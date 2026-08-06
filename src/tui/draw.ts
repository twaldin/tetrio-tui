/** Shared drawing helpers + TETR.IO-ish theme. */
import type { BoardGrid, Cell, PieceType } from '../types.js';
import type { RenderBuffer, Style, RGB } from './app.js';

export const THEME = {
  bg: [10, 10, 18] as RGB,
  panel: [24, 24, 40] as RGB,
  border: [70, 70, 100] as RGB,
  text: [220, 220, 235] as RGB,
  dim: [130, 130, 160] as RGB,
  accent: [255, 85, 200] as RGB,   // tetrio magenta
  accent2: [90, 200, 255] as RGB,  // tetrio cyan
  good: [120, 255, 140] as RGB,
  warn: [255, 220, 90] as RGB,
  bad: [255, 90, 90] as RGB,
  league: [255, 60, 90] as RGB,
  solo: [90, 120, 255] as RGB,
  channel: [90, 230, 120] as RGB,
  config: [90, 170, 255] as RGB,
};

/** Mino colors per piece type (TETR.IO-ish palette). */
export const PIECE_COLORS: Record<string, RGB> = {
  i: [60, 220, 240],
  o: [240, 220, 60],
  t: [200, 90, 240],
  s: [80, 220, 90],
  z: [240, 70, 80],
  l: [240, 160, 50],
  j: [80, 120, 240],
  g: [110, 110, 120], // garbage
  ghost: [90, 90, 110],
};

export function pieceStyle(type: string, ghost = false): Style {
  const c = ghost ? PIECE_COLORS.ghost : (PIECE_COLORS[type] ?? PIECE_COLORS.g);
  return { fg: c };
}

/** Draw the playfield. Each mino = 2 chars wide. Returns the pixel width used. */
export function drawBoard(
  buf: RenderBuffer,
  x: number,
  y: number,
  grid: BoardGrid,
  opts: { ghost?: BoardGrid; width?: number; height?: number } = {},
): number {
  const h = grid.length;
  const w = grid[0]?.length ?? 10;
  // frame
  buf.fillRect(x, y, w * 2 + 2, h + 2, ' ', { bg: THEME.panel });
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const cell = grid[row][col];
      const ghostCell = opts.ghost?.[row]?.[col];
      const px = x + 1 + col * 2;
      const py = y + 1 + row;
      if (cell) {
        buf.set(px, py, '██', pieceStyle(cell));
      } else if (ghostCell) {
        buf.set(px, py, '░░', pieceStyle(ghostCell, true));
      } else {
        buf.set(px, py, '  ', {});
      }
    }
  }
  return w * 2 + 2;
}

/** Draw a single piece (e.g. hold or next preview) centered in a box. */
export function drawPiecePreview(buf: RenderBuffer, x: number, y: number, type: PieceType | null): void {
  buf.fillRect(x, y, 10, 5, ' ', { bg: THEME.panel });
  if (!type) return;
  const shape = PIECE_SHAPES[type];
  if (!shape) return;
  const st = pieceStyle(type);
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) buf.set(x + 1 + c * 2, y + 1 + r, '██', st);
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

/** A menu list row with highlight. */
export function drawMenuItem(buf: RenderBuffer, x: number, y: number, w: number, label: string, sub: string, selected: boolean, color: RGB): void {
  const bg = selected ? color : THEME.panel;
  const fg = selected ? [10, 10, 18] as RGB : THEME.text;
  buf.fillRect(x, y, w, 3, ' ', { bg });
  buf.drawText(x + 2, y, label, { fg, bold: true });
  buf.drawText(x + 2, y + 1, sub, { fg: selected ? fg : THEME.dim });
}
