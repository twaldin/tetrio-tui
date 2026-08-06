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

  // --- UI chrome ---
  bg: RGB;
  panel: RGB;
  panelAlt: RGB;
  border: RGB;
  borderBright: RGB;
  text: RGB;
  dim: RGB;
  faint: RGB;
  accent: RGB;
  accent2: RGB;
  good: RGB;
  warn: RGB;
  bad: RGB;

  // --- section colors (menu items, breadcrumbs) ---
  league: RGB;
  solo: RGB;
  channel: RGB;
  config: RGB;

  // --- board ---
  boardA: RGB;
  boardB: RGB;
  gridLine: RGB;

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
};

const TOKYO_NIGHT: Theme = {
  name: 'Tokyo Night',
  bg: rgb(26, 27, 38),
  panel: rgb(36, 40, 59),
  panelAlt: rgb(30, 33, 50),
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
};

const CATPPUCCIN_MOCHA: Theme = {
  name: 'Catppuccin Mocha',
  bg: rgb(30, 30, 46),
  panel: rgb(49, 50, 68),
  panelAlt: rgb(39, 39, 58),
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
};

const GRUVBOX: Theme = {
  name: 'Gruvbox Dark',
  bg: rgb(40, 40, 40),
  panel: rgb(60, 56, 54),
  panelAlt: rgb(50, 48, 47),
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
};

const NORD: Theme = {
  name: 'Nord',
  bg: rgb(46, 52, 64),
  panel: rgb(59, 66, 82),
  panelAlt: rgb(52, 59, 73),
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
  boardA: rgb(40, 45, 56),
  boardB: rgb(50, 56, 70),
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
};

const DRACULA: Theme = {
  name: 'Dracula',
  bg: rgb(40, 42, 54),
  panel: rgb(68, 71, 90),
  panelAlt: rgb(55, 57, 74),
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
  boardA: rgb(33, 35, 44),
  boardB: rgb(44, 46, 60),
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
};

const SOLARIZED_DARK: Theme = {
  name: 'Solarized Dark',
  bg: rgb(0, 43, 54),
  panel: rgb(7, 54, 66),
  panelAlt: rgb(0, 48, 60),
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
  boardA: rgb(0, 36, 46),
  boardB: rgb(7, 50, 60),
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
};

const MONOKAI: Theme = {
  name: 'Monokai Pro',
  bg: rgb(45, 42, 46),
  panel: rgb(64, 60, 66),
  panelAlt: rgb(54, 51, 56),
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
  boardA: rgb(36, 34, 38),
  boardB: rgb(48, 45, 50),
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
