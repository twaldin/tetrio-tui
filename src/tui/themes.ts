/** 
 * Theme system for tetrio-tui.
 *
 * Each theme defines the full palette: UI chrome colors, the 7 piece colors
 * + garbage + ghost, board shades, and accent colors. The active theme is a
 * module-level singleton — call setTheme(name) to switch, getTheme() to read.
 *
 * Consumers import `theme()` (returns the live object) in render paths and
 * `THEMES` for enumeration (config screen, etc.).
 */
import type { RGB } from '../tui/app.js';

// ---------------------------------------------------------------------------
// Theme shape
// ---------------------------------------------------------------------------

export interface PieceColors {
  i: RGB; o: RGB; t: RGB; s: RGB; z: RGB; l: RGB; j: RGB;
  /** Garbage / gray cells. */
  g: RGB;
  /** Ghost piece. */
  ghost: RGB;
}

export interface Theme {
  /** Display name shown in the config UI. */
  name: string;

  // --- Background depth layers (brief-aligned) ---
  base: RGB;           // Deepest background (= bg)
  mantle: RGB;         // Panel fill (= panel)
  surface: RGB;        // Elevated elements
  overlay: RGB;        // Popups, modals

  // --- Legacy aliases (same values, kept for screen compat) ---
  bg: RGB;
  panel: RGB;
  panelAlt: RGB;

  // --- Borders ---
  border: RGB;
  borderBright: RGB;
  borderActive: RGB;   // Focused panel border
  borderSubtle: RGB;   // Very faint dividers
  boardFrame: RGB;     // Board border (double-line ═║)

  // --- Text hierarchy ---
  text: RGB;
  subtext: RGB;        // Secondary labels
  dim: RGB;
  faint: RGB;

  // --- Semantic accents ---
  accent: RGB;
  accent2: RGB;
  good: RGB;
  warn: RGB;
  bad: RGB;
  info: RGB;

  // --- section colors (menu items, breadcrumbs) ---
  league: RGB;
  solo: RGB;
  channel: RGB;
  config: RGB;

  // --- board ---
  boardA: RGB;
  boardB: RGB;
  gridLine: RGB;

  // --- Game-specific ---
  ghost: RGB;          // Ghost piece shade
  garbage: RGB;        // Garbage row color
  lockFlash: RGB;      // Momentary flash on piece lock
  clearFlash: RGB;     // Line clear flash color

  // --- pieces ---
  pieces: PieceColors;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function rgb(r: number, g: number, b: number): RGB { return [r, g, b]; }

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

const TETRIO_DEFAULT: Theme = {
  name: 'TETR.IO',
  bg: rgb(8, 8, 14),
  panel: rgb(20, 20, 34),
  panelAlt: rgb(14, 14, 24),
  border: rgb(80, 80, 120),
  borderBright: rgb(130, 145, 200),
  text: rgb(235, 235, 245),
  dim: rgb(150, 150, 180),
  faint: rgb(70, 70, 95),
  accent: rgb(255, 85, 200),
  accent2: rgb(90, 200, 255),
  good: rgb(120, 255, 140),
  warn: rgb(255, 220, 90),
  bad: rgb(255, 90, 90),
  league: rgb(255, 60, 90),
  solo: rgb(90, 120, 255),
  channel: rgb(90, 230, 120),
  config: rgb(90, 170, 255),
  boardA: rgb(16, 16, 28),
  boardB: rgb(22, 22, 38),
  gridLine: rgb(40, 42, 60),
  pieces: {
    i: rgb(80, 230, 250),
    o: rgb(250, 225, 70),
    t: rgb(200, 90, 240),
    s: rgb(90, 235, 100),
    z: rgb(250, 80, 90),
    l: rgb(250, 165, 60),
    j: rgb(95, 130, 250),
    g: rgb(120, 120, 132),
    ghost: rgb(70, 70, 95),
  },
  base: rgb(8, 8, 14),
  mantle: rgb(14, 14, 24),
  surface: rgb(20, 20, 34),
  overlay: rgb(30, 30, 48),
  boardFrame: rgb(150, 170, 220),
  borderActive: rgb(150, 170, 220),
  borderSubtle: rgb(45, 45, 65),
  subtext: rgb(180, 180, 200),
  info: rgb(90, 130, 255),
  ghost: rgb(70, 70, 95),
  garbage: rgb(120, 120, 132),
  lockFlash: rgb(255, 255, 255),
  clearFlash: rgb(255, 255, 255),
};

const TOKYO_NIGHT: Theme = {
  name: 'Tokyo Night',
  bg: rgb(26, 27, 38),
  panel: rgb(36, 40, 59),
  panelAlt: rgb(22, 22, 30),
  border: rgb(61, 66, 98),
  borderBright: rgb(122, 162, 247),
  text: rgb(192, 202, 245),
  dim: rgb(115, 130, 175),
  faint: rgb(65, 72, 104),
  accent: rgb(187, 154, 247),
  accent2: rgb(125, 207, 255),
  good: rgb(158, 206, 106),
  warn: rgb(224, 175, 104),
  bad: rgb(247, 118, 142),
  league: rgb(247, 118, 142),
  solo: rgb(122, 162, 247),
  channel: rgb(158, 206, 106),
  config: rgb(125, 207, 255),
  boardA: rgb(22, 23, 33),
  boardB: rgb(30, 32, 46),
  gridLine: rgb(42, 46, 68),
  pieces: {
    i: rgb(125, 207, 255),
    o: rgb(224, 175, 104),
    t: rgb(187, 154, 247),
    s: rgb(158, 206, 106),
    z: rgb(247, 118, 142),
    l: rgb(255, 158, 100),
    j: rgb(122, 162, 247),
    g: rgb(100, 106, 140),
    ghost: rgb(55, 60, 85),
  },
  base: rgb(26, 27, 38),
  mantle: rgb(22, 22, 30),
  surface: rgb(36, 40, 59),
  overlay: rgb(52, 59, 88),
  boardFrame: rgb(125, 133, 174),
  borderActive: rgb(122, 162, 247),
  borderSubtle: rgb(41, 46, 66),
  subtext: rgb(156, 163, 194),
  info: rgb(122, 162, 247),
  ghost: rgb(55, 60, 85),
  garbage: rgb(100, 106, 140),
  lockFlash: rgb(255, 255, 255),
  clearFlash: rgb(192, 202, 245),
};

const CATPPUCCIN_MOCHA: Theme = {
  name: 'Catppuccin Mocha',
  bg: rgb(30, 30, 46),
  panel: rgb(49, 50, 68),
  panelAlt: rgb(24, 24, 37),
  border: rgb(88, 91, 112),
  borderBright: rgb(137, 180, 250),
  text: rgb(205, 214, 244),
  dim: rgb(147, 153, 178),
  faint: rgb(88, 91, 112),
  accent: rgb(245, 194, 231),
  accent2: rgb(137, 220, 235),
  good: rgb(166, 227, 161),
  warn: rgb(249, 226, 175),
  bad: rgb(243, 139, 168),
  league: rgb(243, 139, 168),
  solo: rgb(137, 180, 250),
  channel: rgb(166, 227, 161),
  config: rgb(116, 199, 236),
  boardA: rgb(24, 24, 37),
  boardB: rgb(34, 34, 52),
  gridLine: rgb(49, 50, 68),
  pieces: {
    i: rgb(137, 220, 235),
    o: rgb(249, 226, 175),
    t: rgb(203, 166, 247),
    s: rgb(166, 227, 161),
    z: rgb(243, 139, 168),
    l: rgb(250, 179, 135),
    j: rgb(137, 180, 250),
    g: rgb(108, 112, 134),
    ghost: rgb(63, 64, 82),
  },
  base: rgb(30, 30, 46),
  mantle: rgb(24, 24, 37),
  surface: rgb(49, 50, 68),
  overlay: rgb(69, 71, 90),
  boardFrame: rgb(166, 173, 200),
  borderActive: rgb(137, 180, 250),
  borderSubtle: rgb(49, 50, 68),
  subtext: rgb(186, 194, 222),
  info: rgb(137, 180, 250),
  ghost: rgb(63, 64, 82),
  garbage: rgb(108, 112, 134),
  lockFlash: rgb(255, 255, 255),
  clearFlash: rgb(205, 214, 244),
};

const GRUVBOX: Theme = {
  name: 'Gruvbox Dark',
  bg: rgb(40, 40, 40),
  panel: rgb(60, 56, 54),
  panelAlt: rgb(29, 32, 33),
  border: rgb(102, 92, 84),
  borderBright: rgb(168, 153, 132),
  text: rgb(235, 219, 178),
  dim: rgb(168, 153, 132),
  faint: rgb(102, 92, 84),
  accent: rgb(211, 134, 155),
  accent2: rgb(131, 165, 152),
  good: rgb(184, 187, 38),
  warn: rgb(250, 189, 47),
  bad: rgb(251, 73, 52),
  league: rgb(251, 73, 52),
  solo: rgb(131, 165, 152),
  channel: rgb(184, 187, 38),
  config: rgb(131, 165, 152),
  boardA: rgb(32, 32, 32),
  boardB: rgb(46, 44, 42),
  gridLine: rgb(60, 56, 54),
  pieces: {
    i: rgb(131, 165, 152),
    o: rgb(250, 189, 47),
    t: rgb(211, 134, 155),
    s: rgb(184, 187, 38),
    z: rgb(251, 73, 52),
    l: rgb(254, 128, 25),
    j: rgb(69, 133, 136),
    g: rgb(124, 111, 100),
    ghost: rgb(70, 65, 60),
  },
  base: rgb(40, 40, 40),
  mantle: rgb(29, 32, 33),
  surface: rgb(60, 56, 54),
  overlay: rgb(80, 73, 69),
  boardFrame: rgb(213, 196, 161),
  borderActive: rgb(215, 153, 33),
  borderSubtle: rgb(60, 56, 54),
  subtext: rgb(189, 174, 147),
  info: rgb(131, 165, 152),
  ghost: rgb(70, 65, 60),
  garbage: rgb(124, 111, 100),
  lockFlash: rgb(235, 219, 178),
  clearFlash: rgb(250, 189, 47),
};

const NORD: Theme = {
  name: 'Nord',
  bg: rgb(46, 52, 64),
  panel: rgb(59, 66, 82),
  panelAlt: rgb(41, 46, 56),
  border: rgb(76, 86, 106),
  borderBright: rgb(136, 192, 208),
  text: rgb(236, 239, 244),
  dim: rgb(165, 177, 197),
  faint: rgb(76, 86, 106),
  accent: rgb(180, 142, 173),
  accent2: rgb(136, 192, 208),
  good: rgb(163, 190, 140),
  warn: rgb(235, 203, 139),
  bad: rgb(191, 97, 106),
  league: rgb(191, 97, 106),
  solo: rgb(129, 161, 193),
  channel: rgb(163, 190, 140),
  config: rgb(136, 192, 208),
  boardA: rgb(38, 42, 52),
  boardB: rgb(46, 52, 64),
  gridLine: rgb(59, 66, 82),
  pieces: {
    i: rgb(136, 192, 208),
    o: rgb(235, 203, 139),
    t: rgb(180, 142, 173),
    s: rgb(163, 190, 140),
    z: rgb(191, 97, 106),
    l: rgb(208, 135, 112),
    j: rgb(129, 161, 193),
    g: rgb(105, 116, 132),
    ghost: rgb(60, 67, 80),
  },
  base: rgb(46, 52, 64),
  mantle: rgb(41, 46, 56),
  surface: rgb(59, 66, 82),
  overlay: rgb(76, 86, 106),
  boardFrame: rgb(216, 222, 233),
  borderActive: rgb(136, 192, 208),
  borderSubtle: rgb(59, 66, 82),
  subtext: rgb(216, 222, 233),
  info: rgb(129, 161, 193),
  ghost: rgb(60, 67, 80),
  garbage: rgb(105, 116, 132),
  lockFlash: rgb(236, 239, 244),
  clearFlash: rgb(236, 239, 244),
};

const DRACULA: Theme = {
  name: 'Dracula',
  bg: rgb(40, 42, 54),
  panel: rgb(68, 71, 90),
  panelAlt: rgb(33, 34, 44),
  border: rgb(98, 100, 120),
  borderBright: rgb(139, 233, 253),
  text: rgb(248, 248, 242),
  dim: rgb(159, 162, 186),
  faint: rgb(98, 100, 120),
  accent: rgb(255, 121, 198),
  accent2: rgb(139, 233, 253),
  good: rgb(80, 250, 123),
  warn: rgb(241, 250, 140),
  bad: rgb(255, 85, 85),
  league: rgb(255, 85, 85),
  solo: rgb(189, 147, 249),
  channel: rgb(80, 250, 123),
  config: rgb(139, 233, 253),
  boardA: rgb(30, 31, 40),
  boardB: rgb(38, 40, 52),
  gridLine: rgb(56, 58, 74),
  pieces: {
    i: rgb(139, 233, 253),
    o: rgb(241, 250, 140),
    t: rgb(189, 147, 249),
    s: rgb(80, 250, 123),
    z: rgb(255, 85, 85),
    l: rgb(255, 184, 108),
    j: rgb(98, 114, 164),
    g: rgb(108, 112, 134),
    ghost: rgb(58, 60, 78),
  },
  base: rgb(40, 42, 54),
  mantle: rgb(33, 34, 44),
  surface: rgb(68, 71, 90),
  overlay: rgb(98, 114, 164),
  boardFrame: rgb(248, 248, 242),
  borderActive: rgb(255, 121, 198),
  borderSubtle: rgb(68, 71, 90),
  subtext: rgb(189, 147, 249),
  info: rgb(189, 147, 249),
  ghost: rgb(58, 60, 78),
  garbage: rgb(108, 112, 134),
  lockFlash: rgb(248, 248, 242),
  clearFlash: rgb(241, 250, 140),
};

const SOLARIZED_DARK: Theme = {
  name: 'Solarized Dark',
  bg: rgb(0, 43, 54),
  panel: rgb(7, 54, 66),
  panelAlt: rgb(0, 34, 43),
  border: rgb(88, 110, 117),
  borderBright: rgb(131, 148, 150),
  text: rgb(253, 246, 227),
  dim: rgb(131, 148, 150),
  faint: rgb(88, 110, 117),
  accent: rgb(211, 54, 130),
  accent2: rgb(38, 139, 210),
  good: rgb(133, 153, 0),
  warn: rgb(181, 137, 0),
  bad: rgb(220, 50, 47),
  league: rgb(220, 50, 47),
  solo: rgb(38, 139, 210),
  channel: rgb(133, 153, 0),
  config: rgb(38, 139, 210),
  boardA: rgb(0, 34, 43),
  boardB: rgb(7, 44, 54),
  gridLine: rgb(20, 62, 72),
  pieces: {
    i: rgb(42, 161, 152),
    o: rgb(181, 137, 0),
    t: rgb(108, 113, 196),
    s: rgb(133, 153, 0),
    z: rgb(220, 50, 47),
    l: rgb(203, 75, 22),
    j: rgb(38, 139, 210),
    g: rgb(88, 110, 117),
    ghost: rgb(34, 68, 78),
  },
  base: rgb(0, 43, 54),
  mantle: rgb(0, 34, 43),
  surface: rgb(7, 54, 66),
  overlay: rgb(88, 110, 117),
  boardFrame: rgb(147, 161, 161),
  borderActive: rgb(38, 139, 210),
  borderSubtle: rgb(7, 54, 66),
  subtext: rgb(238, 232, 213),
  info: rgb(38, 139, 210),
  ghost: rgb(34, 68, 78),
  garbage: rgb(88, 110, 117),
  lockFlash: rgb(253, 246, 227),
  clearFlash: rgb(253, 246, 227),
};

const MONOKAI: Theme = {
  name: 'Monokai Pro',
  bg: rgb(45, 42, 46),
  panel: rgb(57, 53, 58),
  panelAlt: rgb(37, 34, 38),
  border: rgb(90, 85, 92),
  borderBright: rgb(169, 220, 118),
  text: rgb(252, 252, 240),
  dim: rgb(150, 144, 154),
  faint: rgb(90, 85, 92),
  accent: rgb(255, 97, 136),
  accent2: rgb(120, 220, 232),
  good: rgb(169, 220, 118),
  warn: rgb(255, 216, 102),
  bad: rgb(255, 97, 136),
  league: rgb(255, 97, 136),
  solo: rgb(171, 157, 242),
  channel: rgb(169, 220, 118),
  config: rgb(120, 220, 232),
  boardA: rgb(32, 30, 34),
  boardB: rgb(42, 40, 44),
  gridLine: rgb(60, 56, 62),
  pieces: {
    i: rgb(120, 220, 232),
    o: rgb(255, 216, 102),
    t: rgb(171, 157, 242),
    s: rgb(169, 220, 118),
    z: rgb(255, 97, 136),
    l: rgb(252, 152, 103),
    j: rgb(120, 120, 220),
    g: rgb(116, 112, 118),
    ghost: rgb(60, 57, 62),
  },
  base: rgb(45, 42, 46),
  mantle: rgb(37, 34, 38),
  surface: rgb(57, 53, 58),
  overlay: rgb(72, 68, 73),
  boardFrame: rgb(199, 199, 195),
  borderActive: rgb(255, 216, 102),
  borderSubtle: rgb(57, 53, 58),
  subtext: rgb(199, 199, 195),
  info: rgb(171, 157, 242),
  ghost: rgb(60, 57, 62),
  garbage: rgb(116, 112, 118),
  lockFlash: rgb(252, 252, 250),
  clearFlash: rgb(255, 216, 102),
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const THEMES: Record<string, Theme> = {
  tetrio: TETRIO_DEFAULT,
  'tokyo-night': TOKYO_NIGHT,
  'catppuccin': CATPPUCCIN_MOCHA,
  gruvbox: GRUVBOX,
  nord: NORD,
  dracula: DRACULA,
  solarized: SOLARIZED_DARK,
  monokai: MONOKAI,
};

/** Ordered list of theme keys for cycling in the config UI. */
export const THEME_KEYS: readonly string[] = Object.keys(THEMES);

// ---------------------------------------------------------------------------
// Active theme (module singleton)
// ---------------------------------------------------------------------------

let _activeKey = 'tetrio';
let _active: Theme = TETRIO_DEFAULT;

/**
 * Switch the active theme. Returns false if the key is unknown.
 * All draw.ts helpers read from the active theme, so this takes
 * effect on the next render frame — no restart needed.
 */
export function setTheme(key: string): boolean {
  const t = THEMES[key];
  if (!t) return false;
  _active = t;
  _activeKey = key;
  return true;
}

/** The current theme key (e.g. 'tetrio', 'catppuccin'). */
export function getThemeKey(): string { return _activeKey; }

/** The live theme object. Safe to call in hot render paths (no allocation). */
export function theme(): Theme { return _active; }
