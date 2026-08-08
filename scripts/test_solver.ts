import { createGame, startGame, tick, NEUTRAL_INPUT, BUFFER_ROWS, visibleBoard, type InputState } from '../src/game/engine.js';
import { bestPlacement } from '../src/game/solver.js';
import { PIECE_ROTATIONS } from '../src/game/pieces.js';

// Play a full 40-lines game with the solver. For each piece: rotate to r, move to x, hard drop.
const engine = createGame({ boardwidth: 10, boardheight: 20, g: 0.02, allow180: true }, 42);
startGame(engine);
engine.state.options.g = 0.02;

function playPiece(): void {
  const f = engine.falling!;
  const board = visibleBoard(engine.state.board);
  const { x, r } = bestPlacement(board, f.type);
  // rotate to r
  while (engine.falling!.r !== r) {
    tick(engine, { ...NEUTRAL_INPUT, rotCW: true });
    tick(engine, NEUTRAL_INPUT);
  }
  // move to x
  let guard = 0;
  while (engine.falling!.x !== x && guard++ < 20) {
    const dir = engine.falling!.x < x ? 'right' : 'left';
    tick(engine, { ...NEUTRAL_INPUT, [dir]: true });
    tick(engine, NEUTRAL_INPUT);
  }
  // hard drop
  tick(engine, { ...NEUTRAL_INPUT, hardDrop: true });
  tick(engine, NEUTRAL_INPUT);
}

let moves = 0;
const start = Date.now();
while (!engine.state.gameover && engine.state.stats.lines < 40 && moves < 300) {
  playPiece();
  moves++;
}
const elapsed = (Date.now() - start) / 1000;
console.log('=== RESULT ===');
console.log('lines cleared:', engine.state.stats.lines);
console.log('pieces placed:', engine.state.stats.piecesplaced);
console.log('gameover:', engine.state.gameover);
console.log('completed 40 lines:', engine.state.stats.lines >= 40);
console.log('simulated in', elapsed.toFixed(2), 's');
console.log('final board:');
const vis = visibleBoard(engine.state.board);
console.log(vis.map((r: any[]) => r.map((c: any) => c ? c.toUpperCase() : '.').join('')).join('\n'));
