/**
 * The game screen: local board + opponents + stats + effects.
 * Used for versus (league/custom) AND offline practice (solo modes).
 */
import type { RenderBuffer, Screen, KeyEvent, Style, RGB } from '../app.js';
import { THEME, PIECE_COLORS, drawBoard, drawPiecePreview, drawBox, drawBoardBorder, drawPanel, center, pieceColor } from '../draw.js';
import { theme } from '../themes.js';
import { LocalGameController } from '../../game/localgame.js';
import { OpponentTracker } from '../../game/state.js';
import { visibleBoard, BUFFER_ROWS } from '../../game/engine.js';
import { bestPlacement } from '../../game/solver.js';
import { PIECE_ROTATIONS } from '../../game/pieces.js';
import type { BoardGrid, FallingPiece } from '../../types.js';
import { EffectManager } from '../effects.js';
import { playClear, playTSpin, playCombo, playHardDrop, playAllClear, playB2B } from '../sound.js';

export interface GameScreenOpts {
  controller: LocalGameController;
  opponents: OpponentTracker;
  onExit: () => void;
  modeLabel: string;        // e.g. "TETRA LEAGUE", "40 LINES", "BLITZ"
  allowOpponents?: boolean;
  autoPlay?: boolean;      // solver plays the game (demo mode)
}


/** Pre-computed render styles — rebuilt on theme change (avoids per-frame Style alloc). */
let _rs: { _t: any; bgClear: Style; dimS: Style; textBold: Style; accentBold: Style;
  goodBold: Style; badBold: Style; warnBold: Style; borderBrightS: Style; badS: Style; faintS: Style } | null = null;
function rs() {
  const t = theme();
  if (_rs && _rs._t === t) return _rs;
  _rs = { _t: t, bgClear: { bg: t.bg }, dimS: { fg: t.dim }, textBold: { fg: t.text, bold: true },
    accentBold: { fg: t.accent, bold: true }, goodBold: { fg: t.good, bold: true },
    badBold: { fg: t.bad, bold: true }, warnBold: { fg: t.warn, bold: true },
    borderBrightS: { fg: t.borderBright }, badS: { fg: t.bad }, faintS: { fg: t.faint } };
  return _rs;
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
  private autoPlay = false;
  private fx = new EffectManager();
  private _pendingClear: { lines: number; kind: string; tspin: string; attack: number } | null = null;
  private _pendingAllClear = false;

  constructor(opts: GameScreenOpts) {
    this.ctrl = opts.controller;
    this.opponents = opts.opponents;
    this.onExit = opts.onExit;
    this.modeLabel = opts.modeLabel;
    this.keymap = defaultKeymap();
    this.autoPlay = opts.autoPlay ?? false;
    this.ctrl.on('attack', (amt: number) => {
      this.effects.push({ kind: 'attack', frame: this.frame, amount: amt });
      this.shakeFrames = Math.min(8, 2 + amt);
      // Trigger EffectManager shake based on attack amount
      const mag = amt >= 4 ? 'heavy' : amt >= 2 ? 'medium' : 'light';
      this.fx.spawnShake(mag, 0, -1); // upward bias for attacks
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
    if (this.autoPlay) this.driveAutoPlay();
    // run the local engine at ~60fps (accumulate real time)
    const events = this.ctrl.tick();
    this.pumpInput();
    this.opponents.tickAll();
    if (events) {
      if (events.lines && events.lines.lines > 0) {
        const li = events.lines;
        this.effects.push({ kind: 'lineclear', frame: this.frame, amount: li.attack, text: clearText(li) });
        // EffectManager: line clear animation on the board
        // (rows will be computed in render when we know boardY)
        this._pendingClear = { lines: li.lines, kind: li.kind, tspin: li.tspin, attack: li.attack };
        // Sound effects
        if (li.tspin === 'full' || li.tspin === 'mini') {
          void playTSpin();
        } else {
          void playClear(li.kind);
        }
        // Combo sound (rising pitch)
        const eng = this.ctrl.engine;
        const eState = eng?.state;
        if (eState && eState.combo > 1) {
          void playCombo(eState.combo - 1);
        }
        // B2B sound
        if (eState && eState.btb > 1 && eState.btb > this.lastBtb) {
          void playB2B();
        }
        if (eState) {
          this.lastBtb = eState.btb;
          this.lastCombo = eState.combo;
        }
      }
      if (events.lines?.allclear) {
        this.effects.push({ kind: 'allclear', frame: this.frame, text: 'ALL CLEAR' });
        this._pendingAllClear = true;
        void playAllClear();
      }
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

  /** Drive the game with the solver (demo auto-play): place each piece at the best spot, instantly. */
  private autoPlayCooldown = 0;
  private driveAutoPlay(): void {
    const engine = this.ctrl.engine;
    if (!engine || !engine.state.playing || engine.state.gameover) return;
    const f = engine.falling;
    if (!f) return;
    this.ctrl.setInput({ hardDrop: false });
    if (this.autoPlayCooldown > 0) { this.autoPlayCooldown--; return; }
    const board = visibleBoard(engine.state.board);
    const { x, r } = bestPlacement(board, f.type);
    f.r = r;
    f.x = x;
    this.ctrl.setInput({ hardDrop: true });
    this.autoPlayCooldown = 3; // a few settle frames per piece => readable sprint pace
  }

  render(buf: RenderBuffer): void {
    const t = theme();
    const _s = rs();
    buf.fillRect(0, 0, buf.width, buf.height, ' ', _s.bgClear);
    const engine = this.ctrl.engine;
    if (!engine) { center(buf, 10, 'no game', _s.dimS); return; }

    const s = engine.state;
    const board = visibleBoard(s.board);
    const bw = s.options.boardwidth ?? 10;
    const bh = s.options.boardheight ?? 20;
    const boardW = bw * 2;
    const hasOpponents = this.opponents.views.size > 0;

    // shake offset — combine old simple shake with EffectManager's directional shake
    this.fx.advance();
    const oldSx = this.shakeFrames > 0 ? (this.frame % 2 === 0 ? 1 : -1) * Math.min(2, this.shakeFrames) : 0;
    const sx = oldSx + this.fx.shakeX;
    const sy = this.fx.shakeY;

    // layout: hold/stats left, board center, next right, opponents far right
    const panelW = 13;
    const totalW = panelW + 2 + boardW + 2 + panelW + 2 + (hasOpponents ? 14 : 0);
    const startX = Math.max(1, Math.floor((buf.width - totalW) / 2));
    const boardX = startX + panelW + 2 + sx;
    const boardY = Math.max(2, Math.floor((buf.height - bh) / 2) - 1) + sy;

    // title + timer
    center(buf, boardY - 2, this.modeLabel, _s.accentBold);
    const st = s.stats;
    const secs = Math.floor(st.currentTime / 60);
    center(buf, boardY - 1, formatTime(secs), _s.dimS);

    // HOLD panel
    drawPanel(buf, startX, boardY, panelW, 7, 'HOLD');
    drawPiecePreview(buf, startX + 2, boardY + 2, s.hold.piece);

    // STATS panel
    drawPanel(buf, startX, boardY + 8, panelW, 11, 'STATS');
    const sx2 = startX + 2;
    buf.drawText(sx2, boardY + 10, 'APM', _s.dimS);
    buf.drawText(sx2 + 6, boardY + 10, st.apm.toFixed(0), _s.textBold);
    buf.drawText(sx2, boardY + 11, 'PPS', _s.dimS);
    buf.drawText(sx2 + 6, boardY + 11, st.pps.toFixed(2), _s.textBold);
    buf.drawText(sx2, boardY + 12, 'VS', _s.dimS);
    buf.drawText(sx2 + 6, boardY + 12, st.vsscore.toFixed(0), _s.textBold);
    buf.drawText(sx2, boardY + 14, 'ATK', _s.dimS);
    buf.drawText(sx2 + 6, boardY + 14, `${st.garbage.attack}`, _s.accentBold);
    buf.drawText(sx2, boardY + 15, 'SNT', _s.dimS);
    buf.drawText(sx2 + 6, boardY + 15, `${st.garbage.sent}`, _s.goodBold);
    buf.drawText(sx2, boardY + 16, 'RCV', _s.dimS);
    buf.drawText(sx2 + 6, boardY + 16, `${st.garbage.received}`, _s.badBold);

    // main board: strong border + checkerboard interior
    drawBoardBorder(buf, boardX - 1, boardY - 1, boardW + 2, bh + 2, _s.borderBrightS);
    const ghostSet = computeGhostSet(s.falling);
    drawBoard(buf, boardX, boardY, board, { ghostSet });

    // NEXT panel
    const nextX = boardX + boardW + 2;
    drawPanel(buf, nextX, boardY, panelW, 22, 'NEXT');
    for (let i = 0; i < 5 && i < s.bag.length; i++) drawPiecePreview(buf, nextX + 2, boardY + 2 + i * 4, s.bag[i]);

    // garbage incoming indicator (left edge of board)
    const incoming = s.garbage.incoming?.length ?? 0;
    if (incoming > 0) {
      for (let i = 0; i < Math.min(incoming, bh); i++) {
        buf.set(boardX - 2, boardY + bh - 1 - i, '▮', _s.badS);
      }
    }

    // Process pending effects now that we know board coordinates
    if (this._pendingClear) {
      const pc = this._pendingClear;
      this._pendingClear = null;
      const clearKind = pc.kind;
      const isTetris = clearKind === 'tetris';
      const pieceType = 't'; // default piece type for color
      // Trigger line clear animation (visual rows — approximate from bottom)
      const clearRows: number[] = [];
      for (let i = 0; i < pc.lines; i++) clearRows.push(bh - 1 - i);
      this.fx.spawnLineClear(clearRows, bw, pieceType, isTetris);
      // Shake for clears
      const clearMag = isTetris ? 'heavy' : pc.lines >= 3 ? 'medium' : 'light';
      this.fx.spawnShake(clearMag, 0, 1);
      // Big text: clear type over the board (near the cleared rows)
      const clearLabel = clearText(pc as any);
      const clearColor = isTetris ? t.warn : pc.tspin ? t.accent : t.text;
      const clearY = boardY + bh - pc.lines - 2; // just above cleared rows
      const textSize = isTetris || pc.tspin ? 'big' : 'small';
      this.fx.spawnBigText(clearLabel, clearColor as RGB, -1, clearY, textSize as 'big' | 'small', true, 1);
      // Attack amount popup (small, below the clear label)
      if (pc.attack > 0) {
        const atkText = `+${pc.attack}`;
        const atkColor: RGB = pc.attack >= 4 ? [255, 100, 100] : [255, 200, 100];
        this.fx.spawnPopup(atkText, atkColor, -1, clearY + (textSize === 'big' ? 4 : 3), true, 1);
      }
    }
    if (this._pendingAllClear) {
      this._pendingAllClear = false;
      this.fx.spawnAllClear(boardX, boardY, bw);
    }

    // Combo zone: left of board (TETR.IO style — big number on the side)
    const comboZoneX = boardX - 10;
    if (s.combo > 1) {
      this.fx.spawnComboZone(s.combo - 1, [t.warn[0], t.warn[1], t.warn[2]] as RGB, comboZoneX, boardY + bh - 8);
    }
    // B2B zone: below combo
    if (s.btb > 1) {
      this.fx.spawnB2BZone(s.btb - 1, [t.accent[0], t.accent[1], t.accent[2]] as RGB, comboZoneX, boardY + bh - 3);
    }

    // Render all EffectManager overlays
    this.fx.render(buf, boardX, boardY, bw, bh);

    // opponents (right of NEXT)
    let ox = nextX + panelW + 2;
    for (const view of this.opponents.views.values()) {
      if (ox + 12 > buf.width) break;
      const vb = view.board ? visibleBoard(view.board) : null;
      if (vb) drawMiniBoard(buf, ox, boardY, vb, view.alive);
      buf.drawText(ox, boardY + 21, (view.username ?? 'opp').slice(0, 11), { fg: view.alive ? t.dim : t.bad });
      ox += 13;
    }

    // Legacy effects overlay — positioned near the board, rising and fading
    for (const e of this.effects) {
      if (!e.text) continue;
      const age = this.frame - e.frame;
      if (age > 40) continue; // old effects fade completely
      const fadeT = Math.max(0, 1 - age / 40);
      const drift = Math.floor(age / 8);
      const color = e.kind === 'allclear' ? t.good : e.kind === 'attack' ? t.accent : t.warn;
      const dimColor: RGB = [
        Math.round(color[0] * fadeT),
        Math.round(color[1] * fadeT),
        Math.round(color[2] * fadeT),
      ];
      // Position: attack popups appear on the right side of the board
      const popY = boardY + 4 - drift;
      if (popY >= 0 && popY < buf.height) {
        if (e.kind === 'attack') {
          // Right side of board
          const tx = boardX + bw * 2 + 3;
          buf.drawText(tx, popY, e.text + (e.amount ? ` +${e.amount}` : ''), { fg: dimColor, bold: true });
        }
        // lineclear/allclear text is handled by EffectManager now
      }
    }

    center(buf, buf.height - 2, 'esc forfeit', _s.faintS);
  }
}

/** Collision check for a piece at (x, y, r) on a board (used by the auto-play solver). */
function collidesFor(board: BoardGrid, type: string, x: number, y: number, r: number): boolean {
  const shape = PIECE_ROTATIONS[type as keyof typeof PIECE_ROTATIONS]?.[r];
  if (!shape) return true;
  const h = board.length, w = board[0].length;
  for (const [cx, cy] of shape) {
    const bx = x + cx, by = y + cy;
    if (bx < 0 || bx >= w || by >= h) return true;
    if (by >= 0 && board[by][bx]) return true;
  }
  return false;
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
const _ghostSet = new Set<number>();
function computeGhostSet(falling: any): Set<number> | null {
  if (!falling || falling.hy === undefined) return null;
  const cells = PIECE_ROTATIONS[falling.type as keyof typeof PIECE_ROTATIONS][falling.r];
  _ghostSet.clear();
  for (const [cx, cy] of cells) {
    const bx = falling.x + cx, by = Math.floor(falling.hy) + cy - BUFFER_ROWS;
    if (by >= 0 && bx >= 0) _ghostSet.add(by * 256 + bx);
  }
  return _ghostSet;
}

function drawMiniBoard(buf: RenderBuffer, x: number, y: number, grid: BoardGrid, alive: boolean): void {
  const t = theme();
  const h = Math.min(20, grid.length);
  const w = grid[0]?.length ?? 10;
  drawBox(buf, x - 1, y - 1, w + 2, h + 2, { fg: alive ? t.border : t.bad });
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const c = grid[row][col];
      buf.set(x + col, y + row, c ? '█' : ' ', c ? { fg: pieceColor(c) } : {});
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
