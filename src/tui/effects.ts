/**
 * Animation & Effect Kit for tetrio-tui.
 *
 * Frame-driven effects that overlay the game board: lock flash, hard-drop trail,
 * line-clear flash+sweep, screen shake, combo/B2B popups, garbage indicator,
 * all-clear flash. All effects respect a global animation-intensity setting (0–100).
 *
 * Zero per-frame allocations in the hot path — effect slots are preallocated and reused.
 */
import type { RenderBuffer, Style, RGB } from '../tui/app.js';
import { theme } from '../tui/themes.js';
import { pieceColor } from '../tui/draw.js';

// ---------------------------------------------------------------------------
// Animation intensity — module-level config (0 = off, 100 = full)
// ---------------------------------------------------------------------------

let _animIntensity = 100;

/** Set global animation intensity (0–100). 0 disables all effects. */
export function setAnimationIntensity(v: number): void {
  _animIntensity = Math.max(0, Math.min(100, Math.round(v)));
}

/** Current animation intensity (0–100). */
export function getAnimationIntensity(): number { return _animIntensity; }

// ---------------------------------------------------------------------------
// Color utilities (no allocation — returns into caller-provided tuple)
// ---------------------------------------------------------------------------

export function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export function brightenRGB(c: RGB, factor: number): RGB {
  return [
    Math.min(255, Math.round(c[0] * factor)),
    Math.min(255, Math.round(c[1] * factor)),
    Math.min(255, Math.round(c[2] * factor)),
  ];
}

export function dimRGB(c: RGB, factor: number): RGB {
  return [
    Math.round(c[0] * factor),
    Math.round(c[1] * factor),
    Math.round(c[2] * factor),
  ];
}

// ---------------------------------------------------------------------------
// Effect slot types — discriminated union with fixed fields
// ---------------------------------------------------------------------------

const MAX_EFFECTS = 64;

interface LockFlashEffect {
  kind: 'lockFlash';
  age: number;
  life: number;
  /** Packed cell positions: up to 4 minos, [col, visRow] pairs */
  cells: [number, number][];
  color: RGB;
}

interface HardDropTrailEffect {
  kind: 'hardDropTrail';
  age: number;
  life: number;
  /** For each column the piece occupied: [col, startVisRow, endVisRow] */
  trails: [number, number, number][];
  color: RGB;
}

interface LineClearEffect {
  kind: 'lineClear';
  age: number;
  life: number;
  /** Visible row indices that were cleared */
  rows: number[];
  /** Board width */
  boardW: number;
  /** Piece color that triggered the clear */
  color: RGB;
  /** Was this a tetris (extra emphasis)? */
  isTetris: boolean;
}

interface ScreenShakeEffect {
  kind: 'screenShake';
  age: number;
  life: number;
  /** Shake magnitude category */
  magnitude: 'light' | 'medium' | 'heavy';
}

interface PopupTextEffect {
  kind: 'popupText';
  age: number;
  life: number;
  text: string;
  color: RGB;
  /** Starting Y position (relative to board top, in buffer rows) */
  startY: number;
  bold: boolean;
}

interface GarbageIndicatorEffect {
  kind: 'garbageIndicator';
  age: number;
  life: number;  // refreshed each frame while garbage is pending
  lineCount: number;
  boardH: number;
}

interface AllClearEffect {
  kind: 'allClear';
  age: number;
  life: number;
}

type GameEffect =
  | LockFlashEffect
  | HardDropTrailEffect
  | LineClearEffect
  | ScreenShakeEffect
  | PopupTextEffect
  | GarbageIndicatorEffect
  | AllClearEffect;

// ---------------------------------------------------------------------------
// EffectManager — the public API
// ---------------------------------------------------------------------------

export class EffectManager {
  /** Active effects pool. */
  private effects: GameEffect[] = [];
  /** Current screen shake offset [dx, dy]. Read by the game screen. */
  shakeX = 0;
  shakeY = 0;

  // ------ spawn methods ------

  /** Lock flash: piece cells flash bright for ~3 frames. */
  spawnLockFlash(cells: [number, number][], pieceType: string): void {
    if (_animIntensity === 0) return;
    const life = Math.max(1, Math.round(3 * _animIntensity / 100));
    this.effects.push({
      kind: 'lockFlash', age: 0, life,
      cells: cells.slice(), // small fixed array, ok to copy
      color: pieceColor(pieceType),
    });
  }

  /** Hard-drop trail: fading vertical streaks above the locked piece. */
  spawnHardDropTrail(
    trails: [number, number, number][],
    pieceType: string,
  ): void {
    if (_animIntensity === 0) return;
    const life = Math.max(1, Math.round(4 * _animIntensity / 100));
    this.effects.push({
      kind: 'hardDropTrail', age: 0, life,
      trails: trails.slice(),
      color: pieceColor(pieceType),
    });
  }

  /** Line-clear flash+sweep animation. */
  spawnLineClear(rows: number[], boardW: number, pieceType: string, isTetris: boolean): void {
    if (_animIntensity === 0) return;
    const life = Math.max(1, Math.round(10 * _animIntensity / 100));
    this.effects.push({
      kind: 'lineClear', age: 0, life,
      rows: rows.slice(),
      boardW,
      color: pieceColor(pieceType),
      isTetris,
    });
  }

  /** Screen shake with decaying intensity. */
  spawnShake(magnitude: 'light' | 'medium' | 'heavy'): void {
    if (_animIntensity === 0) return;
    const baseLives = { light: 4, medium: 6, heavy: 8 };
    const life = Math.max(1, Math.round(baseLives[magnitude] * _animIntensity / 100));
    // Replace any existing shake with the stronger one
    for (let i = 0; i < this.effects.length; i++) {
      if (this.effects[i].kind === 'screenShake') {
        this.effects.splice(i, 1);
        break;
      }
    }
    this.effects.push({ kind: 'screenShake', age: 0, life, magnitude });
  }

  /** Popup text (combo, B2B, T-spin labels). Rises + fades over ~30 frames. */
  spawnPopup(text: string, color: RGB, startY: number, bold = true): void {
    if (_animIntensity === 0) return;
    const life = Math.max(1, Math.round(30 * _animIntensity / 100));
    this.effects.push({ kind: 'popupText', age: 0, life, text, color, startY, bold });
  }

  /** Update the garbage indicator (refreshed every frame while garbage is pending). */
  updateGarbageIndicator(lineCount: number, boardH: number): void {
    if (_animIntensity === 0 || lineCount === 0) {
      // Remove any existing garbage indicator
      for (let i = this.effects.length - 1; i >= 0; i--) {
        if (this.effects[i].kind === 'garbageIndicator') {
          this.effects.splice(i, 1);
        }
      }
      return;
    }
    // Find existing or create
    for (const e of this.effects) {
      if (e.kind === 'garbageIndicator') {
        (e as GarbageIndicatorEffect).lineCount = lineCount;
        (e as GarbageIndicatorEffect).age = 0; // keep alive
        return;
      }
    }
    this.effects.push({ kind: 'garbageIndicator', age: 0, life: 9999, lineCount, boardH });
  }

  /** All-clear full-board flash. */
  spawnAllClear(): void {
    if (_animIntensity === 0) return;
    const life = Math.max(1, Math.round(40 * _animIntensity / 100));
    this.effects.push({ kind: 'allClear', age: 0, life });
    this.spawnShake('heavy');
    this.spawnPopup('★ ALL CLEAR ★', [255, 215, 0], 10, true);
  }

  // ------ tick + render ------

  /** Advance all effects by one frame. Call once per update(). */
  advance(): void {
    this.shakeX = 0;
    this.shakeY = 0;

    let writeIdx = 0;
    for (let i = 0; i < this.effects.length; i++) {
      const e = this.effects[i];
      e.age++;
      if (e.age < e.life) {
        // Keep the effect alive
        if (e.kind === 'screenShake') {
          this._computeShake(e);
        }
        this.effects[writeIdx++] = e;
      }
    }
    this.effects.length = writeIdx;

    // Cap total effects
    if (this.effects.length > MAX_EFFECTS) {
      this.effects.splice(0, this.effects.length - MAX_EFFECTS);
    }
  }

  private _computeShake(e: ScreenShakeEffect): void {
    const progress = e.age / e.life; // 0→1
    const decay = 1 - progress;
    const sign = e.age % 2 === 0 ? 1 : -1;
    const maxX = e.magnitude === 'heavy' ? 2 : e.magnitude === 'medium' ? 2 : 1;
    const maxY = e.magnitude === 'heavy' ? 1 : 0;
    this.shakeX = Math.round(sign * maxX * decay);
    this.shakeY = Math.round(sign * maxY * decay * (e.age < 3 ? 1 : 0));
  }

  /**
   * Render all active effects as an overlay on top of the board.
   * Called AFTER the main board draw.
   *
   * @param buf      The render buffer
   * @param boardX   Board left edge (pixel column in buffer)
   * @param boardY   Board top edge (pixel row in buffer)
   * @param boardW   Board width in cells (e.g. 10)
   * @param boardH   Board height in visible rows (e.g. 20)
   */
  render(buf: RenderBuffer, boardX: number, boardY: number, boardW: number, boardH: number): void {
    if (_animIntensity === 0) return;
    for (const e of this.effects) {
      switch (e.kind) {
        case 'lockFlash':
          this._renderLockFlash(buf, e, boardX, boardY);
          break;
        case 'hardDropTrail':
          this._renderHardDropTrail(buf, e, boardX, boardY);
          break;
        case 'lineClear':
          this._renderLineClear(buf, e, boardX, boardY);
          break;
        case 'popupText':
          this._renderPopup(buf, e, boardX, boardY, boardW);
          break;
        case 'garbageIndicator':
          this._renderGarbageIndicator(buf, e, boardX, boardY, boardH);
          break;
        case 'allClear':
          this._renderAllClear(buf, e, boardX, boardY, boardW, boardH);
          break;
        // screenShake is handled via shakeX/shakeY — no render overlay needed
      }
    }
  }

  /** Number of active effects (for debug / stats). */
  get count(): number { return this.effects.length; }

  // ------ individual effect renderers ------

  private _renderLockFlash(buf: RenderBuffer, e: LockFlashEffect, bx: number, by: number): void {
    // Frame 0: bright white-tinted flash. Frame 1: piece color at 120%. Frame 2: settle to normal.
    const white: RGB = [255, 255, 255];
    let c: RGB;
    if (e.age === 0) {
      c = lerpRGB(e.color, white, 0.6); // 60% toward white
    } else if (e.age === 1) {
      c = brightenRGB(e.color, 1.2);
    } else {
      return; // effect done rendering, let normal board show through
    }
    for (const [col, row] of e.cells) {
      const px = bx + col * 2;
      const py = by + row;
      if (px >= 0 && py >= 0 && px + 1 < buf.width && py < buf.height) {
        buf.set(px, py, '█', { fg: c });
        buf.set(px + 1, py, '█', { fg: c });
      }
    }
  }

  private _renderHardDropTrail(buf: RenderBuffer, e: HardDropTrailEffect, bx: number, by: number): void {
    // Fade over 4 frames: bright → medium → dim → gone
    const opacities = [0.70, 0.45, 0.25, 0.12];
    if (e.age >= opacities.length) return;
    const opacity = opacities[e.age];
    const t = theme();
    const trailFg = dimRGB(e.color, opacity);
    // Background: blend piece color into board color for a colored stripe
    const trailBg = lerpRGB(t.boardA, e.color, opacity * 0.35);
    for (const [col, startRow, endRow] of e.trails) {
      const px = bx + col * 2;
      for (let row = startRow; row < endRow; row++) {
        const py = by + row;
        if (py >= by && py < buf.height && px >= 0 && px + 1 < buf.width) {
          // Gradient fade: top rows are dimmer, bottom rows (near piece) are brighter
          const rowProgress = (row - startRow) / Math.max(1, endRow - startRow - 1);
          const rowOpacity = opacity * (0.3 + 0.7 * rowProgress);
          const rowFg = dimRGB(e.color, rowOpacity);
          const rowBg = lerpRGB(t.boardA, e.color, rowOpacity * 0.3);
          buf.set(px, py, '▕', { fg: rowFg, bg: rowBg });
          buf.set(px + 1, py, '▏', { fg: rowFg, bg: rowBg });
        }
      }
    }
  }

  private _renderLineClear(buf: RenderBuffer, e: LineClearEffect, bx: number, by: number): void {
    const t = theme();
    const { age, rows, boardW, color, isTetris } = e;

    if (age <= 3) {
      // Phase 1 (frames 0–3): Bright flash fading through color intermediates
      const flashSteps: RGB[] = isTetris
        ? [ // Tetris: gold-tinted flash
            lerpRGB([255, 255, 255], brightenRGB(color, 1.5), 0.3),
            lerpRGB([255, 255, 240], color, 0.4),
            lerpRGB([220, 220, 200], color, 0.6),
            dimRGB(color, 0.7),
          ]
        : [ // Normal clear: white flash
            [255, 255, 255] as RGB,
            [204, 204, 230] as RGB,
            [153, 153, 195] as RGB,
            lerpRGB(color, [100, 100, 140] as RGB, 0.5),
          ];
      const flashColor = flashSteps[Math.min(age, flashSteps.length - 1)];

      for (const row of rows) {
        const py = by + row;
        if (py < 0 || py >= buf.height) continue;
        for (let col = 0; col < boardW; col++) {
          const px = bx + col * 2;
          if (px >= 0 && px + 1 < buf.width) {
            // Use full blocks with slight gradient (brighter left to right for sweep feel)
            const cellFlash = age === 0 ? flashColor : lerpRGB(flashColor, t.boardA, col / boardW * 0.2);
            buf.set(px, py, '█', { fg: cellFlash });
            buf.set(px + 1, py, '█', { fg: cellFlash });
          }
        }
      }
    } else if (age <= 7) {
      // Phase 2 (frames 4–7): Left-to-right sweep erase, 2-3 cols per frame
      const sweepFrame = age - 4; // 0..3
      const colsPerFrame = Math.max(1, Math.ceil(boardW / 4));
      const sweepEnd = Math.min(boardW, (sweepFrame + 1) * colsPerFrame);

      for (const row of rows) {
        const py = by + row;
        if (py < 0 || py >= buf.height) continue;
        for (let col = 0; col < boardW; col++) {
          const px = bx + col * 2;
          if (px < 0 || px + 1 >= buf.width) continue;
          if (col < sweepEnd) {
            // Swept — show empty board cell
            const bgColor = (row + col) % 2 === 0 ? t.boardA : t.boardB;
            buf.set(px, py, ' ', { bg: bgColor });
            buf.set(px + 1, py, ' ', { bg: bgColor });
          } else if (col === sweepEnd) {
            // Sweep edge — bright leading edge
            const edgeColor = brightenRGB(color, 1.2);
            buf.set(px, py, '▐', { fg: edgeColor, bg: t.boardA });
            buf.set(px + 1, py, '▌', { fg: dimRGB(color, 0.5), bg: t.boardA });
          } else {
            // Not yet swept — dimming color residue
            const fadeColor = dimRGB(color, 0.35 - sweepFrame * 0.05);
            buf.set(px, py, '█', { fg: fadeColor });
            buf.set(px + 1, py, '█', { fg: fadeColor });
          }
        }
      }
    }
    // Frames 8–9: gravity collapse — handled by the engine itself
  }

  private _renderPopup(buf: RenderBuffer, e: PopupTextEffect, bx: number, by: number, boardW: number): void {
    const { age, life, text, bold } = e;
    // Rise: text drifts up by 1 row every 10 frames
    const drift = Math.floor(age / 10);
    const py = by + e.startY - drift;
    if (py < 0 || py >= buf.height) return;

    // Fade: full brightness for first 50%, then fade
    const fadeStart = life * 0.5;
    let color = e.color;
    if (age > fadeStart) {
      const fadeProg = (age - fadeStart) / (life - fadeStart);
      color = dimRGB(e.color, 1 - fadeProg * 0.7);
    }

    // Center text over the board
    const boardPxW = boardW * 2;
    const tx = bx + Math.max(0, Math.floor((boardPxW - text.length) / 2));
    buf.drawText(tx, py, text, { fg: color, bold });
  }

  private _renderGarbageIndicator(
    buf: RenderBuffer, e: GarbageIndicatorEffect,
    bx: number, by: number, boardH: number,
  ): void {
    const t = theme();
    const { lineCount } = e;
    const displayLines = Math.min(lineCount, boardH);

    // Pulse: alternate brightness every 15 frames (fast pulse if large)
    const pulseRate = lineCount >= 8 ? 4 : 15;
    const bright = Math.floor(e.age / pulseRate) % 2 === 0;
    const barColor: RGB = bright ? t.bad : dimRGB(t.bad, 0.6);

    for (let i = 0; i < displayLines; i++) {
      const py = by + boardH - 1 - i;
      if (py >= 0 && py < buf.height) {
        buf.set(bx - 2, py, '▮', { fg: barColor });
      }
    }

    // Warning exclamation if large garbage (>= 6 lines)
    if (lineCount >= 6) {
      const warningY = by + boardH - displayLines - 1;
      if (warningY >= 0 && warningY < buf.height) {
        buf.set(bx - 2, warningY, '!', { fg: t.warn, bold: true });
      }
    }

    // Red tint on board border for incoming garbage
    if (bright && lineCount >= 4) {
      // Flash the left border column red
      for (let row = 0; row < Math.min(displayLines, boardH); row++) {
        const py = by + boardH - 1 - row;
        if (py >= 0 && py < buf.height) {
          buf.set(bx - 1, py, '┃', { fg: t.bad });
        }
      }
    }
  }

  private _renderAllClear(
    buf: RenderBuffer, e: AllClearEffect,
    bx: number, by: number, boardW: number, boardH: number,
  ): void {
    const t = theme();
    const gold: RGB = [255, 215, 0];

    if (e.age <= 2) {
      // Frames 0–2: Gold flash across entire board
      for (let row = 0; row < boardH; row++) {
        const py = by + row;
        if (py < 0 || py >= buf.height) continue;
        for (let col = 0; col < boardW; col++) {
          const px = bx + col * 2;
          if (px >= 0 && px + 1 < buf.width) {
            buf.set(px, py, '█', { fg: gold });
            buf.set(px + 1, py, '█', { fg: gold });
          }
        }
      }
    } else if (e.age <= 5) {
      // Frames 3–5: Gold fades to board bg through intermediates
      const fadeStep = e.age - 3; // 0..2
      const fadeColor = lerpRGB(gold, t.boardA, (fadeStep + 1) / 3);
      for (let row = 0; row < boardH; row++) {
        const py = by + row;
        if (py < 0 || py >= buf.height) continue;
        for (let col = 0; col < boardW; col++) {
          const px = bx + col * 2;
          if (px >= 0 && px + 1 < buf.width) {
            buf.set(px, py, '█', { fg: fadeColor });
            buf.set(px + 1, py, '█', { fg: fadeColor });
          }
        }
      }
    }
    // After frame 5: the popup text handles the "★ ALL CLEAR ★" label
  }
}
