/** Shared drawing helpers — themed, one-tone pieces with inner bevel. */
import type { BoardGrid, Cell, PieceType } from '../types.js';
import type { RenderBuffer, Style, RGB } from './app.js';
import { theme, type Theme } from './themes.js';

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
// Board rendering — one-tone minoes with inner bevel
// ---------------------------------------------------------------------------

/**
 * Draw a single mino (2 chars wide) at pixel position (px, py).
 * One-tone: both cells use the same base color as BG, with a
 * subtle inner corner/bevel rendered via block-drawing characters.
 *
 * The left cell gets a slightly brighter top-left corner feel (▐ with
 * tint fg on base bg), the right cell gets a slightly darker bottom-right
 * (▌ with shade fg on base bg). This reads as a clean bevel without the
 * jarring 2-tone split.
 */
/** Pre-computed board styles: piece mino left/right, ghost, empties, panel bg. */
let _bc: {
  ml: Record<string, Style>; mr: Record<string, Style>;
  gl: Style; gr: Style; ea: Style; eb: Style; pb: Style;
  _t: Theme;
} | null = null;
function bc(): NonNullable<typeof _bc> {
  const t = theme();
  if (_bc && _bc._t === t) return _bc;
  const p = t.pieces;
  const keys = ['i','o','t','s','z','l','j','g'] as const;
  const ml: Record<string, Style> = {};
  const mr: Record<string, Style> = {};
  for (const k of keys) { ml[k] = { fg: tint(p[k], 0.25), bg: p[k] }; mr[k] = { fg: shade(p[k], 0.72), bg: p[k] }; }
  const gc = p.ghost, gs5 = shade(gc, 0.5);
  _bc = { ml, mr, gl: { fg: tint(gc, 0.3), bg: gs5 }, gr: { fg: shade(gc, 0.3), bg: gs5 },
    ea: { bg: t.boardA }, eb: { bg: t.boardB }, pb: { bg: t.panel }, _t: t };
  return _bc;
}

function drawMino(buf: RenderBuffer, px: number, py: number, c: RGB): void {
  buf.set(px, py, '▐', { fg: tint(c, 0.25), bg: c });
  buf.set(px + 1, py, '▌', { fg: shade(c, 0.72), bg: c });
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
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const cell = grid[row][col];
      const px = x + col * 2;
      const py = y + row;
      if (cell) {
        buf.set(px, py, '▐', c.ml[cell] ?? c.ml.g);
        buf.set(px + 1, py, '▌', c.mr[cell] ?? c.mr.g);
      } else if (gs && gs.has(row * 256 + col)) {
        buf.set(px, py, '▐', c.gl);
        buf.set(px + 1, py, '▌', c.gr);
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
  const ml = cc.ml[type] ?? cc.ml.g;
  const mr = cc.mr[type] ?? cc.mr.g;
  const rows = shape.length, cols = shape[0].length;
  const ox = Math.max(0, Math.floor((8 - cols * 2) / 2));
  const oy = Math.max(0, Math.floor((4 - rows) / 2));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (shape[r][c]) {
        buf.set(x + ox + c * 2, y + oy + r, '▐', ml);
        buf.set(x + ox + c * 2 + 1, y + oy + r, '▌', mr);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Boxes & panels — rounded corners
// ---------------------------------------------------------------------------

/** Draw a box with rounded corners (╭╮╰╯). */
export function drawBox(buf: RenderBuffer, x: number, y: number, w: number, h: number, style?: Style): void {
  if (buf.drawBox) { buf.drawBox(x, y, w, h, style); return; }
  const t = theme();
  const s = style ?? { fg: t.border };
  buf.set(x, y, '╭', s); buf.set(x + w - 1, y, '╮', s);
  buf.set(x, y + h - 1, '╰', s); buf.set(x + w - 1, y + h - 1, '╯', s);
  for (let i = 1; i < w - 1; i++) { buf.set(x + i, y, '─', s); buf.set(x + i, y + h - 1, '─', s); }
  for (let i = 1; i < h - 1; i++) { buf.set(x, y + i, '│', s); buf.set(x + w - 1, y + i, '│', s); }
}

/** Draw a strong board border (double-line feel but using box-drawing). */
export function drawBoardBorder(buf: RenderBuffer, x: number, y: number, w: number, h: number, style?: Style): void {
  const t = theme();
  const s = style ?? { fg: t.borderBright };
  buf.set(x, y, '╭', s); buf.set(x + w - 1, y, '╮', s);
  buf.set(x, y + h - 1, '╰', s); buf.set(x + w - 1, y + h - 1, '╯', s);
  for (let i = 1; i < w - 1; i++) { buf.set(x + i, y, '━', s); buf.set(x + i, y + h - 1, '━', s); }
  for (let i = 1; i < h - 1; i++) { buf.set(x, y + i, '┃', s); buf.set(x + w - 1, y + i, '┃', s); }
}

/** Draw a panel box with a title in the top border. */
export function drawPanel(buf: RenderBuffer, x: number, y: number, w: number, h: number, title: string, opts: { color?: RGB; fill?: boolean } = {}): void {
  const t = theme();
  const color = opts.color ?? t.border;
  if (opts.fill !== false) buf.fillRect(x, y, w, h, ' ', { bg: t.panel });
  drawBox(buf, x, y, w, h, { fg: color });
  if (title) {
    const tx = x + 2;
    buf.set(tx - 1, y, '┤', { fg: color });
    buf.drawText(tx, y, ` ${title} `, { fg: t.dim, bold: true, bg: t.panel });
    buf.set(tx + title.length + 2, y, '├', { fg: color });
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
