/**
 * Persistent configuration store for tetrio-tui.
 *
 * - Loads/saves JSON at `$XDG_CONFIG_HOME/tetrio-tui/config.json`
 *   (or `~/.config/tetrio-tui/config.json`; falls back to the system temp dir
 *   when no home/config dir is resolvable). The directory is created on save.
 * - A missing or corrupt file falls back to defaults (corrupt files are
 *   preserved next to the original as `config.json.corrupt` for debugging).
 * - Typed schema + per-field validation/clamping; unknown keys are dropped.
 * - `importTetrioConfig(json)` imports TETR.IO's own browser/desktop config
 *   (localStorage `userConfig`): keybind presets ("guideline"/"wasd"/"custom"),
 *   handling, and volumes are mapped into our schema.
 *
 * Units: handling values are FRAMES at 60fps (TETR.IO native), except `sdf`
 * which is a gravity multiplier (41 = "instant" in TETR.IO). Audio volumes are
 * integers 0..100 (TETR.IO stores 0..1 floats; import converts).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Handling } from '../types.js';

export const CONFIG_VERSION = 1;
export const CONFIG_DIR_NAME = 'tetrio-tui';
export const CONFIG_FILE_NAME = 'config.json';

// ---------------------------------------------------------------------------
// schema
// ---------------------------------------------------------------------------

/** Initial rotation/hold system modes. `none` maps to TETR.IO's wire value `off`. */
export type IrsMode = 'auto' | 'tap' | 'hold' | 'none';
export const IRS_MODES: readonly IrsMode[] = ['auto', 'tap', 'hold', 'none'];

export type ColorMode = 'truecolor' | '256' | 'mono';
export const COLOR_MODES: readonly ColorMode[] = ['truecolor', '256', 'mono'];

export const TARGET_FPS_OPTIONS: readonly number[] = [30, 60, 120, 240];

/** Player handling (DAS/ARR/DCD/SDF + flags), frames @60fps. */
export interface HandlingConfig {
  arr: number;      // auto-repeat rate (frames per move; may be fractional)
  das: number;      // delayed auto shift (frames)
  dcd: number;      // DAS cut delay (frames)
  sdf: number;      // soft drop factor (gravity multiplier; 41 = instant)
  safelock: boolean;
  cancel: boolean;  // DAS cancel between directions
  may20g: boolean;  // allow 20G soft drop
  irs: IrsMode;     // initial rotation system
  ihs: IrsMode;     // initial hold system
}

/** Game actions that can be bound to keys. */
export const GAME_ACTIONS = [
  'moveLeft', 'moveRight', 'softDrop', 'hardDrop',
  'rotateCW', 'rotateCCW', 'rotate180', 'hold', 'reset',
] as const;
export type GameAction = (typeof GAME_ACTIONS)[number];

/** action -> list of key names (our KeyEvent.key names, e.g. 'left', 'x', 'space'). */
export type KeyBinds = Record<GameAction, string[]>;

export interface VideoConfig {
  effects: boolean;       // board shake / clear flashes / popups
  minimal: boolean;       // minimal mode: plain text, no shake/particles/sweep/big-font
  colorMode: ColorMode;
  targetFps: number;
  theme: string;          // the color theme key (tetrio, catppuccin, ...)
  pieceStyle: string;     // piece rendering style (bevel, flat, outline, gradient, halfblock, shiny)
  borderStyle: string;    // panel/board border style (rounded, double, single, heavy, none)
}

export interface AudioConfig {
  music: number;          // 0..100
  sfx: number;            // 0..100
}

export interface AccountConfig {
  lastUsername: string;
}

export interface Config {
  version: number;
  handling: HandlingConfig;
  keybinds: KeyBinds;
  video: VideoConfig;
  audio: AudioConfig;
  account: AccountConfig;
}

export type ConfigSection = 'handling' | 'keybinds' | 'video' | 'audio' | 'account';
export type ChangeListener = (cfg: Config, section: ConfigSection | 'all') => void;

/** UI ranges + step sizes for the numeric handling fields (match TETR.IO's own limits). */
export interface HandlingRange { min: number; max: number; step: number; bigStep: number }
export const HANDLING_LIMITS: Record<'arr' | 'das' | 'dcd' | 'sdf', HandlingRange> = {
  arr: { min: 0, max: 5, step: 0.2, bigStep: 1 },
  das: { min: 0, max: 20, step: 1, bigStep: 5 },
  dcd: { min: 0, max: 20, step: 1, bigStep: 5 },
  sdf: { min: 1, max: 41, step: 1, bigStep: 5 },
};

// ---------------------------------------------------------------------------
// defaults
// ---------------------------------------------------------------------------

/** Default keybinds — kept in parity with the game screen's built-in keymap. */
export function defaultKeybinds(): KeyBinds {
  return {
    moveLeft: ['left'],
    moveRight: ['right'],
    softDrop: ['down'],
    hardDrop: ['space'],
    rotateCW: ['x'],
    rotateCCW: ['z'],
    rotate180: ['a'],
    hold: ['c', 'shift'],
    reset: ['r'],
  };
}

/** TETR.IO default handling (from the client config + handshake captures). */
export function defaultHandling(): HandlingConfig {
  return {
    arr: 2, das: 10, dcd: 2, sdf: 6,
    safelock: true, cancel: false, may20g: true,
    irs: 'tap', ihs: 'tap',
  };
}

export function defaultConfig(): Config {
  return {
    version: CONFIG_VERSION,
    handling: defaultHandling(),
    keybinds: defaultKeybinds(),
    video: { effects: true, minimal: false, colorMode: 'truecolor', targetFps: 60, theme: 'tetrio', pieceStyle: 'bevel', borderStyle: 'rounded' },
    audio: { music: 100, sfx: 100 },
    account: { lastUsername: '' },
  };
}

// ---------------------------------------------------------------------------
// field validators
// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asOneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Accepts our modes plus TETR.IO's wire names (`off`) and legacy booleans. */
export function normalizeIrsMode(v: unknown, fallback: IrsMode): IrsMode {
  if (v === true) return 'tap';
  if (v === false || v === 'off' || v === 'none') return 'none';
  return asOneOf(v, IRS_MODES, fallback);
}

/**
 * Normalize a key name to our KeyEvent.key vocabulary
 * ('left', 'return', 'space', single lowercase chars, 'f1'..'f12', ...).
 * Returns null for anything we can't represent.
 */
export function normalizeKeyName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const alias: Record<string, string> = {
    ' ': 'space', spacebar: 'space',
    arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down',
    enter: 'return', esc: 'escape', del: 'delete', ins: 'insert',
    control: 'ctrl', option: 'alt', cmd: 'meta', command: 'meta', win: 'meta',
    pgup: 'pageup', pgdn: 'pagedown',
  };
  const lowered = raw.toLowerCase();
  if (lowered in alias) return alias[lowered];   // handles ' ' before it would trim away
  let k = lowered.trim();
  if (!k) return null;
  k = alias[k] ?? k;
  if (k.length === 1) return k;
  if (/^f(?:[1-9]|1[0-2])$/.test(k)) return k;
  const named = new Set([
    'left', 'right', 'up', 'down', 'space', 'return', 'escape', 'tab',
    'backspace', 'delete', 'insert', 'home', 'end', 'pageup', 'pagedown',
    'shift', 'ctrl', 'alt', 'meta',
  ]);
  return named.has(k) ? k : null;
}

// ---------------------------------------------------------------------------
// TETR.IO config import (localStorage `userConfig`)
// ---------------------------------------------------------------------------

/**
 * TETR.IO stores keybinds as arrays of uppercase scancode names
 * ("ARROWLEFT", "KEYZ", "DIGIT1", "NUMPAD4", "SHIFTLEFT", ...).
 * Map them to our KeyEvent.key names. Numpad digits collapse to plain digits
 * (terminals can't reliably distinguish them); gamepad buttons/axes are
 * unmappable (null) and dropped.
 */
export function tetrioKeyName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const k = name.toUpperCase();
  const special: Record<string, string | null> = {
    ARROWLEFT: 'left', LEFT: 'left', ARROWRIGHT: 'right', RIGHT: 'right',
    ARROWUP: 'up', UP: 'up', ARROWDOWN: 'down', DOWN: 'down',
    SPACE: 'space', ENTER: 'return', NUMPADENTER: 'return', ESCAPE: 'escape',
    TAB: 'tab', BACKSPACE: 'backspace', DELETE: 'delete', INSERT: 'insert',
    HOME: 'home', END: 'end', PAGEUP: 'pageup', PAGEDOWN: 'pagedown',
    SHIFT: 'shift', SHIFTLEFT: 'shift', SHIFTRIGHT: 'shift',
    CONTROL: 'ctrl', CONTROLLEFT: 'ctrl', CONTROLRIGHT: 'ctrl',
    ALT: 'alt', ALTLEFT: 'alt', ALTRIGHT: 'alt',
    COMMA: ',', PERIOD: '.', SLASH: '/', BACKSLASH: '\\', SEMICOLON: ';', QUOTE: "'",
    BRACKETLEFT: '[', BRACKETRIGHT: ']', MINUS: '-', EQUAL: '=', BACKQUOTE: '`',
    NUMPADCOMMA: ',', NUMPADPERIOD: '.', NUMPADSLASH: '/',
    NUMPADASTERISK: '*', NUMPADMINUS: '-', NUMPADPLUS: '+',
    // known but not bindable in a terminal
    CAPSLOCK: null, NUMLOCK: null, SCROLLLOCK: null, FN: null,
    META: null, METALEFT: null, METARIGHT: null, OSLEFT: null, OSRIGHT: null,
  };
  if (k in special) return special[k];
  if (/^KEY[A-Z]$/.test(k)) return k[3].toLowerCase();
  if (/^DIGIT[0-9]$/.test(k)) return k[5];
  if (/^NUMPAD[0-9]$/.test(k)) return k[6];
  if (/^F(?:[1-9]|1[0-2])$/.test(k)) return k.toLowerCase();
  if (/^[A-Z0-9]$/.test(k)) return k.toLowerCase();
  return null;
}

/** TETR.IO "guideline" default binds (extracted from the client config code). */
export const TETRIO_PRESET_GUIDELINE: Record<string, string[]> = {
  moveLeft: ['ARROWLEFT', 'LEFT', 'NUMPAD4'],
  moveRight: ['ARROWRIGHT', 'RIGHT', 'NUMPAD6'],
  softDrop: ['ARROWDOWN', 'DOWN', 'NUMPAD2'],
  hardDrop: ['SPACE', 'NUMPAD8'],
  rotateCCW: ['CONTROL', 'CONTROLLEFT', 'Z', 'KEYZ', 'NUMPAD3', 'NUMPAD7'],
  rotateCW: ['ARROWUP', 'UP', 'X', 'KEYX', 'NUMPAD1', 'NUMPAD5', 'NUMPAD9'],
  rotate180: ['A', 'KEYA'],
  hold: ['SHIFT', 'SHIFTLEFT', 'C', 'KEYC', 'NUMPAD0'],
  retry: ['R', 'KEYR'],
};

/** TETR.IO "wasd" default binds (extracted from the client config code). */
export const TETRIO_PRESET_WASD: Record<string, string[]> = {
  moveLeft: ['A', 'KEYA', 'NUMPAD4'],
  moveRight: ['D', 'KEYD', 'NUMPAD6'],
  softDrop: ['W', 'KEYW', 'NUMPAD8'],
  hardDrop: ['S', 'KEYS', 'NUMPAD5'],
  rotateCCW: ['ARROWLEFT', 'LEFT', 'NUMPAD7'],
  rotateCW: ['ARROWRIGHT', 'RIGHT', 'NUMPAD9'],
  rotate180: ['ARROWUP', 'UP', 'NUMPAD2'],
  hold: ['SHIFT', 'SHIFTLEFT', 'NUMPADENTER'],
  retry: ['R', 'KEYR'],
};

/** TETR.IO action name -> our GameAction (they call reset "retry"). Menu/social/chat/target binds are dropped. */
const TETRIO_ACTION_MAP: Record<string, GameAction> = {
  moveLeft: 'moveLeft', moveRight: 'moveRight', softDrop: 'softDrop', hardDrop: 'hardDrop',
  rotateCW: 'rotateCW', rotateCCW: 'rotateCCW', rotate180: 'rotate180', hold: 'hold', retry: 'reset',
};

export interface ImportResult {
  applied: string[];    // sections that were imported ('keybinds' | 'handling' | 'audio')
  warnings: string[];   // non-fatal issues (unmappable keys, missing sections, ...)
}

// ---------------------------------------------------------------------------
// section sanitizers (also used for set() validation)
// ---------------------------------------------------------------------------

export function sanitizeHandling(input: unknown): HandlingConfig {
  const d = defaultHandling();
  const o = isObj(input) ? input : {};
  const L = HANDLING_LIMITS;
  return {
    arr: clampNum(o.arr, L.arr.min, L.arr.max, d.arr),
    das: clampNum(o.das, L.das.min, L.das.max, d.das),
    dcd: clampNum(o.dcd, L.dcd.min, L.dcd.max, d.dcd),
    sdf: clampNum(o.sdf, L.sdf.min, L.sdf.max, d.sdf),
    safelock: asBool(o.safelock, d.safelock),
    cancel: asBool(o.cancel, d.cancel),
    may20g: asBool(o.may20g, d.may20g),
    irs: normalizeIrsMode(o.irs, d.irs),
    ihs: normalizeIrsMode(o.ihs, d.ihs),
  };
}

export function sanitizeKeybinds(input: unknown): KeyBinds {
  const d = defaultKeybinds();
  const src = isObj(input) ? input : {};
  const out = {} as KeyBinds;
  for (const action of GAME_ACTIONS) {
    const v = src[action];
    if (!Array.isArray(v)) { out[action] = [...d[action]]; continue; }
    const keys: string[] = [];
    for (const item of v) {
      const n = normalizeKeyName(item);
      if (n && !keys.includes(n)) keys.push(n);
    }
    out[action] = keys;
  }
  return out;
}

export function sanitizeVideo(input: unknown): VideoConfig {
  const d = defaultConfig().video;
  const o = isObj(input) ? input : {};
  return {
    effects: asBool(o.effects, d.effects),
    minimal: asBool(o.minimal, d.minimal),
    colorMode: asOneOf(o.colorMode, COLOR_MODES, d.colorMode),
    targetFps: TARGET_FPS_OPTIONS.includes(o.targetFps as number)
      ? (o.targetFps as number)
      : Math.round(clampNum(o.targetFps, 15, 240, d.targetFps)),
    theme: typeof o.theme === 'string' ? o.theme : d.theme,
    pieceStyle: typeof o.pieceStyle === 'string' ? o.pieceStyle : d.pieceStyle,
    borderStyle: typeof o.borderStyle === 'string' ? o.borderStyle : d.borderStyle,
  };
}

export function sanitizeAudio(input: unknown): AudioConfig {
  const d = defaultConfig().audio;
  const o = isObj(input) ? input : {};
  return {
    music: Math.round(clampNum(o.music, 0, 100, d.music)),
    sfx: Math.round(clampNum(o.sfx, 0, 100, d.sfx)),
  };
}

export function sanitizeAccount(input: unknown): AccountConfig {
  const d = defaultConfig().account;
  const o = isObj(input) ? input : {};
  return { lastUsername: typeof o.lastUsername === 'string' ? o.lastUsername : d.lastUsername };
}

export function sanitizeConfig(raw: unknown): Config {
  const d = defaultConfig();
  if (!isObj(raw)) return d;
  const merge = <T>(base: T, over: unknown): unknown =>
    isObj(over) ? { ...(base as Record<string, unknown>), ...over } : base;
  return {
    version: CONFIG_VERSION,
    handling: sanitizeHandling(merge(d.handling, raw.handling)),
    keybinds: sanitizeKeybinds(merge(d.keybinds, raw.keybinds)),
    video: sanitizeVideo(merge(d.video, raw.video)),
    audio: sanitizeAudio(merge(d.audio, raw.audio)),
    account: sanitizeAccount(merge(d.account, raw.account)),
  };
}

// ---------------------------------------------------------------------------
// the store
// ---------------------------------------------------------------------------

export interface ConfigStoreOptions {
  /** Config directory. Default: platform config dir (see defaultConfigDir). */
  dir?: string;
  /** Config file name inside dir. Default: 'config.json'. */
  file?: string;
  /** Load from disk immediately (default true). */
  autoLoad?: boolean;
}

export class ConfigStore {
  readonly dir: string;
  readonly file: string;
  private cfg: Config;
  private listeners = new Set<ChangeListener>();
  /** Last IO/parse error encountered (load or save), null when healthy. */
  lastError: Error | null = null;

  constructor(opts: ConfigStoreOptions = {}) {
    this.dir = opts.dir ?? ConfigStore.defaultConfigDir();
    this.file = opts.file ?? CONFIG_FILE_NAME;
    this.cfg = defaultConfig();
    if (opts.autoLoad !== false) this.load();
  }

  /** Absolute path of the backing JSON file. */
  get path(): string { return path.join(this.dir, this.file); }

  /**
   * Default config directory: `$XDG_CONFIG_HOME/tetrio-tui`, else
   * `~/.config/tetrio-tui`, else `<tmpdir>/tetrio-tui` as a last resort.
   * (Injectable env for tests.)
   */
  static defaultConfigDir(env: NodeJS.ProcessEnv = process.env): string {
    const xdg = env.XDG_CONFIG_HOME?.trim();
    if (xdg) return path.join(xdg, CONFIG_DIR_NAME);
    const home = env.HOME?.trim() || safeHomedir();
    if (home) return path.join(home, '.config', CONFIG_DIR_NAME);
    return path.join(os.tmpdir(), CONFIG_DIR_NAME);
  }

  /** Current config (deep copy — mutate via set()/keybind methods). */
  get(): Config { return structuredClone(this.cfg); }

  get handling(): HandlingConfig { return structuredClone(this.cfg.handling); }
  get keybinds(): KeyBinds { return structuredClone(this.cfg.keybinds); }
  get video(): VideoConfig { return structuredClone(this.cfg.video); }
  get audio(): AudioConfig { return structuredClone(this.cfg.audio); }
  get account(): AccountConfig { return structuredClone(this.cfg.account); }

  /** Load from disk. Missing/corrupt file -> defaults (corrupt file is copied aside). */
  load(): Config {
    try {
      const raw = fs.readFileSync(this.path, 'utf8');
      this.cfg = sanitizeConfig(JSON.parse(raw));
      this.lastError = null;
    } catch (e) {
      this.cfg = defaultConfig();
      const err = e as NodeJS.ErrnoException;
      if (err?.code !== 'ENOENT') {
        this.lastError = err ?? null;
        try { fs.copyFileSync(this.path, `${this.path}.corrupt`); } catch { /* best effort */ }
      }
    }
    return this.get();
  }

  /** Persist to disk (creates the config dir; atomic via tmp + rename). Returns success. */
  save(): boolean {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const tmp = `${this.path}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, `${JSON.stringify(this.cfg, null, 2)}\n`, 'utf8');
      fs.renameSync(tmp, this.path);
      this.lastError = null;
      return true;
    } catch (e) {
      this.lastError = e as Error;
      return false;
    }
  }

  /** Merge a patch into a section, validate, save immediately, notify listeners. */
  set<K extends ConfigSection>(section: K, patch: Partial<Config[K]>): Config[K] {
    const merged = { ...(this.cfg[section] as Record<string, unknown>), ...(patch as Record<string, unknown>) };
    switch (section) {
      case 'handling': this.cfg.handling = sanitizeHandling(merged); break;
      case 'keybinds': this.cfg.keybinds = sanitizeKeybinds(merged); break;
      case 'video': this.cfg.video = sanitizeVideo(merged); break;
      case 'audio': this.cfg.audio = sanitizeAudio(merged); break;
      case 'account': this.cfg.account = sanitizeAccount(merged); break;
    }
    this.save();
    this.emit(section);
    return structuredClone(this.cfg[section]);
  }

  /** Reset one section (or 'version' for everything) to defaults; saves + notifies. */
  resetSection(section: ConfigSection): void {
    const d = defaultConfig();
    (this.cfg[section] as Config[ConfigSection]) = d[section];
    this.save();
    this.emit(section);
  }

  resetAll(): void {
    this.cfg = defaultConfig();
    this.save();
    this.emit('all');
  }

  // ---- keybind helpers ----

  /** Replace the bind list for an action (names normalized + deduped). Saves. */
  setKeybinds(action: GameAction, keys: string[]): void {
    this.cfg.keybinds = sanitizeKeybinds({ ...this.cfg.keybinds, [action]: keys });
    this.save();
    this.emit('keybinds');
  }

  /**
   * Add a bind to an action. The key is first removed from every other action
   * (a key drives one action at a time). Saves + notifies on change.
   */
  addKeybind(action: GameAction, key: string): { status: 'added' | 'duplicate' | 'invalid'; stolenFrom?: GameAction } {
    const k = normalizeKeyName(key);
    if (!k) return { status: 'invalid' };
    const binds = this.cfg.keybinds;
    if (binds[action].includes(k)) return { status: 'duplicate' };
    let stolenFrom: GameAction | undefined;
    for (const a of GAME_ACTIONS) {
      if (a === action) continue;
      const i = binds[a].indexOf(k);
      if (i >= 0) { binds[a].splice(i, 1); stolenFrom = a; }
    }
    binds[action] = [...binds[action], k];
    this.save();
    this.emit('keybinds');
    return { status: 'added', stolenFrom };
  }

  removeKeybind(action: GameAction, key: string): boolean {
    const k = normalizeKeyName(key);
    const list = this.cfg.keybinds[action];
    const i = k ? list.indexOf(k) : -1;
    if (i < 0) return false;
    list.splice(i, 1);
    this.save();
    this.emit('keybinds');
    return true;
  }

  clearKeybinds(action: GameAction): void {
    this.cfg.keybinds[action] = [];
    this.save();
    this.emit('keybinds');
  }

  /** Inverse map for the game screen: key name -> action. */
  toKeymap(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const action of GAME_ACTIONS) {
      for (const key of this.cfg.keybinds[action]) out[key] = action;
    }
    return out;
  }

  /**
   * Handling in the shape the engine / wire protocol expects (types.ts Handling).
   * The NetCodec `$$ixs` enum only knows off/hold/tap: `none` -> 'off', and
   * `auto` resolves to 'hold' (TETR.IO resolves auto client-side the same way —
   * the wire enum has no 'auto').
   */
  toEngineHandling(): Handling {
    const h = this.cfg.handling;
    const ixs = (m: IrsMode): string => (m === 'none' ? 'off' : m === 'auto' ? 'hold' : m);
    return {
      arr: h.arr, das: h.das, dcd: h.dcd, sdf: h.sdf,
      safelock: h.safelock, cancel: h.cancel, may20g: h.may20g,
      irs: ixs(h.irs), ihs: ixs(h.ihs),
    };
  }

  // ---- change listeners ----

  onChange(cb: ChangeListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(section: ConfigSection | 'all'): void {
    const snapshot = this.get();
    for (const cb of this.listeners) {
      try { cb(snapshot, section); } catch { /* listener errors must not break the store */ }
    }
  }

  // ---- TETR.IO import ----

  /**
   * Import TETR.IO's own config (the `userConfig` JSON from browser localStorage
   * / the desktop client). Maps controls (guideline/wasd presets or custom binds),
   * handling, and volumes into our schema; saves + notifies once at the end.
   * Throws if the input is not a JSON object.
   */
  importTetrioConfig(json: string): ImportResult {
    const parsed: unknown = JSON.parse(json);
    if (!isObj(parsed)) throw new Error('TETR.IO userConfig must be a JSON object');
    const applied: string[] = [];
    const warnings: string[] = [];

    // --- keybinds ---
    const controls = parsed.controls;
    if (isObj(controls)) {
      const style = typeof controls.style === 'string' ? controls.style : '';
      let table: Record<string, unknown> | null = null;
      if (style === 'custom') {
        if (isObj(controls.custom)) table = controls.custom;
        else warnings.push('controls.style is "custom" but no custom binds found — keybinds unchanged');
      } else if (style === 'wasd') table = TETRIO_PRESET_WASD;
      else if (style === 'guideline') table = TETRIO_PRESET_GUIDELINE;
      else if (isObj(controls.custom)) {
        table = controls.custom;
        warnings.push(`unknown controls.style "${style}" — imported the custom binds`);
      } else if (style) {
        table = TETRIO_PRESET_GUIDELINE;
        warnings.push(`unknown controls.style "${style}" — assumed "guideline"`);
      }
      if (table) {
        const binds = this.keybinds;
        let unmappable = 0;
        let touched = 0;
        for (const [theirAction, theirKeys] of Object.entries(table)) {
          const action = TETRIO_ACTION_MAP[theirAction];
          if (!action || !Array.isArray(theirKeys)) continue;
          const keys: string[] = [];
          for (const raw of theirKeys) {
            const k = tetrioKeyName(raw);
            if (k === null) { unmappable++; continue; }
            if (!keys.includes(k)) keys.push(k);
          }
          if (keys.length === 0 && theirKeys.length > 0) {
            warnings.push(`all binds for "${theirAction}" were unmappable — kept current`);
            continue;
          }
          binds[action] = keys;   // note: empty array honors "unbound" in their config
          touched++;
        }
        if (touched > 0) {
          this.cfg.keybinds = binds;
          applied.push('keybinds');
          if (unmappable > 0) warnings.push(`${unmappable} bind(s) unmappable in a terminal (gamepad/meta keys) — skipped`);
        }
      }
    } else {
      warnings.push('no "controls" section found — keybinds unchanged');
    }

    // --- handling ---
    if (isObj(parsed.handling)) {
      this.cfg.handling = sanitizeHandling({ ...this.cfg.handling, ...parsed.handling });
      applied.push('handling');
    } else {
      warnings.push('no "handling" section found — handling unchanged');
    }

    // --- volumes (TETR.IO uses 0..1 floats) ---
    if (isObj(parsed.volume)) {
      const v = parsed.volume;
      const pct = (x: unknown, fallback: number): number =>
        typeof x === 'number' && Number.isFinite(x)
          ? Math.round(Math.min(1, Math.max(0, x)) * 100)
          : fallback;
      this.cfg.audio = {
        music: pct(v.music, this.cfg.audio.music),
        sfx: pct(v.sfx, this.cfg.audio.sfx),
      };
      applied.push('audio');
    }

    this.save();
    if (applied.length > 0) this.emit('all');
    return { applied, warnings };
  }
}

function safeHomedir(): string {
  try { return os.homedir(); } catch { return ''; }
}
