/**
 * config.test.ts — ConfigStore persistence/validation + TETR.IO import mapping.
 * Uses real temp dirs (no fs mocking needed — the store takes a `dir`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import {
  ConfigStore,
  defaultConfig,
  defaultKeybinds,
  GAME_ACTIONS,
  normalizeKeyName,
  tetrioKeyName,
  type GameAction,
} from '../src/config/store.js';
import {
  createAudioScreen,
  createControlsScreen,
  createHandlingScreen,
  createVideoScreen,
} from '../src/tui/screens/config.js';
import type { KeyEvent, RenderBuffer, Style } from '../src/tui/app.js';

// ---- helpers ----

const tmpDirs: string[] = [];
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tetrio-tui-config-test-'));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function storeIn(dir: string): ConfigStore {
  return new ConfigStore({ dir });
}

const kd = (key: string, mods: Partial<KeyEvent> = {}): KeyEvent => ({ key, type: 'down', ...mods });

/** Minimal RenderBuffer that records text for assertions. */
function stubBuffer(width = 100, height = 44): RenderBuffer & { text(): string } {
  const grid: string[][] = Array.from({ length: height }, () => new Array<string>(width).fill(' '));
  const put = (x: number, y: number, ch: string): void => {
    for (let i = 0; i < ch.length; i++) if (x + i >= 0 && x + i < width && y >= 0 && y < height) grid[y][x + i] = ch[i];
  };
  return {
    width,
    height,
    set: (x, y, ch, _style?: Style) => put(x, y, ch),
    fillRect: (x, y, w, h, ch, _style?: Style) => {
      for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) put(c, r, ch);
    },
    drawText: (x, y, text, _style?: Style) => put(x, y, text),
    text: () => grid.map((r) => r.join('')).join('\n'),
  };
}

// ---- defaults & first load ----

describe('ConfigStore load/defaults', () => {
  test('missing file -> defaults', () => {
    const s = storeIn(tmpDir());
    expect(s.get()).toEqual(defaultConfig());
    expect(s.lastError).toBeNull();
  });

  test('save creates the dir and a parseable versioned JSON file', () => {
    const dir = path.join(tmpDir(), 'nested', 'deeper');
    const s = storeIn(dir);
    s.set('handling', { das: 7 });
    expect(fs.existsSync(s.path)).toBe(true);
    const raw = JSON.parse(fs.readFileSync(s.path, 'utf8'));
    expect(raw.version).toBe(1);
    expect(raw.handling.das).toBe(7);
    // reload in a fresh store -> persisted
    const s2 = storeIn(dir);
    expect(s2.handling.das).toBe(7);
    expect(s2.handling.arr).toBe(2); // untouched fields kept
  });

  test('corrupt file -> defaults, file preserved as .corrupt', () => {
    const dir = tmpDir();
    const s = storeIn(dir);
    s.save();
    fs.writeFileSync(s.path, 'not json {{{', 'utf8');
    const s2 = storeIn(dir);
    expect(s2.get()).toEqual(defaultConfig());
    expect(s2.lastError).not.toBeNull();
    expect(fs.existsSync(`${s2.path}.corrupt`)).toBe(true);
  });

  test('valid JSON with wrong types/out-of-range values is sanitized', () => {
    const dir = tmpDir();
    const s = storeIn(dir);
    fs.writeFileSync(s.path, JSON.stringify({
      version: 99,
      handling: { das: 'fast', arr: 99, sdf: 0, irs: 'off' },
      video: { targetFps: 999, colorMode: 'rainbow' },
      audio: { music: 250 },
      keybinds: { moveLeft: 'ARROWLEFT', hold: ['C', 'c ', 42] },
      junk: true,
    }), 'utf8');
    const s2 = storeIn(dir);
    expect(s2.handling.das).toBe(10);        // junk -> default
    expect(s2.handling.arr).toBe(5);         // clamped to max
    expect(s2.handling.sdf).toBe(1);         // clamped to min
    expect(s2.handling.irs).toBe('none');    // wire name 'off' accepted
    expect(s2.video.targetFps).toBe(240);    // clamped
    expect(s2.video.colorMode).toBe('truecolor');
    expect(s2.audio.music).toBe(100);
    expect(s2.keybinds.moveLeft).toEqual(['left']); // junk -> default
    expect(s2.keybinds.hold).toEqual(['c']);        // normalized + deduped + non-strings dropped
    expect(s2.get()).not.toHaveProperty('junk');
  });

  test('get() returns a deep copy (mutation does not leak into the store)', () => {
    const s = storeIn(tmpDir());
    const cfg = s.get();
    cfg.handling.das = 1;
    cfg.keybinds.moveLeft.push('q');
    expect(s.handling.das).toBe(10);
    expect(s.keybinds.moveLeft).toEqual(['left']);
  });
});

// ---- set/save/listeners ----

describe('ConfigStore set/save', () => {
  test('set validates, saves immediately and notifies listeners', () => {
    const dir = tmpDir();
    const s = storeIn(dir);
    const seen: string[] = [];
    const off = s.onChange((cfg, section) => {
      seen.push(section);
      expect(cfg.handling.das).toBe(20);
    });
    s.set('handling', { das: 999 });   // clamped to 20
    expect(s.handling.das).toBe(20);
    expect(seen).toEqual(['handling']);
    // persisted
    expect(JSON.parse(fs.readFileSync(s.path, 'utf8')).handling.das).toBe(20);
    off();
    s.set('handling', { das: 5 });
    expect(seen).toEqual(['handling']);   // unsubscribed
  });

  test('save failure is graceful (lastError set, no throw, memory still updated)', () => {
    const blocker = path.join(tmpDir(), 'blocker');
    fs.writeFileSync(blocker, 'i am a file, not a dir', 'utf8');
    const s = new ConfigStore({ dir: blocker, autoLoad: false });
    s.set('handling', { das: 3 });
    expect(s.lastError).not.toBeNull();
    expect(s.handling.das).toBe(3);   // applied in memory despite save failure
  });

  test('resetSection / resetAll restore defaults', () => {
    const s = storeIn(tmpDir());
    s.set('handling', { das: 4 });
    s.resetSection('handling');
    expect(s.handling).toEqual(defaultConfig().handling);
    s.set('audio', { music: 12 });
    s.resetAll();
    expect(s.get()).toEqual(defaultConfig());
  });
});

// ---- config dir resolution ----

describe('ConfigStore.defaultConfigDir', () => {
  test('respects XDG_CONFIG_HOME', () => {
    expect(ConfigStore.defaultConfigDir({ XDG_CONFIG_HOME: '/tmp/xdg' }))
      .toBe(path.join('/tmp/xdg', 'tetrio-tui'));
  });
  test('falls back to ~/.config', () => {
    expect(ConfigStore.defaultConfigDir({ HOME: '/home/u' }))
      .toBe(path.join('/home/u', '.config', 'tetrio-tui'));
  });
  test('falls back to the os home dir, and always ends with tetrio-tui', () => {
    expect(ConfigStore.defaultConfigDir({}).endsWith('tetrio-tui')).toBe(true);
  });
});

// ---- keybinds ----

describe('keybinds', () => {
  test('addKeybind: dedupe, invalid, and conflict steal', () => {
    const s = storeIn(tmpDir());
    expect(s.addKeybind('moveLeft', 'j')).toEqual({ status: 'added', stolenFrom: undefined });
    expect(s.keybinds.moveLeft).toEqual(['left', 'j']);
    expect(s.addKeybind('moveLeft', 'j').status).toBe('duplicate');
    expect(s.addKeybind('moveLeft', '###').status).toBe('invalid');
    // steal: 'x' starts on rotateCW
    const res = s.addKeybind('moveRight', 'x');
    expect(res).toEqual({ status: 'added', stolenFrom: 'rotateCW' });
    expect(s.keybinds.rotateCW).toEqual([]);
    expect(s.keybinds.moveRight).toEqual(['right', 'x']);
  });

  test('setKeybinds normalizes + dedupes; removeKeybind/clearKeybinds work', () => {
    const s = storeIn(tmpDir());
    s.setKeybinds('hardDrop', ['ArrowLeft', 'SPACE', 'space', 'Enter']);
    expect(s.keybinds.hardDrop).toEqual(['left', 'space', 'return']);
    expect(s.removeKeybind('hardDrop', 'SPACE')).toBe(true);
    expect(s.removeKeybind('hardDrop', 'not-bound')).toBe(false);
    expect(s.keybinds.hardDrop).toEqual(['left', 'return']);
    s.clearKeybinds('hardDrop');
    expect(s.keybinds.hardDrop).toEqual([]);
  });

  test('keybind writes persist to disk', () => {
    const dir = tmpDir();
    const s = storeIn(dir);
    s.addKeybind('hold', 'v');
    expect(storeIn(dir).keybinds.hold).toEqual(['c', 'shift', 'v']);
  });

  test('toKeymap inverts binds (game-screen shape)', () => {
    const s = storeIn(tmpDir());
    const map = s.toKeymap();
    expect(map.left).toBe('moveLeft');
    expect(map.space).toBe('hardDrop');
    expect(map.c).toBe('hold');
    expect(map.r).toBe('reset');
  });

  test('every action has a default bind', () => {
    const d = defaultKeybinds();
    for (const a of GAME_ACTIONS) expect(d[a].length).toBeGreaterThan(0);
  });
});

// ---- engine/wire projections ----

describe('toEngineHandling', () => {
  test('maps irs/ihs onto the NetCodec $$ixs enum (off/hold/tap)', () => {
    const s = storeIn(tmpDir());
    expect(s.toEngineHandling()).toMatchObject({ arr: 2, das: 10, dcd: 2, sdf: 6, irs: 'tap', ihs: 'tap' });
    s.set('handling', { irs: 'none', ihs: 'auto' });
    const h = s.toEngineHandling();
    expect(h.irs).toBe('off');
    expect(h.ihs).toBe('hold');
  });
});

// ---- key name mapping tables ----

describe('key name mapping', () => {
  test('normalizeKeyName aliases + validation', () => {
    expect(normalizeKeyName('ArrowLeft')).toBe('left');
    expect(normalizeKeyName(' ')).toBe('space');
    expect(normalizeKeyName('Enter')).toBe('return');
    expect(normalizeKeyName('X')).toBe('x');
    expect(normalizeKeyName('F11')).toBe('f11');
    expect(normalizeKeyName('F13')).toBeNull();
    expect(normalizeKeyName('does-not-exist')).toBeNull();
    expect(normalizeKeyName(42 as unknown as string)).toBeNull();
  });

  test('tetrioKeyName maps TETR.IO scancodes to our names', () => {
    expect(tetrioKeyName('ARROWLEFT')).toBe('left');
    expect(tetrioKeyName('LEFT')).toBe('left');
    expect(tetrioKeyName('KEYZ')).toBe('z');
    expect(tetrioKeyName('Z')).toBe('z');
    expect(tetrioKeyName('DIGIT3')).toBe('3');
    expect(tetrioKeyName('NUMPAD4')).toBe('4');
    expect(tetrioKeyName('NUMPADENTER')).toBe('return');
    expect(tetrioKeyName('SHIFTLEFT')).toBe('shift');
    expect(tetrioKeyName('CONTROL')).toBe('ctrl');
    expect(tetrioKeyName('SPACE')).toBe('space');
    expect(tetrioKeyName('BRACKETLEFT')).toBe('[');
    expect(tetrioKeyName('BUTTON_0')).toBeNull();   // gamepad — unmappable
    expect(tetrioKeyName('AXIS_1_NEG')).toBeNull();
  });
});

// ---- TETR.IO userConfig import ----

describe('importTetrioConfig', () => {
  test('throws on non-JSON / non-object input', () => {
    const s = storeIn(tmpDir());
    expect(() => s.importTetrioConfig('not json')).toThrow();
    expect(() => s.importTetrioConfig('[1,2,3]')).toThrow(/object/);
    expect(() => s.importTetrioConfig('42')).toThrow(/object/);
  });

  test('custom style: maps binds (dedupe, retry->reset, drop unmappable), handling, volumes', () => {
    const s = storeIn(tmpDir());
    const res = s.importTetrioConfig(JSON.stringify({
      controls: {
        style: 'custom',
        custom: {
          moveLeft: ['ARROWLEFT', 'KEYJ'],
          moveRight: ['ARROWRIGHT'],
          softDrop: ['ARROWDOWN'],
          hardDrop: ['SPACE'],
          rotateCW: ['X', 'KEYX'],
          rotateCCW: ['Z', 'KEYZ'],
          rotate180: ['A'],
          hold: ['C', 'BUTTON_4'],
          retry: ['R'],
          chat: ['T'],          // not a game action — ignored
          menuUp: ['W'],        // menu bind — ignored
        },
      },
      handling: { arr: 1.5, das: 7, dcd: 0, sdf: 41, safelock: false, cancel: true, may20g: false, irs: 'hold', ihs: 'off' },
      volume: { music: 0.4, sfx: 0.75, stereo: 0.5 },
    }));
    expect(res.applied).toEqual(['keybinds', 'handling', 'audio']);
    expect(s.keybinds.moveLeft).toEqual(['left', 'j']);
    expect(s.keybinds.moveRight).toEqual(['right']);
    expect(s.keybinds.rotateCW).toEqual(['x']);        // X + KEYX dedupe
    expect(s.keybinds.hold).toEqual(['c']);            // BUTTON_4 dropped
    expect(s.keybinds.reset).toEqual(['r']);           // retry -> reset
    expect(res.warnings.join(' ')).toMatch(/unmappable/);
    expect(s.handling).toEqual({
      arr: 1.5, das: 7, dcd: 0, sdf: 41,
      safelock: false, cancel: true, may20g: false,
      irs: 'hold', ihs: 'none',                        // TETR.IO 'off' -> our 'none'
    });
    expect(s.audio).toEqual({ music: 40, sfx: 75 });   // 0..1 floats -> 0..100
  });

  test('guideline preset maps when style=guideline', () => {
    const s = storeIn(tmpDir());
    const res = s.importTetrioConfig(JSON.stringify({ controls: { style: 'guideline' } }));
    expect(res.applied).toContain('keybinds');
    expect(s.keybinds.moveLeft).toEqual(['left', '4']);          // ARROWLEFT, LEFT, NUMPAD4
    expect(s.keybinds.hardDrop).toEqual(['space', '8']);         // SPACE, NUMPAD8
    expect(s.keybinds.rotateCCW).toEqual(['ctrl', 'z', '3', '7']);
    expect(s.keybinds.rotateCW).toEqual(['up', 'x', '1', '5', '9']);
    expect(s.keybinds.rotate180).toEqual(['a']);
    expect(s.keybinds.hold).toEqual(['shift', 'c', '0']);
    expect(s.keybinds.reset).toEqual(['r']);
  });

  test('wasd preset maps when style=wasd', () => {
    const s = storeIn(tmpDir());
    s.importTetrioConfig(JSON.stringify({ controls: { style: 'wasd' } }));
    expect(s.keybinds.moveLeft).toEqual(['a', '4']);
    expect(s.keybinds.softDrop).toEqual(['w', '8']);
    expect(s.keybinds.hardDrop).toEqual(['s', '5']);
    expect(s.keybinds.rotate180).toEqual(['up', '2']);
    expect(s.keybinds.hold).toEqual(['shift', 'return']);        // NUMPADENTER -> return
  });

  test('handling is clamped/validated on import', () => {
    const s = storeIn(tmpDir());
    s.importTetrioConfig(JSON.stringify({ handling: { arr: 99, das: -3, sdf: 'banana' } }));
    expect(s.handling.arr).toBe(5);
    expect(s.handling.das).toBe(0);
    expect(s.handling.sdf).toBe(6);   // junk -> default
  });

  test('missing sections warn and leave config untouched', () => {
    const s = storeIn(tmpDir());
    const before = s.get();
    const res = s.importTetrioConfig('{}');
    expect(res.applied).toEqual([]);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(s.get()).toEqual(before);
  });

  test('unknown style falls back to custom binds with a warning', () => {
    const s = storeIn(tmpDir());
    const res = s.importTetrioConfig(JSON.stringify({
      controls: { style: 'mystery', custom: { moveLeft: ['KEYQ'] } },
    }));
    expect(s.keybinds.moveLeft).toEqual(['q']);
    expect(res.warnings.join(' ')).toMatch(/mystery/);
  });

  test('import persists to disk', () => {
    const dir = tmpDir();
    storeIn(dir).importTetrioConfig(JSON.stringify({
      controls: { style: 'custom', custom: { moveLeft: ['KEYJ'] } },
      handling: { das: 3 },
    }));
    const s2 = storeIn(dir);
    expect(s2.keybinds.moveLeft).toEqual(['j']);
    expect(s2.handling.das).toBe(3);
  });
});

// ---- screens (logic-level, stub buffer) ----

describe('config screens', () => {
  test('CONTROLS: enter captures the next keypress as an extra bind; esc cancels', () => {
    const s = storeIn(tmpDir());
    const changes: string[] = [];
    const scr = createControlsScreen({ store: s, onChange: (_c, sec) => changes.push(sec) });
    const buf = stubBuffer();

    scr.render(buf);
    expect(buf.text()).toContain('MOVE LEFT');
    expect(buf.text()).toContain('←');            // default moveLeft bind

    scr.onKey(kd('return'));                      // capture on MOVE LEFT (first row)
    scr.render(buf);
    expect(buf.text()).toContain('press a key');
    scr.onKey(kd('j'));
    expect(s.keybinds.moveLeft).toEqual(['left', 'j']);
    expect(changes).toEqual(['keybinds']);

    // escape cancels without changing anything
    scr.onKey(kd('return'));
    scr.onKey(kd('escape'));
    expect(s.keybinds.moveLeft).toEqual(['left', 'j']);

    // backspace clears the focused action (navigate to HARD DROP)
    scr.onKey(kd('down')); scr.onKey(kd('down')); scr.onKey(kd('down'));
    scr.onKey(kd('backspace'));
    expect(s.keybinds.hardDrop).toEqual([]);

    // RESET TO DEFAULTS restores everything (6 downs: 5 actions + header skip)
    for (let i = 0; i < 6; i++) scr.onKey(kd('down'));
    scr.onKey(kd('return'));
    expect(s.keybinds).toEqual(defaultKeybinds());
  });

  test('HANDLING: steppers (shift = big step), toggles, irs/ihs cycle', () => {
    const s = storeIn(tmpDir());
    const scr = createHandlingScreen({ store: s });
    const buf = stubBuffer();

    scr.render(buf);
    expect(buf.text()).toContain('DAS');
    expect(buf.text()).toContain('167ms');        // DAS 10F live hint

    scr.onKey(kd('right'));                       // ARR 2 -> 2.2
    expect(s.handling.arr).toBeCloseTo(2.2);
    scr.onKey(kd('right', { shift: true }));      // big step +1
    expect(s.handling.arr).toBeCloseTo(3.2);
    scr.onKey(kd('left'));                        // -0.2
    expect(s.handling.arr).toBeCloseTo(3.0);

    scr.onKey(kd('down'));                        // DAS
    scr.onKey(kd('right'));
    expect(s.handling.das).toBe(11);
    scr.render(buf);
    expect(buf.text()).toContain('183ms');

    // toggle via enter (down x2: DCD, SDF... then skip header to SAFE LOCK)
    scr.onKey(kd('down')); scr.onKey(kd('down')); scr.onKey(kd('down'));
    expect(s.handling.safelock).toBe(true);
    scr.onKey(kd('return'));
    expect(s.handling.safelock).toBe(false);

    // IRS cycle: auto -> tap -> hold -> none (from default 'tap')
    scr.onKey(kd('down')); scr.onKey(kd('down')); scr.onKey(kd('down'));   // -> IRS
    scr.onKey(kd('right'));
    expect(s.handling.irs).toBe('hold');
    scr.onKey(kd('right'));
    expect(s.handling.irs).toBe('none');
    scr.onKey(kd('left'));
    expect(s.handling.irs).toBe('hold');
  });

  test('VIDEO: toggles + cycles persist through the store', () => {
    const s = storeIn(tmpDir());
    const scr = createVideoScreen({ store: s });
    scr.onKey(kd('return'));                      // EFFECTS off
    expect(s.video.effects).toBe(false);
    scr.onKey(kd('down')); scr.onKey(kd('down')); // -> TARGET FPS
    scr.onKey(kd('right'));
    expect(s.video.targetFps).toBe(120);
    scr.onKey(kd('left'));
    expect(s.video.targetFps).toBe(60);
  });

  test('AUDIO: sliders clamp 0..100 and step', () => {
    const s = storeIn(tmpDir());
    const scr = createAudioScreen({ store: s });
    scr.onKey(kd('right'));                       // MUSIC 100 -> clamped 100
    expect(s.audio.music).toBe(100);
    scr.onKey(kd('left'));
    expect(s.audio.music).toBe(95);
    scr.onKey(kd('left', { shift: true }));       // big step -20
    expect(s.audio.music).toBe(75);
    scr.onKey(kd('down'));                        // SFX
    scr.onKey(kd('left'));
    expect(s.audio.sfx).toBe(95);
  });

  test('esc goes back via onBack', () => {
    const s = storeIn(tmpDir());
    let backed = 0;
    const scr = createVideoScreen({ store: s, onBack: () => backed++ });
    scr.onKey(kd('escape'));
    expect(backed).toBe(1);
  });
});
