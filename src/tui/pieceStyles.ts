/**
 * Piece-style system — pluggable mino renderers for the game board.
 *
 * Each style pre-caches its Style objects per theme (rebuilt only on theme
 * change) to avoid per-frame allocations. The active style is a module
 * singleton selected by config key.
 *
 * Styles:
 *  - bevel   (default) — TETR.IO-style raised block: subtle top highlight,
 *                         subtle bottom shadow, both cells identical → no stripes.
 *  - flat    — pure solid ██. Cleanest modern look.
 *  - outline — solid fill with dark separator line between rows.
 *  - gradient — more dramatic vertical gradient (top bright → bottom dark).
 *  - halfblock — slim minoes (▄: full-color bottom half, deep-shade top half
 *                of the SAME piece color): pieces read shorter and lighter
 *                (tetro-tui's ▀▄█ vertical-compression trick, per-mino).
 *  - shiny   — glossy "guideline" look via fg/bg inversion: a light-shade Γ
 *                corner glyph on a solid piece-color background (tetro-tui's
 *                `Γ ` shiny-blocks preset).
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const PIECE_KEYS = ['i', 'o', 't', 's', 'z', 'l', 'j', 'g'] as const;

/** Draw one mino (2 chars wide × 1 row) at pixel position (px, py). */
export type MinoDrawFn = (buf: RenderBuffer, px: number, py: number, type: string) => void;

/** Draw one ghost mino (2 chars wide × 1 row) at pixel position (px, py). type = the falling piece's type (for piece-tinted ghosts). */
export type GhostDrawFn = (buf: RenderBuffer, px: number, py: number, type?: string) => void;

export interface PieceStyleDef {
  readonly name: string;
  readonly label: string;
  readonly drawMino: MinoDrawFn;
  readonly drawGhost: GhostDrawFn;
}

// ---------------------------------------------------------------------------
// Theme-cached style data — rebuilt only on theme change
// ---------------------------------------------------------------------------

interface BevelCache {
  /** Both cells get the same style — no stripes. */
  cell: Record<string, Style>;
  ghost: Record<string, Style>;
}

interface FlatCache {
  cell: Record<string, Style>;
  ghost: Record<string, Style>;
}

interface OutlineCache {
  cell: Record<string, Style>;
  ghost: Record<string, Style>;
}

interface GradientCache {
  cell: Record<string, Style>;
  ghost: Record<string, Style>;
}

interface HalfblockCache {
  cell: Record<string, Style>;
  ghost: Record<string, Style>;
}

interface ShinyCache {
  /** Corner glyph 'Γ' in a light tint on the solid piece color. */
  corner: Record<string, Style>;
  /** Solid fill ' ' in the piece color. */
  fill: Record<string, Style>;
  ghost: Record<string, Style>;
}

interface StyleCaches {
  _theme: Theme;
  bevel: BevelCache;
  flat: FlatCache;
  outline: OutlineCache;
  gradient: GradientCache;
  halfblock: HalfblockCache;
  shiny: ShinyCache;
}

let _sc: StyleCaches | null = null;

function sc(): StyleCaches {
  const t = theme();
  if (_sc && _sc._theme === t) return _sc;

  const p = t.pieces;

  const bevel_c: Record<string, Style> = {};
  const flat_c: Record<string, Style> = {};
  const outline_c: Record<string, Style> = {};
  const gradient_c: Record<string, Style> = {};
  const halfblock_c: Record<string, Style> = {};
  const shiny_corner: Record<string, Style> = {};
  const shiny_fill: Record<string, Style> = {};

  for (const k of PIECE_KEYS) {
    const c = p[k];

    // bevel: subtle raised block — top slightly brighter, bottom slightly darker.
    // Both cells IDENTICAL → no vertical stripe. Subtle shading reads as 3D.
    bevel_c[k] = { fg: tint(c, 0.07), bg: shade(c, 0.88) };

    // flat: pure solid
    flat_c[k] = { fg: c, bg: c };

    // outline: solid fill, soft dark top edge as row separator (0.45 = subtle, not gridlines)
    outline_c[k] = { fg: c, bg: shade(c, 0.45) };

    // gradient: dramatic vertical gradient (top very bright → bottom darker)
    gradient_c[k] = { fg: tint(c, 0.30), bg: shade(c, 0.50) };

    // halfblock: ▄ — bottom half full color, top half a deep shade of the piece
    // (solid-but-slim; a board-colored top half read as a "missing" gap line)
    halfblock_c[k] = { fg: c, bg: shade(c, 0.30) };

    // shiny: Γ corner highlight (light tint) on solid piece color
    shiny_corner[k] = { fg: tint(c, 0.55), bg: c };
    shiny_fill[k] = { fg: c, bg: c };
  }

  // Ghost cells: piece-TINTED so the landing preview reads on every theme.
  // (Was theme.ghost gray at ~15% luminance — invisible on dark boards.)
  const gc = p.ghost;
  const ghostCell: Record<string, Style> = {};
  for (const k of PIECE_KEYS) {
    const c = p[k];
    // FULL piece color on the board shade: the ▒ glyph's 50% density provides the
    // translucency (darkening the fg too made ghosts read as board-colored holes).
    ghostCell[k] = { fg: k === 'g' ? gc : c, bg: t.boardA };
  }
  ghostCell.ghost = { fg: shade(gc, 0.9), bg: t.boardA }; // type-less fallback

  _sc = {
    _theme: t,
    bevel: { cell: bevel_c, ghost: ghostCell },
    flat: { cell: flat_c, ghost: ghostCell },
    outline: { cell: outline_c, ghost: ghostCell },
    gradient: { cell: gradient_c, ghost: ghostCell },
    halfblock: { cell: halfblock_c, ghost: ghostCell },
    shiny: { corner: shiny_corner, fill: shiny_fill, ghost: ghostCell },
  };
  return _sc;
}

// ---------------------------------------------------------------------------
// Style implementations
// ---------------------------------------------------------------------------

/**
 * Bevel — TETR.IO-style raised block.
 *
 * Uses ▀ (upper half block): fg = highlight → top edge bright,
 * bg = shadow → bottom edge dark. BOTH cells use the SAME style,
 * so there are zero vertical stripes. Between vertically stacked
 * minoes the shadow/highlight boundary creates a subtle 3D separator.
 */
const BEVEL: PieceStyleDef = {
  name: 'bevel',
  label: 'Bevel',
  drawMino(buf, px, py, type) {
    const s = sc().bevel.cell[type] ?? sc().bevel.cell.g;
    buf.set(px, py, '\u2580', s);       // ▀
    buf.set(px + 1, py, '\u2580', s);   // ▀
  },
  drawGhost(buf, px, py, type) {
    const g = sc().bevel.ghost;
    const s = g[type ?? 'ghost'] ?? g.ghost ?? g.g;
    buf.set(px, py, '\u2592', s);       // ▒
    buf.set(px + 1, py, '\u2592', s);   // ▒
  },
};

/** Flat — pure solid ██. Cleanest modern look, no shading at all. */
const FLAT: PieceStyleDef = {
  name: 'flat',
  label: 'Flat',
  drawMino(buf, px, py, type) {
    const s = sc().flat.cell[type] ?? sc().flat.cell.g;
    buf.set(px, py, '\u2588', s);       // █
    buf.set(px + 1, py, '\u2588', s);   // █
  },
  drawGhost(buf, px, py, type) {
    const g = sc().flat.ghost;
    const s = g[type ?? 'ghost'] ?? g.ghost ?? g.g;
    buf.set(px, py, '\u2592', s);       // ▒
    buf.set(px + 1, py, '\u2592', s);   // ▒
  },
};

/**
 * Outline — solid fill with a dark separator line on top of each row.
 *
 * Uses ▄ (lower half block): fg = piece color (bottom half solid),
 * bg = dark outline (top half dark). Between stacked minoes:
 *   upper row bottom = solid color
 *   lower row top    = dark outline
 * → visible dark separator line between every row of blocks.
 */
const OUTLINE: PieceStyleDef = {
  name: 'outline',
  label: 'Outline',
  drawMino(buf, px, py, type) {
    const s = sc().outline.cell[type] ?? sc().outline.cell.g;
    buf.set(px, py, '\u2584', s);       // ▄
    buf.set(px + 1, py, '\u2584', s);   // ▄
  },
  drawGhost(buf, px, py, type) {
    const g = sc().outline.ghost;
    const s = g[type ?? 'ghost'] ?? g.ghost ?? g.g;
    buf.set(px, py, '\u2592', s);       // ▒
    buf.set(px + 1, py, '\u2592', s);   // ▒
  },
};

/**
 * Gradient — dramatic vertical gradient within each mino.
 * Top half bright, bottom half dark. More contrast than bevel.
 * Both cells identical → no stripes.
 */
const GRADIENT: PieceStyleDef = {
  name: 'gradient',
  label: 'Gradient',
  drawMino(buf, px, py, type) {
    const s = sc().gradient.cell[type] ?? sc().gradient.cell.g;
    buf.set(px, py, '\u2580', s);       // ▀
    buf.set(px + 1, py, '\u2580', s);   // ▀
  },
  drawGhost(buf, px, py, type) {
    const g = sc().gradient.ghost;
    const s = g[type ?? 'ghost'] ?? g.ghost ?? g.g;
    buf.set(px, py, '\u2592', s);       // ▒
    buf.set(px + 1, py, '\u2592', s);   // ▒
  },
};

/**
 * Halfblock — ▄ with the board shade on top: every mino reads as only the
 * bottom half of its terminal row (tetro-tui's vertical-compression look,
 * adapted to per-mino rendering). Stacks look slimmer; gaps read clearer.
 */
const HALFBLOCK: PieceStyleDef = {
  name: 'halfblock',
  label: 'Half-block',
  drawMino(buf, px, py, type) {
    const s = sc().halfblock.cell[type] ?? sc().halfblock.cell.g;
    buf.set(px, py, '\u2584', s);       // ▄
    buf.set(px + 1, py, '\u2584', s);   // ▄
  },
  drawGhost(buf, px, py, type) {
    const g = sc().halfblock.ghost;
    const s = g[type ?? 'ghost'] ?? g.ghost ?? g.g;
    buf.set(px, py, '\u2592', s);       // ▒
    buf.set(px + 1, py, '\u2592', s);   // ▒
  },
};

/**
 * Shiny — glossy "guideline" look (tetro-tui's `Γ ` shiny-blocks preset):
 * a light corner glyph on the solid piece color. fg/bg inversion does all
 * the work — the Γ reads as a top-left bevel highlight.
 */
const SHINY: PieceStyleDef = {
  name: 'shiny',
  label: 'Shiny',
  drawMino(buf, px, py, type) {
    const c = sc().shiny;
    const corner = c.corner[type] ?? c.corner.g;
    const fill = c.fill[type] ?? c.fill.g;
    buf.set(px, py, '\u0393', corner);       // Γ
    buf.set(px + 1, py, ' ', fill);           // solid
  },
  drawGhost(buf, px, py, type) {
    const g = sc().shiny.ghost;
    const s = g[type ?? 'ghost'] ?? g.ghost ?? g.g;
    buf.set(px, py, '\u2592', s);       // ▒
    buf.set(px + 1, py, '\u2592', s);   // ▒
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const PIECE_STYLES: Record<string, PieceStyleDef> = {
  bevel: BEVEL,
  flat: FLAT,
  outline: OUTLINE,
  gradient: GRADIENT,
  halfblock: HALFBLOCK,
  shiny: SHINY,
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

/** The current style key (e.g. 'bevel', 'flat'). */
export function getPieceStyleKey(): string { return _activeKey; }

/** The live style definition. Safe to call in hot render paths (no allocation). */
export function pieceStyleDef(): PieceStyleDef { return _active; }
