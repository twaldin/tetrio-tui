/**
 * renderer.test.ts — unit tests for the cell buffer + ANSI diff renderer.
 */

import { test, expect } from 'vitest';
import {
  Buffer,
  Renderer,
  rgb,
  colorTo256,
  DEFAULT_COLOR,
} from '../../src/tui/renderer.js';

class MockOutput {
  written: string[] = [];
  columns = 20;
  rows = 10;
  write(s: string): boolean {
    this.written.push(s);
    return true;
  }
  on(): this { return this; }
  off(): this { return this; }
  get text(): string {
    return this.written.join('');
  }
  clear(): void {
    this.written = [];
  }
}

function makeRenderer(mode: 'truecolor' | '256' = 'truecolor'): { out: MockOutput; r: Renderer } {
  const out = new MockOutput();
  const r = new Renderer({ output: out, fps: 0, colorMode: mode, columns: 20, rows: 10 });
  return { out, r };
}

// ---------------------------------------------------------------------------
// Buffer
// ---------------------------------------------------------------------------

test('buffer set/get with style', () => {
  const b = new Buffer(10, 5);
  b.set(2, 3, 'A', { fg: rgb(255, 0, 0), bold: true });
  const c = b.get(2, 3)!;
  expect(c.char).toBe('A');
  expect(c.fg).toBe(rgb(255, 0, 0));
  expect(c.attrs & 1).toBe(1); // bold bit
  expect(c.bg).toBe(DEFAULT_COLOR);
  // untouched cell is a default blank
  const blank = b.get(0, 0)!;
  expect(blank.char).toBe(' ');
  expect(blank.attrs).toBe(0);
});

test('buffer clips out-of-bounds drawing', () => {
  const b = new Buffer(4, 3);
  b.set(-1, 0, 'X');
  b.set(4, 0, 'X');
  b.set(0, 3, 'X');
  b.drawText(2, 1, 'overflow', {});
  b.fillRect(-2, -2, 3, 3, '.');
  expect(b.get(3, 1)!.char).toBe('v'); // only "ov" fits before the right edge"
  expect(b.get(0, 0)!.char).toBe('.');
  expect(b.get(-1, 0)).toBeUndefined();
  expect(b.get(0, 3)).toBeUndefined();
});

test('buffer fillRect and drawText', () => {
  const b = new Buffer(10, 5);
  b.fillRect(1, 1, 3, 2, '#', { bg: rgb(1, 2, 3) });
  for (const [x, y] of [[1, 1], [3, 1], [1, 2], [3, 2]] as const) {
    expect(b.get(x, y)!.char).toBe('#');
    expect(b.get(x, y)!.bg).toBe(rgb(1, 2, 3));
  }
  expect(b.get(4, 1)!.char).toBe(' ');
  b.drawText(0, 4, 'hi', { underline: true });
  expect(b.get(0, 4)!.char).toBe('h');
  expect(b.get(1, 4)!.attrs & 4).toBe(4);
});

test('buffer drawBox draws corners, edges and title', () => {
  const b = new Buffer(12, 6);
  b.drawBox(1, 1, 8, 4, {}, 'Hi');
  expect(b.get(1, 1)!.char).toBe('┌');
  expect(b.get(8, 1)!.char).toBe('┐');
  expect(b.get(1, 4)!.char).toBe('└');
  expect(b.get(8, 4)!.char).toBe('┘');
  expect(b.get(7, 1)!.char).toBe('─'); // top edge past the title
  expect(b.get(1, 3)!.char).toBe('│');
  expect(b.get(4, 1)!.char).toBe('H'); // title " Hi " starts at x+2 with a leading space
  expect(b.get(5, 1)!.char).toBe('i');
  // interior untouched
  expect(b.get(3, 2)!.char).toBe(' ');
});

// ---------------------------------------------------------------------------
// diff / ANSI
// ---------------------------------------------------------------------------

test('first diff draws only non-blank cells with cursor addressing', () => {
  const { r } = makeRenderer();
  r.buffer.set(2, 3, 'A', { fg: rgb(255, 0, 0) });
  const d = r.diff();
  expect(d).toContain('\x1b[4;3H'); // 1-based row;col
  expect(d).toContain('38;2;255;0;0');
  expect(d).toContain('A');
  expect(d).toContain('\x1b[0m'); // style reset at end of frame
});

test('unchanged frames produce empty diffs', async () => {
  const { out, r } = makeRenderer();
  r.buffer.set(0, 0, 'A', {});
  await r.present();
  expect(out.text.length).toBeGreaterThan(0);
  out.clear();
  await r.present();
  expect(out.text).toBe(''); // nothing changed -> nothing written
});

test('diff is minimal: only the changed cell is re-emitted', async () => {
  const { out, r } = makeRenderer();
  r.buffer.drawText(0, 0, 'ABCDE', {});
  await r.present();
  out.clear();
  r.buffer.set(2, 0, 'X', {});
  await r.present();
  const d = out.text;
  expect(d).toContain('\x1b[1;3H'); // cursor to row 1, col 3
  expect(d).toContain('X');
  expect(d).not.toContain('A');
  expect(d).not.toContain('E');
});

test('style changes within a span emit a single SGR each', async () => {
  const { out, r } = makeRenderer();
  r.buffer.set(0, 0, 'a', { fg: rgb(10, 20, 30) });
  r.buffer.set(1, 0, 'b', { fg: rgb(10, 20, 30) }); // same style: no second SGR
  r.buffer.set(2, 0, 'c', { fg: rgb(1, 2, 3), bold: true });
  await r.present();
  const d = out.text;
  expect(d.indexOf('38;2;10;20;30')).toBe(d.lastIndexOf('38;2;10;20;30'));
  expect(d).toContain('1;38;2;1;2;3'); // bold + fg in one SGR
  const plain = d.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\[[0-9;]*H/g, '');
  expect(plain).toBe('abc');
});

test('256-color fallback quantizes truecolor', () => {
  const { r } = makeRenderer('256');
  r.buffer.set(0, 0, 'R', { fg: rgb(255, 0, 0), bg: rgb(0, 0, 255) });
  const d = r.diff();
  expect(d).toContain('38;5;196');
  expect(d).toContain('48;5;21');
  expect(d).not.toContain('38;2;');
  expect(colorTo256(rgb(255, 0, 0))).toBe(196);
  expect(colorTo256(rgb(128, 128, 128))).toBe(244);
});

test('enter/exit manage alt screen and cursor', () => {
  const { out, r } = makeRenderer();
  r.enter();
  expect(out.text).toContain('\x1b[?1049h'); // alt screen on
  expect(out.text).toContain('\x1b[?25l'); // cursor hidden
  r.exit();
  expect(out.text).toContain('\x1b[?25h'); // cursor restored
  expect(out.text).toContain('\x1b[?1049l'); // alt screen off
});

test('resize reallocates buffers and forces a full redraw', async () => {
  const { out, r } = makeRenderer();
  r.buffer.set(0, 0, 'A', {});
  await r.present();
  out.clear();
  r.resize(30, 12);
  expect(r.columns).toBe(30);
  expect(r.rows).toBe(12);
  expect(out.text).toContain('\x1b[2J'); // screen cleared on resize
  out.clear();
  await r.present();
  expect(out.text).toContain('A'); // full redraw after resize
});

test('present() paces frames to the target fps', async () => {
  const out = new MockOutput();
  const r = new Renderer({ output: out, fps: 60, columns: 5, rows: 2 });
  await r.present(); // first frame: no prior timestamp, immediate
  const t0 = performance.now();
  await r.present(); // must wait ~1/60s even though nothing changed
  const elapsed = performance.now() - t0;
  expect(elapsed).toBeGreaterThanOrEqual(10);
});
