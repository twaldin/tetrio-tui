/** Simulate the StartupScreen game loop headlessly: how many pieces until game over? */
import { createGame, startGame, tick, visibleBoard, type Engine, type InputState } from '../src/game/engine.js';
import { bestMove } from '../src/game/solver.js';

const NEUTRAL: InputState = { left: false, right: false, softDrop: false, hardDrop: false, rotCW: false, rotCCW: false, rot180: false, hold: false };

function runGame(seed: number): { pieces: number; frames: number } {
  let e: Engine = createGame({ boardwidth: 10, boardheight: 20, g: 0.02, locktime: 20 } as any, seed);
  startGame(e);
  let frame = 0, holdPulse = false;
  const startPieces = e.state.pieces ?? 0;
  while (!e.state.gameover && frame < 2_000_000) {
    frame++;
    if (frame % 2 === 0) {
      const f = e.falling;
      if (f) {
        const mv = bestMove(visibleBoard(e.state.board), f.type, e.state.bag, e.hold, !e.holdLocked);
        if (mv.useHold && !e.holdLocked && !holdPulse) { tick(e, { ...NEUTRAL, hold: true }); holdPulse = true; continue; }
        f.x = mv.x; f.r = mv.r;
        tick(e, { ...NEUTRAL, hardDrop: true });
        holdPulse = false;
        continue;
      }
    }
    tick(e, NEUTRAL);
  }
  return { pieces: (e.state.pieces ?? 0) - startPieces, frames: frame };
}

for (const seed of [20260810, 12345, 999999]) {
  const r = runGame(seed);
  // at 30fps app loop -> seconds estimate
  console.log(`seed=${seed} gameover after ${r.pieces} pieces, ${r.frames} frames (~${(r.frames / 30).toFixed(0)}s at 30fps)`);
}
