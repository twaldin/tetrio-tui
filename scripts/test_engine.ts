import { createGame, startGame, tick, NEUTRAL_INPUT, type InputState, receiveGarbage } from '../src/game/engine.js';
import { PIECE_ROTATIONS } from '../src/game/pieces.js';

function renderBoard(engine: any): string {
  const b = engine.state.board.map((r: any[]) => r.slice());
  const f = engine.falling;
  if (f) {
    for (const [cx, cy] of PIECE_ROTATIONS[f.type as keyof typeof PIECE_ROTATIONS][f.r]) {
      const bx = f.x + cx, by = Math.floor(f.y) + cy;
      if (by >= 0 && by < b.length && bx >= 0 && bx < b[0].length) b[by][bx] = f.type;
    }
  }
  return b.map((r: any[]) => r.map((c: any) => c === 'g' ? '▓' : c ? c.toUpperCase() : '.').join('')).join('\n');
}

// TEST 1: line clear. Fill bottom row except column 0, drop an I piece vertically in column 0.
const e = createGame({ boardwidth: 10, boardheight: 20, g: 1 }, 42);
startGame(e);
// Manually set up: fill bottom row except col 0-1
const board = e.state.board;
for (let x = 2; x < 10; x++) board[19][x] = 'i';
// We can't easily control the piece, so let's just verify a manual clear works:
// Actually test the clearLines via a synthetic setup
console.log('--- test 1: gravity + movement ---');
const y0 = e.falling!.y;
for (let i = 0; i < 6; i++) tick(e, NEUTRAL_INPUT);
console.log('gravity moved', e.falling!.type, 'from y', y0, 'to', e.falling!.y);

console.log('--- test 2: move left/right ---');
const x0 = e.falling!.x;
tick(e, { ...NEUTRAL_INPUT, left: true });
tick(e, { ...NEUTRAL_INPUT, left: true });
console.log('moved left from', x0, 'to', e.falling!.x);

console.log('--- test 3: rotation ---');
const r0 = e.falling!.r;
tick(e, { ...NEUTRAL_INPUT, rotCW: true });
console.log('rotated from r', r0, 'to', e.falling!.r);

console.log('--- test 4: play to topout (spam harddrop) ---');
const e3 = createGame({ boardwidth: 10, boardheight: 20, g: 1 }, 7);
startGame(e3);
let frames = 0;
while (!e3.state.gameover && frames < 2000) {
  tick(e3, { ...NEUTRAL_INPUT, hardDrop: true });
  tick(e3, NEUTRAL_INPUT);
  frames++;
}
console.log('topout after', e3.stats.piecesplaced, 'pieces. Final board:');
console.log(renderBoard(e3));

console.log('--- test 5: garbage ---');
const e4 = createGame({ boardwidth: 10, boardheight: 20, g: 1 }, 5);
startGame(e4);
receiveGarbage(e4, 3, 4);
console.log(renderBoard(e4));
