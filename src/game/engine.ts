/**
 * Local Tetris engine (TETR.IO-compatible mechanics).
 * Fixed 60fps timestep, deterministic given (seed, input sequence).
 * Board coords: x right, y DOWN, y=0 = top. Rows board[0..h-1].
 *
 * Design: pure functions over an EngineState. `tick` advances one frame given held inputs.
 * Attack/combo/kick tables are data-driven (tunable to match TETR.IO exactly).
 */
import type {
  PieceType, Cell, BoardGrid, Handling, FallingPiece, GameOptions, GameStats, EngineState,
} from '../types.js';
import { PIECE_ROTATIONS, kicksFor, spawnX } from './pieces.js';

// ---- RNG (Park-Miller, TETR.IO exact) + 7-bag ----
// seed %= 2147483647 (<=0 -> +=2147483646 || 1); next: s = 16807*s % 2147483647
export class ParkMiller {
  private s: number;
  constructor(seed: number) {
    let s = seed % 2147483647;
    if (s <= 0) { s += 2147483646; s |= 1; }
    this.s = s;
  }
  next(): number { this.s = (16807 * this.s) % 2147483647; return this.s; }
  nextFloat(): number { return (this.next() - 1) / 2147483646; }
}

// 7-bag base array (TETR.IO order) — shuffled Fisher-Yates from the end.
const BAG_BASE: PieceType[] = ['z', 'l', 'o', 's', 'i', 'j', 't'];

export class Bag {
  private rng: ParkMiller;
  private queue: PieceType[] = [];
  constructor(seed: number, public bagtype: string = '7-bag') {
    this.rng = new ParkMiller(seed);
  }
  private refill(): void {
    const bag = [...BAG_BASE];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.nextFloat() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    this.queue.push(...bag);
  }
  next(): PieceType {
    if (this.queue.length === 0) this.refill();
    return this.queue.shift()!;
  }
  peek(n: number): PieceType[] {
    while (this.queue.length < n) this.refill();
    return this.queue.slice(0, n);
  }
}

// ---- Attack / combo tables (EXACT TETR.IO, from docs/tetrio_constants.json) ----
export const ATTACK_TABLE = {
  single: 0, double: 1, triple: 2, tetris: 4, penta: 5,
  tspin_mini: 0, tspin: 0,
  tspin_mini_single: 0, tspin_single: 2,
  tspin_mini_double: 1, tspin_double: 4,
  tspin_mini_triple: 2, tspin_triple: 6,
  tspin_mini_quad: 4, tspin_quad: 10, tspin_penta: 12,
  b2b_bonus: 1,          // +1 when btb > 1 (non-chaining)
  b2b_bonus_log: 0.8,
  combo_minifier: 1,
  combo_minifier_log: 1.25,
  combo_bonus: 0.25,
  allclear: 10,
};
// combotable arrays (index = min(combo-2, len-1)); 'multiplier' uses the FORMULA in computeComboAttack.
export const COMBO_TABLES: Record<string, number[]> = {
  none: [0],
  'classic guideline': [0,1,1,2,2,3,3,4,4,4,5],
  'modern guideline': [0,1,1,2,2,2,3,3,3,3,3,3,4],
};

/** TETR.IO 'multiplier' combotable is a FORMULA (not an array). */
export function computeComboAttack(combo: number): number {
  if (combo <= 1) return 0;
  let d = 1 + 0.25 * (combo - 1);
  if (combo > 2) d = Math.max(d, Math.log1p((combo - 1) * ATTACK_TABLE.combo_minifier_log));
  return d;
}

// ---- Score table (EXACT TETR.IO, docs/tetrio_constants.json#scoring) ----
// b2b: difficult actions x1.5 while the chain lives; combo: 50*(combo-1);
// all-clear +3500; softdrop 1/cell, harddrop 2/cell; everything x level at the end.
export const SCORE_TABLE = {
  single: 100, double: 300, triple: 500, tetris: 800, penta: 1200,
  tspin_mini: 100, tspin: 400,
  tspin_mini_single: 200, tspin_single: 800,
  tspin_mini_double: 400, tspin_double: 1200,
  tspin_mini_triple: 800, tspin_triple: 1600,
  b2b_multiplier: 1.5,
  combo: 50,
  allclear: 3500,
  softdrop: 1,
  harddrop: 2,
};

export interface ClearResult {
  clearedRows?: number[];  // visible-board row indices that were cleared (for effects)
  kind: 'none' | 'single' | 'double' | 'triple' | 'tetris';
  tspin: 'none' | 'mini' | 'full';
  lines: number;
  allclear: boolean;
  attack: number;
  b2b: number;
  combo: number;
}

export interface TickEvents {
  placed?: boolean;
  lines?: ClearResult;
  harddrop?: boolean;
  hold?: boolean;
  rotate?: boolean;
  gameover?: boolean;
  garbageReceived?: number;
  toppedOut?: boolean;
}

interface ShiftState { dir: -1 | 1; held: boolean; das: number; arr: number }

export interface Engine {
  state: EngineState;
  bag: Bag;
  frame: number;
  g: number;                  // current gravity (cells/frame)
  pieces: number;
  gravityRemainder: number;
  falling: FallingPiece | null;
  hold: PieceType | null;
  holdLocked: boolean;
  combo: number;
  btb: number;
  btbCharge: number;
  lastClearWasTspinOrTetris: boolean;
  clearingFrames: number;     // are/lineclear_are countdown
  spawnDelay: number;         // are countdown
  lShift: ShiftState;
  rShift: ShiftState;
  softdropHeld: boolean;
  safelockT: number;         // safelock: frames after a lock-delay lock during which hard drop is blocked
  stats: GameStats;
  prevInput: InputState;
  lastShiftDir: -1 | 1;
  rotatingSystem: boolean;
}

export interface InputState {
  left: boolean; right: boolean; softDrop: boolean;
  rotCW: boolean; rotCCW: boolean; rot180: boolean;
  hardDrop: boolean; hold: boolean;
}
export const NEUTRAL_INPUT: InputState = {
  left: false, right: false, softDrop: false, rotCW: false, rotCCW: false, rot180: false, hardDrop: false, hold: false,
};

/** Copy input fields in-place (avoids object spread allocation). */
function copyInput(dst: InputState, src: InputState): void {
  dst.left = src.left; dst.right = src.right; dst.softDrop = src.softDrop;
  dst.rotCW = src.rotCW; dst.rotCCW = src.rotCCW; dst.rot180 = src.rot180;
  dst.hardDrop = src.hardDrop; dst.hold = src.hold;
}

function emptyStats(): GameStats {
  return {
    lines: 0, level: 1, score: 0, piecesplaced: 0, inputs: 0, holds: 0,
    garbage: { sent: 0, received: 0, attack: 0, cleared: 0 },
    btb: 0, btbmax: 0, combo: 0, combomax: 0, currentcombo: 0,
    tspins: 0, allclears: 0, apm: 0, pps: 0, vsscore: 0, kills: 0,
    startTime: 0, currentTime: 0,
  };
}

/** Hidden buffer rows above the visible field (spawn/rotate room). */
export const BUFFER_ROWS = 20;

function makeGrid(w: number, h: number): BoardGrid {
  return Array.from({ length: h + BUFFER_ROWS }, () => new Array<Cell>(w).fill(null));
}

/** The visible portion of the board (what the renderer shows). */
export function visibleBoard(board: BoardGrid): BoardGrid {
  return board.slice(BUFFER_ROWS);
}

export function createGame(options: Partial<GameOptions> = {}, seed?: number): Engine {
  const opts = { boardwidth: 10, boardheight: 20, g: 0.02, ...options } as GameOptions;
  const realSeed = seed ?? (options.seed ?? Math.floor(Math.random() * 0x7fffffff));
  const state: EngineState = {
    board: makeGrid(opts.boardwidth, opts.boardheight),
    bag: [],
    hold: { piece: null, locked: false },
    falling: null,
    g: opts.g,
    garbage: { incoming: [], queue: 0 },
    combo: 0, btb: 0, playing: false, gameover: false,
    stats: emptyStats(),
    options: opts,
  };
  const engine: Engine = {
    state, bag: new Bag(realSeed, opts.bagtype), frame: 0, g: opts.g, pieces: 0,
    gravityRemainder: 0, falling: null, hold: null, holdLocked: false,
    combo: 0, btb: 0, btbCharge: 0, lastClearWasTspinOrTetris: false,
    clearingFrames: 0, spawnDelay: 0,
    lShift: { dir: -1, held: false, das: 0, arr: 0 },
    rShift: { dir: 1, held: false, das: 0, arr: 0 },
    softdropHeld: false, safelockT: 0, stats: state.stats, prevInput: { ...NEUTRAL_INPUT }, lastShiftDir: -1,
    rotatingSystem: false,
  };
  return engine;
}

export function startGame(engine: Engine): void {
  engine.state.playing = true;
  engine.stats.startTime = 0;
  spawnNext(engine);
}

// ---- board helpers ----
function collides(board: BoardGrid, type: PieceType, x: number, y: number, r: number): boolean {
  const cells = PIECE_ROTATIONS[type][r];
  const h = board.length, w = board[0].length;
  const fy = Math.floor(y);
  for (const [cx, cy] of cells) {
    const bx = x + cx, by = fy + cy;
    if (bx < 0 || bx >= w || by >= h) return true;
    if (by >= 0 && board[by][bx]) return true;
  }
  return false;
}

function ghostY(board: BoardGrid, type: PieceType, x: number, y: number, r: number): number {
  let gy = y;
  while (!collides(board, type, x, gy + 1, r)) gy++;
  return gy;
}

function lockPiece(engine: Engine): TickEvents {
  const f = engine.falling!;
  const board = engine.state.board;
  let lockedAboveVisible = true;
  for (const [cx, cy] of PIECE_ROTATIONS[f.type][f.r]) {
    const bx = f.x + cx, by = Math.floor(f.y) + cy;
    if (by >= 0 && by < board.length) board[by][bx] = f.type;
    if (by >= BUFFER_ROWS) lockedAboveVisible = false;
  }
  engine.pieces++;
  engine.stats.piecesplaced++;
  engine.holdLocked = false;
  const lines = clearLines(engine, f);
  const ev: TickEvents = { placed: true, lines };
  if (lines.lines > 0 || lines.tspin !== 'none' || lines.allclear) {
    engine.state.stats = engine.stats;
  }
  // lock-out: piece locked entirely above the visible field
  if (lockedAboveVisible) {
    engine.state.gameover = true;
    engine.state.playing = false;
    ev.gameover = true;
    ev.toppedOut = true;
  }
  spawnNext(engine);
  if (engine.state.gameover) { ev.gameover = true; ev.toppedOut = true; }
  return ev;
}

function spawnNext(engine: Engine, useHold = false): void {
  const type = useHold ? (engine.hold ?? engine.bag.next()) : engine.bag.next();
  const w = engine.state.options.boardwidth;
  // Spawn so the piece's topmost mino is just inside the top of the buffer's bottom edge:
  // the piece enters the visible field from above. Buffer rows give room to rotate on entry.
  const cells = PIECE_ROTATIONS[type][0];
  const minCy = Math.min(...cells.map((c) => c[1]));
  const spawnY = BUFFER_ROWS - 1 - minCy - (minCy === 0 ? 0 : 0);
  const x = spawnX(type, w);
  engine.falling = {
    type, x, y: spawnY, r: 0,
    locking: 0, lockresets: 0, rotresets: 0, safelock: 0,
  };
  engine.falling.hy = ghostY(engine.state.board, type, x, spawnY, 0);
  engine.state.falling = engine.falling;
  engine.state.bag = engine.bag.peek(engine.state.options.nextcount ?? 5);
  // block-out: spawn position collides with the stack
  if (collides(engine.state.board, type, x, spawnY, 0)) {
    engine.state.gameover = true;
    engine.state.playing = false;
  }
}

function clearLines(engine: Engine, placed: FallingPiece): ClearResult {
  const board = engine.state.board;
  const w = board[0].length;
  const opts = engine.state.options;
  const fullRows: number[] = [];
  for (let y = 0; y < board.length; y++) {
    if (board[y].every((c) => c !== null)) fullRows.push(y);
  }
  // T-spin detection (all-mini+): T piece, last action was a rotation
  let tspin: 'none' | 'mini' | 'full' = 'none';
  if (placed.type === 't' && engine.rotatingSystem) {
    tspin = detectTspin(board, placed);
  }
  engine.rotatingSystem = false;

  const lines = fullRows.length;
  const kind = lines === 0 ? 'none' : lines === 1 ? 'single' : lines === 2 ? 'double' : lines === 3 ? 'triple' : 'tetris';
  for (const y of fullRows) {
    board.splice(y, 1);
    board.unshift(new Array<Cell>(w).fill(null));
  }
  const allclear = lines > 0 && board.every((row) => row.every((c) => c === null));
  const clearedVisibleRows = fullRows.map((r) => r - BUFFER_ROWS);

  // combo (combo counts consecutive clears; first clear = combo 1)
  if (lines > 0 || tspin !== 'none') {
    engine.combo++;
    engine.stats.currentcombo = engine.combo;
    engine.stats.combomax = Math.max(engine.stats.combomax, engine.combo);
  } else {
    engine.combo = 0;
    engine.stats.currentcombo = 0;
  }

  // b2b: only QUAD+ or FULL spin keeps the chain; mini spins break it.
  const difficult = kind === 'tetris' || tspin === 'full';
  if (difficult) {
    engine.btb++;
  } else if (lines > 0 || tspin === 'mini') {
    engine.btb = 0;
  }
  engine.stats.btb = engine.btb;
  engine.stats.btbmax = Math.max(engine.stats.btbmax, engine.btb);

  // --- attack (EXACT TETR.IO) ---
  let attack = 0;
  if (lines > 0 || tspin !== 'none') {
    let base: number;
    if (tspin === 'full') base = [0, ATTACK_TABLE.tspin_single, ATTACK_TABLE.tspin_double, ATTACK_TABLE.tspin_triple][lines] ?? 0;
    else if (tspin === 'mini') base = [0, ATTACK_TABLE.tspin_mini_single, ATTACK_TABLE.tspin_mini_double, ATTACK_TABLE.tspin_mini_triple][lines] ?? 0;
    else base = [ATTACK_TABLE.single, ATTACK_TABLE.double, ATTACK_TABLE.triple, ATTACK_TABLE.tetris][lines - 1] ?? 0;
    // b2b bonus (+1 when btb > 1)
    const b2bBonus = (engine.btb > 1 && difficult) ? ATTACK_TABLE.b2b_bonus : 0;
    // combo attack: 'multiplier' formula or combotable array
    let comboAttack = 0;
    const combotable = opts.combotable ?? 'multiplier';
    if (combotable === 'multiplier') comboAttack = computeComboAttack(engine.combo);
    else {
      const arr = COMBO_TABLES[combotable] ?? COMBO_TABLES['classic guideline'];
      comboAttack = arr[Math.min(Math.max(engine.combo - 2, 0), arr.length - 1)] ?? 0;
    }
    attack = base + b2bBonus + comboAttack;
    if (allclear) attack += (opts.allclear_garbage ?? ATTACK_TABLE.allclear);
    attack = Math.round(attack * (opts.garbagemultiplier ?? 1));
  }
  if (tspin !== 'none') engine.stats.tspins++;
  if (allclear) engine.stats.allclears++;
  engine.stats.lines += lines;
  engine.stats.garbage.attack += attack;
  engine.stats.garbage.sent += attack;

  // --- score (EXACT TETR.IO: base [x1.5 b2b] + 50*(combo-1) [+3500 AC], all x level) ---
  if (lines > 0 || tspin !== 'none') {
    let base: number;
    if (tspin === 'full') base = [SCORE_TABLE.tspin, SCORE_TABLE.tspin_single, SCORE_TABLE.tspin_double, SCORE_TABLE.tspin_triple][lines] ?? 0;
    else if (tspin === 'mini') base = [SCORE_TABLE.tspin_mini, SCORE_TABLE.tspin_mini_single, SCORE_TABLE.tspin_mini_double, SCORE_TABLE.tspin_mini_triple][lines] ?? 0;
    else base = [SCORE_TABLE.single, SCORE_TABLE.double, SCORE_TABLE.triple, SCORE_TABLE.tetris][lines - 1] ?? 0;
    if (engine.btb > 1 && difficult) base *= SCORE_TABLE.b2b_multiplier;
    let gain = base + SCORE_TABLE.combo * Math.max(0, engine.combo - 1);
    if (allclear) gain += SCORE_TABLE.allclear;
    engine.stats.score += Math.round(gain * engine.stats.level);
  }
  return { kind, tspin, lines, allclear, attack, b2b: engine.btb, combo: engine.combo, clearedRows: clearedVisibleRows };
}

// 3-corner T-spin detection: the T piece's center has 3 of 4 corners filled.
function detectTspin(board: BoardGrid, piece: FallingPiece): 'none' | 'mini' | 'full' {
  // T center cell is the piece position + (1,1) in the 3x3 box.
  const cx = piece.x + 1, cy = Math.floor(piece.y) + 1;
  const filled = (x: number, y: number) => x < 0 || x >= board[0].length || y >= board.length || (y >= 0 && !!board[y][x]);
  // corners relative to center based on rotation; "front" corners point toward the flat side.
  const corners = [
    [cx - 1, cy - 1], [cx + 1, cy - 1], // top-left, top-right
    [cx - 1, cy + 1], [cx + 1, cy + 1], // bottom-left, bottom-right
  ];
  const count = corners.filter(([x, y]) => filled(x, y)).length;
  if (count < 3) return 'none';
  // mini vs full: full if the two "front" corners (facing rotation direction) are filled.
  const frontCorners = piece.r === 0 ? [corners[2], corners[3]] : piece.r === 1 ? [corners[0], corners[2]] : piece.r === 2 ? [corners[0], corners[1]] : [corners[1], corners[3]];
  const frontFilled = frontCorners.filter(([x, y]) => filled(x, y)).length;
  return frontFilled === 2 ? 'full' : 'mini';
}

// ---- rotation with kicks (SRS+ exact) ----
function tryRotate(engine: Engine, dir: -1 | 1 | 2): boolean {
  const f = engine.falling;
  if (!f) return false;
  const board = engine.state.board;
  const from = f.r;
  const to = dir === 2 ? (from + 2) % 4 : (from + (dir === 1 ? 1 : 3)) % 4;
  // 1) basic rotation (no offset)
  if (!collides(board, f.type, f.x, Math.floor(f.y), to)) {
    applyRotation(engine, f, f.x, f.y, to);
    return true;
  }
  // 2) kicks: (x + kx, floor(y) + 0.1 + ky)
  for (const [dx, dy] of kicksFor(f.type, from, to)) {
    const nx = f.x + dx, ny = Math.floor(f.y) + 0.1 + dy;
    if (!collides(board, f.type, nx, Math.floor(ny), to)) {
      applyRotation(engine, f, nx, ny, to);
      return true;
    }
  }
  return false;
}

function applyRotation(engine: Engine, f: FallingPiece, nx: number, ny: number, to: number): void {
  const board = engine.state.board;
  f.x = nx; f.y = ny; f.r = to;
  f.hy = ghostY(board, f.type, f.x, Math.max(0, Math.floor(f.y)), f.r);
  engine.rotatingSystem = true;
  if ((f.lockresets ?? 0) < (engine.state.options.lockresets ?? 15)) {
    f.locking = 0;
    f.rotresets = (f.rotresets ?? 0) + 1;
    f.lockresets = (f.lockresets ?? 0) + 1;
  }
}

// ---- main tick ----
export function tick(engine: Engine, input: InputState): TickEvents {
  const events: TickEvents = {};
  if (!engine.state.playing || engine.state.gameover) return events;
  engine.frame++;
  const opts = engine.state.options;
  const handling = opts as unknown as Handling;
  const f = engine.falling;
  if (!f) return events;
  const board = engine.state.board;

  engine.stats.inputs += countPressed(engine.prevInput, input);

  // --- hold (on press edge) ---
  if (input.hold && !engine.prevInput.hold && !engine.holdLocked) {
    const current = f.type;
    if (engine.hold === null) {
      // first hold: current piece parks, the NEXT queue piece spawns (queue advances once)
      engine.hold = current;
      spawnNext(engine);
    } else {
      // hold SWAP: held piece becomes active, current parks — the queue does NOT advance.
      // (Was popping spawnNext and discarding the popped piece: every swap ate a queue piece.)
      const held = engine.hold;
      engine.hold = current;
      const cells = PIECE_ROTATIONS[held][0];
      const minCy = Math.min(...cells.map((c) => c[1]));
      const swY = BUFFER_ROWS - 1 - minCy;
      const swX = spawnX(held, opts.boardwidth);
      engine.falling = { type: held, x: swX, y: swY, r: 0, locking: 0, lockresets: 0, rotresets: 0, safelock: 0 };
      engine.falling.hy = ghostY(board, held, swX, swY, 0);
      engine.state.falling = engine.falling;
      if (collides(board, held, swX, swY, 0)) { // block-out on swap-in
        engine.state.gameover = true;
        engine.state.playing = false;
      }
    }
    engine.holdLocked = !(opts.infinite_hold ?? false);
    engine.stats.holds++;
    events.hold = true;
    engine.state.hold = { piece: engine.hold, locked: engine.holdLocked };
  }

  // safelock: hard drop is blocked for 7 frames after a lock-delay lock
  if (engine.safelockT > 0) engine.safelockT--;

  // --- hard drop (on press edge) ---
  if (input.hardDrop && !engine.prevInput.hardDrop && (opts.allow_harddrop ?? true) && engine.safelockT === 0) {
    const hdDist = ghostY(board, f.type, f.x, f.y, f.r) - f.y;
    if (hdDist > 0) engine.stats.score += Math.round(hdDist * SCORE_TABLE.harddrop * engine.stats.level);
    f.y = ghostY(board, f.type, f.x, f.y, f.r);
    events.harddrop = true;
    const lockEv = lockPiece(engine);
    Object.assign(events, lockEv);
    // IRS: rotations pressed/held on the lock tick apply to the NEW piece at spawn
    // (the hard-drop branch returns before the normal rotation pass, so they'd be lost).
    applyIRS(engine, input, handling);
    applyGravityStats(engine);
    copyInput(engine.prevInput, input);
    return events;
  }

  // --- rotations (on press edge) ---
  if (input.rotCW && !engine.prevInput.rotCW) { if (tryRotate(engine, 1)) { events.rotate = true; applyDCD(engine, handling); } }
  if (input.rotCCW && !engine.prevInput.rotCCW) { if (tryRotate(engine, -1)) { events.rotate = true; applyDCD(engine, handling); } }
  if (input.rot180 && !engine.prevInput.rot180 && (opts.allow180 ?? true)) { if (tryRotate(engine, 2)) { events.rotate = true; applyDCD(engine, handling); } }

  // --- horizontal movement with DAS/ARR ---
  const arr = handling.arr ?? 2, das = handling.das ?? 10;
  const leftEdge = input.left && !engine.prevInput.left;
  const rightEdge = input.right && !engine.prevInput.right;
  const leftRelease = !input.left && engine.prevInput.left;
  const rightRelease = !input.right && engine.prevInput.right;
  updateShift(engine.lShift, input.left, -1);
  updateShift(engine.rShift, input.right, 1);
  if (leftEdge) engine.lastShiftDir = -1;
  if (rightEdge) engine.lastShiftDir = 1;
  // KeyUp while the other direction is held: switch back to it immediately.
  // With DAS CANCEL on, the resumed direction's charge is RESET (TETR.IO exact:
  // 'if handling.cancel: other dir das=0, arr=handling.arr'). Off (default) = keep the charge.
  const cancel = handling.cancel ?? false;
  if (leftRelease && engine.rShift.held) {
    engine.lastShiftDir = 1;
    if (cancel) { engine.rShift.das = 0; engine.rShift.arr = 0; }
  }
  if (rightRelease && engine.lShift.held) {
    engine.lastShiftDir = -1;
    if (cancel) { engine.lShift.das = 0; engine.lShift.arr = 0; }
  }

  // resolve simultaneous directions (most recent press wins)
  let moveDir: -1 | 0 | 1 = 0;
  if (engine.lShift.held && engine.rShift.held) moveDir = engine.lastShiftDir;
  else if (engine.lShift.held) moveDir = -1;
  else if (engine.rShift.held) moveDir = 1;

  if (moveDir !== 0) {
    const s = moveDir === -1 ? engine.lShift : engine.rShift;
    // immediate move on press edge
    if ((moveDir === -1 && leftEdge) || (moveDir === 1 && rightEdge)) {
      tryMove(engine, moveDir);
    }
    // auto-repeat after DAS
    if (s.das >= das) {
      s.arr += 1;
      const arrFrames = arr <= 0 ? 0.0001 : arr;
      let guard = 0;
      while (s.arr >= arrFrames && guard++ < 64) {
        s.arr -= arrFrames;
        if (!tryMove(engine, moveDir)) break;
      }
    }
  }

  // --- gravity + soft drop (TETR.IO exact: SDF REPLACES gravity) ---
  const sdf = handling.sdf ?? 6;
  const softActive = input.softDrop;
  let gravity = engine.g;
  if (softActive) {
    const may20g = handling.may20g ?? opts.gravitymay20g ?? true;
    gravity = sdf >= 41
      ? (may20g ? Infinity : Math.max(engine.g * 41, 0.05 * 41)) // ∞-SDF needs ALLOW 20G on
      : Math.max(engine.g * sdf, 0.05 * sdf);
  }
  applyGravity(engine, gravity, softActive);

  // grounded -> lock delay
  const grounded = collides(board, f.type, f.x, f.y + 1, f.r);
  if (grounded) {
    f.locking = (f.locking ?? 0) + 1;
    if ((f.locking ?? 0) >= (opts.locktime ?? 30)) {
      const lockEv = lockPiece(engine);
      Object.assign(events, lockEv);
      // safelock: block hard drops for 7 frames after a lock-delay lock
      if (handling.safelock ?? true) engine.safelockT = 7;
    }
  }

  engine.state.g = engine.g;
  engine.state.combo = engine.combo;
  engine.state.btb = engine.btb;
  copyInput(engine.prevInput, input);
  return events;
}

/** IRS (initial rotation system): apply a rotation to the just-spawned piece.
 *  'tap'/'auto': rotation key EDGES on the lock tick accumulate (mod 4) and apply with kicks.
 *  'hold': held rotation keys at the spawn tick apply once. 'none': off. */
function applyIRS(engine: Engine, input: InputState, handling: Handling): void {
  const mode = handling.irs ?? 'tap';
  if (mode === 'none') return;
  const f = engine.falling;
  if (!f) return;
  let r = 0;
  if (mode === 'hold') {
    if (input.rotCW) r += 1;
    if (input.rotCCW) r -= 1;
    if (input.rot180) r += 2;
  } else {
    if (input.rotCW && !engine.prevInput.rotCW) r += 1;
    if (input.rotCCW && !engine.prevInput.rotCCW) r -= 1;
    if (input.rot180 && !engine.prevInput.rot180) r += 2;
  }
  r = ((r % 4) + 4) % 4;
  if (r === 1) tryRotate(engine, 1);
  else if (r === 2) tryRotate(engine, 2);
  else if (r === 3) tryRotate(engine, -1);
}

/** DCD (DAS cut delay): a rotation that ends touching a wall CUTS both DAS charges
 *  by dcd frames (TETR.IO: 'after rotations, if HasHitWall && dcd: das cut, both dirs'). */
function applyDCD(engine: Engine, handling: Handling): void {
  const dcd = handling.dcd ?? 0;
  if (dcd <= 0) return;
  const f = engine.falling;
  if (!f) return;
  const w = engine.state.board[0].length;
  const cells = PIECE_ROTATIONS[f.type][f.r];
  const hitWall = cells.some(([cx]) => { const x = f.x + cx; return x === 0 || x === w - 1; });
  if (hitWall) {
    engine.lShift.das += dcd;
    engine.rShift.das += dcd;
  }
}

function countPressed(prev: InputState, cur: InputState): number {
  let n = 0;
  (Object.keys(cur) as (keyof InputState)[]).forEach((k) => { if (cur[k] && !prev[k]) n++; });
  return n;
}

function updateShift(s: ShiftState, held: boolean, dir: -1 | 1): void {
  if (held && !s.held) { s.held = true; s.das = 0; s.arr = 0; }
  else if (!held) { s.held = false; s.das = 0; s.arr = 0; }
  if (s.held) s.das++;
}

function tryMove(engine: Engine, dir: -1 | 1): boolean {
  const f = engine.falling!;
  const board = engine.state.board;
  if (!collides(board, f.type, f.x + dir, f.y, f.r)) {
    f.x += dir;
    f.hy = ghostY(board, f.type, f.x, Math.max(0, f.y), f.r);
    // movement resets lock (up to lockresets)
    if ((f.lockresets ?? 0) < (engine.state.options.lockresets ?? 15)) {
      f.locking = 0;
      f.lockresets = (f.lockresets ?? 0) + 1;
    }
    return true;
  }
  return false;
}

function applyGravity(engine: Engine, gravity: number, soft: boolean): void {
  const f = engine.falling!;
  const board = engine.state.board;
  if (gravity === Infinity) {
    // 20G soft drop: fall to ghost instantly but don't lock
    const ny = ghostY(board, f.type, f.x, f.y, f.r);
    if (soft && ny > f.y) engine.stats.score += Math.round((ny - f.y) * SCORE_TABLE.softdrop * engine.stats.level);
    f.y = ny;
    return;
  }
  engine.gravityRemainder += gravity;
  let steps = Math.floor(engine.gravityRemainder);
  engine.gravityRemainder -= steps;
  while (steps > 0) {
    if (!collides(board, f.type, f.x, f.y + 1, f.r)) {
      f.y += 1;
      if (soft) engine.stats.score += Math.round(SCORE_TABLE.softdrop * engine.stats.level);
      steps--;
    } else {
      break;
    }
  }
  f.hy = ghostY(board, f.type, f.x, Math.max(0, f.y), f.r);
}

function applyGravityStats(engine: Engine): void {
  const opts = engine.state.options;
  engine.pieces++;
  // gravity increases over time after gmargin
  if (opts.gincrease && opts.gmargin && engine.stats.currentTime > opts.gmargin * 60) {
    engine.g += opts.gincrease;
  }
}

/** Advance time-based gravity. Call once per frame with elapsed frames. */
export function advanceTime(engine: Engine, frames: number): void {
  engine.stats.currentTime += frames;
  const opts = engine.state.options;
  if (opts.gincrease && opts.gmargin && engine.stats.currentTime / 60 > opts.gmargin / 1000) {
    engine.g = Math.min((engine.g ?? 0.02) + opts.gincrease * frames, 20);
  }
  // recompute derived stats
  const sec = engine.stats.currentTime / 60;
  if (sec > 0) {
    engine.stats.pps = engine.stats.piecesplaced / sec;
    engine.stats.apm = (engine.stats.garbage.attack / sec) * 60;
  }
}

/** Receive garbage lines into the board (versus). Returns lines actually added. */
export function receiveGarbage(engine: Engine, lines: number, hole: number): number {
  const board = engine.state.board;
  const w = board[0].length;
  const opts = engine.state.options;
  // attack cancels incoming garbage (garbage blocking / cancel)
  let remaining = lines;
  if ((opts.garbageblocking ?? 'combo blocking') !== 'none') {
    // garbage goes to queue; applied after next piece locks (simplified: apply now)
  }
  for (let i = 0; i < remaining; i++) {
    board.shift();
    const row = new Array<Cell>(w).fill('g' as Cell);
    row[hole] = null;
    board.push(row);
  }
  engine.stats.garbage.received += lines;
  return remaining;
}
