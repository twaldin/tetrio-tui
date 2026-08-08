import { LocalGameController } from '../src/game/localgame.js';
import { GameScreen } from '../src/tui/screens/game.js';
import { OpponentTracker } from '../src/game/state.js';
import { visibleBoard } from '../src/game/engine.js';
const ctrl = new LocalGameController();
ctrl.start(1, { boardwidth: 10, boardheight: 20, g: 0.02 }, 42);
const screen = new GameScreen({ controller: ctrl, opponents: new OpponentTracker(), onExit: () => {}, modeLabel: '40L', autoPlay: true });
let frames = 0;
while (!ctrl.engine!.state.gameover && ctrl.engine!.state.stats.lines < 40 && frames < 8000) {
  (screen as any).update(16);
  frames++;
}
console.log('frames:', frames, 'lines:', ctrl.engine!.state.stats.lines, 'pieces:', ctrl.engine!.state.stats.piecesplaced, 'gameover:', ctrl.engine!.state.gameover);
const vis = visibleBoard(ctrl.engine!.state.board);
console.log(vis.map((r: any[]) => r.map((c: any) => c ? c.toUpperCase() : '.')).join('\n'));
