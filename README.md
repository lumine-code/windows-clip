# windows-clip

Native Windows clipboard operations for tree-view files and folders.

## Features

- **Native clipboard**: uses the Windows clipboard API directly for cross-application compatibility.
- **Cut/Copy/Paste**: full clipboard operations with Explorer interoperability.
- **Smart duplicates**: uses the Windows naming format `<name> - Copy (n)<ext>`.
- **Force paste**: option to overwrite existing files.
- **Service**: provides clipboard access for other packages.

## Installation

To install `windows-clip` search for _windows-clip_ in the Install pane of the Lumine settings or run `lumine --install lumine-code/windows-clip`.

## Commands

Commands available in `.platform-win32 .tree-view`:

- `windows-clip:cut`: cut selected files/folders to clipboard,
- `windows-clip:copy`: copy selected files/folders to clipboard,
- `windows-clip:paste`: paste from clipboard (auto-rename if exists),
- `windows-clip:force`: paste from clipboard (overwrite if exists).

## Services

- **windows-clip** (`1.0.0`): provided to expose native Windows clipboard access — `readFilePaths()`, `readDropEffect()`, `writeFilePaths(paths, dropEffect)`, `clear()`, and the `DROP_EFFECT_*` constants.
- **tree-view** (`^1.0.0`): consumed to read the selected files and folders for clipboard operations.

## Usage

The package registers its commands only on Windows (`.platform-win32`). A consuming package reads and writes the same `CF_HDROP` clipboard data as Windows Explorer, so cut/copied files interoperate with Explorer in both directions.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
