/**
 * Big ASCII-art text renderer for tetrio-tui.
 *
 * Uses a REAL Figlet font (the classic "small" font by Glenn Chappell, parsed from
 * small.flf) — actual ASCII-art glyphs made of / \ _ | . characters, not hand-drawn
 * block bitmaps. This is far more legible than the previous custom bitmap font.
 *
 * Zero allocations in the render path — glyph data is static strings.
 */
import type { RenderBuffer, Style, RGB } from '../tui/app.js';

// Figlet "small" font glyphs (flf2a$, height 5). Each glyph is 5 rows of ASCII art.
const GLYPHS: Record<string, string[]> = {
  " ": ["", "", "", "", ""],
  "!": ["  _", " | |", " |_|", " (_)", ""],
  "+": ["    _", "  _| |_", " |_   _|", "   |_|", ""],
  "-": ["", "  ___", " |___|", "", ""],
  ".": ["", "", "  _", " (_)", ""],
  "0": ["   __", "  /  \\", " | () |", "  \\__/", ""],
  "1": ["  _", " / |", " | |", " |_|", ""],
  "2": ["  ___", " |_  )", "  / /", " /___|", ""],
  "3": ["  ____", " |__ /", "  |_ \\", " |___/", ""],
  "4": ["  _ _", " | | |", " |_  _|", "   |_|", ""],
  "5": ["  ___", " | __|", " |__ \\", " |___/", ""],
  "6": ["   __", "  / /", " / _ \\", " \\___/", ""],
  "7": ["  ____", " |__  |", "   / /", "  /_/", ""],
  "8": ["  ___", " ( _ )", " / _ \\", " \\___/", ""],
  "9": ["  ___", " / _ \\", " \\_, /", "  /_/", ""],
  ":": ["  _", " (_)", "  _", " (_)", ""],
  "A": ["    _", "   /_\\", "  / _ \\", " /_/ \\_\\", ""],
  "B": ["  ___", " | _ )", " | _ \\", " |___/", ""],
  "C": ["   ___", "  / __|", " | (__", "  \\___|", ""],
  "D": ["  ___", " |   \\", " | |) |", " |___/", ""],
  "E": ["  ___", " | __|", " | _|", " |___|", ""],
  "F": ["  ___", " | __|", " | _|", " |_|", ""],
  "G": ["   ___", "  / __|", " | (_ |", "  \\___|", ""],
  "H": ["  _  _", " | || |", " | __ |", " |_||_|", ""],
  "I": ["  ___", " |_ _|", "  | |", " |___|", ""],
  "J": ["     _", "  _ | |", " | || |", "  \\__/", ""],
  "K": ["  _  __", " | |/ /", " | ' <", " |_|\\_\\", ""],
  "L": ["  _", " | |", " | |__", " |____|", ""],
  "M": ["  __  __", " |  \\/  |", " | |\\/| |", " |_|  |_|", ""],
  "N": ["  _  _", " | \\| |", " | .` |", " |_|\\_|", ""],
  "O": ["   ___", "  / _ \\", " | (_) |", "  \\___/", ""],
  "P": ["  ___", " | _ \\", " |  _/", " |_|", ""],
  "Q": ["   ___", "  / _ \\", " | (_) |", "  \\__\\_\\", ""],
  "R": ["  ___", " | _ \\", " |   /", " |_|_\\", ""],
  "S": ["  ___", " / __|", " \\__ \\", " |___/", ""],
  "T": ["  _____", " |_   _|", "   | |", "   |_|", ""],
  "U": ["  _   _", " | | | |", " | |_| |", "  \\___/", ""],
  "V": [" __   __", " \\ \\ / /", "  \\ V /", "   \\_/", ""],
  "W": [" __      __", " \\ \\    / /", "  \\ \\/\\/ /", "   \\_/\\_/", ""],
  "X": [" __  __", " \\ \\/ /", "  >  <", " /_/\\_\\", ""],
  "Y": [" __   __", " \\ \\ / /", "  \\ V /", "   |_|", ""],
  "Z": ["  ____", " |_  /", "  / /", " /___|", ""],
};

const GLYPH_HEIGHT = 5;
const GLYPH_GAP = 1;

/** Get the rendered width of a glyph in columns (max row length). */
function glyphWidth(g: string[]): number {
  let w = 0;
  for (const r of g) w = Math.max(w, r.length);
  return w;
}

/** Measure the total width of a big-text string (including gaps between chars). */
export function measureBigText(text: string, _size: 'big' | 'small' = 'big'): { width: number; height: number } {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const g = GLYPHS[text[i].toUpperCase()];
    if (!g) { width += 2; continue; }
    if (i > 0) width += GLYPH_GAP;
    width += glyphWidth(g);
  }
  return { width, height: GLYPH_HEIGHT };
}

/**
 * Render big text at (x, y). Returns the rendered width.
 * Draws each glyph's ASCII-art rows; spaces are transparent.
 */
export function renderBigText(
  buf: RenderBuffer,
  x: number,
  y: number,
  text: string,
  style: Style,
  _size: 'big' | 'small' = 'big',
): number {
  let cx = x;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toUpperCase();
    const g = GLYPHS[ch];
    if (!g) { cx += 2; continue; }
    if (i > 0) cx += GLYPH_GAP;
    for (let row = 0; row < g.length; row++) {
      const line = g[row];
      for (let col = 0; col < line.length; col++) {
        const c = line[col];
        if (c !== ' ') buf.set(cx + col, y + row, c, style);
      }
    }
    cx += glyphWidth(g);
  }
  return cx - x;
}

/** Render big text centered horizontally at cx. Returns the start x. */
export function renderBigTextCentered(
  buf: RenderBuffer,
  cx: number,
  y: number,
  text: string,
  style: Style,
  size: 'big' | 'small' = 'big',
): number {
  const { width } = measureBigText(text, size);
  const startX = cx - Math.floor(width / 2);
  renderBigText(buf, startX, y, text, style, size);
  return startX;
}

/** Combo number size helper — kept for API compatibility (single font now). */
export function comboSize(_combo: number): 'big' | 'small' {
  return 'small';
}

/** Render a combo counter as a simple "COMBO x3" text line (no big ASCII number). */
export function renderComboCounter(
  buf: RenderBuffer,
  x: number,
  y: number,
  combo: number,
  color: RGB,
  accentColor: RGB,
): { width: number; height: number } {
  const label = `COMBO x${combo}`;
  buf.drawText(x, y, label, { fg: color, bold: true });
  return { width: label.length, height: 1 };
}

/** Render a B2B (back-to-back) counter as a simple text line. */
export function renderB2BCounter(
  buf: RenderBuffer,
  x: number,
  y: number,
  b2b: number,
  color: RGB,
): { width: number; height: number } {
  const label = `B2B x${b2b}`;
  buf.drawText(x, y, label, { fg: color, bold: true });
  return { width: label.length, height: 1 };
}

/** Render a clear-type label (SINGLE, DOUBLE, ...) in the Figlet font. */
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
