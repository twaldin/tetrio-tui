import { createGame, startGame, tick, NEUTRAL_INPUT, visibleBoard, BUFFER_ROWS, type InputState } from '../src/game/engine.js';
import { PIECE_ROTATIONS } from '../src/game/pieces.js';

function render(engine: any): string {
  const b = visibleBoard(engine.state.board).map((r: any[]) => r.slice());
  const f = engine.falling;
  if (f) for (const [cx, cy] of PIECE_ROTATIONS[f.type as keyof typeof PIECE_ROTATIONS][f.r]) {
    const bx = f.x + cx, by = Math.floor(f.y) + cy - BUFFER_ROWS;
    if (by >= 0 && by < b.length && bx >= 0) b[by][bx] = f.type;
  }
  return b.map((r: any[]) => r.map((c: any) => c === 'g' ? '#' : c ? c.toUpperCase() : '.').join('')).join('\n');
}

// movement test
const e = createGame({ boardwidth: 10, boardheight: 20, g: 0.02 }, 42);
startGame(e);
const x0 = e.falling!.x;
tick(e, { ...NEUTRAL_INPUT, right: true }); // press edge -> immediate move
console.log('move right on press:', x0, '->', e.falling!.x, e.falling!.x === x0 + 1 ? 'OK' : 'FAIL');

// DAS/ARR: hold right for 30 frames
for (let i = 0; i < 30; i++) tick(e, { ...NEUTRAL_INPUT, right: true });
console.log('after holding right 30f, x =', e.falling!.x, '(should be near right wall)');

// topout test: fill the buffer zone to force blockout
const e2 = createGame({ boardwidth: 10, boardheight: 20, g: 0.02 }, 1);
startGame(e2);
// fill the visible board + buffer almost to top
for (let y = 0; y < e2.state.board.length; y++) for (let x = 0; x < 10; x++) e2.state.board[y][x] = 'i';
e2.state.board[BUFFER_ROWS - 1] = new Array(10).fill(null); // leave one row
// force a lock that pokes above
let over = false;
for (let i = 0; i < 100 && !over; i++) { tick(e2, { ...NEUTRAL_INPUT, hardDrop: true }); tick(e2, NEUTRAL_INPUT); over = e2.state.gameover; }
console.log('topout detected:', over, 'pieces:', e2.stats.piecesplaced);

// full board render sanity
const e3 = createGame({ boardwidth: 10, boardheight: 20, g: 1 }, 5);
startGame(e3);
for (let i = 0; i < 30; i++) { tick(e3, { ...NEUTRAL_INPUT, hardDrop: true }); tick(e3, NEUTRAL_INPUT); }
console.log('--- board after 30 harddrops ---');
console.log(render(e3));
console.log('gameover:', e3.state.gameover, 'pieces:', e3.stats.piecesplaced, 'lines:', e3.stats.lines);
