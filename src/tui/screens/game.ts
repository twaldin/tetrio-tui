/**
 * The game screen: local board + opponents + stats + effects.
 * Used for versus (league/custom) AND offline practice (solo modes).
 */
import type { RenderBuffer, Screen, KeyEvent, Style, RGB } from '../app.js';
import * as fs from 'node:fs';
import { THEME, PIECE_COLORS, drawBoard, drawPiecePreview, drawBox, drawBoardBorder, drawPanel, center, pieceColor } from '../draw.js';
import { theme, themeWord } from '../themes.js';
import { LocalGameController } from '../../game/localgame.js';
import { OpponentTracker } from '../../game/state.js';
import { visibleBoard, BUFFER_ROWS } from '../../game/engine.js';
import { bestMove } from '../../game/solver.js';
import { PIECE_ROTATIONS } from '../../game/pieces.js';
import type { BoardGrid, FallingPiece } from '../../types.js';
import { EffectManager, dimRGB } from '../effects.js';
import { pieceStyleDef } from '../pieceStyles.js';
import { renderBigTextCentered, renderBigText, measureBigText, comboSize } from '../bigtext.js';
import { playClear, playTSpin, playCombo, playHardDrop, playAllClear, playB2B } from '../sound.js';
import { effectsEnabled, bigTextEnabled } from '../renderPrefs.js';
import { kittyKeyboard } from '../inputMode.js';

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
  /** Versus modes (league/versus) show attack UI; solo sprint modes (40L/blitz/zen/practice) don't. */
  private get isVersus(): boolean { return !['40 LINES', 'BLITZ', 'ZEN', 'PRACTICE'].includes(this.modeLabel); }
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
  /** The TETR.IO-style action-text block on the left of the board (one at a time). */
  private _action: {
    prefix: string | null; clearType: string; size: 'big' | 'small'; color: RGB;
    b2b: number; combo: number; frame: number;
  } | null = null;
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
    if (ev.key === 'escape' && ev.type === 'down') { this.onExit(); return; }
    const key = this.keymap[ev.key] ?? this.keymap[ev.sequence ?? ''];
    if (!key) return;
    this.ilog('key', { key, type: ev.type, repeat: !!ev.repeat, kitty: kittyKeyboard() });
    if (key === 'reset' && ev.type === 'down') { this.pendingTaps.length = 0; this.ctrl.restart(); return; } // retry: restart the game
    if (kittyKeyboard()) {
      // kitty keyboard protocol: real keyup events — exact press/release, no heuristics.
      // OS-level repeats are ignored: the engine's own DAS/ARR drives held-key movement.
      if (ev.repeat) return;
      if (ACTION_KEYS.has(key)) {
        if (ev.type === 'down') this.pendingTaps.push(key);
      } else {
        this.ctrl.setKey(key, ev.type === 'down');
      }
      return;
    }
    if (ev.type !== 'down') return;
    if (ACTION_KEYS.has(key)) {
      // TAP: queue one press per keydown. Each queued press becomes a clean ONE-TICK PULSE on a
      // future engine tick (see tickWithTaps), so rapid presses each register as a fresh press
      // edge. (Setting the key directly here kept the key pinned true across rapid presses —
      // the engine's press-edge detection (`input.x && !prevInput.x`) then never saw a new edge
      // and swallowed every press after the first.)
      this.pendingTaps.push(key);
    } else {
      // HOLD: press now; keep alive while key repeats, release after a short idle timeout
      this.ctrl.setKey(key, true);
      this.holdTimers.set(key, Date.now());
    }
  }

  private holdTimers = new Map<string, number>();
  /** FIFO of queued tap presses (duplicates = multiple presses). Drained one pulse per tick. */
  private pendingTaps: string[] = [];
  /** The tap key pulsed on the immediately previous engine tick (null = any key may fire). */
  private prevPulseKey: string | null = null;
  private static readonly HOLD_RELEASE_MS = 120;

  /**
   * Advance the engine one tick, firing at most one queued tap as a true ONE-TICK PULSE:
   * the key is set true for exactly this tick, then released immediately after, so the
   * engine's press-edge detection (`input.x && !prevInput.x`) sees a fresh edge for every
   * queued press and `prevInput` resets on the following tick.
   *
   * A key that was pulsed on the previous tick is skipped for one tick (its release must be
   * seen by the engine before it can edge again) — a different queued key may fire instead,
   * preserving press order. Max sustained rate per key is 30 presses/sec at 60fps.
   */
  private tickWithTaps(): ReturnType<LocalGameController['tick']> {
    const idx = this.pendingTaps.findIndex((k) => k !== this.prevPulseKey);
    let key: string | null = null;
    if (idx !== -1) {
      key = this.pendingTaps.splice(idx, 1)[0];
      this.ctrl.setKey(key, true);
    }
    const events = this.ctrl.tick();
    if (key !== null) this.ctrl.setKey(key, false);
    this.prevPulseKey = key;
    return events;
  }

  private pumpInput(): void {
    if (kittyKeyboard()) { this.holdTimers.clear(); return; } // real keyups — no timeout heuristic
    // release held keys that stopped repeating
    const now = Date.now();
    for (const [key, t] of this.holdTimers) {
      if (now - t > GameScreen.HOLD_RELEASE_MS) { this.ctrl.setKey(key, false); this.holdTimers.delete(key); }
    }
  }

  private _tickAcc = 0;
  // dev-only input/feel instrumentation: TUI_INPUT_LOG=<file> logs key events + piece-x
  // changes with ms timestamps (DAS/ARR latency measurement, no effect when unset).
  private _ilog: fs.WriteStream | null = null;
  private _lastLogX = -99;
  private ilog(kind: string, data: Record<string, unknown>): void {
    if (!process.env.TUI_INPUT_LOG) return;
    if (!this._ilog) this._ilog = fs.createWriteStream(process.env.TUI_INPUT_LOG, { flags: 'a' });
    this._ilog.write(JSON.stringify({ t: Date.now(), kind, ...data }) + '\n');
  }

  update(dtMs: number): void {
    this.frame++;
    if (this.frame === 2) { const o: any = this.ctrl.engine?.state.options ?? {}; this.ilog('options', { das: o.das, arr: o.arr, dcd: o.dcd, sdf: o.sdf, kitty: kittyKeyboard() }); }
    if (this.autoPlay) this.driveAutoPlay();
    // Run the engine at a true 60fps (1 engine frame = 1/60s) regardless of the render rate —
    // accumulate real elapsed time and tick once per 1/60s. (Was ticking once per 30fps render
    // = half real speed, which made DAS/ARR/gravity 2x too slow.)
    this._tickAcc += dtMs;
    const TICK_MS = 1000 / 60;
    let events: any = null;
    let guard = 0;
    let ticked = false;
    while (this._tickAcc >= TICK_MS && guard++ < 8) {
      this._tickAcc -= TICK_MS;
      const e = this.tickWithTaps();
      if (e) events = e;
      ticked = true;
    }
    const fx = this.ctrl.engine?.falling?.x ?? -1;
    if (fx !== this._lastLogX) { this._lastLogX = fx; this.ilog('move', { x: fx, r: this.ctrl.engine?.falling?.r }); }
    // only release held keys once the engine has actually processed them (a tick) —
    // otherwise a fast press could be released before the engine ever saw it
    if (ticked) this.pumpInput();
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
  private _clearedOnEnd = false;
  private autoPlayCooldown = 0;
  private driveAutoPlay(): void {
    const engine = this.ctrl.engine;
    if (!engine || !engine.state.playing || engine.state.gameover) return;
    const f = engine.falling;
    if (!f) return;
    this.ctrl.setInput({ hardDrop: false, hold: false });
    if (this.autoPlayCooldown > 0) { this.autoPlayCooldown--; return; }
    const board = visibleBoard(engine.state.board);
    // The solver plans the whole 9-0 side-well game: a 3-piece lookahead over the
    // preview queue with HOLD as a first-class move (it saves I-pieces for the well and
    // reroutes S/Z around forced holes). It sustains the full back-to-back Tetris chain.
    const move = bestMove(board, f.type, engine.state.bag, engine.hold, !engine.holdLocked);
    if (move.useHold) {
      // Swap first; the swapped-in piece is placed on a later call (hold locks until then).
      this.ctrl.setInput({ hold: true });
      this.autoPlayCooldown = 3;
      return;
    }
    f.r = move.r;
    f.x = move.x;
    this.ctrl.setInput({ hardDrop: true });
    this.autoPlayCooldown = 7; // calm, readable pace for the demo (~4 PPS)
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
    const fxOn = effectsEnabled();
    const oldSx = fxOn && this.shakeFrames > 0 ? (this.frame % 2 === 0 ? 1 : -1) * Math.min(2, this.shakeFrames) : 0;
    const sx = fxOn ? oldSx + this.fx.shakeX : 0;
    const sy = fxOn ? this.fx.shakeY : 0;

    // layout: hold/stats left, board center, next right, opponents far right
    const panelW = 24;
    const totalW = panelW + 2 + boardW + 2 + panelW + 2 + (hasOpponents ? 14 : 0);
    const startX = Math.max(1, Math.floor((buf.width - totalW) / 2));
    const boardX = startX + panelW + 2 + sx;
    const boardY = Math.max(2, Math.floor((buf.height - bh) / 2) - 1) + sy;

    // title (mode label) — the timer moves into the left stats stack (never on the border row)
    center(buf, boardY - 2, this.modeLabel, _s.accentBold);
    const st = s.stats;
    const secs = Math.floor(st.currentTime / 60);

    // HOLD panel (preview at +1 so its 4-row clear never touches the bottom border)
    drawPanel(buf, startX, boardY, panelW, 6, 'HOLD');
    drawPiecePreview(buf, startX + 2, boardY + 1, s.hold.piece);

    // STATS — plain text at the bottom-left (TETR.IO style), freeing the middle-left for the
    // action-text block. Solo sprint shows PIECES/LINES/TIME/PPS; versus shows APM/PPS/VS/ATK/SNT.
    const sx2 = startX;
    const solo = !this.isVersus;
    if (solo) {
      const isBlitz = this.modeLabel === 'BLITZ';
      if (isBlitz) {
        // Blitz HUD: SCORE is the point of the mode; TIME counts DOWN from the objective.
        buf.drawText(sx2, boardY + 15, 'SCORE', _s.dimS);
        buf.drawText(sx2 + 8, boardY + 15, `${st.score}`, _s.textBold);
        buf.drawText(sx2, boardY + 16, 'LINES', _s.dimS);
        buf.drawText(sx2 + 8, boardY + 16, `${st.lines}`, _s.textBold);
        const obj = this.ctrl.objective;
        const remain = obj && obj.type === 'time' ? Math.max(0, obj.seconds - secs) : secs;
        buf.drawText(sx2, boardY + 17, 'TIME', _s.dimS);
        buf.drawText(sx2 + 8, boardY + 17, formatTime(remain), _s.textBold);
        buf.drawText(sx2, boardY + 18, 'PPS', _s.dimS);
        buf.drawText(sx2 + 8, boardY + 18, st.pps.toFixed(2), _s.textBold);
      } else {
        buf.drawText(sx2, boardY + 15, 'PIECES', _s.dimS);
        buf.drawText(sx2 + 8, boardY + 15, `${st.piecesplaced}`, _s.textBold);
        buf.drawText(sx2, boardY + 16, 'LINES', _s.dimS);
        buf.drawText(sx2 + 8, boardY + 16, `${st.lines}/40`, _s.textBold);
        buf.drawText(sx2, boardY + 17, 'TIME', _s.dimS);
        buf.drawText(sx2 + 8, boardY + 17, formatTime(secs), _s.textBold);
        buf.drawText(sx2, boardY + 18, 'PPS', _s.dimS);
        buf.drawText(sx2 + 8, boardY + 18, st.pps.toFixed(2), _s.textBold);
      }
      // persistent B2B indicator — always show the current back-to-back chain (TETR.IO style)
      if (st.btb > 0 && this.ctrl.result === 'playing') {
        if (bigTextEnabled()) {
          renderBigText(buf, sx2, boardY + 20, `x${st.btb}`, { fg: t.warn, bold: true }, 'block');
          const bw2 = measureBigText(`x${st.btb}`, 'block').width;
          buf.drawText(sx2 + bw2 + 1, boardY + 20 + 3, 'B2B', { fg: t.accent, bold: true });
        } else {
          buf.drawText(sx2, boardY + 20, `B2B x${st.btb}`, { fg: t.warn, bold: true });
        }
      }
    } else {
      buf.drawText(sx2, boardY + 15, 'APM', _s.dimS);
      buf.drawText(sx2 + 6, boardY + 15, st.apm.toFixed(0), _s.textBold);
      buf.drawText(sx2, boardY + 16, 'PPS', _s.dimS);
      buf.drawText(sx2 + 6, boardY + 16, st.pps.toFixed(2), _s.textBold);
      buf.drawText(sx2, boardY + 17, 'VS', _s.dimS);
      buf.drawText(sx2 + 6, boardY + 17, st.vsscore.toFixed(0), _s.textBold);
      buf.drawText(sx2, boardY + 18, 'ATK', _s.dimS);
      buf.drawText(sx2 + 6, boardY + 18, `${st.garbage.attack}`, _s.accentBold);
      buf.drawText(sx2, boardY + 19, 'SNT', _s.dimS);
      buf.drawText(sx2 + 6, boardY + 19, `${st.garbage.sent}`, _s.goodBold);
    }

    // main board: strong border + checkerboard interior
    drawBoardBorder(buf, boardX - 1, boardY - 1, boardW + 2, bh + 2, _s.borderBrightS);
    const ghostSet = computeGhostSet(s.falling);
    drawBoard(buf, boardX, boardY, board, { ghostSet });
    // Draw the ACTIVE (falling) piece in full color — real TETR.IO shows it mid-fall.
    if (s.falling) {
      const style = pieceStyleDef();
      const cells = PIECE_ROTATIONS[s.falling.type as keyof typeof PIECE_ROTATIONS][s.falling.r];
      const fy = Math.floor(s.falling.y) - BUFFER_ROWS;
      for (const [cx, cy] of cells) {
        const bx = s.falling.x + cx, by = fy + cy;
        if (by >= 0 && bx >= 0) style.drawMino(buf, boardX + bx * 2, boardY + by, s.falling.type as any);
      }
    }

    // NEXT panel (previews at +1+i*4 so the last clear never touches the bottom border)
    const nextX = boardX + boardW + 2;
    drawPanel(buf, nextX, boardY, panelW, 22, 'NEXT');
    for (let i = 0; i < 5 && i < s.bag.length; i++) drawPiecePreview(buf, nextX + 2, boardY + 1 + i * 4, s.bag[i]);

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
      if (effectsEnabled()) {
        // Trigger line clear animation (visual rows — approximate from bottom)
        const clearRows: number[] = [];
        for (let i = 0; i < pc.lines; i++) clearRows.push(bh - 1 - i);
        this.fx.spawnLineClear(clearRows, bw, pieceType, isTetris);
        // Shake for clears
        const clearMag = isTetris ? 'heavy' : pc.lines >= 3 ? 'medium' : 'light';
        this.fx.spawnShake(clearMag, 0, 1);
      }
      // TETR.IO-style action text: store the block (rendered on the LEFT of the board).
      // T-SPIN prefix above the clear type; B2B + combo below. One block at a time.
      const isTspin = pc.tspin === 'full' || pc.tspin === 'mini';
      const isBig = isTetris || isTspin;
      const typeNames: Record<string, string> = {
        single: themeWord('single', 'SINGLE'), double: themeWord('double', 'DOUBLE'),
        triple: themeWord('triple', 'TRIPLE'), tetris: themeWord('tetris', 'QUAD'),
      };
      const clearColor = t.text; // clear word is always white (real TETR.IO); prefix/B2B/combo carry the color
      this._action = {
        prefix: pc.tspin === 'full' ? themeWord('tspin', 'T-SPIN') : pc.tspin === 'mini' ? themeWord('tspin_mini', 'MINI T-SPIN') : null,
        clearType: isTspin && pc.lines === 4 ? 'QUAD' : (typeNames[pc.kind] ?? ''),
        size: 'small',
        color: clearColor as RGB,
        b2b: s.btb > 1 ? s.btb - 1 : 0,
        combo: s.combo > 1 ? s.combo - 1 : 0,
        frame: this.frame,
      };
      // Attack counter: the number of lines sent to the enemy — the ONLY big diagonal ASCII.
      // It appears on the right and drifts down-left as it fades (matching the real game).
      // Only in versus modes — solo sprint (40L/blitz/zen/practice) has no opponent, no attack UI.
      if (pc.attack >= 1 && this.ctrl.result === 'playing' && this.isVersus && effectsEnabled()) {
        const atkColor: RGB = pc.attack >= 4 ? [255, 100, 100] : [255, 200, 100];
        this.fx.spawnBigText(`+${pc.attack}`, atkColor, boardX + bw * 2 + panelW + 8, boardY + bh - 8, 'big', true, 0, true, -1, 1);
      }
    }
    if (this._pendingAllClear) {
      this._pendingAllClear = false;
      if (effectsEnabled()) this.fx.spawnAllClear(boardX, boardY, bw);
    }

    // Once the game ends, drop transient text effects (clear popups, combo/b2b) so the
    // completion overlay reads cleanly — run before rendering them, every frame.
    if (this.ctrl.result !== 'playing') this.fx.clearTransient();

    // TETR.IO-style action-text block on the LEFT of the board (T-SPIN prefix / clear type /
    // B2B / N COMBO), one at a time, fading out over ~1.5s.
    if (this._action && this.ctrl.result === 'playing') {
      const a = this._action;
      const age = this.frame - a.frame;
      const LIFE = 50; // frames at the render rate
      if (age > LIFE) {
        this._action = null;
      } else {
        let color = a.color;
        if (age > LIFE * 0.6) color = dimRGB(color, 1 - ((age - LIFE * 0.6) / (LIFE * 0.4)) * 0.85);
        // Anchor to the UNSHAKEN board left edge (boardX includes the shake offset sx, which would
        // push the text off the left edge mid-shake). Unshaken board left = startX + panelW + 2.
        // All action text uses the solid-block font at a UNIFORM height (5 rows).
        const unshakenBoardX = startX + panelW + 2;
        if (bigTextEnabled()) {
          const clearW = measureBigText(a.clearType, 'block').width;
          const ax = Math.max(2, unshakenBoardX - clearW - 2);
          let ay = boardY + 7;
          if (a.prefix) { buf.drawText(ax, ay, a.prefix, { fg: t.accent, bold: true }); ay += 1; }
          renderBigText(buf, ax, ay, a.clearType, { fg: color, bold: true }, 'block'); // solid blocky, uniform height
          ay += 5;
          if (a.b2b > 0) { buf.drawText(ax, ay, `B2B x${a.b2b}`, { fg: t.warn, bold: true }); ay += 1; }
          if (a.combo > 0) {
            renderBigText(buf, ax, ay, String(a.combo), { fg: t.warn, bold: true }, 'block'); // same height as the clear word
            const cw = measureBigText(String(a.combo), 'block').width;
            buf.drawText(ax + cw + 1, ay + 3, 'COMBO', { fg: t.text, bold: true });
          }
        } else {
          // minimal: plain one-line action text, no ASCII art
          const ax = Math.max(2, unshakenBoardX - 16);
          const parts: string[] = [];
          if (a.prefix) parts.push(a.prefix);
          if (a.clearType) parts.push(a.clearType);
          if (a.b2b > 0) parts.push(`B2B x${a.b2b}`);
          if (a.combo > 0) parts.push(`${a.combo} COMBO`);
          buf.drawText(ax, boardY + 7, parts.join(' '), { fg: color, bold: true });
        }
      }
    }

    // Render all EffectManager overlays
    if (effectsEnabled()) this.fx.render(buf, boardX, boardY, bw, bh);

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

    // Game-over overlay: sprint completion (win) or topout.
    // Draw a dark scrim behind the text so it reads over the frozen board stack.
    const result = this.ctrl.result;
    if (result !== 'playing') {
      const cy = boardY + Math.floor(bh / 2) - 4;
      // Clean full-width modal: cover the whole game area (board + panels) so no panel is half-clipped.
      const gcx = Math.floor((startX + nextX + panelW) / 2);
      const scrimX = startX - 1, scrimY = boardY - 1, scrimW = (nextX + panelW) - startX + 2, scrimH = bh + 4; // cover the taller NEXT panel too
      buf.fillRect(scrimX, scrimY, scrimW, scrimH, ' ', { bg: t.bg });
      if (buf.drawBox) buf.drawBox(scrimX, scrimY, scrimW, scrimH, { fg: t.borderSubtle });
      if (result === 'win') {
        const isBlitz = this.modeLabel === 'BLITZ';
        renderBigTextCentered(buf, gcx, cy - 2, isBlitz ? 'TIME UP' : 'CLEAR', { fg: t.good, bold: true }, 'banner');
        const tsec = this.ctrl.finalTime / 60;
        // RESULTS table (real TETR.IO shows one after a sprint/blitz)
        const rs = s.stats;
        const ry = cy + 6;
        const row = (dy: number, k: string, v: string) => {
          buf.drawText(gcx - 11, ry + dy, k, { fg: t.dim });
          buf.drawText(gcx + 3, ry + dy, v, { fg: t.text, bold: true });
        };
        if (isBlitz) {
          // Blitz is scored — show the score first (real TETR.IO does)
          row(0, 'SCORE', `${rs.score}`);
          row(1, 'LINES', `${rs.lines}`);
          row(2, 'PIECES', `${rs.piecesplaced}`);
          row(3, 'PPS', rs.pps.toFixed(2));
          row(4, 'MAX COMBO', `${rs.combomax}`);
          row(5, 'MAX B2B', `${rs.btbmax}`);
        } else {
          row(0, 'PIECES', `${rs.piecesplaced}`);
          row(1, 'LINES', `${rs.lines}/40`);
          row(2, 'TIME', `${tsec.toFixed(2)}s`);
          row(3, 'PPS', rs.pps.toFixed(2));
          row(4, 'MAX COMBO', `${rs.combomax}`);
          row(5, 'MAX B2B', `${rs.btbmax}`);
        }
        center(buf, ry + 7, 'esc back', _s.dimS);
      } else {
        renderBigTextCentered(buf, gcx, cy, 'TOP OUT', { fg: t.bad, bold: true }, 'banner');
        center(buf, cy + 8, 'esc back', _s.dimS);
      }
    } else {
      center(buf, buf.height - 2, 'esc forfeit', _s.faintS);
    }
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
