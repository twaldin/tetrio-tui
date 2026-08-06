/** Shared drawing helpers + TETR.IO-ish theme (higher contrast). */
import type { BoardGrid, Cell, PieceType } from '../types.js';
import type { RenderBuffer, Style, RGB } from './app.js';

export const THEME = {
  bg: [8, 8, 14] as RGB,
  panel: [20, 20, 34] as RGB,
  panelAlt: [14, 14, 24] as RGB,
  border: [110, 110, 150] as RGB,
  borderBright: [150, 170, 220] as RGB,
  text: [235, 235, 245] as RGB,
  dim: [150, 150, 180] as RGB,
  faint: [70, 70, 95] as RGB,
  accent: [255, 85, 200] as RGB,   // tetrio magenta
  accent2: [90, 200, 255] as RGB,  // tetrio cyan
  good: [120, 255, 140] as RGB,
  warn: [255, 220, 90] as RGB,
  bad: [255, 90, 90] as RGB,
  league: [255, 60, 90] as RGB,
  solo: [90, 120, 255] as RGB,
  channel: [90, 230, 120] as RGB,
  config: [90, 170, 255] as RGB,
  // board cell shades (checkerboard)
  boardA: [16, 16, 28] as RGB,
  boardB: [22, 22, 36] as RGB,
  gridLine: [40, 42, 60] as RGB,
};

/** Mino colors per piece type (bright, high-contrast). */
export const PIECE_COLORS: Record<string, RGB> = {
  i: [80, 230, 250],
  o: [250, 225, 70],
  t: [210, 100, 250],
  s: [90, 235, 100],
  z: [250, 80, 90],
  l: [250, 165, 60],
  j: [95, 130, 250],
  g: [120, 120, 132], // garbage
  ghost: [90, 90, 110],
};

/** Darker shade of a color (for the bottom half of a mino, adds depth). */
function shade(c: RGB, f: number): RGB { return [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f)]; }

/** Pre-computed shaded (0.82) mino colors — avoids per-cell shade() allocation. */
const PIECE_COLORS_SHADED: Record<string, RGB> = Object.fromEntries(
  Object.entries(PIECE_COLORS).map(([k, v]) => [k, shade(v, 0.82)])
) as Record<string, RGB>;

/** Pre-computed Style objects for board cells — avoids per-cell object creation. */
const MINO_STYLE: Record<string, Style> = Object.fromEntries(
  Object.entries(PIECE_COLORS).map(([k, v]) => [k, { fg: v }])
) as Record<string, Style>;
const MINO_STYLE_SHADED: Record<string, Style> = Object.fromEntries(
  Object.entries(PIECE_COLORS_SHADED).map(([k, v]) => [k, { fg: v }])
) as Record<string, Style>;
const GHOST_STYLE: Style = { fg: PIECE_COLORS.ghost };
const BOARD_STYLE_A: Style = { bg: THEME.boardA };
const BOARD_STYLE_B: Style = { bg: THEME.boardB };

export function pieceStyle(type: string, ghost = false): Style {
  const c = ghost ? PIECE_COLORS.ghost : (PIECE_COLORS[type] ?? PIECE_COLORS.g);
  return { fg: c };
}

/** Draw the playfield with a checkerboard grid. Each mino = 2 chars wide. Returns pixel width. */
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
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const cell = grid[row][col];
      const px = x + col * 2;
      const py = y + row;
      if (cell) {
        // 2-tone mino: bright top, slightly darker bottom (reads as depth)
        buf.set(px, py, '█', MINO_STYLE[cell] ?? MINO_STYLE.g);
        buf.set(px + 1, py, '█', MINO_STYLE_SHADED[cell] ?? MINO_STYLE_SHADED.g);
      } else if (gs && gs.has(row * 256 + col)) {
        buf.set(px, py, '░', GHOST_STYLE);
        buf.set(px + 1, py, '░', GHOST_STYLE);
      } else {
        // checkerboard empty cells for readability
        buf.set(px, py, ' ', (row + col) % 2 === 0 ? BOARD_STYLE_A : BOARD_STYLE_B);
        buf.set(px + 1, py, ' ', (row + col) % 2 === 0 ? BOARD_STYLE_A : BOARD_STYLE_B);
      }
    }
  }
  return w * 2;
}

/** Draw a piece preview centered in a box (hold / next). */
export function drawPiecePreview(buf: RenderBuffer, x: number, y: number, type: PieceType | null): void {
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) buf.set(x + c, y + r, ' ', { bg: THEME.panel });
  if (!type) return;
  const shape = PIECE_SHAPES[type];
  if (!shape) return;
  const c = PIECE_COLORS[type];
  const cd = shade(c, 0.82);
  const rows = shape.length, cols = shape[0].length;
  const ox = Math.max(0, Math.floor((8 - cols * 2) / 2));
  const oy = Math.max(0, Math.floor((4 - rows) / 2));
  for (let r = 0; r < rows; r++) {
    for (let cc = 0; cc < cols; cc++) {
      if (shape[r][cc]) {
        buf.set(x + ox + cc * 2, y + oy + r, '█', { fg: c });
        buf.set(x + ox + cc * 2 + 1, y + oy + r, '█', { fg: cd });
      }
    }
  }
}

export const PIECE_SHAPES: Record<string, number[][]> = {
  i: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  o: [[1,1],[1,1]],
  t: [[0,1,0],[1,1,1],[0,0,0]],
  s: [[0,1,1],[1,1,0],[0,0,0]],
  z: [[1,1,0],[0,1,1],[0,0,0]],
  l: [[0,0,1],[1,1,1],[0,0,0]],
  j: [[1,0,0],[1,1,1],[0,0,0]],
};

/** Draw a panel box with a title in the top border. */
export function drawPanel(buf: RenderBuffer, x: number, y: number, w: number, h: number, title: string, opts: { color?: RGB; fill?: boolean } = {}): void {
  const color = opts.color ?? THEME.border;
  if (opts.fill !== false) buf.fillRect(x, y, w, h, ' ', { bg: THEME.panel });
  drawBox(buf, x, y, w, h, { fg: color });
  if (title) {
    buf.drawText(x + 2, y, ` ${title} `, { fg: THEME.dim, bg: THEME.panel });
  }
}

export function drawBox(buf: RenderBuffer, x: number, y: number, w: number, h: number, style?: Style): void {
  if (buf.drawBox) { buf.drawBox(x, y, w, h, style); return; }
  const s = style ?? { fg: THEME.border };
  buf.set(x, y, '┌', s); buf.set(x + w - 1, y, '┐', s);
  buf.set(x, y + h - 1, '└', s); buf.set(x + w - 1, y + h - 1, '┘', s);
  for (let i = 1; i < w - 1; i++) { buf.set(x + i, y, '─', s); buf.set(x + i, y + h - 1, '─', s); }
  for (let i = 1; i < h - 1; i++) { buf.set(x, y + i, '│', s); buf.set(x + w - 1, y + i, '│', s); }
}

export function center(buf: RenderBuffer, y: number, text: string, style?: Style): void {
  buf.drawText(Math.max(0, Math.floor((buf.width - text.length) / 2)), y, text, style);
}

/** A menu card (bordered, colored accent edge, big label + subtitle). */
export function drawMenuItem(buf: RenderBuffer, x: number, y: number, w: number, label: string, sub: string, selected: boolean, color: RGB): void {
  const h = 3;
  if (selected) {
    // filled card in the section color, dark text
    buf.fillRect(x, y, w, h, ' ', { bg: color });
    // darker accent edge on the left
    for (let i = 0; i < h; i++) buf.set(x, y + i, '▌', { fg: shade(color, 0.6), bg: color });
    buf.drawText(x + 2, y, label, { fg: [12, 12, 20] as RGB, bold: true, bg: color });
    buf.drawText(x + 2, y + 1, sub, { fg: [30, 30, 44] as RGB, bg: color });
  } else {
    // bordered card, colored left edge, panel bg
    buf.fillRect(x, y, w, h, ' ', { bg: THEME.panel });
    for (let i = 0; i < h; i++) buf.set(x, y + i, '▌', { fg: color, bg: THEME.panel });
    buf.drawText(x + 2, y, label, { fg: THEME.text, bold: true });
    buf.drawText(x + 2, y + 1, sub, { fg: THEME.dim });
  }
}
