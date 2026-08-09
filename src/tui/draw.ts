/** Shared drawing helpers — themed pieces with pluggable piece-style system. */
import type { BoardGrid, Cell, PieceType } from '../types.js';
import type { RenderBuffer, Style, RGB } from './app.js';
import { theme, type Theme } from './themes.js';
import { pieceStyleDef } from './pieceStyles.js';

// ---------------------------------------------------------------------------
// Re-export a THEME proxy so existing `import { THEME } from './draw.js'`
// still compiles — the proxy forwards every property read to the live theme.
// ---------------------------------------------------------------------------

/** @deprecated – prefer `import { theme } from './themes.js'` directly. */
export const THEME: Theme = new Proxy({} as Theme, {
  get(_target, prop) { return (theme() as any)[prop]; },
});

/** Piece color lookup via the active theme. */
export function pieceColor(type: string): RGB {
  const t = theme();
  return (t.pieces as any)[type] ?? t.pieces.g;
}

/** Darker shade of a color. */
function shade(c: RGB, f: number): RGB {
  return [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f)];
}
/** Lighter shade / highlight. */
function tint(c: RGB, f: number): RGB {
  return [
    Math.min(255, Math.round(c[0] + (255 - c[0]) * f)),
    Math.min(255, Math.round(c[1] + (255 - c[1]) * f)),
    Math.min(255, Math.round(c[2] + (255 - c[2]) * f)),
  ];
}

// Backwards compat
export const PIECE_COLORS: Record<string, RGB> = new Proxy({} as Record<string, RGB>, {
  get(_target, prop) { return pieceColor(prop as string); },
});

export function pieceStyle(type: string, ghost = false): Style {
  const t = theme();
  const c = ghost ? t.pieces.ghost : pieceColor(type);
  return { fg: c };
}

// ---------------------------------------------------------------------------
// Board rendering — uses the active piece style from pieceStyles.ts
// ---------------------------------------------------------------------------

/** Pre-computed board styles: empties + panel bg (mino rendering delegated to pieceStyles). */
let _bc: {
  ea: Style; eb: Style; pb: Style;
  _t: Theme;
} | null = null;
function bc(): NonNullable<typeof _bc> {
  const t = theme();
  if (_bc && _bc._t === t) return _bc;
  _bc = { ea: { bg: t.boardA }, eb: { bg: t.boardB }, pb: { bg: t.panel }, _t: t };
  return _bc;
}

/** Draw the playfield with a checkerboard grid. Each mino = 2 chars wide. */
export function drawBoard(
  buf: RenderBuffer,
  x: number,
  y: number,
  grid: BoardGrid,
  opts: { ghostSet?: Set<number> | null; width?: number; height?: number } = {},
): number {
  const h = grid.length;
  const w = grid[0]?.length ?? 10;
  const gs = opts.ghostSet;
  const c = bc();
  const style = pieceStyleDef();
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const cell = grid[row][col];
      const px = x + col * 2;
      const py = y + row;
      if (cell) {
        style.drawMino(buf, px, py, cell);
      } else if (gs && gs.has(row * 256 + col)) {
        style.drawGhost(buf, px, py);
      } else {
        const s = (row + col) % 2 === 0 ? c.ea : c.eb;
        buf.set(px, py, ' ', s);
        buf.set(px + 1, py, ' ', s);
      }
    }
  }
  return w * 2;
}

// ---------------------------------------------------------------------------
// Piece previews (hold / next)
// ---------------------------------------------------------------------------

export const PIECE_SHAPES: Record<string, number[][]> = {
  i: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  o: [[1,1],[1,1]],
  t: [[0,1,0],[1,1,1],[0,0,0]],
  s: [[0,1,1],[1,1,0],[0,0,0]],
  z: [[1,1,0],[0,1,1],[0,0,0]],
  l: [[0,0,1],[1,1,1],[0,0,0]],
  j: [[1,0,0],[1,1,1],[0,0,0]],
};

/** Draw a piece preview centered in a box (hold / next). */
export function drawPiecePreview(buf: RenderBuffer, x: number, y: number, type: PieceType | null): void {
  const cc = bc();
  for (let r = 0; r < 4; r++) for (let col = 0; col < 8; col++) buf.set(x + col, y + r, ' ', cc.pb);
  if (!type) return;
  const shape = PIECE_SHAPES[type];
  if (!shape) return;
  const style = pieceStyleDef();
  const rows = shape.length, cols = shape[0].length;
  const ox = Math.max(0, Math.floor((8 - cols * 2) / 2));
  const oy = Math.max(0, Math.floor((4 - rows) / 2));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (shape[r][c]) {
        style.drawMino(buf, x + ox + c * 2, y + oy + r, type);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Boxes & panels — rounded corners
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Border-style system — pluggable box glyph presets (tetro-tui inspired).
//
// Each preset defines panel glyphs (hold/next/menus) and board glyphs (the
// playfield frame, one tier heavier). 'none' renders borderless "floating"
// panels (zen). The active preset is a module singleton selected by config
// key; a theme may also provide glyph overrides (see themes.ts `borders`).
// ---------------------------------------------------------------------------

export interface BorderGlyphs {
  tl: string; tr: string; bl: string; br: string;
  h: string; v: string;
  /** Optional distinct bottom edge (tetro-tui's ▀ solid floor). Defaults to h. */
  hb?: string;
  /** title join glyphs (drawPanel): titleL = ┤-like, titleR = ├-like. */
  titleL: string; titleR: string;
}

export interface BorderPreset {
  readonly name: string;
  readonly label: string;
  readonly panel: BorderGlyphs;
  readonly board: BorderGlyphs;
}

const G = (tl: string, tr: string, bl: string, br: string, h: string, v: string, titleL: string, titleR: string): BorderGlyphs =>
  ({ tl, tr, bl, br, h, v, titleL, titleR });

export const BORDER_STYLES: Record<string, BorderPreset> = {
  rounded: {
    name: 'rounded', label: 'Rounded',
    panel: G('╭', '╮', '╰', '╯', '─', '│', '┤', '├'),
    board: G('┏', '┓', '┗', '┛', '━', '┃', '┥', '┝'),
  },
  single: {
    name: 'single', label: 'Single',
    panel: G('┌', '┐', '└', '┘', '─', '│', '┤', '├'),
    board: G('┌', '┐', '└', '┘', '─', '│', '┤', '├'),
  },
  double: {
    name: 'double', label: 'Double',
    panel: G('╔', '╗', '╚', '╝', '═', '║', '╡', '╞'),
    board: G('╔', '╗', '╚', '╝', '═', '║', '╡', '╞'),
  },
  heavy: {
    name: 'heavy', label: 'Heavy',
    panel: G('┏', '┓', '┗', '┛', '━', '┃', '┥', '┝'),
    board: G('┏', '┓', '┗', '┛', '━', '┃', '┥', '┝'),
  },
  mixed: {
    // tetro-tui's signature: double sides, dashed top, solid ▀ half-block floor.
    name: 'mixed', label: 'Mixed (tetro)',
    panel: G('╭', '╮', '╰', '╯', '─', '│', '┤', '├'),
    board: { ...G('╓', '╖', '╙', '╜', '╴', '║', '╡', '╞'), hb: '▀' },
  },
  ascii: {
    name: 'ascii', label: 'ASCII',
    panel: G('+', '+', '+', '+', '-', '|', '>', '<'),
    board: G('+', '+', '#', '#', '=', '|', '>', '<'),
  },
  none: {
    name: 'none', label: 'None (zen)',
    panel: G(' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '),
    board: G(' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '),
  },
};

export const BORDER_STYLE_KEYS: readonly string[] = Object.keys(BORDER_STYLES);
export const DEFAULT_BORDER_STYLE = 'rounded';

let _activeBorderKey: string = DEFAULT_BORDER_STYLE;

/** Switch the active border preset. Returns false if the key is unknown. */
export function setBorderStyle(key: string): boolean {
  if (!BORDER_STYLES[key]) return false;
  _activeBorderKey = key;
  return true;
}

export function getBorderStyleKey(): string { return _activeBorderKey; }

/** Resolve the live glyph set: preset base + optional theme overrides. */
export function borderGlyphs(kind: 'panel' | 'board'): BorderGlyphs {
  const base = BORDER_STYLES[_activeBorderKey]?.[kind] ?? BORDER_STYLES[DEFAULT_BORDER_STYLE][kind];
  const ov = (theme() as unknown as { borders?: Partial<BorderGlyphs> }).borders;
  if (!ov) return base;
  return { ...base, ...Object.fromEntries(Object.entries(ov).filter(([, v]) => typeof v === 'string' && v.length > 0)) };
}

/** Draw a box using the active panel border preset. */
export function drawBox(buf: RenderBuffer, x: number, y: number, w: number, h: number, style?: Style): void {
  const t = theme();
  const s = style ?? { fg: t.border };
  const g = borderGlyphs('panel');
  buf.set(x, y, g.tl, s); buf.set(x + w - 1, y, g.tr, s);
  buf.set(x, y + h - 1, g.bl, s); buf.set(x + w - 1, y + h - 1, g.br, s);
  for (let i = 1; i < w - 1; i++) { buf.set(x + i, y, g.h, s); buf.set(x + i, y + h - 1, g.h, s); }
  for (let i = 1; i < h - 1; i++) { buf.set(x, y + i, g.v, s); buf.set(x + w - 1, y + i, g.v, s); }
}

/** Draw the playfield frame using the active board border preset. */
export function drawBoardBorder(buf: RenderBuffer, x: number, y: number, w: number, h: number, style?: Style): void {
  const t = theme();
  const s = style ?? { fg: t.borderBright };
  const g = borderGlyphs('board');
  const hb = g.hb ?? g.h;
  buf.set(x, y, g.tl, s); buf.set(x + w - 1, y, g.tr, s);
  buf.set(x, y + h - 1, g.bl, s); buf.set(x + w - 1, y + h - 1, g.br, s);
  for (let i = 1; i < w - 1; i++) { buf.set(x + i, y, g.h, s); buf.set(x + i, y + h - 1, hb, s); }
  for (let i = 1; i < h - 1; i++) { buf.set(x, y + i, g.v, s); buf.set(x + w - 1, y + i, g.v, s); }
}

/** Draw a panel box with a title in the top border. */
export function drawPanel(buf: RenderBuffer, x: number, y: number, w: number, h: number, title: string, opts: { color?: RGB; fill?: boolean } = {}): void {
  const t = theme();
  const color = opts.color ?? t.border;
  if (opts.fill !== false) buf.fillRect(x, y, w, h, ' ', { bg: t.panel });
  drawBox(buf, x, y, w, h, { fg: color });
  if (title) {
    const g = borderGlyphs('panel');
    const tx = x + 2;
    buf.set(tx - 1, y, g.titleL, { fg: color });
    buf.drawText(tx, y, ` ${title} `, { fg: t.dim, bold: true, bg: t.panel });
    buf.set(tx + title.length + 2, y, g.titleR, { fg: color });
  }
}

export function center(buf: RenderBuffer, y: number, text: string, style?: Style): void {
  buf.drawText(Math.max(0, Math.floor((buf.width - text.length) / 2)), y, text, style);
}

/** A menu card (bordered, colored accent edge, big label + subtitle). */
export function drawMenuItem(buf: RenderBuffer, x: number, y: number, w: number, label: string, sub: string, selected: boolean, color: RGB): void {
  const t = theme();
  const h = 3;
  if (selected) {
    buf.fillRect(x, y, w, h, ' ', { bg: color });
    for (let i = 0; i < h; i++) buf.set(x, y + i, '▌', { fg: shade(color, 0.6), bg: color });
    buf.drawText(x + 2, y, label, { fg: [12, 12, 20] as RGB, bold: true, bg: color });
    buf.drawText(x + 2, y + 1, sub, { fg: [30, 30, 44] as RGB, bg: color });
  } else {
    buf.fillRect(x, y, w, h, ' ', { bg: t.panel });
    for (let i = 0; i < h; i++) buf.set(x, y + i, '▌', { fg: color, bg: t.panel });
    buf.drawText(x + 2, y, label, { fg: t.text, bold: true });
    buf.drawText(x + 2, y + 1, sub, { fg: t.dim });
  }
}
