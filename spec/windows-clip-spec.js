const fs = require("fs");
const os = require("os");
const path = require("path");
const mainModule = require("../lib/main");

describe("windows-clip", () => {
  describe("getWinCopyName", () => {
    it("returns the original path for index 0", () => {
      const dst = path.join("C:", "tmp", "file.txt");
      expect(mainModule.getWinCopyName(dst, 0)).toBe(dst);
    });

    it("appends the Windows copy suffix for later indices", () => {
      const dst = path.join("C:", "tmp", "file.txt");
      expect(mainModule.getWinCopyName(dst, 1)).toBe(path.join("C:", "tmp", "file - Copy.txt"));
      expect(mainModule.getWinCopyName(dst, 3)).toBe(path.join("C:", "tmp", "file - Copy (3).txt"));
    });
  });

  describe("findName", () => {
    let dir;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "windows-clip-"));
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it("returns the path unchanged when nothing exists", async () => {
      const dst = path.join(dir, "a.txt");
      expect(await mainModule.findName(dst)).toBe(dst);
    });

    it("skips over existing copies", async () => {
      const dst = path.join(dir, "a.txt");
      fs.writeFileSync(dst, "x");
      fs.writeFileSync(path.join(dir, "a - Copy.txt"), "x");
      expect(await mainModule.findName(dst)).toBe(path.join(dir, "a - Copy (2).txt"));
    });
  });

  describe("treePaste", () => {
    let dir, srcDir, dstDir, fakePaths, fakeEffect, cleared;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "windows-clip-"));
      srcDir = path.join(dir, "src");
      dstDir = path.join(dir, "dst");
      fs.mkdirSync(srcDir);
      fs.mkdirSync(dstDir);
      fs.writeFileSync(path.join(srcDir, "file.txt"), "content");

      fakePaths = [path.join(srcDir, "file.txt")];
      fakeEffect = 1; // DROP_EFFECT_COPY
      cleared = false;
      mainModule.treeView = { selectedPaths: () => [dstDir] };
      spyOn(mainModule, "getFilepaths").and.callFake(() => fakePaths);
      spyOn(mainModule, "getDropEffect").and.callFake(() => fakeEffect);
      spyOn(mainModule, "clearClipboard").and.callFake(() => {
        cleared = true;
      });
    });

    afterEach(() => {
      mainModule.treeView = null;
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it("copies clipboard files into the selected directory", async () => {
      await mainModule.treePaste(false);
      expect(fs.readFileSync(path.join(dstDir, "file.txt"), "utf8")).toBe("content");
      expect(fs.existsSync(path.join(srcDir, "file.txt"))).toBe(true);
      expect(cleared).toBe(false);
    });

    it("auto-renames on collision when not overwriting", async () => {
      fs.writeFileSync(path.join(dstDir, "file.txt"), "old");
      await mainModule.treePaste(false);
      expect(fs.readFileSync(path.join(dstDir, "file.txt"), "utf8")).toBe("old");
      expect(fs.readFileSync(path.join(dstDir, "file - Copy.txt"), "utf8")).toBe("content");
    });

    it("overwrites on collision with force paste", async () => {
      fs.writeFileSync(path.join(dstDir, "file.txt"), "old");
      await mainModule.treePaste(true);
      expect(fs.readFileSync(path.join(dstDir, "file.txt"), "utf8")).toBe("content");
    });

    it("moves files and clears the clipboard for a cut", async () => {
      fakeEffect = 2; // DROP_EFFECT_MOVE
      await mainModule.treePaste(false);
      expect(fs.readFileSync(path.join(dstDir, "file.txt"), "utf8")).toBe("content");
      expect(fs.existsSync(path.join(srcDir, "file.txt"))).toBe(false);
      expect(cleared).toBe(true);
    });

    it("pastes into the parent when the destination is the source itself", async () => {
      const folder = path.join(dir, "folder");
      fs.mkdirSync(folder);
      fs.writeFileSync(path.join(folder, "inner.txt"), "x");
      fakePaths = [folder];
      mainModule.treeView = { selectedPaths: () => [folder] };
      await mainModule.treePaste(false);
      expect(fs.existsSync(path.join(dir, "folder - Copy", "inner.txt"))).toBe(true);
    });

    it("copies directories recursively", async () => {
      const tree = path.join(srcDir, "tree");
      fs.mkdirSync(path.join(tree, "nested"), { recursive: true });
      fs.writeFileSync(path.join(tree, "nested", "deep.txt"), "deep");
      fakePaths = [tree];
      await mainModule.treePaste(false);
      expect(fs.readFileSync(path.join(dstDir, "tree", "nested", "deep.txt"), "utf8")).toBe("deep");
    });
  });

  if (process.platform === "win32") {
    describe("native clipboard (Windows only)", () => {
      let dir;

      beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "windows-clip-native-"));
      });

      afterEach(() => {
        mainModule.clearClipboard();
        fs.rmSync(dir, { recursive: true, force: true });
      });

      it("round-trips file paths and the drop effect", () => {
        const file = path.join(dir, "roundtrip.txt");
        fs.writeFileSync(file, "x");

        mainModule.setFilepaths([file], 2);
        expect(mainModule.getFilepaths()).toEqual([file]);
        expect(mainModule.getDropEffect()).toBe(2);

        mainModule.clearClipboard();
        expect(mainModule.getFilepaths()).toEqual([]);
      });

      it("exposes the drop-effect constants through the provided service", () => {
        const service = mainModule.provideWindowsClip();
        expect(service.DROP_EFFECT_NONE).toBe(0);
        expect(service.DROP_EFFECT_COPY).toBe(1);
        expect(service.DROP_EFFECT_MOVE).toBe(2);
        expect(service.DROP_EFFECT_LINK).toBe(4);
        expect(typeof service.readFilePaths).toBe("function");
        expect(typeof service.writeFilePaths).toBe("function");
        expect(typeof service.clear).toBe("function");
      });
    });
  }
});
