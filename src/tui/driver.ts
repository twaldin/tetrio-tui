/**
 * Terminal driver: the concrete AppDriver + RenderBuffer binding.
 * Raw ANSI diff rendering (24-bit color) + stdin key parsing. Self-contained.
 * (src/tui/renderer.ts from the tui agent can replace the buffer/blit internals later.)
 */
import { EventEmitter } from 'node:events';
import type { AppDriver, KeyEvent, MouseEvent, RenderBuffer, Style, RGB } from './app.js';
import { setKittyKeyboard } from './inputMode.js';

type PackedCell = { ch: string; fg: number; bg: number; attr: number };

const ATTR_BOLD = 1, ATTR_DIM = 2, ATTR_UNDERLINE = 4, ATTR_INVERSE = 8;

// kitty keyboard protocol: non-printable key codes -> logical names
const KITTY_KEY_NAMES: Record<number, string> = {
  9: 'tab', 13: 'return', 27: 'escape', 32: 'space', 127: 'backspace',
  57394: 'home', 57395: 'end', 57396: 'pageup', 57397: 'pagedown',
  57398: 'insert', 57399: 'delete',
};

function rgbToNum(rgb: RGB | null | undefined): number {
  if (!rgb) return -1;
  return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
}

class CellBuffer implements RenderBuffer {
  width: number;
  height: number;
  cells: PackedCell[];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cells = new Array(width * height).fill(null).map(() => ({ ch: ' ', fg: -1, bg: -1, attr: 0 }));
  }

  private idx(x: number, y: number): number { return y * this.width + x; }

  set(x: number, y: number, ch: string, style: Style = {}): void {
    if (y < 0 || y >= this.height) return;
    const fg = style.fg !== undefined ? rgbToNum(style.fg) : -2;
    const bg = style.bg !== undefined ? rgbToNum(style.bg) : -2;
    const attr = (style.bold ? ATTR_BOLD : 0) | (style.dim ? ATTR_DIM : 0) | (style.underline ? ATTR_UNDERLINE : 0) | (style.inverse ? ATTR_INVERSE : 0);
    const rowOff = y * this.width;
    for (let i = 0; i < ch.length; i++) {
      const cx = x + i;
      if (cx < 0 || cx >= this.width) continue;
      const c = this.cells[rowOff + cx];
      c.ch = ch[i];
      if (fg !== -2) c.fg = fg;
      if (bg !== -2) c.bg = bg;
      c.attr = attr;
    }
  }

  fillRect(x: number, y: number, w: number, h: number, ch: string, style: Style = {}): void {
    const fg = style.fg !== undefined ? rgbToNum(style.fg) : -2;
    const bg = style.bg !== undefined ? rgbToNum(style.bg) : -2;
    const attr = (style.bold ? ATTR_BOLD : 0) | (style.dim ? ATTR_DIM : 0) | (style.underline ? ATTR_UNDERLINE : 0) | (style.inverse ? ATTR_INVERSE : 0);
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(this.width, x + w), y1 = Math.min(this.height, y + h);
    for (let row = y0; row < y1; row++) {
      const rowOff = row * this.width;
      for (let col = x0; col < x1; col++) {
        const c = this.cells[rowOff + col];
        c.ch = ch;
        if (fg !== -2) c.fg = fg;
        if (bg !== -2) c.bg = bg;
        c.attr = attr;
      }
    }
  }

  drawText(x: number, y: number, text: string, style: Style = {}): void {
    // Fast path: pass full string to set() which handles multi-char
    this.set(x, y, text, style);
  }

  drawBox(x: number, y: number, w: number, h: number, style: Style = {}): void {
    const s = style;
    this.set(x, y, '┌', s); this.set(x + w - 1, y, '┐', s);
    this.set(x, y + h - 1, '└', s); this.set(x + w - 1, y + h - 1, '┘', s);
    for (let i = 1; i < w - 1; i++) { this.set(x + i, y, '─', s); this.set(x + i, y + h - 1, '─', s); }
    for (let i = 1; i < h - 1; i++) { this.set(x, y + i, '│', s); this.set(x + w - 1, y + i, '│', s); }
  }
}

function cellSGR(c: PackedCell, prev: PackedCell | null): string {
  let out = '';
  if (!prev || c.fg !== prev.fg) {
    out += c.fg === -1 ? '\x1b[39m' : `\x1b[38;2;${(c.fg >> 16) & 255};${(c.fg >> 8) & 255};${c.fg & 255}m`;
  }
  if (!prev || c.bg !== prev.bg) {
    out += c.bg === -1 ? '\x1b[49m' : `\x1b[48;2;${(c.bg >> 16) & 255};${(c.bg >> 8) & 255};${c.bg & 255}m`;
  }
  if (!prev || c.attr !== prev.attr) {
    const turnOff = (prev ? prev.attr : 0) & ~c.attr;
    if (turnOff & ATTR_BOLD && !(c.attr & ATTR_BOLD)) out += '\x1b[22m';
    if (turnOff & ATTR_UNDERLINE && !(c.attr & ATTR_UNDERLINE)) out += '\x1b[24m';
    if (turnOff & ATTR_INVERSE && !(c.attr & ATTR_INVERSE)) out += '\x1b[27m';
    if (c.attr & ATTR_BOLD) out += '\x1b[1m';
    if (c.attr & ATTR_DIM) out += '\x1b[2m';
    if (c.attr & ATTR_UNDERLINE) out += '\x1b[4m';
    if (c.attr & ATTR_INVERSE) out += '\x1b[7m';
  }
  return out;
}

export class TerminalDriver implements AppDriver {
  private back: CellBuffer;
  private front: CellBuffer | null = null;
  private emitter = new EventEmitter();
  private started = false;
  private out = process.stdout;

  constructor() {
    const { columns, rows } = process.stdout;
    this.back = new CellBuffer(columns || 80, rows || 24);
  }

  buffer(): RenderBuffer { return this.back; }
  size() { return { width: this.back.width, height: this.back.height }; }
  onKey(cb: (ev: KeyEvent) => void): void { this.emitter.on('key', cb); }
  onMouse(cb: (ev: MouseEvent) => void): void { this.emitter.on('mouse', cb); }
  onResize(cb: (w: number, h: number) => void): void { this.emitter.on('resize', cb); }

  start(): void {
    if (this.started) return;
    this.started = true;
    const stdin = process.stdin;
    this.out.write('\x1b[?1049h\x1b[?25l\x1b[2J\x1b[?1006h\x1b[?1003h'); // alt screen, hide cursor, clear, SGR mouse any-event tracking
    // Kitty keyboard protocol: query support, then push flags 1+2 (disambiguate +
    // report event types => real key RELEASE events). Legacy terminals ignore both;
    // the reply to the query flips kittyKeyboard on (inputMode.ts).
    this.out.write('\x1b[?u\x1b[>3u');
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', (data: string) => this.parseInput(data));
    process.stdout.on('resize', () => {
      const { columns, rows } = process.stdout;
      this.back = new CellBuffer(columns || 80, rows || 24);
      this.front = null;
      this.out.write('\x1b[2J');
      this.emitter.emit('resize', columns, rows);
    });
  }

  present(): void {
    const back = this.back;
    let front = this.front;
    const parts: string[] = [];
    let prev: PackedCell | null = null;
    let lastX = -1, lastY = -1;
    const w = back.width;
    for (let y = 0; y < back.height; y++) {
      const rowOff = y * w;
      for (let x = 0; x < w; x++) {
        const c = back.cells[rowOff + x];
        if (front) {
          const f = front.cells[rowOff + x];
          if (f.ch === c.ch && f.fg === c.fg && f.bg === c.bg && f.attr === c.attr) { prev = f; continue; }
        }
        if (x !== lastX || y !== lastY) { parts.push('\x1b[', String(y + 1), ';', String(x + 1), 'H'); prev = null; }
        parts.push(cellSGR(c, prev));
        parts.push(c.ch);
        prev = c;
        lastX = x + 1; lastY = y;
      }
    }
    parts.push('\x1b[0m');
    this.out.write(parts.join(''));
    // Copy back→front in-place (reuse existing front buffer).
    if (!front || front.width !== w || front.height !== back.height) {
      front = new CellBuffer(w, back.height);
      this.front = front;
    }
    const bc = back.cells, fc = front.cells;
    for (let i = 0, len = bc.length; i < len; i++) {
      const s = bc[i], d = fc[i];
      d.ch = s.ch; d.fg = s.fg; d.bg = s.bg; d.attr = s.attr;
    }
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    const stdin = process.stdin;
    stdin.removeAllListeners('data');
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
    this.out.write('\x1b[<u\x1b[?1003l\x1b[?1006l\x1b[0m\x1b[?25h\x1b[?1049l'); // kitty pop, mouse off, reset, show cursor, leave alt screen
  }

  // ---- input parsing ----
  private parseInput(data: string): void {
    let i = 0;
    while (i < data.length) {
      const m = this.readMouse(data, i);
      if (m) {
        this.emitter.emit('mouse', m.event);
        i = m.next;
        continue;
      }
      const ev = this.readKey(data, i);
      if (ev) {
        this.emitter.emit('key', ev.event);
        i = ev.next;
      } else {
        i++;
      }
    }
  }

  // SGR mouse: ESC [ < Cb ; Cx ; Cy M (press) / m (release). Coords are 1-based.
  private readMouse(data: string, i: number): { event: MouseEvent; next: number } | null {
    if (data[i] !== '\x1b') return null;
    const m = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(data.slice(i));
    if (!m) return null;
    const cb = parseInt(m[1], 10);
    const x = parseInt(m[2], 10) - 1;
    const y = parseInt(m[3], 10) - 1;
    let event: MouseEvent;
    if (cb & 64) {
      event = { kind: 'mouse', action: cb & 1 ? 'scroll-down' : 'scroll-up', x, y };
    } else if (cb & 32) {
      event = { kind: 'mouse', action: 'move', x, y };
    } else {
      const b = cb & 3;
      const button = b === 0 ? 'left' : b === 1 ? 'middle' : b === 2 ? 'right' : undefined;
      event = { kind: 'mouse', action: m[4] === 'M' ? 'down' : 'up', x, y, button };
    }
    return { event, next: i + m[0].length };
  }

  private readKey(data: string, i: number): { event: KeyEvent; next: number } | null {
    const ch = data[i];
    const mod = (m: number) => ({ shift: !!(m & 1), alt: !!(m & 2), ctrl: !!(m & 4) });
    if (ch === '\x1b') {
      // escape sequences
      const rest = data.slice(i);
      // Kitty query reply: CSI ? <flags> u — terminal supports the keyboard protocol.
      const kreply = /^\x1b\[\?(\d*)u/.exec(rest);
      if (kreply) {
        setKittyKeyboard(true);
        return { event: { key: '__kitty_ack', type: 'down' } as KeyEvent, next: i + kreply[0].length };
      }
      // Kitty key event: CSI <key>[:<alt>] ; <mod>:<evt> u — evt: 1=press 2=repeat 3=release.
      // (with disambiguate, esc/enter/tab/backspace presses ALSO arrive in this form, evt omitted)
      const kit = /^\x1b\[(\d+)(?::\d+)?(?:;(\d*)(?::(\d+))?)?u/.exec(rest);
      if (kit) {
        setKittyKeyboard(true); // receiving kitty-form events at all proves support (query may go unanswered)

        const code = parseInt(kit[1], 10);
        const evt = kit[3] ?? '1';
        const m = mod((parseInt(kit[2] || '1', 10) || 1) - 1);
        const name = KITTY_KEY_NAMES[code] ?? (code >= 32 && code < 127 ? String.fromCharCode(code) : undefined);
        if (!name) return { event: { key: '__noop', type: 'down' } as KeyEvent, next: i + kit[0].length };
        return { event: { key: name, type: evt === '3' ? 'up' : 'down', repeat: evt === '2', ...m } as KeyEvent, next: i + kit[0].length };
      }
      // Kitty arrow/legacy-key event: CSI 1;<mod>:<evt><ABCD etc> (repeat/release carry :2/:3).
      const karrow = /^\x1b\[1;(\d*)(?::(\d+))?([ABCDHF])/.exec(rest);
      if (karrow && karrow[2]) {
        setKittyKeyboard(true); // kitty-form arrow event proves protocol support

        const names: Record<string, string> = { A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end' };
        const m = mod((parseInt(karrow[1] || '1', 10) || 1) - 1);
        return { event: { key: names[karrow[3]], type: karrow[2] === '3' ? 'up' : 'down', repeat: karrow[2] === '2', ...m } as KeyEvent, next: i + karrow[0].length };
      }
      // CSI: ESC [ <params> <final>
      const csi = /^\x1b\[([0-9;]*)([~A-Za-z])/.exec(rest);
      if (csi) {
        const params = csi[1].split(';').map((p) => (p ? parseInt(p, 10) : 1));
        const final = csi[2];
        const m = params[1] ? mod(params[1] - 1) : {};
        const keyFor = (name: string): KeyEvent => ({ key: name, type: 'down', ...m } as KeyEvent);
        let ev: KeyEvent | null = null;
        if (final === 'A') ev = keyFor('up');
        else if (final === 'B') ev = keyFor('down');
        else if (final === 'C') ev = keyFor('right');
        else if (final === 'D') ev = keyFor('left');
        else if (final === 'H') ev = keyFor('home');
        else if (final === 'F') ev = keyFor('end');
        else if (final === 'Z') ev = { key: 'tab', type: 'down', shift: true } as KeyEvent;
        else if (final === '~') {
          const code = params[0];
          const map: Record<number, string> = { 1: 'home', 2: 'insert', 3: 'delete', 4: 'end', 5: 'pageup', 6: 'pagedown', 7: 'home', 8: 'end', 15: 'f5', 17: 'f6', 18: 'f7', 19: 'f8', 20: 'f9', 21: 'f10', 23: 'f11', 24: 'f12' };
          if (map[code]) ev = keyFor(map[code]);
        }
        if (ev) return { event: ev, next: i + csi[0].length };
        return { event: { key: 'escape', type: 'down', sequence: rest.slice(0, csi[0].length) }, next: i + csi[0].length };
      }
      // SS3: ESC O <char>
      const ss3 = /^\x1bO(.)/.exec(rest);
      if (ss3) {
        const map: Record<string, string> = { A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end', P: 'f1', Q: 'f2', R: 'f3', S: 'f4' };
        const k = map[ss3[1]];
        return { event: { key: k ?? 'escape', type: 'down' }, next: i + ss3[0].length };
      }
      // bare escape
      return { event: { key: 'escape', type: 'down' }, next: i + 1 };
    }
    if (ch === '\r' || ch === '\n') return { event: { key: 'return', type: 'down' }, next: i + 1 };
    if (ch === '\t') return { event: { key: 'tab', type: 'down' }, next: i + 1 };
    if (ch === '\x7f' || ch === '\b') return { event: { key: 'backspace', type: 'down' }, next: i + 1 };
    if (ch === ' ') return { event: { key: 'space', type: 'down' }, next: i + 1 };
    const code = ch.charCodeAt(0);
    if (code < 32) {
      // ctrl+letter
      const letter = String.fromCharCode(code + 96);
      return { event: { key: letter, type: 'down', ctrl: true }, next: i + 1 };
    }
    return { event: { key: ch, type: 'down' }, next: i + 1 };
  }
}
