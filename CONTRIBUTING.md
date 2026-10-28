# Contributing to GIF Masher

Thanks for helping out! This is a small, deliberately focused tool; the most
useful contributions are bug reports with a reproduction, better GIF edge-case
handling, and performance work on the encoder path.

## Getting started

```bash
git clone https://github.com/Grobbit/GIF-masher.git
cd GIF-masher
npm install
npm run dev
```

Node 18+ is required (the CI runs Node 22).

## Before you open a pull request

```bash
npm run check        # typecheck + lint + tests
npm run build:all    # production build + CLI bundle
```

- Add a test for any behaviour change. Engine work belongs in `tests/*.test.ts`
  (Node), UI work in `tests/app.test.tsx` (jsdom).
- Keep the ordering contract intact: sources are appended in the order given, with
  no sorting, shuffling or reordering anywhere in the pipeline.
- Keep the core (`src/core`) free of DOM and React imports so the CLI and the
  worker can keep sharing it.
- Match the existing style: TypeScript strict mode, functional components, no
  `any`, no new runtime dependencies without a good reason.

## Reporting a bug

Please include:

1. the order and names of the clips you added,
2. the settings you used (canvas size, fit, background, speed…),
3. what you expected versus what you got — a screenshot or the resulting GIF
   helps a lot,
4. your browser and OS (or the CLI command and Node version).

If a specific GIF triggers the problem, note where it comes from or attach a
minimal reproducer if you can share it.

## Code map

| Path | What lives there |
| --- | --- |
| `src/core/decode.ts` | Parsing and frame compositing (disposal methods, patches) |
| `src/core/raster.ts` | Fit maths, resampling, background compositing |
| `src/core/encode.ts` | Palette generation and GIF writing |
| `src/core/plan.ts` | Canvas sizing, delay normalisation, frame sequencing |
| `src/core/mash.ts` | The pipeline: read → decode → rasterise → encode |
| `src/workers/` | Worker entry point and message protocol |
| `src/hooks/` | Playlist state and mash job orchestration |
| `src/components/` | UI |
| `src/cli/` | Command line front-end |
| `tests/gifBuilder.ts` | Hand-written GIF writer used to create awkward fixtures |

## Commit messages

Short imperative subject lines are preferred (`Fix disposal 3 frame restore`), with
a body explaining *why* when the change is not obvious.
