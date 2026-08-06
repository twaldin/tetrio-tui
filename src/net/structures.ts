/**
 * structures.ts — TETR.IO game structs on top of NetCodec.
 *
 * Ported from docs/captures/netcodec_deobfuscated.js / netcodec2_deobfuscated.js:
 *   Ne  -> BoardGrid, $e -> FallingPiece, Re -> FullState, Ge -> Stats,
 *   Ue -> ZenithStats, He -> ReplayFrame, Xe -> IGE, je -> GarbageIGE (StructBase),
 *   qe -> LinesIGE (StructBase), Ve -> CustomIGE, Ke -> Letters, Qe -> TetrominoesIGE,
 *   Je/Ze -> PlayerOptions/PlayerOptionsDelta, et -> EndStats,
 *   Te -> Replay, Ie -> BoardList, Ee -> Scoreboard, We -> PlayerList.
 *
 * Field ORDER in each encode/decode IS the wire format — do not reorder.
 *
 * Enum tables confirmed against docs/captures/game_spectate_log.json
 * (plaintext game.replay.state cross-reference):
 *   - piece letters: i o t l j s z; garbage board cell: "gb"
 *   - clears keys (17): singles..allclear
 *   - handling irs/ihs: string enum ("tap" observed)
 */

import {
  Decoder,
  DInt,
  Encoder,
  ExtensionBase,
  StructBase,
  Table,
  TYPES,
  cla32,
} from './netcodec.js';

/* ------------------------------------------------------------------ */
/* enums / tables                                                      */
/* ------------------------------------------------------------------ */

/** Piece letters (wire order in the $$piece / $$blk tables). */
export const PIECES = ['i', 'j', 'l', 'o', 's', 't', 'z'] as const;
export type Piece = (typeof PIECES)[number];
/** Board cell values: pieces + garbage. */
export const BLOCKS = [...PIECES, 'gb'] as const;
export type Block = Piece | 'gb';

/** Frame types for ReplayFrame ($$type). */
export const FRAME_TYPES = [
  'keydown',
  'keyup',
  'start',
  'full',
  'end',
  'ige',
  'strategy',
  'manual_target',
] as const;
export type FrameType = (typeof FRAME_TYPES)[number];

/** Replay keys ($$key). */
export const REPLAY_KEYS = [
  'moveLeft',
  'moveRight',
  'rotate180',
  'rotateCCW',
  'rotateCW',
  'softDrop',
  'hardDrop',
  'undo',
  'redo',
  'hold',
  'retry',
  'exit',
] as const;
export type ReplayKey = (typeof REPLAY_KEYS)[number];

/** irs/ihs handling enum ($$ixs). */
export const IXS = ['off', 'hold', 'tap'] as const;
export type Ixs = (typeof IXS)[number];

/** IGE types ($$type). */
export const IGE_TYPES = [
  'interaction',
  'interaction_confirm',
  'target',
  'targeted',
  'allow_targeting',
  'kev',
  'custom',
] as const;
export type IGEType = (typeof IGE_TYPES)[number];

/** IGE interaction types ($$int_type). */
export const IGE_INT_TYPES = [
  'garbage',
  'zenith.climb_pts',
  'zenith.bonus',
  'zenith.incapacitated',
  'zenith.revive',
  'zenith.attack',
] as const;
export type IGEIntType = (typeof IGE_INT_TYPES)[number];

/** Custom IGE types (CustomIGE.$$type). */
export const CUSTOM_IGE_TYPES = [
  'garbage',
  'map',
  'queue',
  'piece',
  'lines',
  'boardsize',
  'boardresize',
  'holderstate',
  'setoptions',
  'constants',
  'tetrominoes',
] as const;
export type CustomIGEType = (typeof CUSTOM_IGE_TYPES)[number];

/** Stats clear counters, in wire order (17). */
export const CLEARS = [
  'singles',
  'doubles',
  'triples',
  'quads',
  'pentas',
  'realtspins',
  'minitspins',
  'minitspinsingles',
  'tspinsingles',
  'minitspindoubles',
  'tspindoubles',
  'minitspintriples',
  'tspintriples',
  'minitspinquads',
  'tspinquads',
  'tspinpentas',
  'allclear',
] as const;

/** Scoreboard extra-stat selector ($$extraStat). */
export const EXTRA_STATS = [
  'none',
  'revives',
  'escapeartist',
  'blockrationing_app',
  'blockrationing_final',
  'talentless',
] as const;

/** Game-over reasons (EndStats.$$gor). */
export const GAMEOVER_REASONS = [
  null,
  'topout',
  'garbagesmash',
  'zenith',
  'clear',
  'topout_clear',
  'winner',
  'forfeit',
  'retry',
  'drop',
  'dropnow',
  'disconnect',
] as const;

/** GarbageIGE interaction kinds ($$type). */
export const GARBAGE_TYPES = ['garbage', 'corruption'] as const;
/** GarbageIGE/LinesIGE actor types ($$actorType). */
export const ACTOR_TYPES = ['none', 'clears', 'time', 'line'] as const;
/** GarbageIGE/LinesIGE position hints ($$position). */
export const GARBAGE_POSITIONS = ['aboveStack', 'aboveUnclearable', 'abovePerma', 'bottom'] as const;
/** LinesIGE actions ($$action). */
export const LINES_ACTIONS = ['add', 'remove'] as const;
/** TetrominoesIGE special kicksets ($$special). */
export const SPECIAL_KICKSETS = ['i', 'i2', 'i3', 'l3', 'i5', 'oo'] as const;
/** PlayerOptions mino skins ($$minoskin) and skins ($$skins). */
export const MINO_SKINS = ['i', 'j', 'l', 'o', 's', 't', 'z', 'ghost', 'other'] as const;
export const SKINS = ['tetrio', '_bombs', 'connected_test'] as const;

/** Falling-piece flags bit count (W.FLAGS_COUNT in the client). */
export const FLAGS_COUNT = 16;

/* ------------------------------------------------------------------ */
/* Ne — BoardGrid                                                      */
/* ------------------------------------------------------------------ */

export type BoardGridData = (Block | null)[][];

export class BoardGrid extends ExtensionBase {
  static MAX_WIDTH = Math.log2(512); // 9
  static MAX_HEIGHT = Math.log2(512); // 9
  declare static $$blk: Table<false | Block | null>;
  static init(): void {
    this.AddTable('blk', [false, null, ...BLOCKS]);
  }
  static encode(e: Encoder, grid: BoardGridData): void {
    const width = grid[0]?.length ?? 0;
    const height = grid.length;
    if (!width) {
      e.writeUInt(0, this.MAX_WIDTH);
      return;
    }
    e.writeUInt(width, this.MAX_WIDTH);
    e.writeUInt(height, this.MAX_HEIGHT);
    for (const row of grid) {
      if (row.some((cell) => cell !== null)) {
        for (const cell of row) e.writeTable(cell, this.$$blk);
      } else {
        e.writeTable(false, this.$$blk);
      }
    }
  }
  static decode(e: Decoder): BoardGridData {
    const grid: BoardGridData = [];
    const width = e.readUInt(this.MAX_WIDTH);
    if (!width) return grid;
    const height = e.readUInt(this.MAX_HEIGHT);
    for (let i = 0; i < height; i++) {
      if (e.peekTable(this.$$blk) !== false) {
        grid[i] = [];
        for (let x = 0; x < width; x++) grid[i][x] = e.readTable(this.$$blk) as Block | null;
      } else {
        e.seek(4, 2); // skip the empty-row marker ($$blk.size == 4 bits)
        grid[i] = new Array<Block | null>(width).fill(null);
      }
    }
    return grid;
  }
}

/* ------------------------------------------------------------------ */
/* $e — FallingPiece                                                   */
/* ------------------------------------------------------------------ */

export interface FallingPieceData {
  type: Piece;
  x: number;
  r: number;
  hy: number;
  irs: number;
  kick: number;
  keys: number;
  flags: number;
  safelock: number;
  lockresets: number;
  rotresets: number;
  skip: number[];
  y: number;
  locking: number;
}

export class FallingPiece extends ExtensionBase {
  declare static $$piece: Table<Piece | null>;
  static init(): void {
    this.AddTable('piece', [null, ...PIECES], 'flexible');
  }
  static encode(e: Encoder, t: FallingPieceData): void {
    e.writeTable(t.type, this.$$piece);
    e.writeInt(t.x, BoardGrid.MAX_WIDTH);
    e.writeUInt(t.r, 2);
    e.writeUInt(t.hy, BoardGrid.MAX_HEIGHT);
    e.writeUInt(t.irs, 2);
    e.writeUInt(t.kick, 5);
    e.writeUInt(t.keys, 16);
    e.writeUInt(t.flags, FLAGS_COUNT);
    e.writeUInt(t.safelock, 3);
    e.writeUInt(t.lockresets, 5);
    e.writeUInt(t.rotresets, 6);
    e.writeBoolean(t.skip.length);
    if (t.skip.length) {
      for (const s of t.skip) e.writeUInt(s + 1, 7);
      e.writeUInt(0, 7);
    }
    e.writeDouble(t.y);
    e.writeDouble(t.locking);
  }
  static decode(e: Decoder): FallingPieceData {
    const t = {} as FallingPieceData;
    t.type = e.readTable(this.$$piece) as Piece;
    t.x = e.readInt(BoardGrid.MAX_WIDTH);
    t.r = e.readUInt(2);
    t.hy = e.readUInt(BoardGrid.MAX_HEIGHT);
    t.irs = e.readUInt(2);
    t.kick = e.readUInt(5);
    t.keys = e.readUInt(16);
    t.flags = e.readUInt(FLAGS_COUNT);
    t.safelock = e.readUInt(3);
    t.lockresets = e.readUInt(5);
    t.rotresets = e.readUInt(6);
    t.skip = [];
    if (e.readBoolean()) {
      const s = 7;
      for (let n = e.peek(s); n !== 0; n = e.peek(s)) t.skip.push(e.readUInt(s) - 1);
      e.seek(s, 2);
    }
    t.y = e.readDouble();
    t.locking = e.readDouble();
    return t;
  }
}

/* ------------------------------------------------------------------ */
/* Ue — ZenithStats                                                    */
/* ------------------------------------------------------------------ */

export interface ZenithStatsData {
  altitude: number;
  rank: number;
  peakrank: number;
  avgrankpts: number;
  totalbonus: number;
  targetingfactor: number;
  targetinggrace: number;
  floor: number;
  revives: number;
  revivesTotal: number;
  revivesMaxOfBoth?: number;
  speedrun: boolean;
  speedrun_seen: boolean;
  splits: number[];
}

export class ZenithStats extends ExtensionBase {
  declare static $long: DInt;
  static init(): void {
    this.AddProperty('long', { min: 16, max: 32 });
  }
  static encode(e: Encoder, t: ZenithStatsData): void {
    e.writeDouble(t.altitude);
    e.writeDouble(t.rank);
    e.writeDouble(t.peakrank);
    e.writeDouble(t.avgrankpts);
    e.writeDouble(t.totalbonus);
    e.writeFloat(t.targetingfactor, 16, 100);
    e.writeFloat(t.targetinggrace, 16, 100);
    e.writeUInt(t.floor, 4);
    e.writeUInt(t.revives, 8);
    e.writeUInt(t.revivesTotal, 8);
    e.writeBoolean(t.speedrun);
    e.writeBoolean(t.speedrun_seen);
    for (let s = 0; s < 9; s++) e.writeDInt(t.splits[s], this.$long);
  }
  static decode(e: Decoder): ZenithStatsData {
    const t = {} as ZenithStatsData;
    t.altitude = e.readDouble();
    t.rank = e.readDouble();
    t.peakrank = e.readDouble();
    t.avgrankpts = e.readDouble();
    t.totalbonus = e.readDouble();
    t.targetingfactor = e.readFloat(16, 100);
    t.targetinggrace = e.readFloat(16, 100);
    t.floor = e.readUInt(4);
    t.revives = e.readUInt(8);
    t.revivesTotal = e.readUInt(8);
    t.revivesMaxOfBoth = Math.max(t.revives, t.revivesTotal - t.revives);
    t.speedrun = e.readBoolean();
    t.speedrun_seen = e.readBoolean();
    t.splits = [];
    for (let s = 0; s < 9; s++) t.splits[s] = e.readDInt(this.$long);
    return t;
  }
}

/* ------------------------------------------------------------------ */
/* Ge — Stats                                                          */
/* ------------------------------------------------------------------ */

export interface StatsData {
  zenlevel?: number;
  zenprogress?: number;
  lines: number;
  level_lines: number;
  level_lines_needed: number;
  inputs: number;
  holds: number;
  score: number;
  level: number;
  combo: number;
  topcombo: number;
  combopower: number;
  btb: number;
  topbtb: number;
  btbpower: number;
  tspins: number;
  piecesplaced: number;
  clears: Record<(typeof CLEARS)[number], number>;
  garbage: {
    sent: number;
    sent_nomult: number;
    maxspike: number;
    maxspike_nomult: number;
    received: number;
    attack: number;
    cleared: number;
  };
  kills: number;
  finesse: { combo: number; faults: number; perfectpieces: number };
  zenith: ZenithStatsData;
}

export class Stats extends ExtensionBase {
  declare static $short: DInt;
  declare static $long: DInt;
  static readonly _clears: readonly string[] = CLEARS;
  static init(): void {
    this.AddTable('piece', [...PIECES], 'flexible');
    this.AddProperty('short', { min: 8, max: 16 });
    this.AddProperty('long', { min: 16, max: 32 });
  }
  static encode(e: Encoder, t: StatsData): void {
    const s = t.garbage;
    const n = t.clears;
    const i = t.finesse;
    e.writeDInt(t.lines, this.$short);
    e.writeDInt(t.level_lines, this.$short);
    e.writeDInt(t.level_lines_needed, this.$short);
    e.writeDInt(t.inputs, this.$long);
    e.writeDInt(t.holds, this.$long);
    e.writeDInt(t.score, this.$long);
    e.writeUInt(t.level, 8);
    e.writeDInt(t.combo, this.$long);
    e.writeDInt(t.topcombo, this.$long);
    e.writeUInt(t.combopower, 3);
    e.writeDInt(t.btb, this.$short);
    e.writeDInt(t.topbtb, this.$short);
    e.writeUInt(t.btbpower, 8);
    e.writeDInt(t.tspins, this.$long);
    e.writeDInt(t.piecesplaced, this.$long);
    for (const c of this._clears) e.writeDInt(n[c as keyof typeof n], this.$short);
    e.writeDInt(s.sent, this.$long);
    e.writeDInt(s.sent_nomult, this.$long);
    e.writeDInt(s.maxspike, this.$long);
    e.writeDInt(s.maxspike_nomult, this.$long);
    e.writeDInt(s.received, this.$long);
    e.writeDInt(s.attack, this.$long);
    e.writeDInt(s.cleared, this.$long);
    e.writeDInt(t.kills, this.$short);
    e.writeDInt(i.combo, this.$long);
    e.writeDInt(i.faults, this.$long);
    e.writeDInt(i.perfectpieces, this.$long);
    e.writeStruct(t.zenith, ZenithStats);
  }
  static decode(e: Decoder): StatsData {
    const t = {
      zenlevel: 1,
      zenprogress: 0,
      clears: {} as StatsData['clears'],
      garbage: {} as StatsData['garbage'],
      finesse: {} as StatsData['finesse'],
    } as StatsData;
    t.lines = e.readDInt(this.$short);
    t.level_lines = e.readDInt(this.$short);
    t.level_lines_needed = e.readDInt(this.$short);
    t.inputs = e.readDInt(this.$long);
    t.holds = e.readDInt(this.$long);
    t.score = e.readDInt(this.$long);
    t.level = e.readUInt(8);
    t.combo = e.readDInt(this.$long);
    t.topcombo = e.readDInt(this.$long);
    t.combopower = e.readUInt(3);
    t.btb = e.readDInt(this.$short);
    t.topbtb = e.readDInt(this.$short);
    t.btbpower = e.readUInt(8);
    t.tspins = e.readDInt(this.$long);
    t.piecesplaced = e.readDInt(this.$long);
    for (const s of this._clears) t.clears[s as keyof StatsData['clears']] = e.readDInt(this.$short);
    t.garbage.sent = e.readDInt(this.$long);
    t.garbage.sent_nomult = e.readDInt(this.$long);
    t.garbage.maxspike = e.readDInt(this.$long);
    t.garbage.maxspike_nomult = e.readDInt(this.$long);
    t.garbage.received = e.readDInt(this.$long);
    t.garbage.attack = e.readDInt(this.$long);
    t.garbage.cleared = e.readDInt(this.$long);
    t.kills = e.readDInt(this.$short);
    t.finesse.combo = e.readDInt(this.$long);
    t.finesse.faults = e.readDInt(this.$long);
    t.finesse.perfectpieces = e.readDInt(this.$long);
    t.zenith = e.readStruct(ZenithStats);
    return t;
  }
}

/* ------------------------------------------------------------------ */
/* Re — FullState                                                      */
/* ------------------------------------------------------------------ */

export interface FullStateData {
  diyusi: number;
  stats: StatsData;
  game: {
    bag: Piece[];
    board: BoardGridData;
    hold: { locked: boolean; piece: Piece | null };
    g: number;
    controlling: {
      inputSoftdrop: boolean;
      lastshift: -1 | 1;
      lShift: { dir: -1; held: boolean; arr: number; das: number };
      rShift: { dir: 1; held: boolean; arr: number; das: number };
    };
    falling: FallingPieceData;
    handling: {
      arr: number;
      sdf: number;
      safelock: boolean;
      cancel: boolean;
      may20g: boolean;
      das: number;
      dcd: number;
      irs: Ixs;
      ihs: Ixs;
    };
    playing: boolean;
  };
}

export class FullState extends ExtensionBase {
  declare static $$piece: Table<Piece | null>;
  declare static $$ixs: Table<Ixs>;
  static init(): void {
    this.AddTable('piece', [null, ...PIECES], 'flexible');
    this.AddTable('ixs', [...IXS]);
  }
  static encode(e: Encoder, t: FullStateData): void {
    const s = t.game.board;
    const n = t.game.bag;
    const i = t.game.hold;
    const o = t.game.g;
    const a = t.game.controlling;
    const r = t.game.falling;
    const l = t.game.handling;
    e.writeUInt(n.length, 12);
    for (const p of n) e.writeTable(p, this.$$piece);
    e.writeStruct(s, BoardGrid);
    e.writeBoolean(i.locked);
    e.writeTable(i.piece, this.$$piece);
    e.writeDouble(o);
    e.writeBoolean(a.inputSoftdrop);
    e.writeBoolean(a.lastshift === -1);
    e.writeBoolean(a.lShift.held);
    e.writeBoolean(a.rShift.held);
    e.writeUInt(t.diyusi, 4);
    e.writeDouble(a.lShift.arr);
    e.writeDouble(a.rShift.arr);
    e.writeDouble(a.lShift.das);
    e.writeDouble(a.rShift.das);
    e.writeStruct(r, FallingPiece);
    e.writeFloat(l.arr, 6, 10);
    e.writeUInt(l.sdf, 6);
    e.writeBoolean(l.safelock);
    e.writeBoolean(l.cancel);
    e.writeBoolean(l.may20g);
    e.writeBoolean(t.game.playing);
    e.writeFloat(l.das, 8, 10);
    e.writeFloat(l.dcd, 8, 10);
    e.writeTable(l.irs, this.$$ixs);
    e.writeTable(l.ihs, this.$$ixs);
    e.writeStruct(t.stats, Stats);
  }
  static decode(e: Decoder): FullStateData {
    const t = {} as FullStateData;
    const s = {
      bag: [] as Piece[],
      controlling: {
        lShift: { dir: -1 },
        rShift: { dir: 1 },
      } as FullStateData['game']['controlling'],
      handling: {} as FullStateData['game']['handling'],
    } as FullStateData['game'];
    const n = s.controlling;
    const i = s.handling;
    const o = e.readUInt(12);
    for (let k = 0; k < o; k++) s.bag.push(e.readTable(this.$$piece) as Piece);
    s.board = e.readStruct(BoardGrid);
    s.hold = { locked: e.readBoolean(), piece: e.readTable(this.$$piece) as Piece | null };
    s.g = e.readDouble();
    n.inputSoftdrop = e.readBoolean();
    n.lastshift = e.readBoolean() ? -1 : 1;
    n.lShift.held = e.readBoolean();
    n.rShift.held = e.readBoolean();
    t.diyusi = e.readUInt(4);
    n.lShift.arr = e.readDouble();
    n.rShift.arr = e.readDouble();
    n.lShift.das = e.readDouble();
    n.rShift.das = e.readDouble();
    s.falling = e.readStruct(FallingPiece);
    i.arr = e.readFloat(6, 10);
    i.sdf = e.readUInt(6);
    i.safelock = e.readBoolean();
    i.cancel = e.readBoolean();
    i.may20g = e.readBoolean();
    s.playing = e.readBoolean();
    i.das = e.readFloat(8, 10);
    i.dcd = e.readFloat(8, 10);
    i.irs = e.readTable(this.$$ixs) as Ixs;
    i.ihs = e.readTable(this.$$ixs) as Ixs;
    t.stats = e.readStruct(Stats);
    t.game = s;
    return t;
  }
}

/* ------------------------------------------------------------------ */
/* je — GarbageIGE ("garbage" interaction data)                        */
/* ------------------------------------------------------------------ */

export interface GarbageIGEData {
  type: 'garbage' | 'corruption';
  amt: number;
  username?: string;
  gameid?: number;
  position?: (typeof GARBAGE_POSITIONS)[number];
  frame?: number;
  cid?: number;
  iid?: number;
  ackiid?: number;
  x?: number;
  y?: number;
  pos?: Block | null;
  neg?: Block | null;
  color?: number;
  column?: number;
  delay?: number;
  queued?: boolean;
  hardened?: boolean;
  size?: number;
  zthalt?: number;
  actor_neg?: string;
  actor_pos?: string;
  anchor?: string;
  actor_neg_data_type?: (typeof ACTOR_TYPES)[number];
  actor_neg_data_amt?: unknown;
  actor_pos_data_type?: (typeof ACTOR_TYPES)[number];
  actor_pos_data_amt?: unknown;
  [k: string]: unknown;
}

export class GarbageIGE extends StructBase {
  declare static $byte: DInt;
  declare static $$type: Table<string>;
  declare static $$actorType: Table<string>;
  declare static $$blk: Table<Block | null>;
  declare static $$position: Table<string>;
  static init(): void {
    this.AddProperty('byte', { min: 8, max: 24 });
    this.AddTable('type', [...GARBAGE_TYPES]);
    this.AddTable('actorType', [...ACTOR_TYPES]);
    this.AddTable('blk', [null, ...BLOCKS]);
    this.AddTable('position', [...GARBAGE_POSITIONS]);
    this.AddStructure({
      type: { mode: 'fixed', type: TYPES.Table, size: this.$$type },
      amt: { mode: 'fixed', type: TYPES.DInt, size: this.$byte },
      username: { mode: 'optional', type: TYPES.String, size: true },
      gameid: { mode: 'optional', type: TYPES.UInt, size: 13 },
      position: { mode: 'optional', type: TYPES.Table, size: this.$$position },
      frame: { mode: 'optional', type: TYPES.DInt, size: this.$byte },
      cid: { mode: 'optional', type: TYPES.DInt, size: this.$byte },
      iid: { mode: 'optional', type: TYPES.DInt, size: this.$byte },
      ackiid: { mode: 'optional', type: TYPES.DInt, size: this.$byte },
      x: { mode: 'optional', type: TYPES.Int, size: 9 },
      y: { mode: 'optional', type: TYPES.UInt, size: 9 },
      pos: { mode: 'optional', type: TYPES.Table, size: this.$$blk },
      neg: { mode: 'optional', type: TYPES.Table, size: this.$$blk },
      color: { mode: 'optional', type: TYPES.UInt, size: 24 },
      column: { mode: 'optional', type: TYPES.UInt, size: 9 },
      delay: { mode: 'optional', type: TYPES.UInt, size: 16 },
      queued: { mode: 'optional', type: TYPES.Boolean },
      hardened: { mode: 'optional', type: TYPES.Boolean },
      size: { mode: 'optional', type: TYPES.UInt, size: 9 },
      zthalt: { mode: 'optional', type: TYPES.Double },
      actor_neg: { mode: 'optional', type: TYPES.String },
      actor_pos: { mode: 'optional', type: TYPES.String },
      anchor: { mode: 'optional', type: TYPES.String },
      actor_neg_data_type: { mode: 'optional', type: TYPES.Table, size: this.$$actorType },
      actor_neg_data_amt: { mode: 'optional', type: TYPES.Any },
      actor_pos_data_type: { mode: 'optional', type: TYPES.Table, size: this.$$actorType },
      actor_pos_data_amt: { mode: 'optional', type: TYPES.Any },
    });
  }
}

/* ------------------------------------------------------------------ */
/* qe — LinesIGE ("lines" custom-IGE data)                             */
/* ------------------------------------------------------------------ */

export interface LinesIGEData {
  action: 'add' | 'remove';
  amt: number;
  size: number;
  pos?: Block | null;
  neg?: Block | null;
  position?: (typeof GARBAGE_POSITIONS)[number];
  column?: number;
  slow?: number;
  effect?: string;
  actor_neg?: string;
  actor_pos?: string;
  anchor?: string;
  actor_neg_data_type?: (typeof ACTOR_TYPES)[number];
  actor_neg_data_amt?: unknown;
  actor_pos_data_type?: (typeof ACTOR_TYPES)[number];
  actor_pos_data_amt?: unknown;
  [k: string]: unknown;
}

export class LinesIGE extends StructBase {
  declare static $byte: DInt;
  declare static $$action: Table<string>;
  declare static $$position: Table<string>;
  declare static $$actorType: Table<string>;
  declare static $$blk: Table<Block | null>;
  static init(): void {
    this.AddTable('action', [...LINES_ACTIONS]);
    this.AddTable('position', [...GARBAGE_POSITIONS]);
    this.AddTable('actorType', [...ACTOR_TYPES]);
    this.AddTable('blk', [null, ...BLOCKS]);
    this.AddProperty('byte', { min: 8, max: 32 });
    this.AddStructure({
      action: { mode: 'fixed', type: TYPES.Table, size: this.$$action },
      amt: { mode: 'fixed', type: TYPES.DInt, size: this.$byte },
      size: { mode: 'fixed', type: TYPES.UInt, size: 9 },
      pos: { mode: 'optional', type: TYPES.Table, size: this.$$blk },
      neg: { mode: 'optional', type: TYPES.Table, size: this.$$blk },
      position: { mode: 'optional', type: TYPES.Table, size: this.$$position },
      column: { mode: 'optional', type: TYPES.UInt, size: 9 },
      slow: { mode: 'optional', type: TYPES.UInt, size: 16 },
      effect: { mode: 'optional', type: TYPES.String },
      actor_neg: { mode: 'optional', type: TYPES.String },
      actor_pos: { mode: 'optional', type: TYPES.String },
      anchor: { mode: 'optional', type: TYPES.String },
      actor_neg_data_type: { mode: 'optional', type: TYPES.Table, size: this.$$actorType },
      actor_neg_data_amt: { mode: 'optional', type: TYPES.Any },
      actor_pos_data_type: { mode: 'optional', type: TYPES.Table, size: this.$$actorType },
      actor_pos_data_amt: { mode: 'optional', type: TYPES.Any },
    });
  }
}

/* ------------------------------------------------------------------ */
/* Ke — Letters (compact string over a small alphabet)                 */
/* ------------------------------------------------------------------ */

export const LETTERS = ['?', ',', '_', '#', '@', 'z', 'l', 'o', 's', 'i', 'j', 't', 'g', 'd'] as const;

export class Letters extends ExtensionBase {
  declare static $$letters: Table<string>;
  declare static $word: DInt;
  static init(): void {
    this.AddTable('letters', [...LETTERS], 'loose');
    this.AddProperty('word', { min: 16, max: 32 });
  }
  static encode(e: Encoder, t: string): void {
    const s = t.split('');
    e.writeDInt(s.length, this.$word);
    for (const c of s) e.writeTable(c, this.$$letters);
  }
  static decode(e: Decoder): string {
    let t = '';
    const s = e.readDInt(this.$word);
    for (let n = 0; n < s; n++) t += e.readTable(this.$$letters);
    return t;
  }
}

/* ------------------------------------------------------------------ */
/* Qe — TetrominoesIGE (custom pieces)                                 */
/* ------------------------------------------------------------------ */

export class TetrominoesIGE extends ExtensionBase {
  declare static $tiny: DInt;
  declare static $$colors: Table<string>;
  declare static $$spinbonus: Table<string>;
  declare static $$kicksets: Table<string>;
  declare static $$special: Table<string>;
  static init(): void {
    this.AddProperty('tiny', { min: 3, max: 7 });
    this.AddTable('spinbonus', [...PIECES], 'flexible');
    this.AddTable('colors', [...BLOCKS]);
    this.AddTable('kicksets', [...PIECES], 'flexible');
    this.AddTable('special', [...SPECIAL_KICKSETS]);
  }
  static encode(e: Encoder, t: any): void {
    const s = t.tetrominoes;
    const n = t.minotypes;
    const i = t.tetrominoes_color;
    const o = Object.keys(s);
    e.writeUInt(o.length, 8);
    for (const name of o) e.writeString(name);
    for (const [name, def] of Object.entries<any>(s)) {
      const { matrix, preview } = def;
      e.writeDInt(matrix.w, this.$tiny);
      e.writeDInt(matrix.h, this.$tiny);
      e.writeUInt(matrix.dx, 5);
      e.writeUInt(matrix.dy, 5);
      e.writeDInt(matrix.data[0].length, this.$tiny);
      const [r, l] = [cla32(matrix.w - 1), cla32(matrix.h - 1)];
      for (const row of matrix.data) for (const [x, y] of row) e.writeUInt(x, r), e.writeUInt(y, l);
      e.writeDInt(preview.w, this.$tiny);
      e.writeDInt(preview.h, this.$tiny);
      for (const [x, y] of preview.data) e.writeUInt(x, r), e.writeUInt(y, l);
      e.writeBoolean(def.weight !== undefined);
      e.writeBoolean(def.spinbonus_override);
      e.writeBoolean(def.kickset_override);
      e.writeBoolean(def.kickset_special);
      e.writeBoolean(n.includes(name));
      e.writeTable(i[name], this.$$colors);
      if (def.weight !== undefined) e.writeDInt(def.weight, this.$tiny);
      if (def.spinbonus_override) {
        e.writeTable(def.spinbonus_override.rule, this.$$spinbonus);
        e.writeBoolean(def.spinbonus_override.mini);
      }
      if (def.kickset_override) e.writeTable(def.kickset_override, this.$$kicksets);
      if (def.kickset_special) e.writeTable(def.kickset_special, this.$$special);
    }
  }
  static decode(e: Decoder): any {
    const t: Record<string, any> = {};
    const n: string[] = [];
    const colors: Record<string, unknown> = {};
    const count = e.readUInt(8);
    const names: string[] = [];
    for (let s = 0; s < count; s++) {
      const name = e.readString();
      t[name] = { matrix: {}, preview: {} };
      names.push(name);
    }
    for (const name of names) {
      const def = t[name];
      const { matrix, preview } = def;
      matrix.w = e.readDInt(this.$tiny);
      matrix.h = e.readDInt(this.$tiny);
      matrix.dx = e.readUInt(5);
      matrix.dy = e.readUInt(5);
      const l = e.readDInt(this.$tiny);
      const [c, p] = [cla32(matrix.w - 1), cla32(matrix.h - 1)];
      matrix.data = [];
      for (let k = 0; k < 4; k++) {
        matrix.data[k] = [];
        for (let s = 0; s < l; s++) {
          const [x, y] = [e.readUInt(c), e.readUInt(p)];
          matrix.data[k][s] = [x, y];
        }
      }
      preview.w = e.readDInt(this.$tiny);
      preview.h = e.readDInt(this.$tiny);
      preview.data = [];
      for (let k = 0; k < l; k++) {
        const [x, y] = [e.readUInt(c), e.readUInt(p)];
        preview.data[k] = [x, y];
      }
      const hasWeight = e.readBoolean();
      const spinbonus = e.readBoolean();
      const kicksetOverride = e.readBoolean();
      const kicksetSpecial = e.readBoolean();
      const isMino = e.readBoolean();
      colors[name] = e.readTable(this.$$colors);
      if (hasWeight) def.weight = e.readDInt(this.$tiny);
      if (spinbonus) def.spinbonus_override = { rule: e.readTable(this.$$spinbonus), mini: e.readBoolean() };
      if (kicksetOverride) def.kickset_override = e.readTable(this.$$kicksets);
      if (kicksetSpecial) def.kickset_special = e.readTable(this.$$special);
      if (isMino) n.push(name);
    }
    return { tetrominoes: t, minotypes: n, tetrominoes_color: colors };
  }
}

/* ------------------------------------------------------------------ */
/* Ve — CustomIGE                                                      */
/* ------------------------------------------------------------------ */

export class CustomIGE extends ExtensionBase {
  declare static $$type: Table<CustomIGEType>;
  static init(): void {
    this.AddTable('type', [...CUSTOM_IGE_TYPES]);
  }
  static encode(e: Encoder, { type, data: s }: { type: CustomIGEType; data: any }): void {
    e.writeTable(type, this.$$type);
    switch (type) {
      case 'garbage':
        e.writeStruct(s, GarbageIGE);
        return;
      case 'map':
        e.writeStruct(s.map, Letters);
        e.writeUInt(s.w, BoardGrid.MAX_WIDTH);
        e.writeUInt(s.h, BoardGrid.MAX_HEIGHT);
        return;
      case 'queue':
        e.writeBoolean(s.start);
        e.writeString(s.queue.toString());
        return;
      case 'piece':
        e.writeString(s.piece);
        return;
      case 'lines':
        e.writeStruct(s, LinesIGE);
        return;
      case 'boardsize':
      case 'boardresize':
        e.writeUInt(s.w, BoardGrid.MAX_WIDTH);
        e.writeUInt(s.h, BoardGrid.MAX_HEIGHT);
        return;
      case 'holderstate':
      case 'constants':
        e.pack(s);
        return;
      case 'setoptions':
        e.writeStruct(s.options, PlayerOptions);
        return;
      case 'tetrominoes':
        e.writeStruct(s, TetrominoesIGE);
        return;
    }
  }
  static decode(e: Decoder): { type: CustomIGEType; data: any } {
    const t = { type: e.readTable(this.$$type) as CustomIGEType, data: {} as any };
    switch (t.type) {
      case 'garbage':
        t.data = e.readStruct(GarbageIGE);
        break;
      case 'map':
        t.data.map = e.readStruct(Letters);
        t.data.w = e.readUInt(BoardGrid.MAX_WIDTH);
        t.data.h = e.readUInt(BoardGrid.MAX_HEIGHT);
        break;
      case 'queue':
        t.data.start = e.readBoolean();
        t.data.queue = e.readString().split(',');
        break;
      case 'piece':
        t.data.piece = e.readString();
        break;
      case 'lines':
        t.data = e.readStruct(LinesIGE);
        break;
      case 'boardsize':
      case 'boardresize':
        t.data.w = e.readUInt(BoardGrid.MAX_WIDTH);
        t.data.h = e.readUInt(BoardGrid.MAX_HEIGHT);
        break;
      case 'holderstate':
      case 'constants':
        t.data = e.unpack();
        break;
      case 'setoptions':
        t.data.options = e.readStruct(PlayerOptions);
        break;
      case 'tetrominoes':
        t.data = e.readStruct(TetrominoesIGE);
        break;
    }
    return t;
  }
}

/* ------------------------------------------------------------------ */
/* Xe — IGE                                                            */
/* ------------------------------------------------------------------ */

export interface IGEData {
  id: number;
  frame: number;
  type: IGEType;
  data?: any;
}

export class IGE extends ExtensionBase {
  declare static $byte: DInt;
  declare static $$type: Table<IGEType>;
  declare static $$int_type: Table<IGEIntType>;
  static init(): void {
    this.AddProperty('byte', { min: 8, max: 24 });
    this.AddTable('type', [...IGE_TYPES]);
    this.AddTable('int_type', [...IGE_INT_TYPES]);
  }
  static encode(e: Encoder, t: IGEData): void {
    const s = t.frame;
    const n = t.type;
    const i = t.data;
    e.writeDInt(t.id, this.$byte);
    e.writeDInt(s, this.$byte);
    e.writeTable(n, this.$$type);
    switch (n) {
      case 'interaction':
        e.writeStruct(i, GarbageIGE);
        return;
      case 'interaction_confirm':
        e.writeTable(i.type, this.$$int_type);
        switch (i.type) {
          case 'garbage':
            e.writeStruct(i, GarbageIGE);
            return;
          case 'zenith.climb_pts':
          case 'zenith.bonus':
            e.writeUInt(i.gameid, 13);
            e.writeDInt(i.frame, this.$byte);
            e.writeDouble(i.amt);
            return;
          case 'zenith.incapacitated':
          case 'zenith.revive':
            e.writeUInt(i.gameid, 13);
            e.writeDInt(i.frame, this.$byte);
            return;
          case 'zenith.attack':
            e.writeUInt(i.gameid, 13);
            e.writeDInt(i.frame, this.$byte);
            e.writeUInt(i.amt, 8);
            return;
          default:
            throw new Error(`Unknown interaction type received: ${i.type}`);
        }
      case 'target': {
        e.writeUInt(i.targets.length, 13);
        for (const target of i.targets) e.writeUInt(target, 13);
        return;
      }
      case 'targeted':
        e.writeBoolean(i.value);
        e.writeUInt(i.gameid, 13);
        e.writeDInt(i.frame, this.$byte);
        return;
      case 'allow_targeting':
        e.writeBoolean(i.value);
        return;
      case 'kev':
        e.writeUInt(i.victim.gameid, 13);
        e.writeUInt(i.killer.gameid, 13);
        e.writeDInt(i.frame, this.$byte);
        e.writeUInt(i.fire, 10);
        return;
      case 'custom':
        e.writeStruct(i, CustomIGE);
        return;
    }
  }
  static decode(e: Decoder): IGEData {
    const t = {} as IGEData;
    t.id = e.readDInt(this.$byte);
    t.frame = e.readDInt(this.$byte);
    t.type = e.readTable(this.$$type) as IGEType;
    switch (t.type) {
      case 'interaction':
        t.data = e.readStruct(GarbageIGE);
        break;
      case 'interaction_confirm': {
        const s = e.readTable(this.$$int_type) as IGEIntType;
        switch (s) {
          case 'garbage':
            t.data = e.readStruct(GarbageIGE);
            break;
          case 'zenith.climb_pts':
          case 'zenith.bonus':
            t.data = { type: s, gameid: e.readUInt(13), frame: e.readDInt(this.$byte), amt: e.readDouble() };
            break;
          case 'zenith.incapacitated':
          case 'zenith.revive':
            t.data = { type: s, gameid: e.readUInt(13), frame: e.readDInt(this.$byte) };
            break;
          case 'zenith.attack':
            t.data = { type: s, gameid: e.readUInt(13), frame: e.readDInt(this.$byte), amt: e.readUInt(8) };
            break;
        }
        break;
      }
      case 'target': {
        const s: number[] = [];
        const n = e.readUInt(13);
        for (let k = 0; k < n; k++) s.push(e.readUInt(13));
        t.data = { targets: s };
        break;
      }
      case 'targeted':
        t.data = { value: e.readBoolean(), gameid: e.readUInt(13), frame: e.readDInt(this.$byte) };
        break;
      case 'allow_targeting':
        t.data = { value: e.readBoolean() };
        break;
      case 'kev':
        t.data = {
          victim: { gameid: e.readUInt(13) },
          killer: { gameid: e.readUInt(13) },
          frame: e.readDInt(this.$byte),
          fire: e.readUInt(10),
        };
        break;
      case 'custom':
        t.data = e.readStruct(CustomIGE);
        break;
    }
    return t;
  }
}

/* ------------------------------------------------------------------ */
/* Je / Ze — PlayerOptions                                             */
/* ------------------------------------------------------------------ */

export interface OptionInfo {
  type: 'object' | 'array' | 'boolean' | 'table' | 'number' | 'string';
  default?: unknown;
  mode?: string;
}

/**
 * Room/game options book (v19). NOTE: the client's full book is obfuscated in
 * the capture; this covers the common versus options. Extend as needed —
 * encode/decode only touch entries present here.
 */
export const OPTS_BOOK: Record<string, OptionInfo> = {
  version: { type: 'number' },
  seed_random: { type: 'boolean' },
  seed: { type: 'number' },
  hasgarbage: { type: 'boolean' },
  usebombs: { type: 'boolean' },
  garbageblocking: { type: 'boolean' },
  garbagequeue: { type: 'boolean' },
  garbagemultiplier: { type: 'number' },
  garbagespeed: { type: 'number' },
  garbagefavor: { type: 'number' },
  garbageholesize: { type: 'number' },
  garbagephase: { type: 'number' },
  garbageincrease: { type: 'number' },
  garbagemargin: { type: 'number' },
  garbagecap: { type: 'number' },
  garbagecapincrease: { type: 'number' },
  garbagecapmargin: { type: 'number' },
  garbagecapmax: { type: 'number' },
  garbageattackcap: { type: 'number' },
  garbageentry: { type: 'table', mode: undefined },
  garbageare: { type: 'number' },
  garbageabsolutecap: { type: 'number' },
  gincrease: { type: 'number' },
  gmargin: { type: 'number' },
  g: { type: 'number' },
  gravitymay20g: { type: 'boolean' },
  shielded: { type: 'number' },
  are: { type: 'number' },
  lineclear_are: { type: 'number' },
  are_lineclear: { type: 'number' },
  are_cooldown: { type: 'number' },
  are_cooldown_lineclear: { type: 'number' },
  gare_same: { type: 'boolean' },
  kickset: { type: 'table' },
  spinbonuses: { type: 'table' },
  nextcount: { type: 'number' },
  allow180: { type: 'boolean' },
  allow_harddrop: { type: 'boolean' },
  display_next: { type: 'boolean' },
  display_hold: { type: 'boolean' },
  display_shadow: { type: 'boolean' },
  display_username: { type: 'boolean' },
  invisible: { type: 'boolean' },
  twinkle: { type: 'boolean' },
  zenith: { type: 'boolean' },
  zenith_expert: { type: 'boolean' },
  zenith_doublehole: { type: 'boolean' },
  zenith_volatile: { type: 'boolean' },
  zenith_gravity: { type: 'boolean' },
  zenith_messy: { type: 'boolean' },
  zenith_lockout: { type: 'number' },
  zenith_speedrun: { type: 'boolean' },
  zenith_splits: { type: 'array' },
  zenith_allsplits: { type: 'boolean' },
  zenith_rapidfire: { type: 'boolean' },
  zenith_progress: { type: 'boolean' },
  zenith_combo: { type: 'boolean' },
  zenith_weather: { type: 'boolean' },
  boardwidth: { type: 'number' },
  boardheight: { type: 'number' },
  boardbuffer: { type: 'number' },
  stock: { type: 'number' },
  finitestock: { type: 'boolean' },
  countdown: { type: 'boolean' },
  countdown_count: { type: 'number' },
  countdown_interval: { type: 'number' },
  precountdown: { type: 'number' },
  preare: { type: 'number' },
  mission: { type: 'string' },
  mission_type: { type: 'table' },
  zoominto: { type: 'table' },
  no_szo: { type: 'boolean' },
  bagtype: { type: 'table' },
  handling: { type: 'object' },
  minoskin: { type: 'object' },
  minoskinopt: { type: 'string' },
  boardskin: { type: 'table' },
  ghostskin: { type: 'table' },
  nolimbo: { type: 'boolean' },
  neverclear: { type: 'boolean' },
  clear_on_solve: { type: 'boolean' },
  seeded: { type: 'boolean' },
  passthrough: { type: 'boolean' },
  opsec: { type: 'boolean' },
  may20g: { type: 'boolean' },
  attacktable: { type: 'table' },
  comboattack: { type: 'number' },
  combotable: { type: 'table' },
  combotabletype: { type: 'string' },
  b2bchaining: { type: 'boolean' },
  b2bcharging: { type: 'boolean' },
  btb: { type: 'boolean' },
  btbpower: { type: 'number' },
  btbmax: { type: 'number' },
  btbmaxpower: { type: 'number' },
  messiness_change: { type: 'number' },
  messiness_inner: { type: 'number' },
  messiness_nosame: { type: 'boolean' },
  messiness_timeout: { type: 'number' },
  messiness_center: { type: 'boolean' },
  undos: { type: 'number' },
  undos_power: { type: 'number' },
  allow_undo: { type: 'boolean' },
  clutch: { type: 'boolean' },
  spectate: { type: 'boolean' },
  strafe: { type: 'boolean' },
  inverted: { type: 'boolean' },
  constant_garbage: { type: 'boolean' },
  ko: { type: 'boolean' },
  roomname: { type: 'string' },
  bgm: { type: 'string' },
  rng: { type: 'number' },
  seed_extra: { type: 'string' },
  score: { type: 'number' },
  multiplier: { type: 'number' },
  receivemultiplier: { type: 'number' },
  cancelmultiplier: { type: 'number' },
  lines: { type: 'number' },
  level_lines: { type: 'number' },
  level_lines_needed: { type: 'number' },
  level: { type: 'number' },
  levelspeed: { type: 'number' },
  allclear_garbage: { type: 'number' },
  allclear_b2b: { type: 'number' },
  allclear_b2b_dup: { type: 'boolean' },
  allclear_b2b_sends: { type: 'boolean' },
  allclear_spin: { type: 'boolean' },
  lookahead: { type: 'number' },
  survival_messiness: { type: 'number' },
  survival_layer_nonstackable: { type: 'boolean' },
  survival_amt: { type: 'number' },
  survival_step: { type: 'number' },
  survival_minspeed: { type: 'number' },
  survival_maxspeed: { type: 'number' },
  survival_gravity: { type: 'number' },
  survival_garbageframe: { type: 'number' },
  survival_startlevel: { type: 'number' },
  survival_layer_amt: { type: 'number' },
  survival_itv: { type: 'number' },
  enforce: { type: 'boolean' },
  forfeit_time: { type: 'number' },
  retryisredo: { type: 'boolean' },
  topoutbailout: { type: 'boolean' },
  zen: { type: 'boolean' },
  username: { type: 'string' },
  gamemode: { type: 'string' },
  pb: { type: 'boolean' },
  ultra: { type: 'boolean' },
  master: { type: 'boolean' },
  target: { type: 'string' },
  map: { type: 'string' },
  mapdown: { type: 'string' },
  start: { type: 'number' },
  stop_on_win: { type: 'boolean' },
  anon: { type: 'boolean' },
  hack_punish: { type: 'boolean' },
  endless: { type: 'boolean' },
  unranked: { type: 'boolean' },
  competitive: { type: 'boolean' },
  personal: { type: 'boolean' },
  minoless: { type: 'boolean' },
};

export class PlayerOptions extends ExtensionBase {
  declare static $$options: Table<string>;
  declare static $$ixs: Table<string>;
  declare static $$minoskin: Table<string>;
  declare static $$skins: Table<string>;
  static OptsBook: Record<string, OptionInfo> = OPTS_BOOK;
  /** encode emits options grouped by type, in this order (reference: Je.TypeOrders) */
  static TypeOrders: readonly string[] = ['boolean', 'number', 'string', 'table', 'array', 'object'];
  static init(): void {
    this.AddTable('options', Object.keys(this.OptsBook));
    this.AddTable('ixs', [...IXS]);
    this.AddTable('minoskin', [...MINO_SKINS], 'flexible');
    this.AddTable('skins', [...SKINS], 'flexible');
    this.AddTable('_garbageentry', ['instant', 'delayed', 'interrupt'], 'loose');
    this.AddTable('_kickset', ['SRS+', 'SRS', 'SRS-X', 'TETRA-X', 'ASC', 'ARS', 'NRS', 'DRS', 'WORLD', 'NONE'], 'loose');
    this.AddTable('_spinbonuses', ['auto', 'all', 'all-mini', 'all-mini+', 't-spins', 'handheld', 'none', 'custom'], 'loose');
    this.AddTable('_mission_type', ['vs', 'lines', 'attack', 'ko', 'special', 'cheese', 'random'], 'loose');
    this.AddTable('_zoominto', ['none', 'zenith', 'duels'], 'loose');
    this.AddTable('_bagtype', ['7-bag', '14-bag', '7+1-bag', '7+x-bag', 'total mayhem', 'classic', 'pairs', '7-bag+o'], 'loose');
    this.AddTable('_boardskin', ['tetrio', 'tetrio_old', 'tetrio_connected', 'tetrio_allclear', 'tetrio_owob', 'generic'], 'loose');
    this.AddTable('_ghostskin', ['tetrio', 'tetrio_old', 'tetrio_connected', 'tetrio_allclear', 'tetrio_owob', 'generic'], 'loose');
    this.AddTable('_attacktable', ['default', 'tetrax', 'allclear', 'none'], 'loose');
    this.AddTable('_combotable', ['default', 'tetrax', 'modern guideline', 'classic guideline', 'none'], 'loose');
  }
  static *ParseOptions(v: Record<string, unknown>): Generator<[string, unknown, OptionInfo]> {
    const { TypeOrders, OptsBook } = this;
    const keys = Object.keys(v);
    for (const typeOrder of TypeOrders) {
      for (const key of keys) {
        const info = OptsBook[key];
        if (!info || info.type !== typeOrder) continue;
        yield [key, v[key], info];
      }
    }
  }
  static encode(e: Encoder, t: Record<string, unknown>): void {
    for (const [s, n, i] of this.ParseOptions(t)) {
      e.writeTable(s, this.$$options);
      switch (i.type) {
        case 'object':
          if (s === 'handling') {
            const h = n as FullStateData['game']['handling'];
            e.writeFloat(h.arr, 6, 10);
            e.writeUInt(h.sdf, 6);
            e.writeBoolean(h.safelock);
            e.writeBoolean(h.cancel);
            e.writeBoolean(h.may20g);
            e.writeFloat(h.das, 8, 10);
            e.writeFloat(h.dcd, 8, 10);
            e.writeTable(h.irs, this.$$ixs);
            e.writeTable(h.ihs, this.$$ixs);
          } else if (s === 'minoskin') {
            const o = n as Record<string, string>;
            e.writeUInt(Object.keys(o).length, 8);
            for (const [t2, s2] of Object.entries(o)) {
              e.writeTable(t2, this.$$minoskin);
              e.writeTable(s2, this.$$skins);
            }
          }
          break;
        case 'array':
          e.writeArray(n as unknown[]);
          break;
        case 'boolean':
          e.writeBoolean(n);
          break;
        case 'table':
          e.writeTable(n, (this as unknown as Record<string, Table>)[`$$_${s}`]);
          break;
        case 'number':
          e.writeNumber(n as number);
          break;
        case 'string':
          e.writeString(n as string);
          break;
        default:
          throw new TypeError(`Unknown type for key: ${s} value: ${n} | got -> ${i.type}`);
      }
    }
    e.writeTable(null, this.$$options);
  }
  static decode(e: Decoder): Record<string, unknown> {
    const t = this.$$options.size;
    const s = this.OptsBook;
    const n: Record<string, unknown> = {};
    for (let a = e.peek(t); a !== 0; a = e.peek(t)) {
      const key = e.readTable(this.$$options)!;
      const a2 = s[key]?.type;
      switch (a2) {
        case 'object':
          if (key === 'handling') {
            const h = {} as FullStateData['game']['handling'];
            h.arr = e.readFloat(6, 10);
            h.sdf = e.readUInt(6);
            h.safelock = e.readBoolean();
            h.cancel = e.readBoolean();
            h.may20g = e.readBoolean();
            h.das = e.readFloat(8, 10);
            h.dcd = e.readFloat(8, 10);
            h.irs = e.readTable(this.$$ixs) as Ixs;
            h.ihs = e.readTable(this.$$ixs) as Ixs;
            n[key] = h;
          } else if (key === 'minoskin') {
            const o: Record<string, unknown> = {};
            const i2 = e.readUInt(8);
            n[key] = o;
            for (let k = 0; k < i2; k++) {
              const t2 = e.readTable(this.$$minoskin);
              const n2 = e.readTable(this.$$skins);
              o[t2 as string] = n2;
            }
          }
          break;
        case 'array':
          n[key] = e.readArray();
          break;
        case 'boolean':
          n[key] = e.readBoolean();
          break;
        case 'table':
          n[key] = e.readTable((this as unknown as Record<string, Table>)[`$$_${key}`]);
          break;
        case 'number':
          n[key] = e.readNumber();
          break;
        case 'string':
          n[key] = e.readString();
          break;
        default:
          throw new TypeError(`Unknown type for key: ${key} | got -> ${a2}`);
      }
    }
    e.seek(t, 2);
    return n;
  }
}

export class PlayerOptionsDelta extends PlayerOptions {
  static *ParseOptions(v: Record<string, unknown>): Generator<[string, unknown, OptionInfo]> {
    for (const [s, n, i] of super.ParseOptions(v)) {
      if (i.default !== n) yield [s, n, i];
    }
  }
}

/* ------------------------------------------------------------------ */
/* et — EndStats                                                       */
/* ------------------------------------------------------------------ */

export class EndStats extends ExtensionBase {
  declare static $$gor: Table<string | null>;
  static init(): void {
    ExtensionBase.AddExtension(this as never, { ownBuffer: true });
    this.AddTable('gor', [...GAMEOVER_REASONS]);
  }
  static encode(e: Encoder, t: any): void {
    const s = t.successful;
    const n = t.gameoverreason;
    const i = t.killer.gameid;
    const o = t.killer.type === 'spark';
    const a = t.killer.username ?? '';
    const { apm: r, pps: l, vsscore: c } = t.aggregatestats;
    const { game: p, stats: h, diyusi: d } = t;
    e.writeBoolean(s);
    e.writeTable(n, this.$$gor);
    e.writeUInt(i, 13);
    e.writeBoolean(o);
    e.writeString(a);
    e.writeStruct(t.options, PlayerOptionsDelta);
    e.writeDouble(r);
    e.writeDouble(l);
    e.writeDouble(c);
    e.writeStruct({ game: p, stats: h, diyusi: d }, FullState);
  }
  static decode(e: Decoder): any {
    const t: any = { killer: {}, aggregatestats: {} };
    t.successful = e.readBoolean();
    t.gameoverreason = e.readTable(this.$$gor);
    t.killer.gameid = e.readUInt(13);
    t.killer.type = e.readBoolean() ? 'spark' : 'sizzle';
    t.killer.username = e.readString();
    t.options = e.readStruct(PlayerOptionsDelta);
    t.aggregatestats.apm = e.readDouble();
    t.aggregatestats.pps = e.readDouble();
    t.aggregatestats.vsscore = e.readDouble();
    Object.assign(t, e.readStruct(FullState));
    return t;
  }
}

/* ------------------------------------------------------------------ */
/* He — ReplayFrame                                                    */
/* ------------------------------------------------------------------ */

export interface ReplayFrameData {
  type: FrameType;
  frame: number;
  data: any;
}

export class ReplayFrame extends ExtensionBase {
  declare static $$type: Table<FrameType>;
  declare static $$key: Table<ReplayKey>;
  declare static $frame: DInt;
  type: FrameType;
  frame: number;
  data: any;
  constructor(e: ReplayFrameData) {
    super();
    this.type = e.type;
    this.frame = e.frame;
    this.data = e.data;
  }
  static init(): void {
    ExtensionBase.AddExtension(this as never, { ownBuffer: true });
    this.AddProperty('frame', { min: 18, max: 26 });
    this.AddTable('type', [...FRAME_TYPES]);
    this.AddTable('key', [...REPLAY_KEYS]);
  }
  static decode(e: Decoder): ReplayFrame {
    const t = {} as ReplayFrameData;
    t.type = e.readTable(this.$$type) as FrameType;
    t.frame = e.readDInt(this.$frame);
    switch (t.type) {
      case 'keydown':
      case 'keyup': {
        const s = e.readTable(this.$$key) as ReplayKey;
        const hoisted = e.readBoolean();
        const i: { key: ReplayKey; subframe: number; hoisted?: boolean } = {
          key: s,
          subframe: e.readFloat(4, 10),
        };
        if (hoisted) i.hoisted = true;
        t.data = i;
        break;
      }
      case 'start':
        t.data = {};
        break;
      case 'full':
        t.data = e.readStruct(FullState);
        break;
      case 'end':
        t.data = e.readStruct(EndStats);
        break;
      case 'ige':
        t.data = e.readStruct(IGE);
        break;
      case 'strategy':
        t.data = e.readUInt(3);
        break;
      case 'manual_target':
        t.data = e.readUInt(13);
        break;
      default:
        t.data = e.unpack();
    }
    return new this(t);
  }
  encode(e: Encoder): Buffer {
    const t = this.constructor as typeof ReplayFrame;
    e.writeTable(this.type, t.$$type);
    e.writeDInt(this.frame, t.$frame);
    switch (this.type) {
      case 'keydown':
      case 'keyup': {
        const s = this.data.hoisted;
        const n = this.data.subframe;
        e.writeTable(this.data.key, t.$$key);
        e.writeBoolean(s);
        e.writeFloat(n, 4, 10);
        return e.finalize();
      }
      case 'start':
        return e.finalize();
      case 'full':
        e.writeStruct(this.data, FullState);
        return e.finalize();
      case 'end':
        EndStats.encode(e, this.data);
        return e.finalize();
      case 'ige':
        e.writeStruct(this.data, IGE);
        return e.finalize();
      case 'strategy':
        e.writeUInt(this.data, 3);
        return e.finalize();
      case 'manual_target':
        e.writeUInt(this.data, 13);
        return e.finalize();
      default:
        e.pack(this.data);
        return e.finalize();
    }
  }
}

/* ------------------------------------------------------------------ */
/* Te — Replay (msgpackr ext 10): gameid + provisioned + packed frames */
/* ------------------------------------------------------------------ */

export class Replay extends ExtensionBase {
  declare static $prov: DInt;
  gameid: number;
  provisioned: number;
  frames: ReplayFrame[];
  constructor(gameid: number, provisioned: number, frames: ReplayFrameData[] | ReplayFrame[]) {
    super();
    this.gameid = gameid;
    this.provisioned = provisioned;
    this.frames = frames.map((f) => (f instanceof ReplayFrame ? f : new ReplayFrame(f)));
  }
  static init(): void {
    ExtensionBase.AddExtension(this as never);
    this.AddProperty('prov', { min: 18, max: 26 });
  }
  static decode(e: Decoder): Replay {
    return new this(e.readUInt(13), e.readDInt(this.$prov), e.unpack() as ReplayFrameData[]);
  }
  encode(e: Encoder): Buffer {
    const t = this.constructor as typeof Replay;
    e.writeUInt(this.gameid, 13);
    e.writeDInt(this.provisioned, t.$prov);
    e.pack(this.frames);
    return e.finalize();
  }
}

/* ------------------------------------------------------------------ */
/* Ie — BoardList (per-player board snapshots)                         */
/* ------------------------------------------------------------------ */

export interface BoardListEntry {
  gameid: number;
  board: { f: number; g: number; w: number; h: number; b: BoardGridData };
}

export class BoardList extends ExtensionBase {
  declare static $long: DInt;
  boards: BoardListEntry[];
  constructor(e: BoardListEntry[]) {
    super();
    this.boards = e;
  }
  static init(): void {
    ExtensionBase.AddExtension(this as never);
    this.AddProperty('long', { min: 16, max: 32 });
  }
  static decode(e: Decoder): BoardList {
    const t: BoardListEntry[] = [];
    const s = e.readUInt(13);
    for (let n = 0; n < s; n++) {
      const entry = { board: {} as BoardListEntry['board'] } as BoardListEntry;
      entry.gameid = e.readUInt(13);
      entry.board.f = e.readUInt(10);
      entry.board.g = e.readDInt(this.$long);
      entry.board.w = e.readUInt(BoardGrid.MAX_WIDTH);
      entry.board.h = e.readUInt(BoardGrid.MAX_HEIGHT);
      entry.board.b = e.readStruct(BoardGrid);
      t[n] = entry;
    }
    return new this(t);
  }
  encode(e: Encoder): Buffer {
    const t = this.constructor as typeof BoardList;
    e.writeUInt(this.boards.length, 13);
    for (const { gameid: s, board: { b: n, f: i, g: o, w: a, h: r } } of this.boards) {
      e.writeUInt(s, 13);
      e.writeUInt(i, 10);
      e.writeDInt(o, t.$long);
      e.writeUInt(a, BoardGrid.MAX_WIDTH);
      e.writeUInt(r, BoardGrid.MAX_HEIGHT);
      e.writeStruct(n, BoardGrid);
    }
    return e.finalize();
  }
}

/* ------------------------------------------------------------------ */
/* Ee — Scoreboard (zenith)                                            */
/* ------------------------------------------------------------------ */

export interface ScoreboardEntry {
  gameid: number;
  stats: {
    rank: number;
    altitude: number;
    btb: number;
    revives: number;
    escapeartist: number;
    blockrationing_app: number;
    blockrationing_final: number;
  };
  allies: number[];
  specCount: number;
  speedrun: boolean;
  nearWR: boolean;
  talentless?: boolean;
}

export class Scoreboard extends ExtensionBase {
  declare static $$extraStat: Table<string>;
  sb: ScoreboardEntry[];
  constructor(e: ScoreboardEntry[]) {
    super();
    this.sb = e;
  }
  static init(): void {
    ExtensionBase.AddExtension(this as never);
    this.AddTable('extraStat', [...EXTRA_STATS]);
  }
  static decode(e: Decoder): Scoreboard {
    const t: ScoreboardEntry[] = [];
    const s = e.readUInt(13);
    for (let n = 0; n < s; n++) {
      const entry = { stats: {} as ScoreboardEntry['stats'], allies: [] as number[] } as ScoreboardEntry;
      t[n] = entry;
      entry.gameid = e.readUInt(13);
      entry.stats.rank = e.readUInt(6);
      entry.stats.altitude = e.readFloat(18, 10);
      entry.stats.btb = e.readUInt(13);
      entry.specCount = e.readUInt(10);
      entry.speedrun = e.readBoolean();
      entry.nearWR = e.readBoolean();
      const i = e.readUInt(3);
      for (let k = 0; k < i; k++) entry.allies.push(e.readUInt(13));
      entry.stats.revives = 0;
      entry.stats.escapeartist = 0;
      entry.stats.blockrationing_app = 0;
      entry.stats.blockrationing_final = 0;
      switch (e.readTable(this.$$extraStat)) {
        case 'none':
          break;
        case 'revives':
          entry.stats.revives = e.readUInt(8);
          break;
        case 'escapeartist':
          entry.stats.escapeartist = e.readUInt(9);
          break;
        case 'blockrationing_app':
          entry.stats.blockrationing_app = e.readFloat(10, 100);
          break;
        case 'blockrationing_final':
          entry.stats.blockrationing_final = e.readUInt(11);
          break;
        case 'talentless':
          entry.talentless = true;
          break;
      }
    }
    return new this(t);
  }
  encode(e: Encoder): Buffer {
    const t = this.constructor as typeof Scoreboard;
    e.writeUInt(this.sb.length, 13);
    for (const { gameid: s, stats: n, allies: i, specCount: o, speedrun: a, nearWR: r, talentless: l } of this.sb) {
      e.writeUInt(s, 13);
      e.writeUInt(Math.floor(n.rank), 6);
      e.writeFloat(Number(n.altitude.toFixed(2)), 18, 10);
      e.writeUInt(n.btb, 13);
      e.writeUInt(o, 10);
      e.writeBoolean(a);
      e.writeBoolean(r);
      if (i) {
        e.writeUInt(i.length, 3);
        for (const ally of i) e.writeUInt(ally, 13);
      } else {
        e.writeUInt(0, 3);
      }
      let c: string = 'none';
      if (n.revives) c = 'revives';
      if (n.escapeartist) c = 'escapeartist';
      if (n.blockrationing_app) c = 'blockrationing_app';
      if (n.blockrationing_final) c = 'blockrationing_final';
      if (l) c = 'talentless';
      e.writeTable(c, t.$$extraStat);
      switch (c) {
        case 'none':
        case 'talentless':
          break;
        case 'revives':
          e.writeUInt(n.revives, 8);
          break;
        case 'escapeartist':
          e.writeUInt(n.escapeartist, 9);
          break;
        case 'blockrationing_app':
          e.writeFloat(n.blockrationing_app, 10, 100);
          break;
        case 'blockrationing_final':
          e.writeUInt(n.blockrationing_final, 11);
          break;
      }
    }
    return e.finalize();
  }
}

/* ------------------------------------------------------------------ */
/* We — PlayerList                                                     */
/* ------------------------------------------------------------------ */

export interface PlayerListEntry {
  userid: string;
  gameid: number;
  alive: boolean;
  naturalorder: number;
  options: Record<string, unknown>;
}

export class PlayerList extends ExtensionBase {
  players: PlayerListEntry[];
  constructor(e: PlayerListEntry[]) {
    super();
    this.players = e;
  }
  static init(): void {
    ExtensionBase.AddExtension(this as never);
  }
  static decode(e: Decoder): PlayerListEntry[] {
    const t: PlayerListEntry[] = [];
    const s = e.readUInt(13);
    for (let n = 0; n < s; n++) {
      const entry = {} as PlayerListEntry;
      entry.userid = e.readHex(12);
      entry.gameid = e.readUInt(13);
      entry.alive = e.readBoolean();
      entry.naturalorder = e.readUInt(13);
      entry.options = e.readStruct(PlayerOptions);
      t.push(entry);
    }
    return t;
  }
  encode(e: Encoder): Buffer {
    e.writeUInt(this.players.length, 13);
    for (const { gameid: t, userid: s, alive: n, naturalorder: i, options: o } of this.players) {
      e.writeHex(s, 12);
      e.writeUInt(t, 13);
      e.writeBoolean(n);
      e.writeUInt(i, 13);
      e.writeStruct(o, PlayerOptions);
    }
    return e.finalize();
  }
}

/* ------------------------------------------------------------------ */
/* init (reference order!)                                             */
/* ------------------------------------------------------------------ */

let initialized = false;
export function initStructures(): void {
  if (initialized) return;
  initialized = true;
  // exact order from the client bundle: Te,Ie,Ee,He,We,Re,Ne,$e,Ge,Ue,Xe,je,qe,Ve,Qe,Ke,Je,et
  Replay.init();
  BoardList.init();
  Scoreboard.init();
  ReplayFrame.init();
  PlayerList.init();
  FullState.init();
  BoardGrid.init();
  FallingPiece.init();
  Stats.init();
  ZenithStats.init();
  IGE.init();
  GarbageIGE.init();
  LinesIGE.init();
  CustomIGE.init();
  TetrominoesIGE.init();
  Letters.init();
  PlayerOptions.init();
  EndStats.init();
}
initStructures();
