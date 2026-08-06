import { LocalGameController } from '../src/game/localgame.js';
import { GameScreen } from '../src/tui/screens/game.js';
import { OpponentTracker } from '../src/game/state.js';

// Minimal in-memory RenderBuffer for inspection
class TestBuf {
  width = 110; height = 34;
  cells: {ch: string}[] = new Array(this.width * this.height).fill(null).map(() => ({ch: ' '}));
  set(x: number, y: number, ch: string) { if (x>=0&&y>=0&&x<this.width&&y<this.height) { for (let i=0;i<ch.length;i++) this.cells[y*this.width+x+i] = {ch: ch[i]}; } }
  fillRect(x: number, y: number, w: number, h: number, ch: string) { for (let r=y;r<y+h;r++) for (let c=x;c<x+w;c++) this.set(c, r, ch); }
  drawText(x: number, y: number, text: string) { this.set(x, y, text); }
  drawBox(x: number, y: number, w: number, h: number) {}
  render(): string {
    let out = '';
    for (let y = 0; y < this.height; y++) { out += this.cells.slice(y*this.width, (y+1)*this.width).map(c=>c.ch).join('') + '\n'; }
    return out;
  }
}

const ctrl = new LocalGameController();
ctrl.start(1, { boardwidth: 10, boardheight: 20, g: 1 }, 42);
for (let i = 0; i < 5; i++) { ctrl.setKey('hardDrop', true); ctrl.tick(); ctrl.setKey('hardDrop', false); ctrl.tick(); }
const screen = new GameScreen({ controller: ctrl, opponents: new OpponentTracker(), onExit: () => {}, modeLabel: '40 LINES' });
const buf = new TestBuf();
screen.render(buf as any);
console.log(buf.render());
