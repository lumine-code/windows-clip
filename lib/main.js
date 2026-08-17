const { CompositeDisposable, Disposable } = require("lumine");
const fs = require("fs/promises");
const path = require("path");

/**
 * Drop effect constants from the Windows clipboard API.
 * These match the DROPEFFECT values used by Windows Explorer.
 */
const DROP_EFFECT_NONE = 0;
const DROP_EFFECT_COPY = 1;
const DROP_EFFECT_MOVE = 2;
const DROP_EFFECT_LINK = 4;

// The native module is Windows-only; load it lazily so the package can be
// required (e.g. by the spec runner) on other platforms without crashing.
let nativeClipboard = null;
function clipboard() {
  if (!nativeClipboard) {
    nativeClipboard = require("node-gyp-build")(path.join(__dirname, ".."));
  }
  return nativeClipboard;
}

async function pathExists(pth) {
  try {
    await fs.access(pth);
    return true;
  } catch {
    return false;
  }
}

/**
 * Windows Clip Package
 * Provides native Windows clipboard integration for file operations in tree-view.
 * Enables copy/cut/paste of files using the Windows clipboard format.
 */
module.exports = {
  /**
   * Activates the package and registers tree-view commands.
   */
  activate() {
    this.disposables = new CompositeDisposable();
    this.disposables.add(
      lumine.commands.add(".platform-win32 .tree-view", {
        "windows-clip:cut": {
          description: "Cut the selected entries to the Windows clipboard.",
          didDispatch: () => this.treeCut(),
        },
        "windows-clip:copy": {
          description: "Copy the selected entries to the Windows clipboard.",
          didDispatch: () => this.treeCopy(),
        },
        "windows-clip:paste": {
          description: "Paste the Windows clipboard into the selected folder.",
          didDispatch: () => this.treePaste(false),
        },
        "windows-clip:force": {
          description: "Paste over what is already there, without asking.",
          didDispatch: () => this.treePaste(true),
        },
      }),
    );
  },

  /**
   * Deactivates the package and disposes all subscriptions.
   */
  deactivate() {
    this.disposables.dispose();
  },

  // ===== Provided Service ===== //

  /**
   * Provides the Windows clipboard service API for other packages.
   * @returns {Object} Service object with clipboard methods and constants
   */
  provideWindowsClip() {
    return {
      // Constants
      DROP_EFFECT_NONE,
      DROP_EFFECT_COPY,
      DROP_EFFECT_MOVE,
      DROP_EFFECT_LINK,

      // Read file paths from Windows clipboard
      readFilePaths: () => clipboard().readFilePaths(),

      // Read the drop effect (NONE=0, COPY=1, MOVE=2, LINK=4)
      readDropEffect: () => clipboard().readDropEffect(),

      // Write file paths to Windows clipboard with drop effect
      writeFilePaths: (filePaths, dropEffect = DROP_EFFECT_COPY) => {
        clipboard().writeFilePaths(filePaths, dropEffect);
      },

      // Clear the clipboard
      clear: () => clipboard().clear(),
    };
  },

  // ===== Native Clipboard API ===== //

  /**
   * Reads file paths from the Windows clipboard.
   * @returns {string[]} Array of file paths
   */
  getFilepaths() {
    return clipboard().readFilePaths();
  },

  /**
   * Reads the drop effect from the Windows clipboard.
   * @returns {number} Drop effect constant (NONE=0, COPY=1, MOVE=2, LINK=4)
   */
  getDropEffect() {
    return clipboard().readDropEffect();
  },

  /**
   * Writes file paths to the Windows clipboard with a drop effect.
   * @param {string[]} filePaths - Array of file paths to write
   * @param {number} dropEffect - Drop effect constant (default: COPY)
   */
  setFilepaths(filePaths, dropEffect = DROP_EFFECT_COPY) {
    clipboard().writeFilePaths(filePaths, dropEffect);
  },

  /**
   * Clears the Windows clipboard.
   */
  clearClipboard() {
    clipboard().clear();
  },

  // ===== tree-view ===== //

  /**
   * Consumes the tree-view service.
   * @param {Object} treeView - The tree-view service object
   * @returns {Disposable} Disposable to unregister the service
   */
  consumeTreeViewSelection(treeView) {
    this.treeView = treeView;
    return new Disposable(() => {
      this.treeView = null;
    });
  },

  /**
   * Cuts selected files in tree-view to the clipboard.
   */
  treeCut() {
    if (!this.treeView) {
      return;
    }
    const paths = this.treeView.selectedPaths();
    if (paths.length > 0) {
      this.setFilepaths(paths, DROP_EFFECT_MOVE);
    }
  },

  /**
   * Copies selected files in tree-view to the clipboard.
   */
  treeCopy() {
    if (!this.treeView) {
      return;
    }
    const paths = this.treeView.selectedPaths();
    if (paths.length > 0) {
      this.setFilepaths(paths, DROP_EFFECT_COPY);
    }
  },

  /**
   * Pastes files from the clipboard to selected directories in tree-view.
   * @param {boolean} overwrite - Whether to overwrite existing files
   */
  async treePaste(overwrite = false) {
    if (!this.treeView) {
      return;
    }

    // Get destination directories from selection
    const dstDirs = [];
    for (let sel of this.treeView.selectedPaths()) {
      try {
        if (!(await fs.lstat(sel)).isDirectory()) {
          sel = path.dirname(sel);
        }
        if (!dstDirs.includes(sel)) {
          dstDirs.push(sel);
        }
      } catch (err) {
        console.error(`windows-clip: Failed to stat ${sel}:`, err);
      }
    }

    if (dstDirs.length === 0) {
      return;
    }

    // Get source files and drop effect from clipboard
    const srcs = this.getFilepaths();
    if (srcs.length === 0) {
      return;
    }

    const dropEffect = this.getDropEffect();
    const isMove = dropEffect === DROP_EFFECT_MOVE;

    // Process each destination directory
    for (let dstDir of dstDirs) {
      for (const src of srcs) {
        // If destination is the source itself or a subdirectory of it,
        // paste into the parent directory instead (matches Windows Explorer behavior)
        let effectiveDstDir = dstDir;
        const srcNorm = path.normalize(src);
        const dstNorm = path.normalize(dstDir);
        if (dstNorm === srcNorm || dstNorm.startsWith(srcNorm + path.sep)) {
          effectiveDstDir = path.dirname(srcNorm);
        }
        let dst = path.join(effectiveDstDir, path.basename(src));

        // For copy operation (not overwrite), find unique name
        if (!overwrite) {
          dst = await this.findName(dst);
        }

        try {
          if (isMove && dstDirs.length === 1) {
            // Move operation: only move to a single destination
            await this.moveEntry(src, dst, overwrite);
          } else {
            // Copy operation (or move to multiple destinations)
            await fs.cp(src, dst, {
              recursive: true,
              force: overwrite,
              errorOnExist: !overwrite,
            });
          }
        } catch (err) {
          console.error(
            `windows-clip: Failed to ${isMove ? "move" : "copy"} ${src} to ${dst}:`,
            err,
          );
        }
      }
    }

    // Clear clipboard after move operation to prevent re-moving
    if (isMove && dstDirs.length === 1) {
      this.clearClipboard();
    }
  },

  // ===== Tools ===== //

  /**
   * Moves a file or directory, replacing the destination when requested.
   * Falls back to copy + delete when the rename crosses devices.
   * @param {string} src - The source path
   * @param {string} dst - The destination path
   * @param {boolean} overwrite - Whether to replace an existing destination
   */
  async moveEntry(src, dst, overwrite) {
    if (await pathExists(dst)) {
      if (!overwrite) {
        throw new Error(`Destination already exists: ${dst}`);
      }
      await fs.rm(dst, { recursive: true, force: true });
    }
    try {
      await fs.rename(src, dst);
    } catch (err) {
      if (err.code !== "EXDEV") {
        throw err;
      }
      await fs.cp(src, dst, { recursive: true });
      await fs.rm(src, { recursive: true, force: true });
    }
  },

  /**
   * Finds a unique filename for the destination, avoiding collisions.
   * Uses Windows-style naming: "file - Copy.ext", "file - Copy (2).ext", etc.
   * @param {string} dst - The desired destination path
   * @returns {Promise<string>} A unique path that doesn't exist
   */
  async findName(dst) {
    for (let i = 0; ; i++) {
      const pth = this.getWinCopyName(dst, i);
      if (!(await pathExists(pth))) {
        return pth;
      }
    }
  },

  /**
   * Generates a Windows-style copy name for a file.
   * @param {string} dst - The original destination path
   * @param {number} i - The copy index (0 = original, 1 = "- Copy", 2+ = "- Copy (n)")
   * @returns {string} The formatted path with copy suffix
   */
  getWinCopyName(dst, i) {
    if (i > 0) {
      const pth = path.parse(dst);
      const num = i === 1 ? "" : ` (${i})`;
      return `${pth.dir}${path.sep}${pth.name} - Copy${num}${pth.ext}`;
    } else {
      return dst;
    }
  },
};
