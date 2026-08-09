# windows-clip

Native Windows clipboard access for file paths, including the copy/cut distinction that Explorer uses.

|             |                                                               |
| ----------- | ------------------------------------------------------------- |
| Version     | `1.0.0`                                                       |
| Provided by | `provideWindowsClip()` returning the clipboard API            |
| Consumed by | `consumeWindowsClip(clip)`                                    |
| Owner       | [`windows-clip`](https://github.com/lumine-code/windows-clip) |

The platform clipboard carries text, not files. This is what lets a package copy files to Explorer, paste files from it, and tell a copy from a cut — none of which the built-in clipboard can express.

## Registration

In your `package.json`:

```json
{
  "consumedServices": {
    "windows-clip": {
      "versions": { "^1.0.0": "consumeWindowsClip" }
    }
  }
}
```

## Contract

```ts
type WindowsClip = {
  readFilePaths(): string[];
  readDropEffect(): number;
  writeFilePaths(filePaths: string[], dropEffect?: number): void;
  clear(): void;

  DROP_EFFECT_NONE: 0;
  DROP_EFFECT_COPY: 1;
  DROP_EFFECT_MOVE: 2;
  DROP_EFFECT_LINK: 4;
};
```

| Member                              | Description                                                               |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `readFilePaths()`                   | The file paths on the clipboard, or `[]`.                                 |
| `readDropEffect()`                  | Whether they were copied, cut, or linked. One of the constants.           |
| `writeFilePaths(paths, dropEffect)` | Puts paths on the clipboard. `dropEffect` defaults to `DROP_EFFECT_COPY`. |
| `clear()`                           | Empties the clipboard.                                                    |

## Minimal example

```js
const { Disposable } = require("lumine");

module.exports = {
  consumeWindowsClip(clip) {
    this.clip = clip;
    return new Disposable(() => (this.clip = null));
  },

  cutSelection(paths) {
    this.clip?.writeFilePaths(paths, this.clip.DROP_EFFECT_MOVE);
  },

  paste() {
    const paths = this.clip?.readFilePaths() ?? [];
    const move = this.clip?.readDropEffect() === this.clip?.DROP_EFFECT_MOVE;
    return { paths, move };
  },
};
```

## Behavior

**This service exists only on Windows.** Guard everything on having received it, rather than on `process.platform` — a consumer that is never called is the intended behavior elsewhere.

**Read `readDropEffect()` before acting on the paths.** A cut and a copy put the same paths on the clipboard; only the drop effect distinguishes them, and ignoring it turns every Explorer cut into a copy.

Use the constants rather than the numbers. They are the Windows values, and `DROP_EFFECT_LINK` is `4` rather than `3`, so counting will get it wrong.

`readFilePaths()` returns `[]` for a clipboard holding something else — text, an image — which is not distinguishable from an empty clipboard through this API.

Paths are whatever Windows put there and are not checked for existence.

## Teardown

Return a `Disposable` that drops your reference. The clipboard is system state — **do not `clear()` on teardown**, since its contents belong to the user, not to your package.

## Versioning

`1.0.0` provided, `^1.0.0` consumed. A change that breaks this shape gets a new service name rather than a new major version, and both sides move in the same release.
