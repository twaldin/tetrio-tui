/**
 * renderer.ts — lean terminal renderer for tetrio-tui.
 *
 * - Cell buffer (char + 24-bit fg/bg + bold/dim/underline), sized to the terminal.
 * - Diff-based blitting: present() computes changed-cell spans vs the previous frame
 *   and writes one ANSI batch (single write() call => no tearing).
 * - 24-bit truecolor with automatic 256-color fallback.
 * - Alt-screen + hidden cursor on enter, restore on exit. Handles SIGWINCH resize.
 * - Frame pacing: await present() and it spaces frames to the target FPS (default 60).
 */

/** A packed 24-bit color: 0xRRGGBB. Use DEFAULT_COLOR (-1) for the terminal default. */
export type Color = number;
export const DEFAULT_COLOR: Color = -1;

/** Pack r,g,b (0-255) into a Color. */
export function rgb(r: number, g: number, b: number): Color {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

export function colorRed(c: Color): number { return (c >> 16) & 0xff; }
export function colorGreen(c: Color): number { return (c >> 8) & 0xff; }
export function colorBlue(c: Color): number { return c & 0xff; }

/** Quantize a 24-bit color to the xterm 256 palette (16-255). */
export function colorTo256(c: Color): number {
  const r = colorRed(c), g = colorGreen(c), b = colorBlue(c);
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return 232 + Math.min(23, Math.round(((r - 8) / 247) * 24));
  }
  const q = (v: number): number => (v < 48 ? 0 : v < 115 ? 1 : Math.min(5, Math.floor((v - 35) / 40)));
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

// ---------------------------------------------------------------------------
// Styles & cells
// ---------------------------------------------------------------------------

const ATTR_BOLD = 1;
const ATTR_DIM = 2;
const ATTR_UNDERLINE = 4;

/** Style applied to a cell. Missing fields fall back to terminal defaults. */
export interface Style {
  fg?: Color;
  bg?: Color;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
}

/** A single terminal cell. char must be a single-width printable character. */
export interface Cell {
  char: string;
  fg: Color;
  bg: Color;
  attrs: number; // bitmask of ATTR_*
}

function blankCell(): Cell {
  return { char: ' ', fg: DEFAULT_COLOR, bg: DEFAULT_COLOR, attrs: 0 };
}

function cellsEqual(a: Cell, b: Cell): boolean {
  return a.char === b.char && a.fg === b.fg && a.bg === b.bg && a.attrs === b.attrs;
}

function normalizeStyle(s: Style | undefined): { fg: Color; bg: Color; attrs: number } {
  let attrs = 0;
  if (s?.bold) attrs |= ATTR_BOLD;
  if (s?.dim) attrs |= ATTR_DIM;
  if (s?.underline) attrs |= ATTR_UNDERLINE;
  return {
    fg: s?.fg ?? DEFAULT_COLOR,
    bg: s?.bg ?? DEFAULT_COLOR,
    attrs,
  };
}

// ---------------------------------------------------------------------------
// Buffer — the drawable grid
// ---------------------------------------------------------------------------

/**
 * A 2D grid of cells. (0,0) is the top-left corner.
 * All drawing methods clip silently to the buffer bounds.
 */
export class Buffer {
  width: number;
  height: number;
  /** Row-major cells: index = y * width + x. */
  cells: Cell[];

  constructor(width: number, height: number) {
    this.width = Math.max(0, width | 0);
    this.height = Math.max(0, height | 0);
    this.cells = new Array<Cell>(this.width * this.height);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = blankCell();
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Reset every cell to a blank (optionally styled) cell. */
  clear(style?: Style): void {
    const st = normalizeStyle(style);
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      c.char = ' ';
      c.fg = st.fg;
      c.bg = st.bg;
      c.attrs = st.attrs;
    }
  }

  /** Set a single cell. */
  set(x: number, y: number, char: string, style?: Style): void {
    if (!this.inBounds(x, y)) return;
    const c = this.cells[this.index(x, y)];
    c.char = char.length === 0 ? ' ' : char[0];
    const st = normalizeStyle(style);
    c.fg = st.fg;
    c.bg = st.bg;
    c.attrs = st.attrs;
  }

  /** Read a cell (returns undefined when out of bounds). */
  get(x: number, y: number): Cell | undefined {
    if (!this.inBounds(x, y)) return undefined;
    return this.cells[this.index(x, y)];
  }

  /** Fill a rectangle with a char + style. */
  fillRect(x: number, y: number, w: number, h: number, char: string, style?: Style): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.set(x + dx, y + dy, char, style);
      }
    }
  }

  /** Draw a single line of text. Clips at the right edge; does not wrap. */
  drawText(x: number, y: number, text: string, style?: Style): void {
    if (y < 0 || y >= this.height) return;
    for (let i = 0; i < text.length; i++) {
      const cx = x + i;
      if (cx >= this.width) break;
      if (cx >= 0) this.set(cx, y, text[i], style);
    }
  }

  /**
   * Draw a unicode box. w/h include the border, so the interior is (w-2) x (h-2).
   * An optional title is drawn into the top border.
   */
  drawBox(x: number, y: number, w: number, h: number, style?: Style, title?: string): void {
    if (w < 2 || h < 2) return;
    this.set(x, y, '┌', style);
    this.set(x + w - 1, y, '┐', style);
    this.set(x, y + h - 1, '└', style);
    this.set(x + w - 1, y + h - 1, '┘', style);
    for (let dx = 1; dx < w - 1; dx++) {
      this.set(x + dx, y, '─', style);
      this.set(x + dx, y + h - 1, '─', style);
    }
    for (let dy = 1; dy < h - 1; dy++) {
      this.set(x, y + dy, '│', style);
      this.set(x + w - 1, y + dy, '│', style);
    }
    if (title) {
      const label = ` ${title} `.slice(0, Math.max(0, w - 4));
      this.drawText(x + 2, y, label, style);
    }
  }

  /** Resize, preserving the overlapping region. */
  resize(width: number, height: number): void {
    const w = Math.max(0, width | 0);
    const h = Math.max(0, height | 0);
    const next = new Array<Cell>(w * h);
    for (let i = 0; i < next.length; i++) next[i] = blankCell();
    const cw = Math.min(w, this.width);
    const ch = Math.min(h, this.height);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const src = this.cells[y * this.width + x];
        const dst = next[y * w + x];
        dst.char = src.char; dst.fg = src.fg; dst.bg = src.bg; dst.attrs = src.attrs;
      }
    }
    this.width = w;
    this.height = h;
    this.cells = next;
  }

  /** Copy another buffer's contents into this one (must be same size). */
  copyFrom(other: Buffer): void {
    for (let i = 0; i < this.cells.length; i++) {
      const s = other.cells[i];
      const d = this.cells[i];
      d.char = s.char; d.fg = s.fg; d.bg = s.bg; d.attrs = s.attrs;
    }
  }
}

// ---------------------------------------------------------------------------
// ANSI emission
// ---------------------------------------------------------------------------

export type ColorMode = 'auto' | 'truecolor' | '256';

const CSI = '\x1b[';

function sgrForStyle(fg: Color, bg: Color, attrs: number, mode: 'truecolor' | '256'): string {
  const parts: string[] = ['0'];
  if (attrs & ATTR_BOLD) parts.push('1');
  if (attrs & ATTR_DIM) parts.push('2');
  if (attrs & ATTR_UNDERLINE) parts.push('4');
  if (fg === DEFAULT_COLOR) {
    parts.push('39');
  } else if (mode === 'truecolor') {
    parts.push(`38;2;${colorRed(fg)};${colorGreen(fg)};${colorBlue(fg)}`);
  } else {
    parts.push(`38;5;${colorTo256(fg)}`);
  }
  if (bg === DEFAULT_COLOR) {
    parts.push('49');
  } else if (mode === 'truecolor') {
    parts.push(`48;2;${colorRed(bg)};${colorGreen(bg)};${colorBlue(bg)}`);
  } else {
    parts.push(`48;5;${colorTo256(bg)}`);
  }
  return `${CSI}${parts.join(';')}m`;
}

/** Minimal writable interface the renderer needs (satisfied by process.stdout). */
export interface RenderOutput {
  write(data: string): unknown;
  columns?: number;
  rows?: number;
  on?(event: string, listener: () => void): unknown;
  off?(event: string, listener: () => void): unknown;
}

export interface RendererOptions {
  /** Output stream; defaults to process.stdout. */
  output?: RenderOutput;
  /** Target frames per second for present(); 0 = uncapped. Default 60. */
  fps?: number;
  /** Force a color mode; 'auto' sniffs COLORTERM/TERM. Default 'auto'. */
  colorMode?: ColorMode;
  /** Override dimensions (defaults to output.columns/rows, then 80x24). */
  columns?: number;
  rows?: number;
}

/** Gap (in cells) below which adjacent diffs are bridged into one span. */
const BRIDGE_GAP = 8;

export class Renderer {
  readonly output: RenderOutput;
  /** The back buffer — draw the next frame into this. */
  buffer: Buffer;
  private front: Buffer;
  private fps: number;
  private frameMs: number;
  private lastWrite = 0;
  private mode: 'truecolor' | '256';
  private entered = false;
  private curStyle: { fg: Color; bg: Color; attrs: number } | null = null;
  private resizeListener: (() => void) | null = null;

  constructor(options: RendererOptions = {}) {
    this.output = options.output ?? process.stdout;
    this.fps = options.fps ?? 60;
    this.frameMs = this.fps > 0 ? 1000 / this.fps : 0;
    this.mode = this.detectColorMode(options.colorMode ?? 'auto');
    const cols = options.columns ?? this.output.columns ?? 80;
    const rows = options.rows ?? this.output.rows ?? 24;
    this.buffer = new Buffer(cols, rows);
    this.front = new Buffer(cols, rows);
  }

  private detectColorMode(mode: ColorMode): 'truecolor' | '256' {
    if (mode !== 'auto') return mode;
    const ct = (process.env.COLORTERM ?? '').toLowerCase();
    if (ct === 'truecolor' || ct === '24bit') return 'truecolor';
    const term = (process.env.TERM ?? '').toLowerCase();
    if (term.includes('256color') || term.includes('direct')) return term.includes('direct') ? 'truecolor' : '256';
    return 'truecolor'; // modern default
  }

  get colorMode(): 'truecolor' | '256' {
    return this.mode;
  }

  get columns(): number {
    return this.buffer.width;
  }

  get rows(): number {
    return this.buffer.height;
  }

  /** Enter the alt screen, hide the cursor, clear, and start listening for resizes. */
  enter(): void {
    if (this.entered) return;
    this.entered = true;
    this.output.write(`${CSI}?1049h${CSI}?25l${CSI}0m${CSI}2J${CSI}H`);
    this.curStyle = { fg: DEFAULT_COLOR, bg: DEFAULT_COLOR, attrs: 0 };
    this.invalidate();
    if (this.output.on) {
      this.resizeListener = () => this.handleResize();
      this.output.on('resize', this.resizeListener);
    }
  }

  /** Restore the terminal: show cursor, reset SGR, leave the alt screen. */
  exit(): void {
    if (!this.entered) return;
    this.entered = false;
    if (this.output.off && this.resizeListener) {
      this.output.off('resize', this.resizeListener);
      this.resizeListener = null;
    }
    this.output.write(`${CSI}0m${CSI}?25h${CSI}?1049l`);
    this.curStyle = null;
  }

  /** Mark the front buffer unknown so the next present() redraws everything. */
  invalidate(): void {
    for (const c of this.front.cells) {
      c.char = '\0';
      c.fg = DEFAULT_COLOR;
      c.bg = DEFAULT_COLOR;
      c.attrs = -1;
    }
  }

  /** Handle a terminal resize (SIGWINCH): reallocate and force a full redraw. */
  resize(columns: number, rows: number): void {
    const w = Math.max(1, columns | 0);
    const h = Math.max(1, rows | 0);
    if (w === this.buffer.width && h === this.buffer.height) return;
    this.buffer.resize(w, h);
    this.front.resize(w, h);
    // After a resize the terminal's contents are unreliable: clear + full redraw.
    this.output.write(`${CSI}0m${CSI}2J${CSI}H`);
    this.curStyle = { fg: DEFAULT_COLOR, bg: DEFAULT_COLOR, attrs: 0 };
    this.invalidate();
  }

  private handleResize(): void {
    this.resize(this.output.columns ?? 80, this.output.rows ?? 24);
  }

  /**
   * Compute the ANSI diff between the back buffer and the front buffer.
   * Returns '' when nothing changed. Exposed for testing.
   */
  diff(): string {
    const w = this.buffer.width;
    const h = this.buffer.height;
    const back = this.buffer.cells;
    const front = this.front.cells;
    let out = '';
    let style = this.curStyle;
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        const i = y * w + x;
        if (cellsEqual(back[i], front[i])) {
          x++;
          continue;
        }
        // span start at x; extend while cells differ, bridging small gaps
        let end = x;
        let lastDiff = x;
        while (end < w) {
          const j = y * w + end;
          if (!cellsEqual(back[j], front[j])) {
            lastDiff = end;
            end++;
          } else if (end - lastDiff <= BRIDGE_GAP) {
            end++;
          } else {
            break;
          }
        }
        out += `${CSI}${y + 1};${x + 1}H`;
        for (let cx = x; cx <= lastDiff; cx++) {
          const c = back[y * w + cx];
          if (!style || style.fg !== c.fg || style.bg !== c.bg || style.attrs !== c.attrs) {
            out += sgrForStyle(c.fg, c.bg, c.attrs, this.mode);
            style = { fg: c.fg, bg: c.bg, attrs: c.attrs };
          }
          out += c.char;
        }
        x = lastDiff + 1;
      }
    }
    if (out.length > 0 && style && (style.fg !== DEFAULT_COLOR || style.bg !== DEFAULT_COLOR || style.attrs !== 0)) {
      out += `${CSI}0m`;
      style = { fg: DEFAULT_COLOR, bg: DEFAULT_COLOR, attrs: 0 };
    }
    this.curStyle = style;
    return out;
  }

  /** Commit the back buffer to the front buffer (mark current frame as displayed). */
  private commit(): void {
    this.front.copyFrom(this.buffer);
  }

  /**
   * Flush the diff to the terminal as a single write (no tearing), pacing frames
   * to the configured FPS. Always `await` the returned promise.
   */
  async present(): Promise<void> {
    if (this.frameMs > 0) {
      const now = performance.now();
      const wait = this.frameMs - (now - this.lastWrite);
      if (wait > 0.5) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
    const out = this.diff();
    if (out.length > 0) {
      this.output.write(out);
    }
    // Pace every frame, even empty diffs — otherwise the caller's loop
    // busy-spins at unbounded speed whenever a frame produces no changes.
    this.lastWrite = performance.now();
    this.commit();
  }
}

// ---------------------------------------------------------------------------
// Screen — convenient high-level wrapper (Buffer drawing + present)
// ---------------------------------------------------------------------------

/**
 * Screen combines a Renderer and its back Buffer behind one drawing API:
 * set / fillRect / drawText / drawBox / clear draw into the next frame,
 * present() flushes the diff. enter()/exit() manage the terminal.
 */
export class Screen {
  readonly renderer: Renderer;

  constructor(options: RendererOptions = {}) {
    this.renderer = new Renderer(options);
  }

  get columns(): number { return this.renderer.columns; }
  get rows(): number { return this.renderer.rows; }

  enter(): void { this.renderer.enter(); }
  exit(): void { this.renderer.exit(); }

  clear(style?: Style): void { this.renderer.buffer.clear(style); }
  set(x: number, y: number, char: string, style?: Style): void { this.renderer.buffer.set(x, y, char, style); }
  get(x: number, y: number): Cell | undefined { return this.renderer.buffer.get(x, y); }
  fillRect(x: number, y: number, w: number, h: number, char: string, style?: Style): void {
    this.renderer.buffer.fillRect(x, y, w, h, char, style);
  }
  drawText(x: number, y: number, text: string, style?: Style): void {
    this.renderer.buffer.drawText(x, y, text, style);
  }
  drawBox(x: number, y: number, w: number, h: number, style?: Style, title?: string): void {
    this.renderer.buffer.drawBox(x, y, w, h, style, title);
  }

  async present(): Promise<void> {
    await this.renderer.present();
  }
}
