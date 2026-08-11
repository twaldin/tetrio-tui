/**
 * Piece-style system — pluggable mino renderers for the game board.
 *
 * The core set is a 1-1 port of tetro-tui's (Strophox/tetro-tui) graphics presets
 * (glyph tables from docs/TETRO_TUI_INspo.md), adapted to our per-mino model:
 *  - ascii       — roguelike: locked `##`, player `[]`, ghost `::`, grid ` .`
 *  - blocks      — UTF8 solids: locked `██`, player `▓▓`, ghost `░░`, grid ` ⢀`
 *  - shiny       — guideline gloss: `Γ ` corner highlight on solid fill, ghost `░░`
 *  - braille     — dot-matrix: locked `⣿⣿`, player `⣏⣹`, ghost `⠰⠆`, grid ` ⢀`
 *  - nes         — NES simulacra: O/I/T = `▙▟`, S/Z/L/J = `Γ `, ghost `()`
 *  - elektronika — soviet Elektronika-60: `▮▮` monochrome amber, ghost `▯▯`, grid ` .`
 * Plus ours: bevel / flat / outline / gradient / halfblock.
 *
 * COLOR RULE (user directive): the secondary shade in any style is a GENTLE,
 * hue-preserving shift of the piece color (small luminance delta) — never a
 * hard-contrast second color.
 *
 * Each style pre-caches its Style objects per theme (rebuilt only on theme
 * change). Locked stack cells use drawLocked (defaults to drawMino); the
 * falling piece and previews use drawMino (the "player" texture); the landing
 * preview uses drawGhost.
 */
import type { RenderBuffer, Style, RGB } from './app.js';
import { theme, type Theme } from './themes.js';

// ---------------------------------------------------------------------------
// Color helpers (inlined — no imports, hot-path safe)
// ---------------------------------------------------------------------------

function shade(c: RGB, f: number): RGB {
  return [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f)];
}
function tint(c: RGB, f: number): RGB {
  return [
    Math.min(255, Math.round(c[0] + (255 - c[0]) * f)),
    Math.min(255, Math.round(c[1] + (255 - c[1]) * f)),
    Math.min(255, Math.round(c[2] + (255 - c[2]) * f)),
  ];
}

/** WCAG-ish relative luminance (0..1). */
function luminance(c: RGB): number {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
function contrastRatio(a: RGB, b: RGB): number {
  const l1 = luminance(a), l2 = luminance(b);
  return l1 > l2 ? (l1 + 0.05) / (l2 + 0.05) : (l2 + 0.05) / (l1 + 0.05);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const PIECE_KEYS = ['i', 'o', 't', 's', 'z', 'l', 'j', 'g'] as const;

/** Draw one mino (2 chars wide × 1 row) at pixel position (px, py). */
export type MinoDrawFn = (buf: RenderBuffer, px: number, py: number, type: string) => void;

/** Draw one ghost mino (2 chars wide × 1 row) at pixel position (px, py). type = the falling piece's type. */
export type GhostDrawFn = (buf: RenderBuffer, px: number, py: number, type?: string) => void;

export interface PieceStyleDef {
  readonly name: string;
  readonly label: string;
  /** Active piece + previews ("player" texture in tetro-tui terms). */
  readonly drawMino: MinoDrawFn;
  /** Locked stack cells. Defaults to drawMino when absent. */
  readonly drawLocked?: MinoDrawFn;
  readonly drawGhost: GhostDrawFn;
  /** Optional board empty-cell texture (tetro-tui's grid dot) — overrides the checkerboard. */
  readonly grid?: { ch: string; fg: (t: Theme) => RGB };
}

// ---------------------------------------------------------------------------
// Theme-cached style data — rebuilt only on theme change
// ---------------------------------------------------------------------------

interface Cache {
  _theme: Theme;
  /** per-piece: full color style */
  solid: Record<string, Style>;
  /** gentle light shade (cap/highlight) — hue-preserving */
  lite: Record<string, Style>;
  /** gentle dark shade — hue-preserving */
  dark: Record<string, Style>;
  /** deeper (but still hued) shade for player/locked split */
  mid: Record<string, Style>;
  /** ghost per piece (contrast-aware ▒) */
  ghost: Record<string, Style>;
  boardA: RGB;
  gridFg: RGB;
}

let _sc: Cache | null = null;

function sc(): Cache {
  const t = theme();
  if (_sc && _sc._theme === t) return _sc;
  const p = t.pieces;
  const solid: Record<string, Style> = {};
  const lite: Record<string, Style> = {};
  const dark: Record<string, Style> = {};
  const mid: Record<string, Style> = {};
  const ghost: Record<string, Style> = {};
  for (const k of PIECE_KEYS) {
    const c = p[k];
    solid[k] = { fg: c, bg: c };
    lite[k] = { fg: tint(c, 0.14), bg: shade(c, 0.86) };   // gentle bevel pair
    mid[k] = { fg: shade(c, 0.72), bg: c };                 // ▓-style: 72% fg on solid bg
    dark[k] = { fg: c, bg: shade(c, 0.60) };                // gentle cap
    // ghost: ▒ density does the translucency; tint up until the blend separates from boardA
    let gcol = k === 'g' ? p.ghost : tint(c, 0.15);
    const blend = (fg: RGB): RGB => [Math.round((fg[0] + t.boardA[0]) / 2), Math.round((fg[1] + t.boardA[1]) / 2), Math.round((fg[2] + t.boardA[2]) / 2)];
    let guard = 0;
    while (contrastRatio(blend(gcol), t.boardA) < 1.5 && guard++ < 6) gcol = tint(gcol, 0.15);
    ghost[k] = { fg: gcol, bg: t.boardA };
  }
  ghost.ghost = { fg: shade(p.ghost, 1.2), bg: t.boardA };
  _sc = { _theme: t, solid, lite, dark, mid, ghost, boardA: t.boardA, gridFg: t.gridLine };
  return _sc;
}

const get = (rec: Record<string, Style>, type?: string) => rec[type ?? 'ghost'] ?? rec.ghost ?? rec.g;

// ---------------------------------------------------------------------------
// tetro-tui 1-1 presets
// ---------------------------------------------------------------------------

/** ascii — locked `##`, player `[]`, ghost `::`, grid ` .` (tetro-tui preset 1). */
const ASCII: PieceStyleDef = {
  name: 'ascii', label: 'ASCII',
  drawMino(buf, px, py, type) {
    const c = sc();
    const s = { fg: get(c.solid, type).fg };
    buf.set(px, py, '[', s); buf.set(px + 1, py, ']', s);
  },
  drawLocked(buf, px, py, type) {
    const c = sc();
    const s = { fg: get(c.mid, type).fg }; // locked slightly dimmer than the player
    buf.set(px, py, '#', s); buf.set(px + 1, py, '#', s);
  },
  drawGhost(buf, px, py, type) {
    const s = get(sc().ghost, type);
    buf.set(px, py, ':', s); buf.set(px + 1, py, ':', s);
  },
  grid: { ch: '.', fg: (t) => t.gridLine },
};

/** blocks — locked `██`, player `▓▓`, ghost `░░`, grid ` ⢀` (tetro-tui preset 2). */
const BLOCKS: PieceStyleDef = {
  name: 'blocks', label: 'Blocks',
  drawMino(buf, px, py, type) {
    const s = get(sc().mid, type); // ▓▓: 72% piece on solid piece bg — gentle player shade
    buf.set(px, py, '\u2593', s); buf.set(px + 1, py, '\u2593', s);
  },
  drawLocked(buf, px, py, type) {
    const s = get(sc().solid, type);
    buf.set(px, py, '\u2588', s); buf.set(px + 1, py, '\u2588', s);
  },
  drawGhost(buf, px, py, type) {
    const s = get(sc().ghost, type);
    buf.set(px, py, '\u2591', s); buf.set(px + 1, py, '\u2591', s);
  },
  grid: { ch: '\u2880', fg: (t) => t.gridLine }, // ⢀
};

/** shiny — `Γ ` glossy corner on solid fill (tetro-tui preset 3), ghost `░░`. */
const SHINY: PieceStyleDef = {
  name: 'shiny', label: 'Shiny',
  drawMino(buf, px, py, type) {
    const c = sc();
    const base = get(c.solid, type).fg!;
    // gentle highlight: a light tint of the SAME hue for the corner glyph
    buf.set(px, py, '\u0393', { fg: tint(base, 0.30), bg: base });   // Γ
    buf.set(px + 1, py, ' ', { fg: base, bg: base });
  },
  drawGhost(buf, px, py, type) {
    const s = get(sc().ghost, type);
    buf.set(px, py, '\u2591', s); buf.set(px + 1, py, '\u2591', s);
  },
};

/** braille — locked `⣿⣿`, player `⣏⣹`, ghost `⠰⠆`, grid ` ⢀` (tetro-tui preset 4). */
const BRAILLE: PieceStyleDef = {
  name: 'braille', label: 'Braille',
  drawMino(buf, px, py, type) {
    const s = { fg: get(sc().solid, type).fg };
    buf.set(px, py, '\u28CF', s); buf.set(px + 1, py, '\u28F9', s); // ⣏⣹
  },
  drawLocked(buf, px, py, type) {
    const s = { fg: get(sc().mid, type).fg };
    buf.set(px, py, '\u28FF', s); buf.set(px + 1, py, '\u28FF', s); // ⣿⣿
  },
  drawGhost(buf, px, py, type) {
    const s = get(sc().ghost, type);
    buf.set(px, py, '\u2830', s); buf.set(px + 1, py, '\u2806', s); // ⠰⠆
  },
  grid: { ch: '\u2880', fg: (t) => t.gridLine },
};

/** nes — O/I/T = `▙▟`, S/Z/L/J = `Γ `, ghost `()` (tetro-tui preset 5, two-tone). */
const NES: PieceStyleDef = {
  name: 'nes', label: 'NES',
  drawMino(buf, px, py, type) {
    const c = sc();
    const base = get(c.solid, type).fg!;
    if (type === 'o' || type === 'i' || type === 't') {
      // chunky bottom-corner blocks: gentle dark fg on solid piece bg
      buf.set(px, py, '\u2599', { fg: shade(base, 0.62), bg: base }); // ▙
      buf.set(px + 1, py, '\u259F', { fg: shade(base, 0.62), bg: base }); // ▟
    } else {
      buf.set(px, py, '\u0393', { fg: tint(base, 0.28), bg: base }); // Γ
      buf.set(px + 1, py, ' ', { fg: base, bg: base });
    }
  },
  drawGhost(buf, px, py, type) {
    const s = get(sc().ghost, type);
    buf.set(px, py, '(', s); buf.set(px + 1, py, ')', s);
  },
  grid: { ch: '.', fg: (t) => t.gridLine },
};

/** elektronika — `▮▮` monochrome amber, ghost `▯▯`, grid ` .` (tetro-tui preset 6). */
const ELEKTRONIKA: PieceStyleDef = {
  name: 'elektronika', label: 'Elektronika-60',
  drawMino(buf, px, py) {
    const amber: RGB = [255, 176, 0];
    buf.set(px, py, '\u25AE', { fg: amber }); buf.set(px + 1, py, '\u25AE', { fg: amber }); // ▮▮
  },
  drawGhost(buf, px, py) {
    const amber: RGB = [140, 102, 20];
    buf.set(px, py, '\u25AF', { fg: amber }); buf.set(px + 1, py, '\u25AF', { fg: amber }); // ▯▯
  },
  grid: { ch: '.', fg: () => [80, 62, 20] },
};

// ---------------------------------------------------------------------------
// Our styles (retuned to the gentle-color rule)
// ---------------------------------------------------------------------------

/** bevel — subtle raised block: gentle light top / gentle dark bottom, same hue. */
const BEVEL: PieceStyleDef = {
  name: 'bevel', label: 'Bevel',
  drawMino(buf, px, py, type) {
    const s = get(sc().lite, type);
    buf.set(px, py, '\u2580', s); buf.set(px + 1, py, '\u2580', s); // ▀
  },
  drawGhost(buf, px, py, type) {
    const s = get(sc().ghost, type);
    buf.set(px, py, '\u2592', s); buf.set(px + 1, py, '\u2592', s);
  },
};

/** flat — pure solid ██, no shading. */
const FLAT: PieceStyleDef = {
  name: 'flat', label: 'Flat',
  drawMino(buf, px, py, type) {
    const s = get(sc().solid, type);
    buf.set(px, py, '\u2588', s); buf.set(px + 1, py, '\u2588', s);
  },
  drawGhost(buf, px, py, type) {
    const s = get(sc().ghost, type);
    buf.set(px, py, '\u2592', s); buf.set(px + 1, py, '\u2592', s);
  },
};

/** outline — solid fill with a gentle same-hue cap stripe. */
const OUTLINE: PieceStyleDef = {
  name: 'outline', label: 'Outline',
  drawMino(buf, px, py, type) {
    const c = sc();
    const s = { fg: get(c.solid, type).fg, bg: shade(get(c.solid, type).fg!, 0.68) };
    buf.set(px, py, '\u2584', s); buf.set(px + 1, py, '\u2584', s); // ▄
  },
  drawGhost(buf, px, py, type) {
    const s = get(sc().ghost, type);
    buf.set(px, py, '\u2592', s); buf.set(px + 1, py, '\u2592', s);
  },
};

/** gradient — gentle vertical gradient (light top → mid bottom), same hue. */
const GRADIENT: PieceStyleDef = {
  name: 'gradient', label: 'Gradient',
  drawMino(buf, px, py, type) {
    const c = sc();
    const base = get(c.solid, type).fg!;
    const s = { fg: tint(base, 0.20), bg: shade(base, 0.72) };
    buf.set(px, py, '\u2580', s); buf.set(px + 1, py, '\u2580', s); // ▀
  },
  drawGhost(buf, px, py, type) {
    const s = get(sc().ghost, type);
    buf.set(px, py, '\u2592', s); buf.set(px + 1, py, '\u2592', s);
  },
};

/** halfblock — slim minoes: full color bottom, gentle hued cap. */
const HALFBLOCK: PieceStyleDef = {
  name: 'halfblock', label: 'Half-block',
  drawMino(buf, px, py, type) {
    const c = sc();
    const base = get(c.solid, type).fg!;
    const s = { fg: base, bg: shade(base, 0.55) };
    buf.set(px, py, '\u2584', s); buf.set(px + 1, py, '\u2584', s); // ▄
  },
  drawGhost(buf, px, py, type) {
    const s = get(sc().ghost, type);
    buf.set(px, py, '\u2592', s); buf.set(px + 1, py, '\u2592', s);
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const PIECE_STYLES: Record<string, PieceStyleDef> = {
  bevel: BEVEL,
  flat: FLAT,
  blocks: BLOCKS,
  shiny: SHINY,
  outline: OUTLINE,
  gradient: GRADIENT,
  halfblock: HALFBLOCK,
  ascii: ASCII,
  braille: BRAILLE,
  nes: NES,
  elektronika: ELEKTRONIKA,
};

/** Ordered list of style keys for cycling in the config UI. */
export const PIECE_STYLE_KEYS: readonly string[] = Object.keys(PIECE_STYLES);

export const DEFAULT_PIECE_STYLE = 'bevel';

// ---------------------------------------------------------------------------
// Active style (module singleton, like the theme system)
// ---------------------------------------------------------------------------

let _activeKey: string = DEFAULT_PIECE_STYLE;
let _active: PieceStyleDef = BEVEL;

/** Switch the active piece style. Returns false if the key is unknown. */
export function setPieceStyle(key: string): boolean {
  const s = PIECE_STYLES[key];
  if (!s) return false;
  _active = s;
  _activeKey = key;
  return true;
}

/** The current style key (e.g. 'bevel', 'blocks'). */
export function getPieceStyleKey(): string { return _activeKey; }

/** The live style definition. Safe to call in hot render paths (no allocation). */
export function pieceStyleDef(): PieceStyleDef { return _active; }

/** Locked-stack mino renderer for the active style (falls back to drawMino). */
export function drawLockedMino(buf: RenderBuffer, px: number, py: number, type: string): void {
  const s = _active;
  (s.drawLocked ?? s.drawMino)(buf, px, py, type);
}

/** Board empty-cell texture for the active style (null = keep the checkerboard). */
export function styleGrid(): { ch: string; fg: RGB } | null {
  const g = _active.grid;
  if (!g) return null;
  return { ch: g.ch, fg: g.fg(theme()) };
}
