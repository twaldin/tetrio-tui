/**
 * The game screen: local board + opponents + stats + effects.
 * Used for versus (league/custom) AND offline practice (solo modes).
 */
import type { RenderBuffer, Screen, KeyEvent } from '../app.js';
import { THEME, PIECE_COLORS, drawBoard, drawPiecePreview, drawBox, drawPanel, center } from '../draw.js';
import { LocalGameController } from '../../game/localgame.js';
import { OpponentTracker } from '../../game/state.js';
import { visibleBoard, BUFFER_ROWS } from '../../game/engine.js';
import { PIECE_ROTATIONS } from '../../game/pieces.js';
import type { BoardGrid } from '../../types.js';

export interface GameScreenOpts {
  controller: LocalGameController;
  opponents: OpponentTracker;
  onExit: () => void;
  modeLabel: string;        // e.g. "TETRA LEAGUE", "40 LINES", "BLITZ"
  allowOpponents?: boolean;
}

interface Effect {
  kind: 'lineclear' | 'attack' | 'allclear' | 'lock' | 'tspin' | 'garbage';
  frame: number;
  rows?: number[];
  text?: string;
  amount?: number;
}

export class GameScreen implements Screen {
  readonly name = 'game';
  private ctrl: LocalGameController;
  private opponents: OpponentTracker;
  private onExit: () => void;
  private modeLabel: string;
  private frame = 0;
  private effects: Effect[] = [];
  private lastCombo = 0;
  private lastBtb = 0;
  private shakeFrames = 0;
  private keymap: Record<string, string>;

  constructor(opts: GameScreenOpts) {
    this.ctrl = opts.controller;
    this.opponents = opts.opponents;
    this.onExit = opts.onExit;
    this.modeLabel = opts.modeLabel;
    this.keymap = defaultKeymap();
    this.ctrl.on('attack', (amt: number) => {
      this.effects.push({ kind: 'attack', frame: this.frame, amount: amt });
      this.shakeFrames = Math.min(8, 2 + amt);
    });
  }

  setKeymap(map: Record<string, string>): void { this.keymap = map; }

  onShow(): void {}
  onKey(ev: KeyEvent): void {
    if (ev.key === 'escape') { this.onExit(); return; }
    if (ev.type !== 'down') return;
    const key = this.keymap[ev.key] ?? this.keymap[ev.sequence ?? ''];
    if (!key) return;
    if (ACTION_KEYS.has(key)) {
      // TAP: fire immediately, release next tick (terminals don't send key-up reliably)
      this.ctrl.setKey(key, true);
      this.queueTapRelease(key);
    } else {
      // HOLD: press now; keep alive while key repeats, release after a short idle timeout
      this.ctrl.setKey(key, true);
      this.holdTimers.set(key, Date.now());
    }
  }

  private holdTimers = new Map<string, number>();
  private tapQueue = new Set<string>();
  private queueTapRelease(key: string): void { this.tapQueue.add(key); }
  private static readonly HOLD_RELEASE_MS = 120;

  private pumpInput(): void {
    // release taps after one tick
    for (const key of this.tapQueue) { this.ctrl.setKey(key, false); }
    this.tapQueue.clear();
    // release held keys that stopped repeating
    const now = Date.now();
    for (const [key, t] of this.holdTimers) {
      if (now - t > GameScreen.HOLD_RELEASE_MS) { this.ctrl.setKey(key, false); this.holdTimers.delete(key); }
    }
  }

  update(dtMs: number): void {
    this.frame++;
    // run the local engine at ~60fps (accumulate real time)
    const events = this.ctrl.tick();
    this.pumpInput();
    this.opponents.tickAll();
    if (events) {
      if (events.lines && events.lines.lines > 0) {
        this.effects.push({ kind: 'lineclear', frame: this.frame, amount: events.lines.attack, text: clearText(events.lines) });
      }
      if (events.lines?.allclear) this.effects.push({ kind: 'allclear', frame: this.frame, text: 'ALL CLEAR' });
      if (events.gameover) this.effects.push({ kind: 'garbage', frame: this.frame, text: 'TOP OUT' });
    }
    // age effects (in-place to avoid array allocation)
    let writeIdx = 0;
    for (let i = 0; i < this.effects.length; i++) {
      if (this.frame - this.effects[i].frame < 60) this.effects[writeIdx++] = this.effects[i];
    }
    this.effects.length = writeIdx;
    if (this.shakeFrames > 0) this.shakeFrames--;
  }

  render(buf: RenderBuffer): void {
    buf.fillRect(0, 0, buf.width, buf.height, ' ', { bg: THEME.bg });
    const engine = this.ctrl.engine;
    if (!engine) { center(buf, 10, 'no game', { fg: THEME.dim }); return; }

    const s = engine.state;
    const board = visibleBoard(s.board);
    const bw = s.options.boardwidth ?? 10;
    const bh = s.options.boardheight ?? 20;
    const boardW = bw * 2;
    const hasOpponents = this.opponents.views.size > 0;

    // shake offset
    const sx = this.shakeFrames > 0 ? (this.frame % 2 === 0 ? 1 : -1) * Math.min(2, this.shakeFrames) : 0;

    // layout: hold/stats left, board center, next right, opponents far right
    const panelW = 13;
    const totalW = panelW + 2 + boardW + 2 + panelW + 2 + (hasOpponents ? 14 : 0);
    const startX = Math.max(1, Math.floor((buf.width - totalW) / 2));
    const boardX = startX + panelW + 2 + sx;
    const boardY = Math.max(2, Math.floor((buf.height - bh) / 2) - 1);

    // title + timer
    center(buf, boardY - 2, this.modeLabel, { fg: THEME.accent, bold: true });
    const st = s.stats;
    const secs = Math.floor(st.currentTime / 60);
    center(buf, boardY - 1, formatTime(secs), { fg: THEME.dim });

    // HOLD panel
    drawPanel(buf, startX, boardY, panelW, 7, 'HOLD');
    drawPiecePreview(buf, startX + 2, boardY + 2, s.hold.piece);

    // STATS panel
    drawPanel(buf, startX, boardY + 8, panelW, 11, 'STATS');
    const sx2 = startX + 2;
    buf.drawText(sx2, boardY + 10, 'APM', { fg: THEME.dim });
    buf.drawText(sx2 + 6, boardY + 10, st.apm.toFixed(0), { fg: THEME.text, bold: true });
    buf.drawText(sx2, boardY + 11, 'PPS', { fg: THEME.dim });
    buf.drawText(sx2 + 6, boardY + 11, st.pps.toFixed(2), { fg: THEME.text, bold: true });
    buf.drawText(sx2, boardY + 12, 'VS', { fg: THEME.dim });
    buf.drawText(sx2 + 6, boardY + 12, st.vsscore.toFixed(0), { fg: THEME.text, bold: true });
    buf.drawText(sx2, boardY + 14, 'ATK', { fg: THEME.dim });
    buf.drawText(sx2 + 6, boardY + 14, `${st.garbage.attack}`, { fg: THEME.accent, bold: true });
    buf.drawText(sx2, boardY + 15, 'SNT', { fg: THEME.dim });
    buf.drawText(sx2 + 6, boardY + 15, `${st.garbage.sent}`, { fg: THEME.good, bold: true });
    buf.drawText(sx2, boardY + 16, 'RCV', { fg: THEME.dim });
    buf.drawText(sx2 + 6, boardY + 16, `${st.garbage.received}`, { fg: THEME.bad, bold: true });

    // main board: strong border + checkerboard interior
    drawBox(buf, boardX - 1, boardY - 1, boardW + 2, bh + 2, { fg: THEME.borderBright });
    const ghostSet = computeGhostSet(s.falling);
    drawBoard(buf, boardX, boardY, board, { ghostSet });

    // NEXT panel
    const nextX = boardX + boardW + 2;
    drawPanel(buf, nextX, boardY, panelW, 22, 'NEXT');
    const next = s.bag.slice(0, 5);
    next.forEach((p, i) => drawPiecePreview(buf, nextX + 2, boardY + 2 + i * 4, p));

    // garbage incoming indicator (left edge of board)
    const incoming = s.garbage.incoming?.length ?? 0;
    if (incoming > 0) {
      for (let i = 0; i < Math.min(incoming, bh); i++) {
        buf.set(boardX - 2, boardY + bh - 1 - i, '▮', { fg: THEME.bad });
      }
    }

    // combo / b2b
    if (s.combo > 1) buf.drawText(boardX, boardY + bh + 2, `COMBO x${s.combo - 1}`, { fg: THEME.warn, bold: true });
    if (s.btb > 1) buf.drawText(boardX + 12, boardY + bh + 2, `B2B x${s.btb - 1}`, { fg: THEME.accent, bold: true });

    // opponents (right of NEXT)
    let ox = nextX + panelW + 2;
    for (const view of this.opponents.views.values()) {
      if (ox + 12 > buf.width) break;
      const vb = view.board ? visibleBoard(view.board) : null;
      if (vb) drawMiniBoard(buf, ox, boardY, vb, view.alive);
      buf.drawText(ox, boardY + 21, (view.username ?? 'opp').slice(0, 11), { fg: view.alive ? THEME.dim : THEME.bad });
      ox += 13;
    }

    // effects overlay (floating text)
    let ey = boardY + 8;
    for (const e of this.effects) {
      if (!e.text) continue;
      const age = this.frame - e.frame;
      const color = e.kind === 'allclear' ? THEME.good : e.kind === 'attack' ? THEME.accent : THEME.warn;
      center(buf, ey, e.text + (e.amount ? ` +${e.amount}` : ''), { fg: color, bold: true });
      ey += 1;
    }

    center(buf, buf.height - 2, 'esc forfeit', { fg: THEME.faint });
  }
}

const ACTION_KEYS = new Set(['hardDrop', 'rotateCW', 'rotateCCW', 'rotate180', 'hold', 'reset', 'undo', 'redo']);

function defaultKeymap(): Record<string, string> {
  return {
    left: 'moveLeft', right: 'moveRight', down: 'softDrop',
    space: 'hardDrop', z: 'rotateCCW', x: 'rotateCW', a: 'rotate180',
    c: 'hold', shift: 'hold', r: 'reset', escape: 'exit',
  };
}

/** Packed ghost cell positions (row * 256 + col) — avoids full-board copy. */
function computeGhostSet(falling: any): Set<number> | null {
  if (!falling || falling.hy === undefined) return null;
  const cells = PIECE_ROTATIONS[falling.type as keyof typeof PIECE_ROTATIONS][falling.r];
  const s = new Set<number>();
  for (const [cx, cy] of cells) {
    const bx = falling.x + cx, by = Math.floor(falling.hy) + cy - BUFFER_ROWS;
    if (by >= 0 && bx >= 0) s.add(by * 256 + bx);
  }
  return s;
}

function drawMiniBoard(buf: RenderBuffer, x: number, y: number, grid: BoardGrid, alive: boolean): void {
  // 1-wide minoes for opponents
  const h = Math.min(20, grid.length);
  const w = grid[0]?.length ?? 10;
  drawBox(buf, x - 1, y - 1, w + 2, h + 2, { fg: alive ? THEME.border : THEME.bad });
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const c = grid[row][col];
      buf.set(x + col, y + row, c ? '█' : ' ', c ? { fg: PIECE_COLORS[c] ?? PIECE_COLORS.g } : {});
    }
  }
}

function clearText(lines: { kind: string; tspin: string; lines: number }): string {
  const names: Record<string, string> = { single: 'SINGLE', double: 'DOUBLE', triple: 'TRIPLE', tetris: 'TETRIS' };
  const ts = lines.tspin === 'full' ? 'T-SPIN ' : lines.tspin === 'mini' ? 'T-SPIN MINI ' : '';
  return ts + (names[lines.kind] ?? '');
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
