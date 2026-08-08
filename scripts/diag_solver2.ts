import { LocalGameController } from '../src/game/localgame.js';
import { visibleBoard } from '../src/game/engine.js';
import { bestPlacement } from '../src/game/solver.js';

const ctrl = new LocalGameController();
ctrl.start(1, { boardwidth: 10, boardheight: 20, g: 0.02 }, 42);
let frames = 0;
while (!ctrl.engine!.state.gameover && ctrl.engine!.state.stats.lines < 40 && frames < 3000) {
  const engine = ctrl.engine!;
  const f = engine.falling;
  if (f) {
    const board = visibleBoard(engine.state.board);
    const { x, r } = bestPlacement(board, f.type);
    f.r = r;
    f.x = x;
    // hard drop via input
    ctrl.setInput({ hardDrop: true });
    ctrl.tick();
    ctrl.setInput({ hardDrop: false });
    ctrl.tick();
  }
  frames++;
}
console.log('frames:', frames, 'lines:', ctrl.engine!.state.stats.lines, 'pieces:', ctrl.engine!.state.stats.piecesplaced, 'gameover:', ctrl.engine!.state.gameover);
const vis = visibleBoard(ctrl.engine!.state.board);
console.log(vis.map((r: any[]) => r.map((c: any) => c ? c.toUpperCase() : '.').join('')).join('\n'));
