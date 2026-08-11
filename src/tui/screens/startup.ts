/**
 * Startup animation: a fast auto-played mini game — themes + piece styles cycle
 * while the solver rips through pieces. Any key skips. Shown at every launch
 * unless disabled in CONFIG > VIDEO > STARTUP ANIMATION.
 */
import type { RenderBuffer, Screen, KeyEvent, Style } from '../app.js';
import { theme, themeKeys, setTheme, getThemeKey } from '../themes.js';
import { PIECE_STYLE_KEYS, setPieceStyle, getPieceStyleKey } from '../pieceStyles.js';
import { drawBoard, drawBoardBorder, center } from '../draw.js';
import { renderBigTextCentered, measureBigText } from '../bigtext.js';
import { createGame, startGame, tick, visibleBoard, BUFFER_ROWS, type Engine, type InputState } from '../../game/engine.js';
import { bestMove } from '../../game/solver.js';

const NEUTRAL: InputState = { left: false, right: false, softDrop: false, hardDrop: false, rotCW: false, rotCCW: false, rot180: false, hold: false };

export class StartupScreen implements Screen {
  readonly name = 'startup';
  private engine: Engine;
  private frame = 0;
  private holdPulse = false;
  private onDone: () => void;
  /** theme/style the user actually had — restored when the animation ends. */
  private savedTheme: string;
  private savedStyle: string;
  private cycleIdx = 0;

  constructor(onDone: () => void, seed = 20260810) {
    this.onDone = onDone;
    this.savedTheme = getThemeKey();
    this.savedStyle = getPieceStyleKey();
    this.engine = createGame({ boardwidth: 10, boardheight: 20, g: 0.02, locktime: 20 } as any, seed);
    startGame(this.engine);
  }

  onKey(_ev: KeyEvent): void { this.finish(); }

  private finish(): void {
    setTheme(this.savedTheme);
    setPieceStyle(this.savedStyle);
    this.onDone();
  }

  update(dtMs: number): void {
    this.frame++;
    // ~2 engine ticks per render frame at 60fps, turbo placement every other tick
    const e = this.engine;
    if (!e.state.playing || e.state.gameover) {
      // restart a fresh game with a new seed, and CYCLE theme + piece style
      const keys = themeKeys();
      this.cycleIdx = (this.cycleIdx + 1) % keys.length;
      setTheme(keys[this.cycleIdx]);
      setPieceStyle(PIECE_STYLE_KEYS[this.cycleIdx % PIECE_STYLE_KEYS.length]);
      this.engine = createGame({ boardwidth: 10, boardheight: 20, g: 0.02, locktime: 20 } as any, (Date.now() % 0x7ffffffe) + 1);
      startGame(this.engine);
      return;
    }
    // solver drive (turbo): place every other tick
    if (this.frame % 2 === 0) {
      const f = e.falling;
      if (f) {
        const mv = bestMove(visibleBoard(e.state.board), f.type, e.state.bag, e.hold, !e.holdLocked);
        if (mv.useHold && !e.holdLocked && !this.holdPulse) {
          tick(e, { ...NEUTRAL, hold: true });
          this.holdPulse = true;
          return;
        }
        f.x = mv.x; f.r = mv.r;
        tick(e, { ...NEUTRAL, hardDrop: true });
        this.holdPulse = false;
        return;
      }
    }
    tick(e, NEUTRAL);
  }

  render(buf: RenderBuffer): void {
    const t = theme();
    buf.fillRect(0, 0, buf.width, buf.height, ' ', { bg: t.bg });
    const e = this.engine;
    const board = visibleBoard(e.state.board);
    const bw = 10, bh = 20;
    const boardW = bw * 2;
    const boardX = Math.max(1, Math.floor((buf.width - boardW) / 2));
    const boardY = Math.max(3, Math.floor((buf.height - bh) / 2) + 2);
    drawBoardBorder(buf, boardX - 1, boardY - 1, boardW + 2, bh + 2, { fg: t.borderBright });
    drawBoard(buf, boardX, boardY, board, { ghostType: e.falling?.type ?? null, ghostSet: ghostSetFor(e) });
    // falling piece on top
    if (e.falling) {
      const cells = ROT(e.falling.type, e.falling.r);
      const fy = Math.floor(e.falling.y) - BUFFER_ROWS;
      for (const [cx, cy] of cells) {
        const bx = e.falling.x + cx, by = fy + cy;
        if (by >= 0 && bx >= 0) drawMinoCell(buf, boardX + bx * 2, boardY + by, e.falling.type);
      }
    }
    // title over the top
    renderBigTextCentered(buf, Math.floor(buf.width / 2), 1, 'TETR.IO', { fg: t.accent, bold: true }, 'block');
    center(buf, boardY + bh + 2, 't e r m i n a l   c l i e n t', { fg: t.dim });
    center(buf, buf.height - 2, 'press any key', { fg: t.faint });
  }
}

// --- tiny local helpers (avoid pulling in the whole GameScreen) ---
import { PIECE_ROTATIONS } from '../../game/pieces.js';
import { pieceStyleDef } from '../pieceStyles.js';

function ROT(type: string, r: number): number[][] {
  return PIECE_ROTATIONS[type as keyof typeof PIECE_ROTATIONS][r] as unknown as number[][];
}
function drawMinoCell(buf: RenderBuffer, px: number, py: number, type: string): void {
  pieceStyleDef().drawMino(buf, px, py, type);
}
const _gs = new Set<number>();
function ghostSetFor(e: Engine): Set<number> | null {
  const f = e.falling;
  if (!f) return null;
  _gs.clear();
  for (const [cx, cy] of PIECE_ROTATIONS[f.type as keyof typeof PIECE_ROTATIONS][f.r]) {
    const bx = f.x + cx, by = Math.floor(f.hy ?? 0) + cy - BUFFER_ROWS;
    if (by >= 0 && bx >= 0) _gs.add(by * 256 + bx);
  }
  return _gs;
}
