import { LocalGameController } from '../src/game/localgame.js';
import { GameScreen } from '../src/tui/screens/game.js';
import { OpponentTracker } from '../src/game/state.js';
class TestBuf {
  width = 110; height = 34;
  cells: any[] = new Array(this.width*this.height).fill(null).map(()=>({ch:' ',fg:-1}));
  set(x:number,y:number,ch:string,st:any) { for(let i=0;i<ch.length;i++){ if(x+i>=0&&x+i<this.width&&y>=0&&y<this.height) this.cells[y*this.width+x+i]={ch:ch[i],fg:st?.fg}; } }
  fillRect(x:number,y:number,w:number,h:number,ch:string,st:any){for(let r=y;r<y+h;r++)for(let c=x;c<x+w;c++)this.set(c,r,ch,st);}
  drawText(x:number,y:number,t:string,st:any){this.set(x,y,t,st);}
  drawBox(x:number,y:number,w:number,h:number,st:any){}
}
const ctrl = new LocalGameController();
ctrl.start(1, {boardwidth:10, boardheight:20, g:1}, 42);
const screen = new GameScreen({controller: ctrl, opponents: new OpponentTracker(), onExit: ()=>{}, modeLabel:'40L'});
const buf = new TestBuf();
screen.render(buf as any);
// print the NEXT region (right side) with piece letters
const bag = ctrl.engine!.state.bag;
console.log('bag:', bag);
for (let y = 2; y < 30; y++) {
  let line = '';
  for (let x = 40; x < 70; x++) line += buf.cells[y*buf.width+x].ch;
  console.log(`y=${y} |${line}|`);
}
