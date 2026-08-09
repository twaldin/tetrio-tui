/**
 * Piece definitions: rotation states, spawn data, EXACT TETR.IO SRS+ kicks (from
 * docs/tetrio_constants.json via docs/gamemechanics.md). Board coords: x right, y DOWN.
 * Kick lists EXCLUDE the implicit [0,0] basic-rotation test (try that first, then these).
 * Kick application: (x + kx, floor(y) + 0.1 + ky) per the reference.
 */
import type { PieceType } from '../types.js';

/** Rotation states per piece: [rot][minoIndex] = [x, y] within the piece bounding box. */
export const PIECE_ROTATIONS: Record<PieceType, [number, number][][]> = {
  i: [
    [[0,1],[1,1],[2,1],[3,1]],
    [[2,0],[2,1],[2,2],[2,3]],
    [[0,2],[1,2],[2,2],[3,2]],
    [[1,0],[1,1],[1,2],[1,3]],
  ],
  o: [
    [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[2,1]],
  ],
  t: [
    [[1,0],[0,1],[1,1],[2,1]],
    [[1,0],[1,1],[2,1],[1,2]],
    [[0,1],[1,1],[2,1],[1,2]],
    [[1,0],[0,1],[1,1],[1,2]],
  ],
  s: [
    [[1,0],[2,0],[0,1],[1,1]],
    [[1,0],[1,1],[2,1],[2,2]],
    [[1,1],[2,1],[0,2],[1,2]],
    [[0,0],[0,1],[1,1],[1,2]],
  ],
  z: [
    [[0,0],[1,0],[1,1],[2,1]],
    [[2,0],[1,1],[2,1],[1,2]],
    [[0,1],[1,1],[1,2],[2,2]],
    [[1,0],[0,1],[1,1],[0,2]],
  ],
  l: [
    [[2,0],[0,1],[1,1],[2,1]],
    [[1,0],[1,1],[1,2],[2,2]],
    [[0,1],[1,1],[2,1],[0,2]],
    [[0,0],[1,0],[1,1],[1,2]],
  ],
  j: [
    [[0,0],[0,1],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[1,2]],
    [[0,1],[1,1],[2,1],[2,2]],
    [[1,0],[1,1],[0,2],[1,2]],
  ],
};

export const PIECE_SIZES: Record<PieceType, number> = { i: 4, o: 2, t: 3, s: 3, z: 3, l: 3, j: 3 };

/**
 * Spawn column per SRS/TETR.IO (docs/gamemechanics.md §2): the piece matrix anchor
 * enters at ceil(W/2) - 1 for every piece; absolute cell col = anchor + cx - dx with
 * dx=1 (I/J/L/S/T/Z) or 0 (O). On a 10-wide board that places the occupied spawn
 * columns at I: 3-6, O: 4-5, J/L/S/T/Z: 3-5. PIECE_ROTATIONS cells are used directly
 * (board col = x + cx; O's cells are pre-shifted +1 in x, folding in its dx=0 anchor),
 * so solve x from the piece's leftmost occupied spawn cell.
 */
export function spawnX(type: PieceType, boardWidth: number): number {
  const targetLeft = Math.ceil(boardWidth / 2) - 2 + (type === 'o' ? 1 : 0);
  const minCx = Math.min(...PIECE_ROTATIONS[type][0].map((c) => c[0]));
  return targetLeft - minCx;
}

type Kick = [number, number];
type KickTable = Record<string, Kick[]>;

// EXACT SRS+ tables (kick lists exclude the leading [0,0] basic test).
export const KICKS_JLSTZ: KickTable = {
  '0>1': [[-1,0],[-1,-1],[0,2],[-1,2]],
  '1>0': [[1,0],[1,1],[0,-2],[1,-2]],
  '1>2': [[1,0],[1,1],[0,-2],[1,-2]],
  '2>1': [[-1,0],[-1,-1],[0,2],[-1,2]],
  '2>3': [[1,0],[1,-1],[0,2],[1,2]],
  '3>2': [[-1,0],[-1,1],[0,-2],[-1,-2]],
  '3>0': [[-1,0],[-1,1],[0,-2],[-1,-2]],
  '0>3': [[1,0],[1,-1],[0,2],[1,2]],
  // SRS+'s own 180 table
  '0>2': [[0,-1],[1,-1],[-1,-1],[1,0],[-1,0]],
  '2>0': [[0,1],[-1,1],[1,1],[-1,0],[1,0]],
  '1>3': [[1,0],[1,-2],[1,-1],[0,-2],[0,-1]],
  '3>1': [[-1,0],[-1,-2],[-1,-1],[0,-2],[0,-1]],
};

// SRS+ "symmetric I" kicks
export const KICKS_I: KickTable = {
  '0>1': [[1,0],[-2,0],[-2,1],[1,-2]],
  '1>0': [[-1,0],[2,0],[-1,2],[2,-1]],
  '1>2': [[-1,0],[2,0],[-1,-2],[2,1]],
  '2>1': [[-2,0],[1,0],[-2,-1],[1,2]],
  '2>3': [[2,0],[-1,0],[2,-1],[-1,2]],
  '3>2': [[1,0],[-2,0],[1,-2],[-2,1]],
  '3>0': [[1,0],[-2,0],[1,2],[-2,-1]],
  '0>3': [[-1,0],[2,0],[2,1],[-1,-2]],
  // I-180: single kick each direction
  '0>2': [[0,-1]],
  '2>0': [[0,1]],
  '1>3': [[1,0]],
  '3>1': [[-1,0]],
};

// O piece kicks (O "rotates" with offsets in TETR.IO)
export const KICKS_O: KickTable = {
  '0>1': [[0,-1],[-1,-1],[0,1],[-1,1],[1,0],[1,-1],[1,1]],
  '1>0': [[1,0],[0,-1],[1,1],[1,-1],[-1,0],[-1,-1],[-1,1]],
  '1>2': [[-1,0],[0,-1],[-1,1],[-1,-1],[1,0],[1,-1],[1,1]],
  '2>1': [[0,-1],[1,-1],[0,1],[1,1],[-1,0],[-1,-1],[-1,1]],
  '2>3': [[0,-1],[-1,-1],[0,1],[-1,1],[1,0],[1,-1],[1,1]],
  '3>2': [[1,0],[0,-1],[1,1],[1,-1],[-1,0],[-1,-1],[-1,1]],
  '3>0': [[-1,0],[0,-1],[-1,1],[-1,-1],[1,0],[1,-1],[1,1]],
  '0>3': [[0,-1],[1,-1],[0,1],[1,1],[-1,0],[-1,-1],[-1,1]],
  '0>2': [[0,-1]],
  '2>0': [[0,1]],
  '1>3': [[1,0]],
  '3>1': [[-1,0]],
};

/** Kick table for a rotation. Tries [0,0] basic rotation first (handled by caller), then these. */
export function kicksFor(type: PieceType, from: number, to: number): Kick[] {
  const key = `${from}>${to}`;
  if (type === 'o') return KICKS_O[key] ?? [];
  if (type === 'i') return KICKS_I[key] ?? [];
  return KICKS_JLSTZ[key] ?? [];
}
