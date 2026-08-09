/**
 * B2B-Tetris solver for the 40-LINES demo — plays a pro-style 9-0 side-well game.
 *
 * Strategy (classic side-well / "9-0 stacking"):
 *  - The rightmost column is a permanent Tetris well: NOTHING is ever placed there
 *    except a vertical I that clears exactly 4 lines (a Tetris).
 *  - Every other piece stacks across the remaining columns with ZERO covered cells
 *    (holes), keeping the bottom rows "Tetris-ready" (full except the well).
 *  - When an I arrives and the bottom 4+ rows are full, it drops into the well:
 *    TETRIS. The back-to-back chain can never break accidentally, because a row
 *    can only clear by filling the well column — which only the clearing I does.
 *
 * The subtlety of 9-0 stacking is that S and Z have NO hole-free placement on a
 * flat surface (their overhang always covers a cell). They need steps: S wants an
 * up-step, Z a down-step (and vice versa for their vertical rotations). So the
 * evaluator rewards MOBILITY: after our placement, every piece type must still
 * have at least one hole-free straight-drop spot (matched via bottom profiles),
 * or a future piece will be forced to dig a hole and ruin the stack.
 */
import { PIECE_ROTATIONS } from './pieces.js';
import { PIECE_TYPES, type BoardGrid, type PieceType, type Cell } from '../types.js';

interface Placement { x: number; r: number; score: number; landingY: number }

/** Heuristic weights. */
export const W = {
  tetris: 100000,   // a 4-line clear always wins (keeps the B2B chain alive)
  holes: -1000,     // covered cells can never be filled by straight drops — prohibited
  noHome: -300,     // a piece type with no hole-free spot is a future hole — avoid
  home: 2,          // small reward per hole-free spot each piece type has (capped)
  homeCap: 4,
  fullRow: 10,      // reward each row filled across all non-well columns (Tetris progress)
  bumpiness: -1.0,  // keep the non-well surface smooth
  maxHeight: -0.6,  // keep the stack low
  panic: -3.0,      // extra penalty per row of height above the panic line
  panicHeight: 13,  // visible rows; above this we get nervous
  emergencyClear: 80, // near death, reward clearing lines to survive (rarely used)
};

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

/** Empty cells with a filled cell somewhere above them in the same column. */
function countHoles(board: BoardGrid, heights: number[]): number {
  const h = board.length, w = board[0].length;
  let holes = 0;
  for (let x = 0; x < w; x++) {
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

/** Sum of |h[x] - h[x+1]| across the non-well columns. */
function bumpiness(heights: number[], wellCol: number): number {
  let bump = 0;
  for (let x = 0; x < heights.length - 1; x++) {
    if (x === wellCol || x + 1 === wellCol) continue;
    bump += Math.abs(heights[x] - heights[x + 1]);
  }
  return bump;
}

// ---- bottom profiles: for each (type, rotation), the lowest-cell row offset per
// occupied column. A straight drop is hole-free iff h[x+k] + bottom[k] is the same
// for every occupied column k (the piece's underside exactly matches the terrain).
type Profile = { cols: number[]; bottoms: number[] };
const PROFILES: Record<PieceType, (Profile | null)[]> = (() => {
  const out = {} as Record<PieceType, (Profile | null)[]>;
  for (const t of PIECE_TYPES) {
    out[t] = PIECE_ROTATIONS[t].map((cells) => {
      const byCol = new Map<number, number>();
      for (const [cx, cy] of cells) byCol.set(cx, Math.max(byCol.get(cx) ?? -1, cy));
      const cols = [...byCol.keys()].sort((a, b) => a - b);
      return { cols, bottoms: cols.map((c) => byCol.get(c)!) };
    });
  }
  return out;
})();

/** Count hole-free straight-drop spots for `type` on terrain `heights`,
 *  excluding any placement that occupies the well column. */
function mobility(heights: number[], type: PieceType, wellCol: number): number {
  const w = heights.length;
  let count = 0;
  const seen = new Set<string>();
  for (let r = 0; r < 4; r++) {
    const p = PROFILES[type][r]!;
    const sig = p.cols.join(',') + '|' + p.bottoms.join(',');
    if (seen.has(sig)) continue;
    seen.add(sig);
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

function evaluate(after: BoardGrid, cleared: number, wellCol: number): number {
  if (cleared === 4) return W.tetris; // Tetris: always the best move, period.
  const heights = columnHeights(after);
  const holes = countHoles(after, heights);
  const fullRows = countFullRows(after, wellCol);
  const bump = bumpiness(heights, wellCol);
  let maxH = 0;
  for (let x = 0; x < heights.length; x++) if (x !== wellCol) maxH = Math.max(maxH, heights[x]);
  const panic = Math.max(0, maxH - W.panicHeight);
  // Mobility: every piece type must keep at least one hole-free home.
  let mob = 0;
  for (const t of PIECE_TYPES) {
    const m = mobility(heights, t, wellCol);
    mob += m === 0 ? W.noHome : W.home * Math.min(m, W.homeCap);
  }
  // Emergency mode (stack dangerously high): reward clearing lines to survive.
  // Normally unreachable — non-well placements cannot clear, and well placements
  // that clear < 4 are filtered out before scoring (see bestPlacement).
  const emergency = cleared > 0 ? W.emergencyClear * cleared : 0;
  return (
    W.holes * holes + W.fullRow * fullRows + W.bumpiness * bump
    + W.maxHeight * maxH + W.panic * panic + mob + emergency
  );
}

/** Pick the best placement for the current piece. Returns {x, r} of the best placement. */
export function bestPlacement(board: BoardGrid, type: PieceType): { x: number; r: number } {
  const w = board[0].length;
  const wellCol = w - 1;
  const startY = -4;
  let best: Placement | null = null;       // allowed placements (well only via Tetris)
  let fallback: Placement | null = null;   // anything, for near-death survival
  for (let r = 0; r < 4; r++) {
    for (let x = -3; x < w + 3; x++) {
      if (collides(board, type, x, startY, r)) continue;
      const ly = dropY(board, type, x, startY, r);
      const locked = lockInto(board, type, x, ly, r);
      const { board: after, cleared } = clearRows(locked);
      let touchesWell = false;
      for (const [cx] of PIECE_ROTATIONS[type][r]) {
        if (x + cx === wellCol) { touchesWell = true; break; }
      }
      const score = evaluate(after, cleared, wellCol);
      const cand: Placement = { x, r, score, landingY: ly };
      if (score > (fallback?.score ?? -Infinity)) fallback = cand;
      // The well column is reserved for Tetrises: reject anything that leaves
      // blocks there without clearing exactly 4 lines.
      if (touchesWell && cleared !== 4) continue;
      if (!best || score > best.score) best = cand;
    }
  }
  const chosen = best ?? fallback!;
  return { x: chosen.x, r: chosen.r };
}
