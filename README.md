# GIF Masher

**Stitch any number of GIFs into a single animated GIF — in the exact order you add them.**

No shuffling. No sorting. Clip 1 plays first, clip 2 second, and so on. Everything
happens locally in your browser (or in a single CLI command) — no uploads, no
watermark, no account.

[![CI](https://github.com/Grobbit/GIF-masher/actions/workflows/ci.yml/badge.svg)](https://github.com/Grobbit/GIF-masher/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)

---

## Why another GIF merger?

Most tools make you upload your files, slap on a watermark, or quietly reorder
things. GIF Masher is a small, focused tool that does one job properly:

- **Order is sacred.** The playlist is the output. Drag to reorder, or leave it alone.
- **Real decoding.** Every frame is composited from the source GIF's actual state
  machine — partial frames, disposal methods and transparent indices included —
  so nothing flickers or loses its background.
- **Quality scaling.** Downscaling uses a box filter (no aliasing), upscaling is
  bilinear, and every frame gets its own optimised palette of up to 256 colours.
- **Fast and private.** Encoding runs in a Web Worker. Your GIFs never leave the tab.
- **Same engine everywhere.** The web app and the CLI share one TypeScript core.

## Quick start

```bash
git clone https://github.com/Grobbit/GIF-masher.git
cd GIF-masher
npm install
npm run dev          # http://localhost:5173
```

Build for production and bundle the CLI:

```bash
npm run build:all
npm run preview                       # serve the built web app
node dist/cli/gif-masher.mjs --help   # the CLI
```

## Using the web app

1. **Add clips.** Drop GIFs anywhere on the page, paste them from the clipboard, or
   click *Choose GIFs*. Picking several files at once keeps their order.
2. **Arrange.** The numbered playlist *is* the output order. Drag a card by its
   handle, use the ↑/↓ buttons, set how many times a clip repeats, or override the
   fit mode for one clip only.
3. **Tune the output.** Canvas size, fit mode, background, speed, fixed frame
   delay, pause between clips, loop behaviour and colour count all live in the
   sidebar. The estimate updates live.
4. **Mash.** Press the button (or <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd>).
   The finished GIF plays in the sidebar — download it or copy it straight to the
   clipboard.

Shortcuts: <kbd>Ctrl</kbd>+<kbd>Enter</kbd> mashing · <kbd>Esc</kbd> closes dialogs ·
<kbd>↑</kbd>/<kbd>↓</kbd> while a drag handle is focused moves that clip.

### What the settings do

| Setting | Options | Notes |
| --- | --- | --- |
| Canvas size | Largest clip, smallest clip, match width, match height, custom | Sets the shared frame size. Custom accepts any size up to 2000px. |
| Fit | Fit, Fill, Stretch | Letterbox, crop, or distort. Overridable per clip. |
| Background | Transparent, white, black, custom | Fills the space around clips that don't match the canvas. |
| Speed | 0.25x – 4x | Divides every frame delay. |
| Frame timing | From clips / fixed | Fixed forces one delay for every frame. |
| Pause between clips | 0 – 1000 ms | Holds the last frame before the next clip. |
| Loop | Forever, once, 2x, 3x, 5x | Written to the Netscape extension. |
| Colours | 256, 128, 64, 32 | Lower = smaller file. |

## CLI

The CLI is the same engine, wrapped in a single bundled file.

```bash
node dist/cli/gif-masher.mjs intro.gif loop.gif outro.gif -o final.gif
```

```
Usage
  gif-masher <input.gif...> [options]

Options
  -o, --out <file>         Output file (default: mash.gif)
      --size <spec>        largest | smallest | fit-width | fit-height | WxH   (default: largest)
      --fit <mode>         contain | cover | stretch                         (default: contain)
      --background <bg>    transparent | white | black | #rrggbb              (default: transparent)
      --speed <n>          Playback speed multiplier, 0.25-4                  (default: 1)
      --delay <ms>         Force every frame to this delay                    (default: keep source)
      --gap <ms>           Pause after each clip                              (default: 0)
      --loop <spec>        forever | once | <play count>                      (default: forever)
      --colors <n>         Colours per frame, 2-256                            (default: 256)
      --repeat <n>         Play every input n times                           (default: 1)
  -q, --quiet              Suppress progress output
  -h, --help               Show this help
  -v, --version            Show the version
```

Inputs are appended in the order given (shell globs keep their expansion order).
Exit codes: `0` success, `1` runtime failure, `2` bad usage.

```bash
# Match a specific size, crop to fill, play twice as fast, loop once
gif-masher *.gif -o all.gif --size 600x600 --fit cover --speed 2 --loop once

# 250ms pause between clips, on a solid background
gif-masher cat.gif dog.gif -o pets.gif --background '#101014' --gap 250
```

## How it works

```
                 ┌───────────────────────┐
  GIF bytes ───▶ │ decode (gifuct-js)    │  LZW pixels + frame rects + disposal
                 │ compositor            │  ──▶ full RGBA frames
                 └──────────┬────────────┘
                            │  resize into the shared canvas
                            ▼
                 ┌───────────────────────┐
                 │ raster (box/bilinear) │  premultiplied alpha, 1-bit snap
                 └──────────┬────────────┘
                            │  quantise + LZW
                            ▼
                 ┌───────────────────────┐
                 │ encode (gifenc)       │  per-frame palette, delays, loop
                 └──────────┬────────────┘
                            ▼
                     single output GIF
```

1. **Read metadata** for every input (cheap: no pixel decompression) to resolve the
   canvas size and plan the exact frame sequence up front.
2. **Decode** one clip at a time, replaying the GIF state machine: each frame patch
   is drawn onto a canvas, `dispose=2` clears its rectangle afterwards, `dispose=3`
   restores the previous canvas. The result is a fully composited RGBA frame, which
   is what makes clips with different encodings mash cleanly.
3. **Rasterise** into the shared output canvas — box-filtered when shrinking,
   bilinear when growing, composited onto the chosen background.
4. **Encode** each frame with its own palette and append it to one GIF stream. Every
   frame uses disposal method 2, so transparent regions stay transparent instead of
   showing the previous clip through them.

Everything is incremental: one clip's pixels are released before the next is
decoded, so memory tracks the largest single clip rather than the whole mash.

### Ordering guarantee

`mashGifs()` walks the source array from index 0 to the end and appends every frame
of each source before touching the next one. There is no parallelism, sorting or
randomisation anywhere in the pipeline, and there is a test that asserts the exact
frame colours for a three-clip mash (`tests/mash.test.ts`).

## Development

```bash
npm run dev            # Vite dev server with HMR
npm run build          # typecheck + production build to dist/
npm run build:cli      # bundle the CLI to dist/cli/gif-masher.mjs
npm test               # Vitest (engine + jsdom UI tests)
npm run test:coverage  # coverage for src/core
npm run typecheck      # tsc --noEmit
npm run lint           # oxlint
npm run check          # typecheck + lint + tests
```

### Project layout

```
src/
  core/               platform-agnostic engine (no DOM, no React)
    decode.ts         GIF parsing + frame compositing
    raster.ts         fit maths, resampling, background compositing
    encode.ts         per-frame quantisation + GIF writing
    plan.ts           canvas size, delays, frame sequence
    mash.ts           the pipeline that ties it together
    types.ts          shared types + defaults
  workers/
    mash.worker.ts    runs the engine off the main thread
    protocol.ts       message types
  hooks/
    useMashSources.ts ordered playlist state
    useMashJob.ts     worker orchestration, progress, preview URL
  components/         React UI (playlist, settings, output, toasts…)
  lib/                formatting, file handling, downloads, settings
  cli/index.ts        command line front-end
tests/                Vitest suites (node + jsdom)
scripts/build-cli.mjs esbuild bundler for the CLI
```

### Tests

The suite runs the real encoder and the real decoder, so a passing run means the
bytes are valid:

- `encode-decode.test.ts` — round trips, transparency, loop counts, palettes.
- `decode-compositing.test.ts` — partial frames, disposal methods, local colour
  tables, malformed input. Uses a hand-written GIF builder so the awkward cases are
  produced on purpose.
- `raster.test.ts` — fit rectangles, letterboxing, box-filter averaging, buffer
  reuse, 1-bit alpha snapping.
- `mash.test.ts` — ordering, repeats, timing, canvas modes, guards, progress.
- `app.test.tsx` — the UI: adding files in order, rejecting non-GIFs, reordering,
  removing, mashing, persisted settings.

## Browser support

Modern evergreen browsers (Chrome/Edge 105+, Firefox 110+, Safari 16.4+) with Web
Workers, `createImageBitmap` and ES2022. Without Workers the app still works, just
on the main thread.

## Limitations (by design or by GIF)

- GIF is limited to 256 colours per frame and 1-bit transparency; semi-transparent
  pixels become either fully visible or fully transparent.
- Delays are stored in hundredths of a second, so timings snap to 10ms steps.
- A mash is capped at 4,000 output frames and ~2,400px per canvas edge to keep the
  tab responsive.
- Inputs are capped at 40 MB per clip and 40 clips per mash.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Run
`npm run check` before opening a PR.

## Credits

Built on the shoulders of [gifenc](https://github.com/mattdesl/gifenc) (encoding)
and [gifuct-js](https://github.com/matt-way/gifuct-js) (decoding), with React and
Vite. MIT licensed — see [LICENSE](LICENSE).
