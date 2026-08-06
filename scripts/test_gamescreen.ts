import { LocalGameController } from '../src/game/localgame.js';
import { visibleBoard } from '../src/game/engine.js';

const ctrl = new LocalGameController();
ctrl.start(1, { boardwidth: 10, boardheight: 20, g: 1 }, 42);
// harddrop 5 pieces
for (let i = 0; i < 5; i++) {
  ctrl.setKey('hardDrop', true);
  ctrl.tick();
  ctrl.setKey('hardDrop', false);
  ctrl.tick();
}
const s = ctrl.engine!.state;
console.log('pieces placed:', s.stats.piecesplaced);
console.log('board (visible) rows with content:');
const vis = visibleBoard(s.board);
vis.forEach((row, i) => {
  const line = row.map((c) => (c === 'g' ? '#' : c ? c.toUpperCase() : '.')).join('');
  if (line.replace(/\./g, '').length > 0) console.log(`row ${i}: ${line}`);
});
console.log('falling:', s.falling?.type, 'x', s.falling?.x, 'y', s.falling?.y, 'hy', s.falling?.hy);
