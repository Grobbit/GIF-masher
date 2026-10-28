// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../src/App';
import { solidGif } from './helpers';

vi.mock('../src/hooks/useMashJob', async () => {
  // Real hook, but never touch a Worker in jsdom.
  const actual = await vi.importActual<typeof import('../src/hooks/useMashJob')>(
    '../src/hooks/useMashJob',
  );
  return actual;
});

function gifFile(name: string, colors: [number, number, number, number][], size = 8): File {
  const bytes = solidGif(
    colors.map((color) => ({ color, delayMs: 100 })),
    { width: size, height: size },
  );
  return new File([bytes.slice().buffer as ArrayBuffer], name, { type: 'image/gif' });
}

function addFiles(files: File[]): void {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('file input not found');
  fireEvent.change(input, { target: { files } });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('App', () => {
  it('starts with an empty playlist and a disabled mash button', () => {
    render(<App />);
    expect(screen.getByText('Your playlist is empty')).toBeTruthy();
    const mashButton = screen.getByRole('button', { name: /add gifs to mash/i });
    expect((mashButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('adds clips in the order they are picked', async () => {
    render(<App />);
    addFiles([
      gifFile('first.gif', [[255, 0, 0, 255]]),
      gifFile('second.gif', [[0, 255, 0, 255]]),
      gifFile('third.gif', [[0, 0, 255, 255]]),
    ]);

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
    const names = Array.from(document.querySelectorAll('.clip__name')).map((node) => node.textContent);
    expect(names).toEqual(['first.gif', 'second.gif', 'third.gif']);
  });

  it('rejects non-GIF files with a notice', async () => {
    render(<App />);
    addFiles([new File(['hello'], 'notes.txt', { type: 'text/plain' })]);
    expect(await screen.findByText(/is not a GIF/i)).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('moves clips up and down', async () => {
    render(<App />);
    addFiles([gifFile('a.gif', [[255, 0, 0, 255]]), gifFile('b.gif', [[0, 255, 0, 255]])]);
    await screen.findAllByRole('listitem');

    fireEvent.click(screen.getByRole('button', { name: /move b\.gif earlier/i }));
    const items = await screen.findAllByRole('listitem');
    expect(within(items[0]).getByText('b.gif')).toBeTruthy();
    expect(within(items[1]).getByText('a.gif')).toBeTruthy();
  });

  it('removes a clip after confirming', async () => {
    render(<App />);
    addFiles([gifFile('a.gif', [[255, 0, 0, 255]])]);
    await screen.findAllByRole('listitem');

    fireEvent.click(screen.getByRole('button', { name: /remove a\.gif/i }));
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    await waitFor(() => expect(screen.queryAllByRole('listitem')).toHaveLength(0));
  });

  it('shows a live estimate and mashes the clips', async () => {
    render(<App />);
    addFiles([
      gifFile('one.gif', [
        [255, 0, 0, 255],
        [255, 0, 0, 255],
      ]),
      gifFile('two.gif', [[0, 0, 255, 255]]),
    ]);
    await screen.findAllByRole('listitem');

    // 3 frames across 2 clips at 100ms each.
    expect(await screen.findByText('300ms')).toBeTruthy();

    const mashButton = screen.getByRole('button', { name: /mash 2 clips/i });
    fireEvent.click(mashButton);

    const image = await screen.findByAltText(/your mashed gif/i, undefined, { timeout: 5000 });
    expect(image.getAttribute('src')).toMatch(/^blob:/);
    expect(screen.getByRole('button', { name: /download gif/i })).toBeTruthy();
  });

  it('keeps settings across mounts', async () => {
    const { unmount } = render(<App />);
    addFiles([gifFile('a.gif', [[255, 0, 0, 255]])]);
    await screen.findAllByRole('listitem');

    fireEvent.click(screen.getByRole('button', { name: /^fill$/i }));
    unmount();

    render(<App />);
    const fill = await screen.findByRole('button', { name: /^fill$/i });
    expect(fill.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('sample clips', () => {
  it('loads the three built-in samples in order and can mash them', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /try three sample gifs/i }));

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3), {
      timeout: 10_000,
    });
    const names = Array.from(document.querySelectorAll('.clip__name')).map((n) => n.textContent);
    expect(names).toEqual([
      'sample-sunrise.gif',
      'sample-orbit.gif',
      'sample-wipe.gif',
    ]);

    fireEvent.click(screen.getByRole('button', { name: /mash 3 clips/i }));
    expect(await screen.findByAltText(/your mashed gif/i, undefined, { timeout: 10_000 })).toBeTruthy();
  });
});
