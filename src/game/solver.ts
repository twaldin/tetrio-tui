/**
 * A heuristic Tetris solver for the demo — plays a real, fast, efficient 40-LINES game.
 * Evaluates each placement (x, rotation) with a classic stacker heuristic and picks the best.
 * This drives the engine so the demo shows a genuine completed game.
 */
import type { Engine, InputState } from './engine.js';
import { PIECE_ROTATIONS } from './pieces.js';
import type { BoardGrid, PieceType, Cell } from '../types.js';

interface Placement { x: number; r: number; score: number; landingY: number }

// Heuristic weights (El-Tetris / Dellacherie style, tuned for 40L sprint efficiency).
export const W = {
  aggHeight: -0.5,    // keep the stack low
  holes: -2.0,        // holes are very bad (messy) — strongest penalty
  bumpiness: -0.6,    // keep cols 0..8 flat
  maxHeight: -0.8,    // don't stack high
  rightWell: 0.4,     // gentle Tetris well on the right column
  tetris: 0.8,        // reward Tetrises (4-line clears)
  line: 0.9,          // reward any line clear
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

function evaluate(board: BoardGrid, cleared: number): number {
  const h = board.length, w = board[0].length;
  const heights: number[] = [];
  let holes = 0, aggHeight = 0;
  for (let x = 0; x < w; x++) {
    let colTop = -1;
    for (let y = 0; y < h; y++) {
      if (board[y][x]) { if (colTop === -1) colTop = y; }
      else if (colTop !== -1) holes++;
    }
    const colHeight = colTop === -1 ? 0 : h - colTop;
    heights.push(colHeight);
    aggHeight += colHeight;
  }
  // bumpiness over the stacking columns (exclude the right well column so the well isn't penalized)
  let bumpiness = 0;
  for (let x = 0; x < w - 2; x++) bumpiness += Math.abs(heights[x] - heights[x + 1]);
  const maxHeight = Math.max(...heights);
  // Tetris well on the RIGHT column: reward col (w-1) sitting lower than col (w-2)
  const rightWell = Math.max(0, heights[w - 2] - heights[w - 1]);
  const tetrisBonus = cleared === 4 ? 1 : 0;
  const lineBonus = cleared === 4 ? 0 : cleared;
  return (
    W.aggHeight * aggHeight + W.holes * holes + W.bumpiness * bumpiness + W.maxHeight * maxHeight
    + W.rightWell * rightWell + W.tetris * tetrisBonus + W.line * lineBonus
  );
}

/** Pick the best placement for the current piece. Returns {x, r} of the best placement. */
export function bestPlacement(board: BoardGrid, type: PieceType): { x: number; r: number } {
  const w = board[0].length;
  const startY = -2;
  let best: Placement = { x: 0, r: 0, score: -Infinity, landingY: 0 };
  for (let r = 0; r < 4; r++) {
    for (let x = -2; x < w + 2; x++) {
      if (collides(board, type, x, startY, r)) continue;
      const ly = dropY(board, type, x, startY, r);
      const locked = lockInto(board, type, x, ly, r);
      const { board: cleared, cleared: clearedCount } = clearRows(locked);
      const score = evaluate(cleared, clearedCount);
      if (score > best.score) best = { x, r, score, landingY: ly };
    }
  }
  return { x: best.x, r: best.r };
}
