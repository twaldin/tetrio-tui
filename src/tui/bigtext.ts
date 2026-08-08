/**
 * Big ASCII-art font renderer for tetrio-tui.
 *
 * Renders text as big blocky glyphs using Unicode full-block characters (█).
 * Two sizes: 'big' (5 rows × 4 cols per char) and 'small' (3 rows × 3 cols).
 * Each "pixel" in the glyph is rendered as a full block character.
 *
 * Zero allocations in render path — glyph data is static bitmaps.
 */
import type { RenderBuffer, Style, RGB } from '../tui/app.js';

// ---------------------------------------------------------------------------
// Glyph definitions — binary bitmaps
// 'big' glyphs: 5 rows tall, up to 5 columns wide (each col = 1 terminal char)
// 'small' glyphs: 3 rows tall, up to 4 columns wide
// 1 = filled, 0 = empty
// ---------------------------------------------------------------------------

type BigGlyph = number[][]; // rows of column flags

const BIG: Record<string, BigGlyph> = {
  // Letters — 5 rows × 4-5 cols
  'A': [[0,1,1,0],[1,0,0,1],[1,1,1,1],[1,0,0,1],[1,0,0,1]],
  'B': [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,1],[1,1,1,0]],
  'C': [[0,1,1,1],[1,0,0,0],[1,0,0,0],[1,0,0,0],[0,1,1,1]],
  'D': [[1,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,1,1,0]],
  'E': [[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,1,1,1]],
  'F': [[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,0,0,0]],
  'G': [[0,1,1,1],[1,0,0,0],[1,0,1,1],[1,0,0,1],[0,1,1,1]],
  'H': [[1,0,0,1],[1,0,0,1],[1,1,1,1],[1,0,0,1],[1,0,0,1]],
  'I': [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[1,1,1]],
  'J': [[0,0,1],[0,0,1],[0,0,1],[1,0,1],[0,1,0]],
  'K': [[1,0,0,1],[1,0,1,0],[1,1,0,0],[1,0,1,0],[1,0,0,1]],
  'L': [[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]],
  'M': [[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1]],
  'N': [[1,0,0,1],[1,1,0,1],[1,0,1,1],[1,0,0,1],[1,0,0,1]],
  'O': [[0,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
  'P': [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,0],[1,0,0,0]],
  'Q': [[0,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,1,0],[0,1,0,1]],
  'R': [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,1,0],[1,0,0,1]],
  'S': [[0,1,1,1],[1,0,0,0],[0,1,1,0],[0,0,0,1],[1,1,1,0]],
  'T': [[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
  'U': [[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
  'V': [[1,0,0,0,1],[1,0,0,0,1],[0,1,0,1,0],[0,1,0,1,0],[0,0,1,0,0]],
  'W': [[1,0,0,0,1],[1,0,0,0,1],[1,0,1,0,1],[1,1,0,1,1],[1,0,0,0,1]],
  'X': [[1,0,0,1],[0,1,1,0],[0,1,1,0],[0,1,1,0],[1,0,0,1]],
  'Y': [[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
  'Z': [[1,1,1,1],[0,0,1,0],[0,1,0,0],[1,0,0,0],[1,1,1,1]],
  // Numbers
  '0': [[0,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
  '1': [[0,1,0],[1,1,0],[0,1,0],[0,1,0],[1,1,1]],
  '2': [[0,1,1,0],[1,0,0,1],[0,0,1,0],[0,1,0,0],[1,1,1,1]],
  '3': [[1,1,1,0],[0,0,0,1],[0,1,1,0],[0,0,0,1],[1,1,1,0]],
  '4': [[1,0,0,1],[1,0,0,1],[1,1,1,1],[0,0,0,1],[0,0,0,1]],
  '5': [[1,1,1,1],[1,0,0,0],[1,1,1,0],[0,0,0,1],[1,1,1,0]],
  '6': [[0,1,1,0],[1,0,0,0],[1,1,1,0],[1,0,0,1],[0,1,1,0]],
  '7': [[1,1,1,1],[0,0,0,1],[0,0,1,0],[0,1,0,0],[0,1,0,0]],
  '8': [[0,1,1,0],[1,0,0,1],[0,1,1,0],[1,0,0,1],[0,1,1,0]],
  '9': [[0,1,1,0],[1,0,0,1],[0,1,1,1],[0,0,0,1],[0,1,1,0]],
  // Symbols
  '+': [[0,0,0],[0,1,0],[1,1,1],[0,1,0],[0,0,0]],
  '-': [[0,0,0],[0,0,0],[1,1,1],[0,0,0],[0,0,0]],
  '!': [[0,1,0],[0,1,0],[0,1,0],[0,0,0],[0,1,0]],
  '×': [[0,0,0],[1,0,1],[0,1,0],[1,0,1],[0,0,0]],
  ' ': [[0,0],[0,0],[0,0],[0,0],[0,0]],
  '.': [[0,0],[0,0],[0,0],[0,0],[0,1]],
  ':': [[0],[1],[0],[1],[0]],
  '★': [[0,0,1,0,0],[1,1,1,1,1],[0,1,1,1,0],[1,0,0,0,1],[0,0,0,0,0]],
};

const SMALL: Record<string, BigGlyph> = {
  // Letters — 3 rows × 3-4 cols
  'A': [[0,1,0],[1,0,1],[1,1,1]],
  'B': [[1,1,0],[1,1,1],[1,1,0]],
  'C': [[0,1,1],[1,0,0],[0,1,1]],
  'D': [[1,1,0],[1,0,1],[1,1,0]],
  'E': [[1,1,1],[1,1,0],[1,1,1]],
  'F': [[1,1,1],[1,1,0],[1,0,0]],
  'G': [[0,1,1],[1,0,0],[1,1,1]],
  'H': [[1,0,1],[1,1,1],[1,0,1]],
  'I': [[1,1,1],[0,1,0],[1,1,1]],
  'J': [[0,0,1],[0,0,1],[1,1,0]],
  'K': [[1,0,1],[1,1,0],[1,0,1]],
  'L': [[1,0,0],[1,0,0],[1,1,1]],
  'M': [[1,0,1],[1,1,1],[1,0,1]],
  'N': [[1,0,1],[1,1,1],[1,0,1]],
  'O': [[0,1,0],[1,0,1],[0,1,0]],
  'P': [[1,1,0],[1,1,0],[1,0,0]],
  'Q': [[0,1,0],[1,0,1],[0,1,1]],
  'R': [[1,1,0],[1,1,0],[1,0,1]],
  'S': [[0,1,1],[0,1,0],[1,1,0]],
  'T': [[1,1,1],[0,1,0],[0,1,0]],
  'U': [[1,0,1],[1,0,1],[0,1,0]],
  'V': [[1,0,1],[1,0,1],[0,1,0]],
  'W': [[1,0,1],[1,1,1],[1,0,1]],
  'X': [[1,0,1],[0,1,0],[1,0,1]],
  'Y': [[1,0,1],[0,1,0],[0,1,0]],
  'Z': [[1,1,1],[0,1,0],[1,1,1]],
  // Numbers
  '0': [[1,1,1],[1,0,1],[1,1,1]],
  '1': [[0,1,0],[1,1,0],[0,1,0]],
  '2': [[1,1,0],[0,1,0],[0,1,1]],
  '3': [[1,1,0],[0,1,0],[1,1,0]],
  '4': [[1,0,1],[1,1,1],[0,0,1]],
  '5': [[0,1,1],[0,1,0],[1,1,0]],
  '6': [[0,1,1],[1,1,0],[1,1,1]],
  '7': [[1,1,1],[0,0,1],[0,0,1]],
  '8': [[1,1,1],[0,1,0],[1,1,1]],
  '9': [[1,1,1],[0,1,1],[1,1,0]],
  // Symbols
  '+': [[0,1,0],[1,1,1],[0,1,0]],
  '-': [[0,0,0],[1,1,1],[0,0,0]],
  '!': [[0,1,0],[0,1,0],[0,1,0]],
  '×': [[1,0,1],[0,1,0],[1,0,1]],
  ' ': [[0],[0],[0]],
  '.': [[0,0],[0,0],[0,1]],
  ':': [[1],[0],[1]],
  '★': [[0,1,0],[1,1,1],[1,0,1]],
};

/** Get the width of a glyph in columns. */
function glyphWidth(g: BigGlyph): number {
  return g[0]?.length ?? 0;
}

/** Measure the total width of a big-text string (including 1-col gaps between chars). */
export function measureBigText(text: string, size: 'big' | 'small' = 'big'): { width: number; height: number } {
  const glyphs = size === 'big' ? BIG : SMALL;
  const height = size === 'big' ? 5 : 3;
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toUpperCase();
    const g = glyphs[ch];
    if (g) {
      if (i > 0) width += 1; // gap between chars
      width += glyphWidth(g);
    }
  }
  return { width, height };
}

/**
 * Render big text into a RenderBuffer at position (x, y).
 * Each filled pixel is rendered as a '█' character.
 * Returns the total width consumed.
 */
export function renderBigText(
  buf: RenderBuffer,
  x: number,
  y: number,
  text: string,
  style: Style,
  size: 'big' | 'small' = 'big',
): number {
  const glyphs = size === 'big' ? BIG : SMALL;
  const rows = size === 'big' ? 5 : 3;
  let cx = x;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toUpperCase();
    const g = glyphs[ch];
    if (!g) continue;
    if (i > 0) cx += 1; // gap between chars

    for (let row = 0; row < rows && row < g.length; row++) {
      const glyphRow = g[row];
      for (let col = 0; col < glyphRow.length; col++) {
        if (glyphRow[col]) {
          buf.set(cx + col, y + row, '█', style);
        }
      }
    }
    cx += glyphWidth(g);
  }
  return cx - x;
}

/**
 * Render big text centered horizontally within a given width.
 * Returns the actual x position where text started.
 */
export function renderBigTextCentered(
  buf: RenderBuffer,
  centerX: number,
  y: number,
  text: string,
  style: Style,
  size: 'big' | 'small' = 'big',
  _maxWidth?: number,
): number {
  const measured = measureBigText(text, size);
  const startX = centerX - Math.floor(measured.width / 2);
  renderBigText(buf, startX, y, text, style, size);
  return startX;
}

/**
 * Choose the appropriate big-text size based on combo count.
 * Low combos: small (3 rows), high combos: big (5 rows).
 */
export function comboSize(combo: number): 'big' | 'small' {
  return combo >= 5 ? 'big' : 'small';
}

/**
 * Render a combo counter with scaling size.
 * Shows "COMBO" label + big number that grows with combo count.
 */
export function renderComboCounter(
  buf: RenderBuffer,
  x: number,
  y: number,
  combo: number,
  color: RGB,
  accentColor: RGB,
): { width: number; height: number } {
  const size = comboSize(combo);
  const numStr = String(combo);
  const label = 'COMBO';

  // Label on top row
  const labelStyle: Style = { fg: accentColor, bold: true };
  buf.drawText(x, y, label, labelStyle);

  // Big number below label
  const numY = y + 1;
  const numStyle: Style = { fg: color, bold: true };
  const numWidth = renderBigText(buf, x, numY, numStr, numStyle, size);
  const height = 1 + (size === 'big' ? 5 : 3);

  return { width: Math.max(label.length, numWidth), height };
}

/**
 * Render a B2B (back-to-back) counter with big text.
 */
export function renderB2BCounter(
  buf: RenderBuffer,
  x: number,
  y: number,
  b2b: number,
  color: RGB,
): { width: number; height: number } {
  const label = 'B2B';
  const numStr = String(b2b);

  // Label
  buf.drawText(x, y, label, { fg: color, bold: true });

  // Counter below
  const numY = y + 1;
  const numWidth = renderBigText(buf, x, numY, numStr, { fg: color }, 'small');
  return { width: Math.max(label.length, numWidth), height: 4 };
}

/**
 * Render a clear-type label in big text (SINGLE, DOUBLE, TRIPLE, TETRIS, T-SPIN, etc.)
 */
export function renderClearLabel(
  buf: RenderBuffer,
  x: number,
  y: number,
  clearType: string,
  color: RGB,
  size: 'big' | 'small' = 'small',
): number {
  return renderBigText(buf, x, y, clearType, { fg: color, bold: true }, size);
}
