import { LocalGameController } from '../src/game/localgame.js';
import { GameScreen } from '../src/tui/screens/game.js';
import { OpponentTracker } from '../src/game/state.js';
import { TerminalDriver } from '../src/tui/driver.js';

// Use the real driver's CellBuffer-ish path: render two frames and diff
const ctrl = new LocalGameController();
ctrl.start(1, {boardwidth:10, boardheight:20, g:1}, 42);
const screen = new GameScreen({controller: ctrl, opponents: new OpponentTracker(), onExit: ()=>{}, modeLabel:'40L'});

// Access the driver's internals by making a minimal driver subclass
class DbgDriver extends TerminalDriver {
  public dbgPresent(): { out: string; cells: any[] } {
    const back: any = (this as any).back;
    // simulate present diff without writing to stdout
    (this as any).present();
    return { out: '', cells: (this as any).front?.cells ?? [] };
  }
}
