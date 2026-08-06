/**
 * Shared type contracts for tetrio-tui.
 * These mirror the TETR.IO NetCodec wire structures (see docs/captures/netcodec_deobfuscated.js).
 * Modules should build against these types so engine <-> protocol <-> tui integrate cleanly.
 */

/** Tetromino types. TETR.IO uses lowercase letters. */
export type PieceType = 'i' | 'o' | 't' | 's' | 'z' | 'l' | 'j';
export const PIECE_TYPES: readonly PieceType[] = ['i', 'o', 't', 's', 'z', 'l', 'j'];

/** A board cell: null = empty, otherwise a piece letter (garbage is its own encoding at the protocol layer,
 * but the engine may represent garbage as 'g' internally and map at the boundary). */
export type Cell = PieceType | 'g' | null;

/** A board grid: rows indexed [y][x], y=0 is the TOP of the visible board. */
export type BoardGrid = Cell[][];

/** Player handling configuration (DAS/ARR/DCD/SDF + flags). */
export interface Handling {
  arr: number;      // auto-repeat rate (frames per move at 60fps; may be fractional)
  das: number;      // delayed auto shift (frames)
  dcd: number;      // DAS cut delay (frames)
  sdf: number;      // soft drop factor (gravity multiplier)
  safelock: boolean;
  cancel: boolean;  // allow DAS cancel between directions
  may20g: boolean;  // allow 20G (instant) soft drop
  irs: string;      // initial rotation system: 'tap' | 'hold' | 'none'
  ihs: string;      // initial hold system: 'tap' | 'hold' | 'none'
}

/** A falling (active) piece. */
export interface FallingPiece {
  type: PieceType;
  x: number;        // column of the piece's bounding-box origin
  y: number;        // row (float; fractional for gravity)
  r: number;        // rotation 0..3
  // engine bookkeeping
  hy?: number;      // hard-drop ghost y
  locking?: number; // lock delay progress (frames)
  lockresets?: number;
  rotresets?: number;
  safelock?: number;
}

/** Input actions the engine understands (mirrors the $$key enum on the wire). */
export type InputKey =
  | 'moveLeft' | 'moveRight' | 'softDrop' | 'hardDrop'
  | 'rotateCW' | 'rotateCCW' | 'rotate180' | 'hold'
  | 'undo' | 'redo' | 'reset';

/** Full game options (room options v19 subset that affects gameplay). */
export interface GameOptions {
  seed: number;
  seed_random: boolean;
  boardwidth: number;
  boardheight: number;
  g: number;             // gravity (cells/frame)
  gincrease: number;
  gmargin: number;
  gravitymay20g: boolean;
  hasgarbage: boolean;
  garbagemultiplier: number;
  garbageincrease: number;
  garbagemargin: number;
  garbagecap: number;
  garbagecapincrease: number;
  garbageholesize: number;
  garbagequeue: boolean;
  garbageentry: string;     // 'instant' | 'delayed'
  garbageblocking: string;  // 'combo blocking' | 'limited blocking' | 'none'
  bagtype: string;          // '7-bag' | '14-bag' | 'classic'
  spinbonuses: string;      // 'all-mini+' | 'all-mini' | 't-spins' | 'none'
  combotable: string;       // 'multiplier' | 'classic guideline' | 'modern guideline'
  kickset: string;          // 'SRS+' | 'SRS' | 'TGM' | ...
  nextcount: number;
  allow_harddrop: boolean;
  locktime: number;         // lock delay (frames)
  lockresets: number;       // max move resets
  allow180: boolean;
  b2bchaining: boolean;
  b2bcharging: boolean;
  b2bcharge_at: number;
  b2bcharge_base: number;
  allclears: boolean;
  allclear_garbage: number;
  allclear_b2b: number;
  infinite_hold: boolean;
  are: number;
  lineclear_are: number;
  [key: string]: unknown;   // many more options exist; tolerate them
}

/** Live game statistics. */
export interface GameStats {
  lines: number;
  level: number;
  score: number;
  piecesplaced: number;
  inputs: number;
  holds: number;
  // versus stats
  garbage: { sent: number; received: number; attack: number; cleared: number };
  btb: number;         // current back-to-back chain
  btbmax: number;
  combo: number;
  combomax: number;
  currentcombo: number;
  tspins: number;
  allclears: number;
  apm: number;         // attack per minute
  pps: number;         // pieces per second
  vsscore: number;
  kills: number;
  startTime: number;
  currentTime: number;
  [key: string]: unknown;
}

/** The engine's authoritative state (mirrors NetCodec FullState closely). */
export interface EngineState {
  board: BoardGrid;
  bag: PieceType[];          // upcoming pieces (next queue), index 0 = next
  hold: { piece: PieceType | null; locked: boolean };
  falling: FallingPiece | null;
  g: number;                 // current gravity (cells/frame)
  garbage: { incoming: number[]; queue: number };  // pending garbage lines
  combo: number;
  btb: number;
  playing: boolean;
  gameover: boolean;
  stats: GameStats;
  options: GameOptions;
}
