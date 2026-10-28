#!/usr/bin/env node
/**
 * GIF Masher CLI — the same engine as the web app, for scripts and terminals.
 *
 *   gif-masher one.gif two.gif three.gif -o mash.gif
 *   gif-masher clips/*.gif -o out.gif --size 480x480 --fit cover --speed 1.5
 *
 * Order is exactly the order the paths are given on the command line (and glob
 * expansion keeps shell order too).
 */

import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import process from 'node:process';
import { mashGifs } from '../core/mash';
import type { MashSource } from '../core/mash';
import type { BackgroundMode, CanvasSizeMode, FitMode, MashOptions } from '../core/types';
import { formatBytes, formatDimensions, formatDuration, pluralize } from '../lib/format';

const VERSION = '1.0.0';

const USAGE = `
GIF Masher ${VERSION} — combine GIFs into one, in the order you give them.

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

Examples
  gif-masher intro.gif loop.gif outro.gif -o final.gif
  gif-masher *.gif -o all.gif --size 600x600 --fit cover --speed 2
  gif-masher cat.gif dog.gif -o pets.gif --gap 250 --loop once
`;

class UsageError extends Error {}

interface ParsedArgs {
  inputs: string[];
  out: string;
  quiet: boolean;
  help: boolean;
  version: boolean;
  options: MashOptions;
  repeat: number;
}

function fail(message: string): never {
  throw new UsageError(message);
}

function parsePositiveNumber(raw: string | undefined, flag: string): number {
  if (raw === undefined) fail(`${flag} needs a value.`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) fail(`${flag} must be a positive number.`);
  return value;
}

function parseSize(raw: string | undefined): Pick<MashOptions, 'canvasSize' | 'width' | 'height'> {
  if (!raw) fail('--size needs a value.');
  const custom = /^(\d{1,4})x(\d{1,4})$/i.exec(raw);
  if (custom) {
    const width = Number(custom[1]);
    const height = Number(custom[2]);
    if (width < 1 || height < 1 || width > 4000 || height > 4000) {
      fail('--size WxH must be between 1x1 and 4000x4000.');
    }
    return { canvasSize: 'preset', width, height };
  }
  const modes: CanvasSizeMode[] = ['largest', 'smallest', 'fit-width', 'fit-height'];
  if (modes.includes(raw as CanvasSizeMode)) return { canvasSize: raw as CanvasSizeMode };
  return fail(`Unknown --size "${raw}". Use WxH or one of ${modes.join(', ')}.`);
}

function parseFit(raw: string | undefined): FitMode {
  if (!raw) fail('--fit needs a value.');
  if (raw === 'contain' || raw === 'cover' || raw === 'stretch') return raw;
  return fail(`Unknown --fit "${raw}".`);
}

function parseBackground(raw: string | undefined): Pick<MashOptions, 'background' | 'backgroundColor'> {
  if (!raw) fail('--background needs a value.');
  if (raw === 'transparent' || raw === 'white' || raw === 'black') {
    return { background: raw as BackgroundMode, backgroundColor: '#000000' };
  }
  if (/^#?[0-9a-f]{3,6}$/i.test(raw)) {
    const color = raw.startsWith('#') ? raw : `#${raw}`;
    const normalized =
      color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
    return { background: 'custom', backgroundColor: normalized };
  }
  return fail(`Unknown --background "${raw}". Use transparent, white, black or a hex colour.`);
}

function parseLoop(raw: string | undefined): number {
  if (!raw) fail('--loop needs a value.');
  if (raw === 'forever') return 0;
  if (raw === 'once') return -1;
  const plays = Number(raw);
  if (!Number.isInteger(plays) || plays < 1) {
    fail('--loop must be "forever", "once" or a positive play count.');
  }
  return plays <= 1 ? -1 : plays - 1;
}

function parseArgs(argv: string[]): ParsedArgs {
  const inputs: string[] = [];
  let out = 'mash.gif';
  let quiet = false;
  let repeat = 1;
  const options: MashOptions = {
    canvasSize: 'largest',
    fit: 'contain',
    background: 'transparent',
    backgroundColor: '#000000',
    speed: 1,
    frameDelayMs: null,
    loop: 0,
    maxColors: 256,
    gapMs: 0,
  };

  let help = false;
  let version = false;
  let onlyPaths = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string | undefined => argv[++i];

    if (onlyPaths || !arg.startsWith('-')) {
      inputs.push(arg);
      continue;
    }

    switch (arg) {
      case '--':
        onlyPaths = true;
        break;
      case '-h':
      case '--help':
        help = true;
        break;
      case '-v':
      case '--version':
        version = true;
        break;
      case '-q':
      case '--quiet':
        quiet = true;
        break;
      case '-o':
      case '--out':
        out = next() ?? fail(`${arg} needs a file path.`);
        break;
      case '--size':
        Object.assign(options, parseSize(next()));
        break;
      case '--fit':
        options.fit = parseFit(next());
        break;
      case '--background':
        Object.assign(options, parseBackground(next()));
        break;
      case '--speed': {
        const speed = parsePositiveNumber(next(), '--speed');
        if (speed < 0.1 || speed > 20) fail('--speed must be between 0.1 and 20.');
        options.speed = speed;
        break;
      }
      case '--delay': {
        const delay = parsePositiveNumber(next(), '--delay');
        if (delay < 20 || delay > 10_000) fail('--delay must be between 20 and 10000 ms.');
        options.frameDelayMs = delay;
        break;
      }
      case '--gap': {
        const gap = Number(next());
        if (!Number.isFinite(gap) || gap < 0 || gap > 10_000) fail('--gap must be 0-10000 ms.');
        options.gapMs = gap;
        break;
      }
      case '--loop':
        options.loop = parseLoop(next());
        break;
      case '--colors': {
        const colors = Number(next());
        if (!Number.isInteger(colors) || colors < 2 || colors > 256) {
          fail('--colors must be an integer between 2 and 256.');
        }
        options.maxColors = colors;
        break;
      }
      case '--repeat': {
        const count = Number(next());
        if (!Number.isInteger(count) || count < 1 || count > 20) {
          fail('--repeat must be an integer between 1 and 20.');
        }
        repeat = count;
        break;
      }
      default:
        fail(`Unknown option "${arg}". Run gif-masher --help for usage.`);
    }
  }

  return { inputs, out, quiet, help, version, options, repeat };
}

const useColor = process.stderr.isTTY && !process.env.NO_COLOR;
const paint = (code: string, text: string) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);
const bold = (text: string) => paint('1', text);
const dim = (text: string) => paint('2', text);
const green = (text: string) => paint('32', text);
const red = (text: string) => paint('31', text);

function progressBar(ratio: number, width = 24): string {
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

async function main(): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${red('error')} ${error.message}\n`);
      return 2;
    }
    throw error;
  }

  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (args.inputs.length === 0) {
    process.stderr.write(`${red('error')} No input GIFs given.\n${USAGE}`);
    return 2;
  }

  const sources: MashSource[] = [];
  for (const input of args.inputs) {
    const path = resolve(input);
    try {
      const bytes = new Uint8Array(await readFile(path));
      sources.push({
        bytes,
        name: basename(path),
        options: args.repeat > 1 ? { repeat: args.repeat } : undefined,
      });
    } catch (error) {
      process.stderr.write(
        `${red('error')} Cannot read ${input}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      return 1;
    }
  }

  if (extname(args.out).toLowerCase() !== '.gif') {
    process.stderr.write(`${dim('note')} output does not end in .gif — writing it anyway.\n`);
  }

  let lastPercent = -1;
  const started = Date.now();

  try {
    const result = await mashGifs(sources, args.options, {
      onProgress: ({ progress, stage }) => {
        if (args.quiet) return;
        const percent = Math.floor(progress * 100);
        if (percent === lastPercent) return;
        lastPercent = percent;
        process.stderr.write(`\r${progressBar(progress)} ${String(percent).padStart(3)}%  ${dim(stage.padEnd(28))}`);
      },
      onWarning: (warning) => {
        if (!args.quiet) process.stderr.write(`\n${paint('33', 'warn')} ${warning.message}\n`);
      },
    });

    if (!args.quiet) process.stderr.write('\r'.padEnd(1) + ' '.repeat(70) + '\r');

    await writeFile(resolve(args.out), result.bytes);

    const seconds = ((Date.now() - started) / 1000).toFixed(2);
    process.stdout.write(
      `${green('✔')} ${bold(args.out)}  ${formatDimensions(result.width, result.height)}, ` +
        `${pluralize(result.frameCount, 'frame')}, ${formatDuration(result.durationMs)}, ` +
        `${formatBytes(result.byteLength)} ${dim(`(${seconds}s)`)}\n`,
    );

    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        process.stderr.write(`${paint('33', 'warn')} ${warning.message}\n`);
      }
    }
    return 0;
  } catch (error) {
    if (!args.quiet) process.stderr.write('\n');
    process.stderr.write(
      `${red('error')} ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`${red('fatal')} ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
