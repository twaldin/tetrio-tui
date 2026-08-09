/**
 * B2B-Tetris solver for the 40-LINES demo — plays a pro-style 9-0 side-well game.
 *
 * Strategy (classic side-well / "9-0 stacking"):
 *  - The rightmost column is a permanent Tetris well: NOTHING is ever placed there
 *    except a vertical I that clears exactly 4 lines (a Tetris).
 *  - Every other piece stacks across the remaining 9 columns with ZERO holes, keeping
 *    the bottom rows "Tetris-ready" (full except the well). Four+ full rows = a banked
 *    Tetris: the next I that drops in the well clears it and keeps B2B alive.
 *  - A row can only clear by filling the well column, which only the clearing I does —
 *    so the back-to-back chain can never break accidentally.
 *
 * What makes this version reliable (the old greedy 1-ply version topped out):
 *  - 3-PIECE LOOKAHEAD: a recursive search scores each candidate by the best achievable
 *    leaf two follow-up pieces later (from the preview queue), so the solver plans row
 *    completion ahead — e.g. it finishes the 4th row exactly when an I is next, and
 *    prepares steps for upcoming S/Z pieces (or holds them out of the way entirely).
 *  - HOLD-AWARE: holding is evaluated as a first-class move (place the held piece now,
 *    or stash the current one). I-pieces are saved for the well instead of wasted.
 *  - HARD FILTERS: hole-digging and well-dirtying placements are rejected outright
 *    (not merely penalized) unless every placement would dig a hole — a hole that
 *    survives a Tetris is permanent damage.
 *  - MOBILITY: after our placement every piece type must still have a hole-free
 *    straight-drop spot, or a future piece is forced to dig a hole and ruin the stack.
 */
import { PIECE_ROTATIONS } from './pieces.js';
import { PIECE_TYPES, type BoardGrid, type PieceType, type Cell } from '../types.js';

/** A decided move: optionally swap via HOLD first, then hard-drop at (x, r). */
export interface Move { useHold: boolean; x: number; r: number; score: number }

/** Heuristic weights. */
export const W = {
  tetris: 1_000_000,     // a 4-line clear always wins (keeps the B2B chain alive)
  breakClear: -30_000,   // a non-Tetris clear breaks the B2B chain — avoid unless dying
  nearDeath: -200_000,   // stack at the emergency line: survival overrides B2B
  nearDeathHeight: 17,
  death: -10_000_000,    // piece would lock (partially) above the visible field
  holes: -2000,          // covered cells can never be filled by straight drops
  fullRow: 45,           // a row filled across all non-well columns (Tetris progress)
  rowFill: 1,            // gradient toward completing bottom rows (per filled cell)
  rowFillRows: 10,       // ...within this many bottom rows
  bumpiness: -15,        // keep the non-well surface smooth
  maxHeight: -2,         // keep the stack low
  tall: -15,             // extra penalty per row above the comfort line
  tallHeight: 8,
  danger: -60,           // even more per row above the danger line
  dangerHeight: 13,
  noHome: -500,          // a piece type with no hole-free spot is a future hole
  home: 2,               // small reward per hole-free spot each piece type has (capped)
  homeCap: 3,
  wellBlock: -150,       // junk in the well column (fallback/emergency play only)
  wells: -35,            // Dellacherie-style pits (quadratic) — pits are hole-magnets
  spikes: -40,           // towers sticking up above both neighbors (quadratic past 1)
  iHold: 120,            // an I saved in hold is a likely future Tetris
  fullCap: 6,            // full-row reward saturates here (the next Tetris only needs 4)
};

const START_Y = -4;

function collides(board: BoardGrid, type: PieceType, x: number, y: number, r: number): boolean {
  const cells = PIECE_ROTATIONS[type][r];
  const h = board.length, w = board[0].length;
  for (const [cx, cy] of cells) {
    const bx = x + cx, by = y + cy;
    if (bx < 0 || bx >= w || by >= h) return true;
    if (by >= 0 && board[by][bx]) return true;
  }
  return false;
}

function dropY(board: BoardGrid, type: PieceType, x: number, y: number, r: number): number {
  let gy = y;
  while (!collides(board, type, x, gy + 1, r)) gy++;
  return gy;
}

function lockInto(board: BoardGrid, type: PieceType, x: number, y: number, r: number): BoardGrid {
  const b = board.map((row) => row.slice());
  for (const [cx, cy] of PIECE_ROTATIONS[type][r]) {
    const bx = x + cx, by = y + cy;
    if (by >= 0 && by < b.length && bx >= 0 && bx < b[0].length) b[by][bx] = type as Cell;
  }
  return b;
}

function clearRows(board: BoardGrid): { board: BoardGrid; cleared: number } {
  const w = board[0].length;
  const remaining = board.filter((row) => !row.every((c) => c !== null));
  const cleared = board.length - remaining.length;
  const nb = [...Array.from({ length: cleared }, () => new Array<Cell>(w).fill(null)), ...remaining];
  return { board: nb, cleared };
}

/** Per-column stack heights (empty column = 0). */
function columnHeights(board: BoardGrid): number[] {
  const h = board.length, w = board[0].length;
  const heights = new Array<number>(w).fill(0);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (board[y][x]) { heights[x] = h - y; break; }
    }
  }
  return heights;
}

/** Empty cells with a filled cell somewhere above them in the same column (non-well only). */
function countHoles(board: BoardGrid, heights: number[], wellCol: number): number {
  const h = board.length;
  let holes = 0;
  for (let x = 0; x < heights.length; x++) {
    if (x === wellCol) continue;
    for (let y = h - heights[x]; y < h; y++) {
      if (y >= 0 && !board[y][x]) holes++;
    }
  }
  return holes;
}

/** Rows completely filled across the non-well columns (ready for a Tetris). */
function countFullRows(board: BoardGrid, wellCol: number): number {
  const w = board[0].length;
  let full = 0;
  for (const row of board) {
    let ok = true;
    for (let x = 0; x < w; x++) {
      if (x !== wellCol && !row[x]) { ok = false; break; }
    }
    if (ok) full++;
  }
  return full;
}

/** Filled cells across non-well columns within the bottom `rows` rows. */
function bottomFill(board: BoardGrid, wellCol: number, rows: number): number {
  const h = board.length, w = board[0].length;
  let n = 0;
  for (let y = Math.max(0, h - rows); y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x !== wellCol && board[y][x]) n++;
    }
  }
  return n;
}

/** Sum of |h[x] - h[x+1]| across the non-well columns. */
function bumpiness(heights: number[], wellCol: number): number {
  let bump = 0;
  for (let x = 0; x < heights.length - 1; x++) {
    if (x === wellCol || x + 1 === wellCol) continue;
    bump += Math.abs(heights[x] - heights[x + 1]);
  }
  return bump;
}

/** Mirror of wellsDepth for TOWERS: how far each non-well column sticks up above its
 *  shorter neighbor (past the first free unit, which S/Z steps need), quadratic. */
function spikeHeight(heights: number[], wellCol: number): number {
  const w = heights.length;
  let total = 0;
  for (let x = 0; x < w; x++) {
    if (x === wellCol) continue;
    const left = x > 0 ? (x - 1 === wellCol ? -1 : heights[x - 1]) : 99;
    const right = x < w - 1 ? (x + 1 === wellCol ? -1 : heights[x + 1]) : 99;
    let bound: number;
    if (left < 0 && right < 0) continue;
    else if (left < 0) bound = right;
    else if (right < 0) bound = left;
    else bound = Math.min(left, right);
    const d = heights[x] - bound - 1; // one unit of step is free (S/Z homes)
    if (d > 0) total += (d * (d + 1)) / 2;
  }
  return total;
}

/**
 * Dellacherie-style "wells": how deep each non-well column sits below its neighbors,
 * summed as 1+2+...+depth per pit. Deep pits are hole-magnets (any wide piece bridges
 * them, covering cells) and greedy flattening alone will never refill them, so the
 * gradient of this term is what keeps the stacking surface even. The reserved well
 * column is excluded and does NOT count as a "neighbor wall" for its adjacent column.
 */
function wellsDepth(heights: number[], wellCol: number): number {
  const w = heights.length;
  let total = 0;
  for (let x = 0; x < w; x++) {
    if (x === wellCol) continue;
    const left = x > 0 ? (x - 1 === wellCol ? -1 : heights[x - 1]) : 99;
    const right = x < w - 1 ? (x + 1 === wellCol ? -1 : heights[x + 1]) : 99;
    let bound: number;
    if (left < 0 && right < 0) continue;
    else if (left < 0) bound = right;
    else if (right < 0) bound = left;
    else bound = Math.min(left, right);
    const d = bound - heights[x];
    if (d > 0) total += (d * (d + 1)) / 2;
  }
  return total;
}

/** Unique rotation states per piece (O has 1, I/S/Z have 2, T/L/J have 4). */
const UNIQUE_ROTATIONS: Record<PieceType, number[]> = (() => {
  const out = {} as Record<PieceType, number[]>;
  for (const t of PIECE_TYPES) {
    const seen = new Set<string>();
    const rots: number[] = [];
    PIECE_ROTATIONS[t].forEach((cells, r) => {
      const key = cells.map(([x, y]) => `${x},${y}`).join(';');
      if (!seen.has(key)) { seen.add(key); rots.push(r); }
    });
    out[t] = rots;
  }
  return out;
})();

// ---- bottom profiles: for each (type, rotation), the lowest-cell row offset per
// occupied column. A straight drop is hole-free iff h[x+k] + bottom[k] is the same
// for every occupied column k (the piece's underside exactly matches the terrain).
type Profile = { cols: number[]; bottoms: number[] };
const PROFILES: Record<PieceType, Profile[]> = (() => {
  const out = {} as Record<PieceType, Profile[]>;
  for (const t of PIECE_TYPES) {
    const seen = new Set<string>();
    const list: Profile[] = [];
    for (const cells of PIECE_ROTATIONS[t]) {
      const byCol = new Map<number, number>();
      for (const [cx, cy] of cells) byCol.set(cx, Math.max(byCol.get(cx) ?? -1, cy));
      const cols = [...byCol.keys()].sort((a, b) => a - b);
      const key = cols.join(',') + '|' + cols.map((c) => byCol.get(c)!).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ cols, bottoms: cols.map((c) => byCol.get(c)!) });
    }
    out[t] = list;
  }
  return out;
})();

/** Count hole-free straight-drop spots for `type` on terrain `heights`,
 *  excluding any placement that occupies the well column. */
function mobility(heights: number[], type: PieceType, wellCol: number): number {
  const w = heights.length;
  let count = 0;
  for (const p of PROFILES[type]) {
    for (let x = -3; x < w + 3; x++) {
      let target = -1, ok = true;
      for (let k = 0; k < p.cols.length; k++) {
        const bx = x + p.cols[k];
        if (bx < 0 || bx >= w || bx === wellCol) { ok = false; break; }
        const v = heights[bx] + p.bottoms[k];
        if (target === -1) target = v;
        else if (v !== target) { ok = false; break; }
      }
      if (ok) count++;
    }
  }
  return count;
}

/** Feature-only board evaluation (no line-clear bonuses). */
function evalBoard(board: BoardGrid, wellCol: number): number {
  const heights = columnHeights(board);
  let maxH = 0;
  for (let x = 0; x < heights.length; x++) if (x !== wellCol) maxH = Math.max(maxH, heights[x]);
  const holes = countHoles(board, heights, wellCol);
  // Banked full rows only pay off up to ~5 (the next Tetris clears 4); beyond that
  // they are pure height risk, so the reward saturates.
  const full = Math.min(countFullRows(board, wellCol), W.fullCap);
  const bump = bumpiness(heights, wellCol);
  const wells = wellsDepth(heights, wellCol);
  const spikes = spikeHeight(heights, wellCol);
  const fill = bottomFill(board, wellCol, W.rowFillRows);
  let score = W.holes * holes + W.fullRow * full + W.rowFill * fill
    + W.bumpiness * bump + W.wells * wells + W.spikes * spikes + W.maxHeight * maxH;
  if (maxH > W.tallHeight) score += W.tall * (maxH - W.tallHeight);
  if (maxH > W.dangerHeight) score += W.danger * (maxH - W.dangerHeight);
  if (maxH >= W.nearDeathHeight) score += W.nearDeath;
  if (heights[wellCol] > 0) score += W.wellBlock * heights[wellCol];
  // Mobility: every piece type must keep at least one hole-free home.
  for (const t of PIECE_TYPES) {
    const m = mobility(heights, t, wellCol);
    score += m === 0 ? W.noHome : W.home * Math.min(m, W.homeCap);
  }
  return score;
}

/** Immediate bonus for a simulated clear. */
function clearBonus(cleared: number): number {
  if (cleared >= 4) return W.tetris;
  if (cleared > 0) return W.breakClear;
  return 0;
}

interface Sim {
  x: number; r: number;
  after: BoardGrid;
  cleared: number;
  death: boolean;       // a cell locked above the visible field
  touchesWell: boolean; // occupies the well column
}

/** All unique straight-drop placements of `type` on `board`, simulated. */
function simulate(board: BoardGrid, type: PieceType, wellCol: number): Sim[] {
  const w = board[0].length;
  const out: Sim[] = [];
  for (const r of UNIQUE_ROTATIONS[type]) {
    for (let x = -3; x < w + 3; x++) {
      if (collides(board, type, x, START_Y, r)) continue;
      const ly = dropY(board, type, x, START_Y, r);
      const locked = lockInto(board, type, x, ly, r);
      const { board: after, cleared } = clearRows(locked);
      let death = false, touchesWell = false;
      for (const [cx, cy] of PIECE_ROTATIONS[type][r]) {
        if (x + cx === wellCol) touchesWell = true;
        if (ly + cy < 0) death = true;
      }
      out.push({ x, r, after, cleared, death, touchesWell });
    }
  }
  return out;
}

/** Greedy 1-ply score of a simulated placement (used to shortlist deeper plies). */
function quickScore(sim: Sim, wellCol: number): number {
  return clearBonus(sim.cleared) + (sim.death ? W.death : 0) + evalBoard(sim.after, wellCol);
}

/** Shortlist sizes for the search (per node). */
const LOOKAHEAD_ROOT = 8;
const LOOKAHEAD_DEEP = 6;
/** Search depth in piece placements (root ply + recursive plies). */
const SEARCH_DEPTH = 3;

/** One piece-placement choice within the search tree. */
interface Option {
  piece: PieceType;               // piece to place now
  useHold: boolean;               // whether placing it requires a HOLD swap first
  nextFalling: PieceType | undefined; // falling piece for the child node
  nextHold: PieceType | null;     // hold piece for the child node
  advance: number;                // how many queue entries the child consumes
}

/**
 * Which pieces can be placed at a search node: the falling piece directly, or — if
 * holding is allowed — the held piece (swap), or the next queue piece when hold is
 * empty (the falling piece goes to hold). A Tetris available right now is never worth
 * deferring, so holding an I is disallowed whenever the well is ready.
 */
function placementOptions(
  board: BoardGrid,
  falling: PieceType,
  hold: PieceType | null,
  queue: readonly PieceType[],
  canHold: boolean,
): Option[] {
  const options: Option[] = [{ piece: falling, useHold: false, nextFalling: queue[0], nextHold: hold, advance: 1 }];
  if (canHold && !(falling === 'i' && canTetris(board))) {
    // NOTE: the engine's hold-swap draws AND DISCARDS one bag piece (spawnNext inside
    // the swap), so the piece after a swap is queue[1], not queue[0] — advance=2.
    if (hold !== null && hold !== falling) {
      options.push({ piece: hold, useHold: true, nextFalling: queue[1], nextHold: falling, advance: 2 });
    } else if (hold === null && queue[0] !== undefined && queue[0] !== falling) {
      options.push({ piece: queue[0], useHold: true, nextFalling: queue[1], nextHold: falling, advance: 2 });
    }
  }
  return options;
}

/** Count holes on a board (covered empty cells, non-well columns). */
function holesOf(board: BoardGrid, wellCol: number): number {
  return countHoles(board, columnHeights(board), wellCol);
}

/** Simulate `piece` on `board`, keeping only hole-free, well-preserving placements.
 *  Tiers: [hole-free && well-clean] > [well-clean, holes allowed] > [everything].
 *  Well-dirtying placements that don't clear a Tetris are excluded from the first two
 *  tiers — even a forced hole is less damaging than a blocked well. */
function validSims(board: BoardGrid, piece: PieceType, wellCol: number, holes0: number): { sims: Sim[]; clean: boolean } {
  const sims = simulate(board, piece, wellCol);
  const wellOk = sims.filter((s) => !s.touchesWell || s.cleared === 4);
  const clean = wellOk.filter((s) => holesOf(s.after, wellCol) <= holes0);
  if (clean.length > 0) return { sims: clean, clean: true };
  return { sims: wellOk.length > 0 ? wellOk : sims, clean: false };
}

/**
 * Recursive lookahead value: the best achievable leaf evaluation from this node,
 * accumulating immediate clear/death bonuses along the way. HOLD branches at every
 * level above the leaf ply.
 */
function searchValue(
  board: BoardGrid,
  falling: PieceType | undefined,
  hold: PieceType | null,
  queue: readonly PieceType[],
  depth: number,
  wellCol: number,
): number {
  if (depth === 0 || falling === undefined) return evalBoard(board, wellCol);
  const holes0 = holesOf(board, wellCol);
  const allowHold = depth > 1; // leaf ply: no hold swaps (they add no board information)
  let best = -Infinity;
  for (const opt of placementOptions(board, falling, hold, queue, allowHold)) {
    const { sims } = validSims(board, opt.piece, wellCol, holes0);
    const k = depth > 1 ? LOOKAHEAD_DEEP : LOOKAHEAD_ROOT;
    const ranked = sims
      .map((sim) => ({ sim, q: quickScore(sim, wellCol) }))
      .sort((a, b) => b.q - a.q)
      .slice(0, k);
    for (const { sim } of ranked) {
      const imm = clearBonus(sim.cleared) + (sim.death ? W.death : 0);
      const v = imm + searchValue(sim.after, opt.nextFalling, opt.nextHold, queue.slice(opt.advance), depth - 1, wellCol);
      if (v > best) best = v;
    }
  }
  return best;
}

/**
 * Pick the best move for the falling piece: a 3-piece lookahead (this placement plus
 * two follow-ups from the preview queue) that treats HOLD as a first-class move.
 * `queue` is the preview list (queue[0] = next piece), `hold` the held piece (or
 * null), `canHold` whether HOLD is currently allowed.
 */
export function bestMove(
  board: BoardGrid,
  type: PieceType,
  queue: readonly PieceType[],
  hold: PieceType | null,
  canHold: boolean,
): Move {
  const w = board[0].length;
  const wellCol = w - 1;
  const holes0 = holesOf(board, wellCol);

  let best: Move | null = null;
  let fallback: Move | null = null;
  for (const opt of placementOptions(board, type, hold, queue, canHold)) {
    const { sims, clean } = validSims(board, opt.piece, wellCol, holes0);
    const ranked = sims
      .map((sim) => ({ sim, q: quickScore(sim, wellCol) }))
      .sort((a, b) => b.q - a.q)
      .slice(0, LOOKAHEAD_ROOT);
    for (const { sim } of ranked) {
      const imm = clearBonus(sim.cleared) + (sim.death ? W.death : 0);
      let leaf = imm + searchValue(sim.after, opt.nextFalling, opt.nextHold, queue.slice(opt.advance), SEARCH_DEPTH - 1, wellCol);
      if (opt.nextHold === 'i') leaf += W.iHold; // an I saved in hold is a banked Tetris
      const cand: Move = { useHold: opt.useHold, x: sim.x, r: sim.r, score: leaf };
      if (clean) { if (!best || leaf > best.score) best = cand; }
      else if (!fallback || leaf > fallback.score) fallback = cand;
    }
  }
  return best ?? fallback ?? { useHold: false, x: 3, r: 0, score: -Infinity };
}

/** Pick the best placement for the current piece (1-ply, no hold). Legacy helper. */
export function bestPlacement(board: BoardGrid, type: PieceType): { x: number; r: number } {
  const m = bestMove(board, type, [], null, false);
  return { x: m.x, r: m.r };
}

/** Would an I-piece placed in the well clear a Tetris (4 lines) right now?
 *  The I lands at the BOTTOM of the (empty) well and spans exactly the bottom 4 rows,
 *  so precisely those rows must be full across the non-well columns. */
export function canTetris(board: BoardGrid): boolean {
  const w = board[0].length;
  const h = board.length;
  const wellCol = w - 1;
  for (let y = h - 4; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === wellCol) { if (board[y][x]) return false; } // well must be empty
      else if (!board[y][x]) return false; // every non-well cell of the bottom 4 rows filled
    }
  }
  return true;
}
