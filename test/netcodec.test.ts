/**
 * netcodec.test.ts — NetCodec core + game struct round-trips.
 * Wire format cross-checked against docs/captures/netcodec_deobfuscated.js.
 */

import { describe, expect, it } from 'vitest';
import { Packr, Unpackr } from 'msgpackr';
import {
  ArrayCodec,
  Decoder,
  DInt,
  Encoder,
  ExtensionBase,
  NumberCodec,
  StructBase,
  Table,
  TYPES,
  cla32,
  getIntSize,
} from '../src/net/netcodec.js';
import {
  ACTOR_TYPES,
  BLOCKS,
  BoardGrid,
  BoardGridData,
  BoardList,
  CustomIGE,
  EndStats,
  FLAGS_COUNT,
  FallingPiece,
  FallingPieceData,
  FullState,
  FullStateData,
  GARBAGE_POSITIONS,
  GarbageIGE,
  IGE,
  Letters,
  LinesIGE,
  PIECES,
  Piece,
  PlayerList,
  PlayerOptions,
  Replay,
  ReplayFrame,
  Scoreboard,
  Stats,
  StatsData,
  TetrominoesIGE,
  ZenithStats,
  initStructures,
} from '../src/net/structures.js';
import { createGamePack } from './helpers/gamepack.js';

initStructures();

function roundTrip<T>(write: (e: Encoder) => void, read: (d: Decoder) => T): { value: T; bits: number } {
  const enc = new Encoder();
  write(enc);
  const buf = enc.finalize();
  const dec = new Decoder(buf);
  const value = read(dec);
  return { value, bits: dec.offset };
}

/* ------------------------------------------------------------------ */
/* core codec                                                          */
/* ------------------------------------------------------------------ */

describe('core codec', () => {
  it('writes MSB-first sub-byte integers', () => {
    const enc = new Encoder();
    enc.writeUInt(0b101, 3);
    enc.writeUInt(0b01, 2);
    enc.writeUInt(0b111, 3);
    const buf = enc.finalize();
    expect(buf).toEqual(Buffer.from([0b10101111]));
    const dec = new Decoder(buf);
    expect(dec.readUInt(3)).toBe(0b101);
    expect(dec.readUInt(2)).toBe(0b01);
    expect(dec.readUInt(3)).toBe(0b111);
  });

  it('round-trips UInts at many widths', () => {
    const cases: [number, number][] = [
      [0, 1], [1, 1], [5, 3], [255, 8], [256, 9], [8191, 13], [65535, 16], [2 ** 31 - 1, 31], [2 ** 32 - 1, 32],
    ];
    const enc = new Encoder();
    for (const [v, b] of cases) enc.writeUInt(v, b);
    const dec = new Decoder(enc.finalize());
    for (const [v, b] of cases) expect(dec.readUInt(b)).toBe(v);
  });

  it('round-trips signed Ints (two\'s complement)', () => {
    const cases: [number, number][] = [[-1, 4], [-8, 4], [7, 4], [-128, 8], [127, 8], [-256, 9], [-(2 ** 31), 32], [2 ** 31 - 1, 32]];
    const enc = new Encoder();
    for (const [v, b] of cases) enc.writeInt(v, b);
    const dec = new Decoder(enc.finalize());
    for (const [v, b] of cases) expect(dec.readInt(b)).toBe(v);
  });

  it('cla32 / getIntSize match the reference', () => {
    expect(cla32(0)).toBe(1);
    expect(cla32(1)).toBe(1);
    expect(cla32(255)).toBe(8);
    expect(cla32(256)).toBe(9);
    expect(cla32(-1)).toBe(2); // 32 - clz32(0) + 1 -> 1 -> max(1,2)
    expect(cla32(-129)).toBe(9);
    expect(getIntSize(0)).toBe(1);
    expect(getIntSize(0xffffffff)).toBe(8);
    expect(getIntSize(-1)).toBe(1);
  });

  it('DInt picks min/max bits by threshold', () => {
    const d = new DInt({ min: 8, max: 24 });
    expect(d.writeSize(0)).toEqual({ bit: false, size: 8 });
    expect(d.writeSize(255)).toEqual({ bit: false, size: 8 });
    expect(d.writeSize(256)).toEqual({ bit: true, size: 24 });
    expect(d.writeSize(-1)).toEqual({ bit: false, size: 8 });
    expect(d.writeSize(-128)).toEqual({ bit: false, size: 8 });
    expect(d.writeSize(-129)).toEqual({ bit: true, size: 24 });
    expect(() => d.writeSize(1.5)).toThrow(RangeError);
    const enc = new Encoder();
    enc.writeDInt(255, d);
    enc.writeDInt(256, d);
    expect(enc.size).toBe(1 + 8 + 1 + 24);
    const dec = new Decoder(enc.finalize());
    expect(dec.readDInt(d)).toBe(255);
    expect(dec.readDInt(d)).toBe(256);
  });

  it('Float: sign bit + scaled magnitude; UFloat unsigned', () => {
    const enc = new Encoder();
    enc.writeFloat(1.3, 6, 10); // sign 0 + 13 in 6 bits
    enc.writeFloat(-1.3, 6, 10);
    enc.writeUFloat(7.5, 8, 10);
    const buf = enc.finalize();
    const dec = new Decoder(buf);
    expect(dec.readFloat(6, 10)).toBeCloseTo(1.3);
    expect(dec.readFloat(6, 10)).toBeCloseTo(-1.3);
    expect(dec.readUFloat(8, 10)).toBeCloseTo(7.5);
  });

  it('Double and Buffer realign to byte boundaries', () => {
    const enc = new Encoder();
    enc.writeUInt(0b101, 3);
    enc.writeDouble(0.40745833333329684);
    enc.writeUInt(1, 1);
    enc.writeBuffer(Buffer.from([0xde, 0xad]));
    enc.writeUInt(0, 1);
    const buf = enc.finalize();
    // 3 bits + pad5 + 64 + 1 + pad7 + 16 + 1 = 104 bits = 13 bytes
    expect(buf.length).toBe(13);
    expect(buf.readDoubleBE(1)).toBe(0.40745833333329684);
    const dec = new Decoder(buf);
    expect(dec.readUInt(3)).toBe(0b101);
    expect(dec.readDouble()).toBe(0.40745833333329684);
    expect(dec.readUInt(1)).toBe(1);
    expect(dec.readBuffer(2)).toEqual(Buffer.from([0xde, 0xad]));
    expect(dec.readUInt(1)).toBe(0);
  });

  it('Hex round-trips as raw bytes', () => {
    const id = '6863dcd54b633689d1c81aca';
    const { value } = roundTrip((e) => e.writeHex(id, 12), (d) => d.readHex(12));
    expect(value).toBe(id);
  });

  it('UInt64 round-trips as aligned QWORD', () => {
    const enc = new Encoder();
    enc.writeBoolean(true);
    enc.writeUInt64(0x0123456789abcdefn);
    const dec = new Decoder(enc.finalize());
    expect(dec.readBoolean()).toBe(true);
    expect(dec.readUInt64()).toBe(0x0123456789abcdefn);
  });

  it('Number codec: NaN, infinities, ints, doubles', () => {
    const values = [NaN, Infinity, -Infinity, 0, 1, 255, 256, 65535, 65536, 2 ** 32 - 1, -1, -128, -129, -32768, -32769, -(2 ** 31), 3.14159, -0.5];
    const enc = new Encoder();
    for (const v of values) enc.writeNumber(v);
    const dec = new Decoder(enc.finalize());
    for (const v of values) {
      const got = dec.readNumber();
      if (Number.isNaN(v)) expect(got).toBeNaN();
      else expect(got).toBe(v);
    }
  });

  it('String is NUL-terminated UTF-8', () => {
    const enc = new Encoder();
    enc.writeUInt(1, 1);
    enc.writeString('héllo→世界');
    const buf = enc.finalize();
    const dec = new Decoder(buf);
    expect(dec.readUInt(1)).toBe(1);
    expect(dec.readString()).toBe('héllo→世界');
  });

  it('Table: strict indices, flexible escapes to Any', () => {
    const t = new Table(['a', 'b', 'c']);
    expect(t.size).toBe(2);
    const enc = new Encoder();
    enc.writeTable('a', t);
    enc.writeTable('c', t);
    const dec = new Decoder(enc.finalize());
    expect(dec.readTable(t)).toBe('a');
    expect(dec.readTable(t)).toBe('c');

    const loose = new Table(['x', 'y'], 'flexible');
    const enc2 = new Encoder();
    enc2.writeTable('x', loose);
    enc2.writeTable('NOT-IN-TABLE', loose); // 0 index + Any string
    const dec2 = new Decoder(enc2.finalize());
    expect(dec2.readTable(loose)).toBe('x');
    expect(dec2.readTable(loose)).toBe('NOT-IN-TABLE');
  });

  it('Any: tagged union over supported types', () => {
    const values: unknown[] = [undefined, null, true, false, 42, -7, 1.5, 'text', '', [1, 'two', [null]]];
    const enc = new Encoder();
    for (const v of values) enc.writeAny(v);
    const dec = new Decoder(enc.finalize());
    for (const v of values) expect(dec.readAny()).toEqual(v);
  });

  it('Array: default mode with reference dedup', () => {
    const shared = [1, 2, 3];
    const enc = new Encoder();
    enc.writeAny(['a', shared, shared, 'b']);
    const dec = new Decoder(enc.finalize());
    const out = dec.readAny() as unknown[];
    expect(out[0]).toBe('a');
    expect(out[1]).toEqual([1, 2, 3]);
    expect(out[2]).toEqual([1, 2, 3]);
    expect(out[1]).toBe(out[2]); // same reference restored
    expect(out[3]).toBe('b');
  });

  it('Array: strict mode uses the element table', () => {
    const codec = new ArrayCodec('strict', { list: ['i', 'o', 't'] });
    const enc = new Encoder();
    enc.writeArray(['i', 't', 'o', 'o'], codec);
    const dec = new Decoder(enc.finalize());
    expect(dec.readArray(codec)).toEqual(['i', 't', 'o', 'o']);
  });

  it('StructBase: fixed + optional + const fields with prop table', () => {
    class Widget extends StructBase {
      declare static $byte: DInt;
      static init(): void {
        this.AddProperty('byte', { min: 8, max: 24 });
        this.AddStructure({
          id: { mode: 'fixed', type: TYPES.UInt, size: 13 },
          kind: { mode: 'constant', value: 'widget' },
          name: { mode: 'optional', type: TYPES.String },
          count: { mode: 'optional', type: TYPES.DInt, size: this.$byte },
          flag: { mode: 'optional', type: TYPES.Boolean },
        });
      }
    }
    Widget.init();
    const full = { id: 4000, name: 'w1', count: 70000, flag: true };
    const decFull = new Decoder(((e) => (Widget.encode(e, full), e.finalize()))(new Encoder()));
    expect(Widget.decode(decFull)).toEqual({ id: 4000, kind: 'widget', name: 'w1', count: 70000, flag: true });
    // sparse: no optional fields -> fixed + 2-bit terminator
    const sparse = { id: 1 };
    const enc = new Encoder();
    Widget.encode(enc, sparse);
    expect(enc.size).toBe(13 + 2);
    const decSparse = new Decoder(enc.finalize());
    expect(Widget.decode(decSparse)).toEqual({ id: 1, kind: 'widget' });
  });
});

/* ------------------------------------------------------------------ */
/* struct fixtures                                                     */
/* ------------------------------------------------------------------ */

export function makeFallingPiece(): FallingPieceData {
  return {
    type: 'l', x: 3, r: 1, hy: 22, irs: 0, kick: 1, keys: 6, flags: 24898 & ((1 << FLAGS_COUNT) - 1),
    safelock: 0, lockresets: 6, rotresets: 5, skip: [0, 3, 126], y: 20.1, locking: 7,
  };
}

export function makeZenith(): import('../src/net/structures.js').ZenithStatsData {
  return {
    altitude: 123.4, rank: 2, peakrank: 1, avgrankpts: 3.5, totalbonus: 7,
    targetingfactor: 3, targetinggrace: 0.5, floor: 4, revives: 2, revivesTotal: 5,
    speedrun: false, speedrun_seen: true, splits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  };
}

export function makeStats(): StatsData {
  const clears = {} as StatsData['clears'];
  let i = 0;
  for (const c of ['singles','doubles','triples','quads','pentas','realtspins','minitspins','minitspinsingles','tspinsingles','minitspindoubles','tspindoubles','minitspintriples','tspintriples','minitspinquads','tspinquads','tspinpentas','allclear'] as const) clears[c] = i++;
  return {
    lines: 190, level_lines: 40, level_lines_needed: 5, inputs: 1234, holds: 12, score: 98765,
    level: 7, combo: 4, topcombo: 9, combopower: 3, btb: 6, topbtb: 11, btbpower: 200,
    tspins: 22, piecesplaced: 375, clears,
    garbage: { sent: 783, sent_nomult: 762, maxspike: 149, maxspike_nomult: 149, received: 573, attack: 1232, cleared: 10 },
    kills: 1,
    finesse: { combo: 3, faults: 36, perfectpieces: 375 },
    zenith: makeZenith(),
  };
}

export function makeBoard(width = 10, height = 20): BoardGridData {
  const grid: BoardGridData = [];
  for (let y = 0; y < height; y++) {
    const row: (Piece | 'gb' | null)[] = [];
    for (let x = 0; x < width; x++) {
      if (y < height - 6) row.push(null);
      else row.push(x === 3 ? null : (x % 2 ? 'gb' : PIECES[(x + y) % 7]));
    }
    grid.push(row);
  }
  grid[0] = new Array(width).fill(null); // fully empty row -> empty marker
  return grid;
}

export function makeFullState(): FullStateData {
  return {
    diyusi: 2,
    stats: makeStats(),
    game: {
      bag: ['i', 'o', 's', 'z', 't', 'j', 't', 'o', 'i', 's', 'l', 'z'],
      board: makeBoard(),
      hold: { locked: true, piece: 'z' },
      g: 0.40745833333329684,
      controlling: {
        inputSoftdrop: false,
        lastshift: -1,
        lShift: { dir: -1, held: true, arr: 0.6000000000000001, das: 7.5 },
        rShift: { dir: 1, held: false, arr: 1.3, das: 0 },
      },
      falling: makeFallingPiece(),
      handling: { arr: 1.3, sdf: 41, safelock: true, cancel: false, may20g: true, das: 7.5, dcd: 2.5, irs: 'tap', ihs: 'tap' },
      playing: true,
    },
  };
}

/** FullState.decode attaches reference defaults (zenlevel/zenprogress/revivesMaxOfBoth). */
export function enrichFullState(fs: FullStateData): FullStateData {
  return {
    ...fs,
    stats: {
      zenlevel: 1,
      zenprogress: 0,
      ...fs.stats,
      zenith: {
        ...fs.stats.zenith,
        revivesMaxOfBoth: Math.max(fs.stats.zenith.revives, fs.stats.zenith.revivesTotal - fs.stats.zenith.revives),
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/* struct round-trips                                                  */
/* ------------------------------------------------------------------ */

describe('structs round-trip', () => {
  it('BoardGrid: normal, empty, and all-empty rows', () => {
    const grid = makeBoard();
    const { value } = roundTrip((e) => BoardGrid.encode(e, grid), (d) => d.readStruct(BoardGrid));
    expect(value).toEqual(grid);
    const empty = roundTrip((e) => BoardGrid.encode(e, []), (d) => d.readStruct(BoardGrid));
    expect(empty.value).toEqual([]);
  });

  it('FallingPiece (with and without skip list)', () => {
    const fp = makeFallingPiece();
    const { value } = roundTrip((e) => FallingPiece.encode(e, fp), (d) => d.readStruct(FallingPiece));
    expect(value).toEqual(fp);
    const fp2 = { ...fp, skip: [] };
    const { value: v2 } = roundTrip((e) => FallingPiece.encode(e, fp2), (d) => d.readStruct(FallingPiece));
    expect(v2).toEqual(fp2);
  });

  it('ZenithStats', () => {
    const z = makeZenith();
    const { value } = roundTrip((e) => ZenithStats.encode(e, z), (d) => d.readStruct(ZenithStats));
    expect(value).toEqual({ ...z, revivesMaxOfBoth: Math.max(z.revives, z.revivesTotal - z.revives) });
  });

  it('Stats', () => {
    const st = makeStats();
    const { value } = roundTrip((e) => Stats.encode(e, st), (d) => d.readStruct(Stats));
    expect(value).toEqual({ zenlevel: 1, zenprogress: 0, ...st, zenith: { ...st.zenith, revivesMaxOfBoth: 3 } });
  });

  it('FullState', () => {
    const fs = makeFullState();
    const { value } = roundTrip((e) => FullState.encode(e, fs), (d) => d.readStruct(FullState));
    expect(value).toEqual(enrichFullState(fs));
  });

  it('GarbageIGE: minimal and fully-loaded', () => {
    const min = { type: 'garbage', amt: 4 };
    const { value } = roundTrip((e) => GarbageIGE.encode(e, min), (d) => d.readStruct(GarbageIGE));
    expect(value).toEqual(min);
    const full = {
      type: 'garbage', amt: 20, username: 'guest', gameid: 7865, position: 'aboveStack',
      frame: 12875, cid: 152, iid: 402, ackiid: 175, x: -1, y: 45, pos: 'gb', neg: null,
      color: 0xff00aa, column: 3, delay: 72, queued: true, hardened: false, size: 1,
      zthalt: 4.25, actor_neg: 'a', actor_pos: 'b', anchor: 'c',
      actor_neg_data_type: 'clears', actor_neg_data_amt: [1, 'x'], actor_pos_data_type: 'line', actor_pos_data_amt: 42,
    };
    const { value: v2 } = roundTrip((e) => GarbageIGE.encode(e, full), (d) => d.readStruct(GarbageIGE));
    expect(v2).toEqual(full);
  });

  it('LinesIGE', () => {
    const lines = { action: 'add', amt: 10, size: 2, pos: 'i', neg: 'gb', position: 'bottom', column: 2, slow: 500, effect: 'fx' };
    const { value } = roundTrip((e) => LinesIGE.encode(e, lines), (d) => d.readStruct(LinesIGE));
    expect(value).toEqual(lines);
  });

  it('Letters', () => {
    const { value } = roundTrip((e) => Letters.encode(e, 'zlo?#@sit'), (d) => d.readStruct(Letters));
    expect(value).toBe('zlo?#@sit');
  });

  it('TetrominoesIGE', () => {
    const def = {
      tetrominoes: {
        k: {
          matrix: { w: 3, h: 2, dx: 1, dy: 0, data: [[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[0, 1], [1, 1]], [[0, 0], [0, 1]]] },
          preview: { w: 3, h: 2, data: [[0, 0], [1, 0]] },
          weight: 2,
          spinbonus_override: { rule: 'i', mini: true },
          kickset_override: 'j',
          kickset_special: 'i2',
        },
      },
      minotypes: ['k'],
      tetrominoes_color: { k: 'gb' },
    };
    const { value } = roundTrip((e) => TetrominoesIGE.encode(e, def), (d) => d.readStruct(TetrominoesIGE));
    expect(value).toEqual(def);
  });

  it('CustomIGE variants', () => {
    const cases: any[] = [
      { type: 'garbage', data: { type: 'garbage', amt: 7, gameid: 100 } },
      { type: 'queue', data: { start: true, queue: ['i', 'o', 't'] } },
      { type: 'piece', data: { piece: 't' } },
      { type: 'boardsize', data: { w: 4, h: 20 } },
      { type: 'lines', data: { action: 'remove', amt: 2, size: 1 } },
    ];
    for (const c of cases) {
      const { value } = roundTrip((e) => CustomIGE.encode(e, c), (d) => d.readStruct(CustomIGE));
      expect(value).toEqual(c);
    }
  });

  it('IGE: all variants', () => {
    const cases: any[] = [
      { id: 1, frame: 100, type: 'interaction', data: { type: 'garbage', amt: 4, gameid: 1062, frame: 230, cid: 1, iid: 1, ackiid: 0, x: 2, y: 38, size: 1 } },
      { id: 2, frame: 100, type: 'interaction_confirm', data: { type: 'garbage', amt: 4, gameid: 1062, frame: 230, cid: 1, iid: 1, ackiid: 0, x: 2, y: 38, size: 1 } },
      { id: 3, frame: 100, type: 'interaction_confirm', data: { type: 'zenith.climb_pts', gameid: 5, frame: 90, amt: 12.5 } },
      { id: 4, frame: 100, type: 'interaction_confirm', data: { type: 'zenith.bonus', gameid: 5, frame: 90, amt: 3 } },
      { id: 5, frame: 100, type: 'interaction_confirm', data: { type: 'zenith.incapacitated', gameid: 5, frame: 90 } },
      { id: 6, frame: 100, type: 'interaction_confirm', data: { type: 'zenith.revive', gameid: 5, frame: 90 } },
      { id: 7, frame: 100, type: 'interaction_confirm', data: { type: 'zenith.attack', gameid: 5, frame: 90, amt: 200 } },
      { id: 8, frame: 100, type: 'target', data: { targets: [3, 4, 5] } },
      { id: 9, frame: 100, type: 'targeted', data: { value: true, gameid: 9, frame: 99 } },
      { id: 10, frame: 100, type: 'allow_targeting', data: { value: false } },
      { id: 11, frame: 100, type: 'kev', data: { victim: { gameid: 1 }, killer: { gameid: 2 }, frame: 88, fire: 500 } },
      { id: 12, frame: 100, type: 'custom', data: { type: 'piece', data: { piece: 'l' } } },
    ];
    for (const c of cases) {
      const { value } = roundTrip((e) => IGE.encode(e, c), (d) => d.readStruct(IGE));
      expect(value).toEqual(c);
    }
  });

  it('PlayerOptions', () => {
    const opts = {
      version: 19,
      hasgarbage: true,
      garbageentry: 'instant',
      g: 0.02,
      handling: { arr: 1.3, sdf: 41, safelock: true, cancel: false, may20g: true, das: 7.5, dcd: 2.5, irs: 'tap', ihs: 'tap' },
      minoskin: { i: 'tetrio', ghost: 'connected_test' },
      zenith_splits: ['a', 'b'],
      mission: 'survive',
    };
    const { value } = roundTrip((e) => PlayerOptions.encode(e, opts), (d) => d.readStruct(PlayerOptions));
    expect(value).toEqual(opts);
  });

  it('EndStats', () => {
    const end = {
      successful: false,
      gameoverreason: 'garbagesmash',
      killer: { gameid: 7865, type: 'sizzle', username: 'dongsookgea' },
      options: { g: 0.02, hasgarbage: true },
      aggregatestats: { apm: 55.5, pps: 2.1, vsscore: 90.25 },
      game: makeFullState().game,
      stats: makeStats(),
      diyusi: 0,
    };
    const { value } = roundTrip((e) => EndStats.encode(e, end), (d) => d.readStruct(EndStats));
    const fs = enrichFullState({ game: end.game, stats: end.stats, diyusi: end.diyusi });
    expect(value).toEqual({ ...end, game: fs.game, stats: fs.stats });
  });

  it('ReplayFrame: every branch', () => {
    const frames: any[] = [
      { type: 'keydown', frame: 12900, data: { key: 'moveLeft', subframe: 0.8 } },
      { type: 'keyup', frame: 12901, data: { key: 'hold', subframe: 0.1, hoisted: true } },
      { type: 'start', frame: 0, data: {} },
      { type: 'full', frame: 5, data: makeFullState() },
      { type: 'ige', frame: 9, data: { id: 1, frame: 8, type: 'allow_targeting', data: { value: true } } },
      { type: 'strategy', frame: 10, data: 3 },
      { type: 'manual_target', frame: 11, data: 7860 },
    ];
    const { packr, unpackr } = createGamePack();
    for (const f of frames) {
      const frame = new ReplayFrame(f);
      const enc = new Encoder(packr);
      const buf = frame.encode(enc);
      const dec = new Decoder(buf, (off) => unpackr.unpack(buf.subarray(off)));
      const back = ReplayFrame.decode(dec);
      expect(back.type).toBe(f.type);
      expect(back.frame).toBe(f.frame);
      expect(back.data).toEqual(f.type === 'full' ? enrichFullState(f.data) : f.data);
      expect(buf.length * 8 - dec.offset).toBeLessThan(8);
    }
  });

  it('ReplayFrame: unknown type index falls back to msgpackr payload', () => {
    const { packr, unpackr } = createGamePack();
    // type index 15 is not in $$type -> getvk undefined -> default branch unpacks
    const enc = new Encoder(packr);
    enc.writeUInt(15, (ReplayFrame as any).$$type.size);
    enc.writeDInt(12, (ReplayFrame as any).$frame);
    enc.pack({ arbitrary: ['msgpack', 1, null] });
    const buf = enc.finalize();
    const dec = new Decoder(buf, (off) => unpackr.unpack(buf.subarray(off)));
    const back = ReplayFrame.decode(dec);
    expect(back.type).toBeUndefined();
    expect(back.frame).toBe(12);
    expect(back.data).toEqual({ arbitrary: ['msgpack', 1, null] });
  });

  it('Replay + frames through msgpackr extension types (10/13)', () => {
    const { packr, unpackr } = createGamePack();
    const replay = new Replay(7860, 13185, [
      { type: 'start', frame: 0, data: {} },
      { type: 'keydown', frame: 10, data: { key: 'hardDrop', subframe: 0.2 } },
      { type: 'full', frame: 12, data: makeFullState() },
      { type: 'ige', frame: 20, data: { id: 7, frame: 19, type: 'targeted', data: { value: false, gameid: 7862, frame: 18 } } },
    ]);
    const packed = packr.pack(replay);
    const back = unpackr.unpack(packed);
    expect(back).toBeInstanceOf(Replay);
    expect(back.gameid).toBe(7860);
    expect(back.provisioned).toBe(13185);
    expect(back.frames.length).toBe(4);
    expect(back.frames[0]).toBeInstanceOf(ReplayFrame);
    expect(back.frames[2].type).toBe('full');
    expect(back.frames[2].data).toEqual(enrichFullState(makeFullState()));
  });

  it('BoardList', () => {
    const list = new BoardList([
      { gameid: 7860, board: { f: 100, g: 5, w: 4, h: 20, b: makeBoard(4, 20) } },
      { gameid: 7862, board: { f: 90, g: 70000, w: 4, h: 20, b: makeBoard(4, 20) } },
    ]);
    const enc = new Encoder();
    const buf = list.encode(enc);
    const back = BoardList.decode(new Decoder(buf));
    expect(back.boards.length).toBe(2);
    expect(back.boards[0].gameid).toBe(7860);
    expect(back.boards[0].board.b).toEqual(makeBoard(4, 20));
    expect(back.boards[1].board.g).toBe(70000);
  });

  it('Scoreboard', () => {
    const sb = new Scoreboard([
      { gameid: 1, stats: { rank: 2, altitude: 44.4, btb: 9, revives: 3, escapeartist: 0, blockrationing_app: 0, blockrationing_final: 0 }, allies: [5, 6], specCount: 2, speedrun: false, nearWR: true },
      { gameid: 2, stats: { rank: 1, altitude: 100, btb: 0, revives: 0, escapeartist: 0, blockrationing_app: 0, blockrationing_final: 0 }, allies: [], specCount: 0, speedrun: true, nearWR: false, talentless: true },
    ]);
    const enc = new Encoder();
    const buf = sb.encode(enc);
    const back = Scoreboard.decode(new Decoder(buf));
    expect(back.sb.length).toBe(2);
    expect(back.sb[0].stats.revives).toBe(3);
    expect(back.sb[0].stats.altitude).toBeCloseTo(44.4);
    expect(back.sb[0].allies).toEqual([5, 6]);
    expect(back.sb[1].talentless).toBe(true);
  });

  it('PlayerList', () => {
    const pl = new PlayerList([
      {
        userid: '6863dcd54b633689d1c81aca',
        gameid: 7860,
        alive: true,
        naturalorder: 0,
        options: { version: 19, hasgarbage: true, g: 0.02 },
      },
    ]);
    const enc = new Encoder();
    const buf = pl.encode(enc);
    const back = PlayerList.decode(new Decoder(buf));
    expect(back[0].userid).toBe('6863dcd54b633689d1c81aca');
    expect(back[0].gameid).toBe(7860);
    expect(back[0].options).toEqual({ version: 19, hasgarbage: true, g: 0.02 });
  });
});
