/**
 * CONFIG screens: CONTROLS (keybind capture), HANDLING (steppers/toggles),
 * VIDEO, AUDIO. All are App `Screen`s and drop into the MenuScreen tree via
 * `custom` items (see createConfigMenuNode).
 *
 * Every edit is written to the ConfigStore immediately (the store saves to
 * disk and notifies its listeners), and the screens additionally fire the
 * optional `onChange` callback so the host app can apply changes live
 * (e.g. re-keymap the game screen, retarget the frame rate).
 *
 * Navigation: up/down select, left/right adjust (shift = big step on
 * numbers/sliders), enter edits/activates, esc goes back.
 * CONTROLS: enter starts a "press a key…" capture — the next keydown becomes
 * an additional bind for that action (esc cancels). backspace/delete clears
 * the action's binds.
 */
import type { KeyEvent, MouseEvent, RenderBuffer, RGB, Screen } from '../app.js';
import { THEME, center } from '../draw.js';
import type { MenuNode } from './menu.js';
import {
  COLOR_MODES,
  GAME_ACTIONS,
  HANDLING_LIMITS,
  IRS_MODES,
  TARGET_FPS_OPTIONS,
  normalizeKeyName,
  type ColorMode,
  type Config,
  type ConfigSection,
  type HandlingConfig,
  type ConfigStore,
  type GameAction,
  type IrsMode,
} from '../../config/store.js';
import { PIECE_STYLE_KEYS } from '../pieceStyles.js';
import { BORDER_STYLE_KEYS } from '../draw.js';
import { themeKeys } from '../themes.js';

// ---------------------------------------------------------------------------
// row model
// ---------------------------------------------------------------------------

type Row =
  | { kind: 'header'; label: string }
  | { kind: 'bind'; action: GameAction; label: string; hint: string }
  | {
      kind: 'number'; label: string; hint: (v: number) => string;
      min: number; max: number; step: number; bigStep: number;
      get: () => number; set: (v: number) => void; format: (v: number) => string;
    }
  | { kind: 'toggle'; label: string; hint: string; get: () => boolean; set: (v: boolean) => void }
  | {
      kind: 'cycle'; label: string; hint: string;
      options: readonly (string | number)[]; get: () => string | number;
      set: (v: string | number) => void; format: (v: string | number) => string;
    }
  | { kind: 'slider'; label: string; hint: string; get: () => number; set: (v: number) => void }
  | { kind: 'action'; label: string; hint: string; danger?: boolean; run: () => void };

const ACTION_LABELS: Record<GameAction, { label: string; hint: string }> = {
  moveLeft: { label: 'MOVE LEFT', hint: 'shift the piece left (hold for DAS/ARR)' },
  moveRight: { label: 'MOVE RIGHT', hint: 'shift the piece right (hold for DAS/ARR)' },
  softDrop: { label: 'SOFT DROP', hint: 'drop faster while held (SDF multiplier)' },
  hardDrop: { label: 'HARD DROP', hint: 'instantly drop and lock the piece' },
  rotateCW: { label: 'ROTATE CW', hint: 'rotate clockwise' },
  rotateCCW: { label: 'ROTATE CCW', hint: 'rotate counter-clockwise' },
  rotate180: { label: 'ROTATE 180', hint: 'rotate 180 degrees' },
  hold: { label: 'HOLD', hint: 'swap with the hold slot' },
  reset: { label: 'RESET', hint: 'retry the game (TETR.IO calls this "retry")' },
};

/** Pretty label for a stored key name. */
export function displayKey(k: string): string {
  const named: Record<string, string> = {
    left: '←', right: '→', up: '↑', down: '↓',
    space: 'SPACE', return: 'ENTER', escape: 'ESC', tab: 'TAB',
    backspace: 'BKSP', delete: 'DEL', insert: 'INS',
    home: 'HOME', end: 'END', pageup: 'PGUP', pagedown: 'PGDN',
    shift: 'SHIFT', ctrl: 'CTRL', alt: 'ALT', meta: 'META',
  };
  return named[k] ?? k.toUpperCase();
}

const fmtFrames = (v: number): string => `${Math.round(v * 10) / 10}F`;
const framesMs = (v: number): number => Math.round((v * 1000) / 60);

// ---------------------------------------------------------------------------
// generic config list screen
// ---------------------------------------------------------------------------

export interface ConfigListScreenOpts {
  title: string;
  subtitle?: string;
  breadcrumb: string[];
  rows: Row[];
  footer: string;
  onBack?: () => void;
  /** Called after the screen itself commits a store mutation (bind capture/clear). */
  onChanged?: () => void;
}

export class ConfigListScreen implements Screen {
  readonly name: string;
  protected opts: ConfigListScreenOpts;
  protected store: ConfigStore | null;
  protected rows: Row[];
  protected idx = 0;
  protected capturing = false;
  private blinkMs = 0;
  private notice: { text: string; until: number } | null = null;

  constructor(opts: ConfigListScreenOpts, store: ConfigStore | null = null) {
    this.opts = opts;
    this.rows = opts.rows;
    this.store = store;
    this.name = opts.title.toLowerCase();
    this.idx = -1;
    this.move(1);   // land on the first selectable row
  }

  protected flash(text: string): void {
    this.notice = { text, until: Date.now() + 2600 };
  }

  /** `update` existing makes the app re-render every frame (blink + notice expiry). */
  update(dtMs: number): void {
    this.blinkMs = (this.blinkMs + dtMs) % 900;
    if (this.notice && Date.now() > this.notice.until) this.notice = null;
  }

  private selectable(i: number): boolean {
    return this.rows[i]?.kind !== 'header';
  }

  protected move(dir: number): void {
    if (this.rows.length === 0) return;
    let i = this.idx;
    for (let n = 0; n < this.rows.length; n++) {
      i = (((i + dir) % this.rows.length) + this.rows.length) % this.rows.length;
      if (this.selectable(i)) { this.idx = i; return; }
    }
  }

  onKey(ev: KeyEvent): void {
    if (ev.type !== 'down') return;
    const row = this.rows[this.idx];

    // --- bind capture mode: the next key becomes the bind ---
    if (this.capturing) {
      if (ev.key === 'escape') {
        this.capturing = false;
        this.flash('rebind cancelled');
        return;
      }
      const key = normalizeKeyName(ev.key);
      if (!key) { this.flash(`can't bind "${ev.key}"`); return; }
      this.capturing = false;
      if (row?.kind === 'bind' && this.store) {
        const res = this.store.addKeybind(row.action, key);
        if (res.status === 'duplicate') this.flash(`${displayKey(key)} already bound to ${row.label}`);
        else if (res.status === 'added') {
          this.flash(
            res.stolenFrom
              ? `bound ${displayKey(key)} to ${row.label} (was: ${ACTION_LABELS[res.stolenFrom].label})`
              : `bound ${displayKey(key)} to ${row.label}`,
          );
          this.opts.onChanged?.();
        }
      }
      return;
    }

    switch (ev.key) {
      case 'up': this.move(-1); return;
      case 'down': this.move(1); return;
      case 'left': this.adjust(row, -1, ev.shift === true); return;
      case 'right': this.adjust(row, 1, ev.shift === true); return;
      case 'return': this.activate(row); return;
      case 'backspace':
      case 'delete':
        if (row?.kind === 'bind' && this.store) {
          this.store.clearKeybinds(row.action);
          this.flash(`cleared binds for ${row.label}`);
          this.opts.onChanged?.();
        }
        return;
      case 'escape':
        this.opts.onBack?.();
        return;
    }
  }

  /** Row/extent of each selectable row from the last render, for mouse hit-testing (null = header). */
  private rowRects: ({ x: number; y: number; w: number; h: number } | null)[] = [];

  onMouse(ev: MouseEvent): void {
    if (this.capturing) return;
    if (ev.action === 'scroll-up') { this.move(-1); return; }
    if (ev.action === 'scroll-down') { this.move(1); return; }
    if (ev.action === 'down' && ev.button !== 'left') return;
    if (ev.action !== 'down' && ev.action !== 'move') return;
    for (let i = 0; i < this.rowRects.length; i++) {
      const r = this.rowRects[i];
      if (!r) continue;
      if (ev.x < r.x || ev.x >= r.x + r.w || ev.y < r.y || ev.y >= r.y + r.h) continue;
      this.idx = i;
      if (ev.action === 'down') this.activate(this.rows[i]);
      return;
    }
  }

  private adjust(row: Row | undefined, dir: -1 | 1, big: boolean): void {
    if (!row) return;
    switch (row.kind) {
      case 'number': {
        const step = (big ? row.bigStep : row.step) * dir;
        const v = Math.min(row.max, Math.max(row.min, Math.round((row.get() + step) * 100) / 100));
        row.set(v);
        return;
      }
      case 'slider': {
        const step = (big ? 20 : 5) * dir;
        row.set(Math.min(100, Math.max(0, row.get() + step)));
        return;
      }
      case 'toggle': row.set(!row.get()); return;
      case 'cycle': {
        const cur = row.options.indexOf(row.get());
        const next = (((cur < 0 ? 0 : cur) + dir) + row.options.length) % row.options.length;
        row.set(row.options[next]);
        return;
      }
      default: return;
    }
  }

  private activate(row: Row | undefined): void {
    if (!row) return;
    switch (row.kind) {
      case 'bind': this.capturing = true; return;
      case 'toggle': row.set(!row.get()); return;
      case 'cycle': this.adjust(row, 1, false); return;
      case 'number': {
        const v = row.get() + row.step;
        row.set(v > row.max ? row.min : Math.round(v * 100) / 100);
        return;
      }
      case 'slider': row.set(row.get() >= 100 ? 0 : Math.min(100, row.get() + 5)); return;
      case 'action': row.run(); return;
      default: return;
    }
  }

  // ---- rendering ----

  render(buf: RenderBuffer): void {
    const { subtitle, breadcrumb } = this.opts;
    buf.fillRect(0, 0, buf.width, buf.height, ' ', { bg: THEME.bg });
    buf.drawText(2, 1, breadcrumb.join(' / '), { fg: THEME.config, bold: true });
    if (subtitle) center(buf, 3, subtitle, { fg: THEME.dim });

    const w = Math.min(72, buf.width - 8);
    const x = Math.max(0, Math.floor((buf.width - w) / 2));

    // adaptive density: 3 lines/row (label + hint + gap) when there's room,
    // otherwise 2 lines/row with the hint inlined after the label.
    const headers = this.rows.filter((r) => r.kind === 'header').length;
    const normal = this.rows.length - headers;
    const avail = buf.height - 5 - 4;   // top offset + footer zone
    const compact = normal * 3 + headers * 2 > avail;

    let y = 5;
    this.rowRects = [];
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      if (row.kind === 'header') {
        this.rowRects.push(null);
        if (row.label) {
          buf.drawText(x + 2, compact ? y : y + 1, row.label, { fg: THEME.dim, bold: true });
          y += compact ? 1 : 2;
        } else if (!compact) y += 2;
        continue;
      }
      this.rowRects.push({ x, y, w, h: compact ? 1 : 2 });
      const sel = i === this.idx;
      const bg: RGB = sel ? THEME.config : THEME.panel;
      const fg: RGB = sel ? [10, 10, 18] : THEME.text;
      const dim: RGB = sel ? [30, 30, 46] : THEME.dim;
      buf.fillRect(x, y, w, compact ? 1 : 2, ' ', { bg });
      if (row.kind === 'action') {
        // danger rows: lift the theme's bad color toward white so the destructive
        // action stays >=4.5:1 on every theme (measured on nord/solarized/dracula/gruvbox)
        const lift = (cc: RGB, f: number): RGB => [Math.min(255, Math.round(cc[0] + (255 - cc[0]) * f)), Math.min(255, Math.round(cc[1] + (255 - cc[1]) * f)), Math.min(255, Math.round(cc[2] + (255 - cc[2]) * f))] as RGB;
        const c = row.danger ? lift(THEME.bad, 0.35) : THEME.accent2;
        buf.drawText(x + 2, y, row.label, { fg: sel ? fg : c, bold: true });
        if (!compact) buf.drawText(x + 2, y + 1, row.hint, { fg: dim });
      } else {
        const value = this.valueText(row, sel);
        buf.drawText(x + 2, y, row.label, { fg, bold: true });
        if (value.text) buf.drawText(x + w - 2 - value.text.length, y, value.text, { fg: value.color(fg, dim), bold: sel });
        const hint = this.hintText(row);
        if (!compact) {
          buf.drawText(x + 2, y + 1, hint, { fg: dim });
        } else if (hint) {
          const hx = x + 20;
          const maxLen = x + w - 4 - value.text.length - hx;
          if (maxLen > 8) buf.drawText(hx, y, hint.length > maxLen ? `${hint.slice(0, maxLen - 1)}…` : hint, { fg: dim });
        }
      }
      y += compact ? 2 : 3;
    }

    // footer: transient notice, capture prompt, or context help
    const foot = this.notice
      ? { text: this.notice.text, color: THEME.warn }
      : this.capturing
        ? { text: 'press a key to bind · esc cancel', color: THEME.warn }
        : { text: this.opts.footer, color: THEME.dim };
    center(buf, buf.height - 3, foot.text, { fg: foot.color });
  }

  private hintText(row: Row): string {
    switch (row.kind) {
      case 'number': return row.hint(row.get());
      case 'header': return '';
      default: return row.hint;
    }
  }

  private valueText(row: Row, sel: boolean): { text: string; color: (fg: RGB, dim: RGB) => RGB } {
    switch (row.kind) {
      case 'bind': {
        if (this.capturing && sel) {
          return { text: this.blinkMs < 550 ? 'press a key…' : '', color: (_f, d) => d };
        }
        const binds = this.store?.keybinds[row.action] ?? [];
        return {
          text: binds.length ? binds.map(displayKey).join('   ') : '—',
          color: (f, d) => (binds.length ? f : d),
        };
      }
      case 'number': return { text: `‹ ${row.format(row.get())} ›`, color: (f) => f };
      case 'toggle': {
        const on = row.get();
        return { text: on ? '[ ON ]' : '[ OFF ]', color: (f, d) => (sel ? f : on ? THEME.good : d) };
      }
      case 'cycle': return { text: `‹ ${row.format(row.get())} ›`, color: (f) => f };
      case 'slider': {
        const v = row.get();
        const cells = 12;
        const fill = Math.round((v / 100) * cells);
        // NB: single-width glyphs only — the terminal driver double-widths █░▓▒
        return { text: `[${'■'.repeat(fill)}${'□'.repeat(cells - fill)}] ${v}%`, color: (f) => f };
      }
      default: return { text: '', color: (f) => f };
    }
  }
}

// ---------------------------------------------------------------------------
// factories
// ---------------------------------------------------------------------------

export interface ConfigScreenFactoryOpts {
  store: ConfigStore;
  onBack?: () => void;
  /** Called after every committed change (the store has already saved). */
  onChange?: (cfg: Config, section: ConfigSection | 'all') => void;
}

const FOOTER_NAV = '↑↓ select · ←→ adjust (shift = big step) · enter edit · esc back';

export function createControlsScreen(opts: ConfigScreenFactoryOpts): Screen {
  const { store } = opts;
  const changed = (): void => opts.onChange?.(store.get(), 'keybinds');

  const rows: Row[] = [
    { kind: 'header', label: 'GAME ACTIONS — enter to add a bind · backspace clears' },
    ...GAME_ACTIONS.map((action): Row => ({ kind: 'bind', action, ...ACTION_LABELS[action] })),
    { kind: 'header', label: '' },
    {
      kind: 'action', label: 'RESET TO DEFAULTS', hint: 'restore the default keybinds', danger: true,
      run: () => { store.resetSection('keybinds'); changed(); },
    },
  ];
  return new ConfigListScreen({
    title: 'CONTROLS',
    subtitle: 'keybinds — multiple binds per action allowed',
    breadcrumb: ['CONFIG', 'CONTROLS'],
    rows,
    footer: '↑↓ select · enter rebind · bksp clear · esc back',
    onBack: opts.onBack,
    onChanged: changed,
  }, store);
}

export function createHandlingScreen(opts: ConfigScreenFactoryOpts): Screen {
  const { store } = opts;
  const set = (patch: Partial<HandlingConfig>): void => {
    store.set('handling', patch);
    opts.onChange?.(store.get(), 'handling');
  };
  const num = (
    key: 'arr' | 'das' | 'dcd' | 'sdf',
    label: string,
    format: (v: number) => string,
    hint: (v: number) => string,
  ): Row => {
    const L = HANDLING_LIMITS[key];
    return {
      kind: 'number', label, min: L.min, max: L.max, step: L.step, bigStep: L.bigStep,
      get: () => store.handling[key],
      set: (v) => set({ [key]: v }),
      format, hint,
    };
  };
  const toggle = (
    key: 'safelock' | 'cancel' | 'may20g',
    label: string,
    hint: string,
  ): Row => ({
    kind: 'toggle', label, hint,
    get: () => store.handling[key],
    set: (v) => set({ [key]: v }),
  });
  const ixs = (key: 'irs' | 'ihs', label: string, hint: string): Row => ({
    kind: 'cycle', label, hint,
    options: IRS_MODES,
    get: () => store.handling[key],
    set: (v) => set({ [key]: v as IrsMode }),
    format: (v) => String(v).toUpperCase(),
  });

  const rows: Row[] = [
    { kind: 'header', label: 'SPEEDS (frames @60fps)' },
    num('arr', 'ARR', fmtFrames, (v) =>
      v <= 0 ? 'auto-shift is instant (zooms to the wall)' : `${framesMs(v)}ms per auto-shift · ${Math.round(6000 / v) / 100} cells/s`),
    num('das', 'DAS', fmtFrames, (v) =>
      v <= 0 ? 'auto-shift starts immediately' : `${framesMs(v)}ms before auto-shift starts`),
    num('dcd', 'DCD', fmtFrames, (v) =>
      v <= 0 ? 'no DAS cut on wall-charge rotations' : `${framesMs(v)}ms cut from DAS when a rotation hits a wall`),
    num('sdf', 'SDF', (v) => (v >= 41 ? '∞' : `${v}x`), (v) =>
      v >= 41 ? 'soft drop is instant (20G)' : `soft drop falls at gravity × ${v}`),
    { kind: 'header', label: 'FLAGS' },
    toggle('safelock', 'SAFE LOCK', 'on: brief hard-drop guard right after a piece locks'),
    toggle('cancel', 'DAS CANCEL', 'on: releasing one direction instantly re-charges the other'),
    toggle('may20g', 'ALLOW 20G', 'on: soft drop may go 20G when gravity is high'),
    ixs('irs', 'IRS', 'initial rotation system — rotate before the piece spawns'),
    ixs('ihs', 'IHS', 'initial hold system — hold before the piece spawns'),
    { kind: 'header', label: '' },
    {
      kind: 'action', label: 'RESET TO DEFAULTS', hint: 'arr 2F · das 10F · dcd 2F · sdf 6x', danger: true,
      run: () => { store.resetSection('handling'); opts.onChange?.(store.get(), 'handling'); },
    },
  ];
  return new ConfigListScreen({
    title: 'HANDLING',
    subtitle: 'DAS / ARR / DCD / SDF + flags',
    breadcrumb: ['CONFIG', 'HANDLING'],
    rows,
    footer: FOOTER_NAV,
    onBack: opts.onBack,
  }, store);
}

export function createVideoScreen(opts: ConfigScreenFactoryOpts): Screen {
  const { store } = opts;
  const set = (patch: Partial<Config['video']>): void => {
    store.set('video', patch);
    opts.onChange?.(store.get(), 'video');
  };
  const rows: Row[] = [
    { kind: 'header', label: 'DISPLAY' },
    {
      kind: 'toggle', label: 'EFFECTS', hint: 'board shake, line-clear flashes, attack popups',
      get: () => store.video.effects, set: (v) => set({ effects: v }),
    },
    {
      kind: 'cycle', label: 'COLOR MODE', hint: 'reduce colors for terminals without truecolor',
      options: COLOR_MODES,
      get: () => store.video.colorMode,
      set: (v) => set({ colorMode: v as ColorMode }),
      format: (v) => String(v).toUpperCase(),
    },
    {
      kind: 'cycle', label: 'TARGET FPS', hint: 'frame rate cap for the renderer',
      options: TARGET_FPS_OPTIONS,
      get: () => store.video.targetFps,
      set: (v) => set({ targetFps: v as number }),
      format: (v) => `${v} FPS`,
    },
    {
      kind: 'cycle', label: 'PIECE STYLE', hint: 'how pieces are rendered on the board',
      options: PIECE_STYLE_KEYS,
      get: () => store.video.pieceStyle,
      set: (v) => set({ pieceStyle: v as string }),
      format: (v) => String(v).toUpperCase(),
    },
    {
      kind: 'cycle', label: 'BORDER STYLE', hint: 'panel + board frame glyphs (rounded / double / tetro mixed / zen)',
      options: BORDER_STYLE_KEYS,
      get: () => store.video.borderStyle,
      set: (v) => set({ borderStyle: v as string }),
      format: (v) => String(v).toUpperCase(),
    },
    {
      kind: 'cycle', label: 'THEME', hint: 'color theme — user themes load from ~/.config/tetrio-tui/themes/',
      options: themeKeys(),
      get: () => store.video.theme,
      set: (v) => set({ theme: v as string }),
      format: (v) => String(v).toUpperCase(),
    },
    {
      kind: 'toggle', label: 'MINIMAL MODE', hint: 'no ASCII art, no shake/particles/animations — plain calm text',
      get: () => store.video.minimal,
      set: (v) => set({ minimal: v }),
    },
    { kind: 'header', label: '' },
    {
      kind: 'action', label: 'RESET TO DEFAULTS', hint: 'effects on · truecolor · 60 fps · bevel', danger: true,
      run: () => { store.resetSection('video'); opts.onChange?.(store.get(), 'video'); },
    },
  ];
  return new ConfigListScreen({
    title: 'VIDEO',
    subtitle: 'display and effects',
    breadcrumb: ['CONFIG', 'VIDEO'],
    rows,
    footer: FOOTER_NAV,
    onBack: opts.onBack,
  }, store);
}

export function createAudioScreen(opts: ConfigScreenFactoryOpts): Screen {
  const { store } = opts;
  const set = (patch: Partial<Config['audio']>): void => {
    store.set('audio', patch);
    opts.onChange?.(store.get(), 'audio');
  };
  const slider = (key: 'music' | 'sfx', label: string, hint: string): Row => ({
    kind: 'slider', label, hint,
    get: () => store.audio[key],
    set: (v) => set({ [key]: v }),
  });
  const rows: Row[] = [
    { kind: 'header', label: 'VOLUMES' },
    slider('music', 'MUSIC', 'background music volume'),
    slider('sfx', 'SFX', 'sound effects volume'),
    { kind: 'header', label: '' },
    {
      kind: 'action', label: 'RESET TO DEFAULTS', hint: 'music 100% · sfx 100%', danger: true,
      run: () => { store.resetSection('audio'); opts.onChange?.(store.get(), 'audio'); },
    },
  ];
  return new ConfigListScreen({
    title: 'AUDIO',
    subtitle: 'volume (reserved for future sound support)',
    breadcrumb: ['CONFIG', 'AUDIO'],
    rows,
    footer: FOOTER_NAV,
    onBack: opts.onBack,
  }, store);
}

/**
 * The CONFIG submenu as a MenuNode — drop-in replacement for the placeholder
 * config menu in the app controller (`custom` items push the four screens).
 */
export function createConfigMenuNode(opts: ConfigScreenFactoryOpts): MenuNode {
  return {
    title: 'CONFIG',
    color: THEME.config,
    items: [
      { id: 'controls', label: 'CONTROLS', sub: 'keybinds', color: THEME.config, custom: createControlsScreen(opts) },
      { id: 'handling', label: 'HANDLING', sub: 'DAS / ARR / SDF / DCD', color: THEME.config, custom: createHandlingScreen(opts) },
      { id: 'video', label: 'VIDEO', sub: 'display and effects', color: THEME.config, custom: createVideoScreen(opts) },
      { id: 'audio', label: 'AUDIO', sub: 'volume', color: THEME.config, custom: createAudioScreen(opts) },
    ],
  };
}
