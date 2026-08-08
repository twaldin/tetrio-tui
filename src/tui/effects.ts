/**
 * Animation & Effect Kit for tetrio-tui.
 *
 * Frame-driven effects that overlay the game board: lock flash, hard-drop trail,
 * line-clear flash+sweep, screen shake, combo/B2B popups, garbage indicator,
 * all-clear flash, and BIG TEXT displays.
 *
 * TETR.IO-authentic placement:
 *   - Clear type text appears at the cleared rows (over the board)
 *   - Combo counter is a big number on the LEFT of the board (like TETR.IO's combo zone)
 *   - B2B counter appears below the combo zone
 *   - Popups RISE slightly and FADE (not a static stack in the middle)
 *   - All-clear gets a full-board gold flash + big centered text
 *
 * All effects respect a global animation-intensity setting (0–100).
 * Zero per-frame allocations in the hot path — effect slots are preallocated and reused.
 */
import type { RenderBuffer, Style, RGB } from '../tui/app.js';
import { theme } from '../tui/themes.js';
import { pieceColor } from '../tui/draw.js';
import { renderBigText, renderBigTextCentered, measureBigText, comboSize } from '../tui/bigtext.js';

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
  cells: [number, number][];
  color: RGB;
}

interface HardDropTrailEffect {
  kind: 'hardDropTrail';
  age: number;
  life: number;
  trails: [number, number, number][];
  color: RGB;
}

interface LineClearEffect {
  kind: 'lineClear';
  age: number;
  life: number;
  rows: number[];
  boardW: number;
  color: RGB;
  isTetris: boolean;
}

interface ScreenShakeEffect {
  kind: 'screenShake';
  age: number;
  life: number;
  magnitude: 'light' | 'medium' | 'heavy';
  /** Directional bias: 0 = random, positive = rightward, negative = leftward */
  dirX: number;
  /** Directional bias: positive = downward */
  dirY: number;
}

interface PopupTextEffect {
  kind: 'popupText';
  age: number;
  life: number;
  text: string;
  color: RGB;
  /** Absolute X position in buffer (or -1 for auto-center on board) */
  absX: number;
  /** Starting Y position (absolute buffer row) */
  startY: number;
  bold: boolean;
  /** Rise speed: rows to drift up per 10 frames */
  riseSpeed: number;
}

interface BigTextEffect {
  kind: 'bigText';
  age: number;
  life: number;
  text: string;
  color: RGB;
  /** Absolute X position (-1 for centered on board) */
  absX: number;
  /** Starting Y position (absolute buffer row) */
  startY: number;
  /** Size grows based on importance */
  size: 'big' | 'small';
  /** Rise speed */
  riseSpeed: number;
  /** Flash: first few frames are brighter */
  flash: boolean;
  /** Diagonal (staircase) slant, like the real game's tilted action text */
  diagonal?: boolean;
}

interface ComboZoneEffect {
  kind: 'comboZone';
  age: number;
  life: number;
  combo: number;
  color: RGB;
  /** Position: left of board */
  zoneX: number;
  zoneY: number;
}

interface B2BZoneEffect {
  kind: 'b2bZone';
  age: number;
  life: number;
  b2b: number;
  color: RGB;
  zoneX: number;
  zoneY: number;
}

interface GarbageIndicatorEffect {
  kind: 'garbageIndicator';
  age: number;
  life: number;
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
  | BigTextEffect
  | ComboZoneEffect
  | B2BZoneEffect
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
      cells: cells.slice(),
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
    const life = Math.max(1, Math.round(9 * _animIntensity / 100));
    this.effects.push({
      kind: 'lineClear', age: 0, life,
      rows: rows.slice(),
      boardW,
      color: pieceColor(pieceType),
      isTetris,
    });
  }

  /**
   * Screen shake with decaying intensity. Directional like TETR.IO:
   * - Big attacks shake more and longer
   * - Direction biases toward the action (garbage = downward, attacks = upward)
   */
  spawnShake(magnitude: 'light' | 'medium' | 'heavy', dirX = 0, dirY = 0): void {
    if (_animIntensity === 0) return;
    const baseLives = { light: 5, medium: 8, heavy: 12 };
    const life = Math.max(1, Math.round(baseLives[magnitude] * _animIntensity / 100));
    // Replace any existing shake with the stronger one
    for (let i = 0; i < this.effects.length; i++) {
      if (this.effects[i].kind === 'screenShake') {
        const existing = this.effects[i] as ScreenShakeEffect;
        const magnitudes = { light: 1, medium: 2, heavy: 3 };
        if (magnitudes[existing.magnitude] >= magnitudes[magnitude] && existing.age < 3) {
          return; // Don't replace a stronger shake that just started
        }
        this.effects.splice(i, 1);
        break;
      }
    }
    this.effects.push({ kind: 'screenShake', age: 0, life, magnitude, dirX, dirY });
  }

  /**
   * Popup text that appears at a specific position, rises and fades.
   * Unlike old version: position is absolute, not centered.
   */
  spawnPopup(text: string, color: RGB, absX: number, startY: number, bold = true, riseSpeed = 1): void {
    if (_animIntensity === 0) return;
    const life = Math.max(1, Math.round(30 * _animIntensity / 100));
    this.effects.push({
      kind: 'popupText', age: 0, life, text, color,
      absX, startY, bold, riseSpeed,
    });
  }

  /**
   * Spawn a BIG TEXT effect (clear type, attack amount) at a position.
   * The text is rendered using the bigtext.ts ASCII-art font.
   */
  spawnBigText(
    text: string,
    color: RGB,
    absX: number,
    startY: number,
    size: 'big' | 'small' = 'small',
    flash = true,
    riseSpeed = 1,
    diagonal = false,
  ): void {
    if (_animIntensity === 0) return;
    // ONE big text at a time — a new popup immediately replaces any existing one
    // (matches TETR.IO: "new clears replace the text immediately", no overlap).
    this.effects = this.effects.filter((e) => e.kind !== 'bigText');
    const life = Math.max(1, Math.round(26 * _animIntensity / 100)); // faster fade than before
    this.effects.push({
      kind: 'bigText', age: 0, life, text, color,
      absX, startY, size, riseSpeed, flash, diagonal,
    });
  }

  /**
   * Spawn/update the combo zone display (left of board).
   * Shows combo count as a big number that grows with combo.
   */
  spawnComboZone(combo: number, color: RGB, zoneX: number, zoneY: number): void {
    if (_animIntensity === 0) return;
    // Remove existing combo zone
    for (let i = this.effects.length - 1; i >= 0; i--) {
      if (this.effects[i].kind === 'comboZone') {
        this.effects.splice(i, 1);
      }
    }
    const life = Math.max(1, Math.round(45 * _animIntensity / 100));
    this.effects.push({
      kind: 'comboZone', age: 0, life, combo, color, zoneX, zoneY,
    });
  }

  /**
   * Spawn/update the B2B zone display (left of board, below combo).
   */
  spawnB2BZone(b2b: number, color: RGB, zoneX: number, zoneY: number): void {
    if (_animIntensity === 0) return;
    // Remove existing B2B zone
    for (let i = this.effects.length - 1; i >= 0; i--) {
      if (this.effects[i].kind === 'b2bZone') {
        this.effects.splice(i, 1);
      }
    }
    const life = Math.max(1, Math.round(50 * _animIntensity / 100));
    this.effects.push({
      kind: 'b2bZone', age: 0, life, b2b, color, zoneX, zoneY,
    });
  }

  /** Update the garbage indicator (refreshed every frame while garbage is pending). */
  updateGarbageIndicator(lineCount: number, boardH: number): void {
    if (_animIntensity === 0 || lineCount === 0) {
      for (let i = this.effects.length - 1; i >= 0; i--) {
        if (this.effects[i].kind === 'garbageIndicator') {
          this.effects.splice(i, 1);
        }
      }
      return;
    }
    for (const e of this.effects) {
      if (e.kind === 'garbageIndicator') {
        (e as GarbageIndicatorEffect).lineCount = lineCount;
        (e as GarbageIndicatorEffect).age = 0;
        return;
      }
    }
    this.effects.push({ kind: 'garbageIndicator', age: 0, life: 9999, lineCount, boardH });
  }

  /** All-clear full-board flash + big text + heavy shake. */
  spawnAllClear(boardX: number, boardY: number, boardW: number): void {
    if (_animIntensity === 0) return;
    const life = Math.max(1, Math.round(50 * _animIntensity / 100));
    this.effects.push({ kind: 'allClear', age: 0, life });
    this.spawnShake('heavy', 0, 1);
    // Big "ALL CLEAR" text centered on board
    const textY = boardY + 8;
    this.spawnBigText('ALL CLEAR', [255, 215, 0], -1, textY, 'big', true, 0);
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
        if (e.kind === 'screenShake') {
          this._computeShake(e);
        }
        this.effects[writeIdx++] = e;
      }
    }
    this.effects.length = writeIdx;

    if (this.effects.length > MAX_EFFECTS) {
      this.effects.splice(0, this.effects.length - MAX_EFFECTS);
    }
  }

  /** Remove transient text effects (bigText/popup/combo/b2b) — used on game-over so the
   *  completion overlay shows cleanly without a frozen last-clear label. */
  clearTransient(): void {
    this.effects = this.effects.filter(
      (e) => e.kind !== 'bigText' && e.kind !== 'popupText' && e.kind !== 'comboZone' && e.kind !== 'b2bZone',
    );
  }

  private _computeShake(e: ScreenShakeEffect): void {
    const progress = e.age / e.life; // 0→1
    // Exponential decay for more natural feel (like TETR.IO)
    const decay = Math.pow(1 - progress, 1.5);
    const maxAmp = e.magnitude === 'heavy' ? 3 : e.magnitude === 'medium' ? 2 : 1;

    // Oscillation with directional bias
    // Use a pseudo-random-ish pattern instead of simple alternation
    const phase = e.age * 2.7; // non-integer multiplier for less predictable shake
    const oscX = Math.sin(phase) + e.dirX * 0.5;
    const oscY = Math.cos(phase * 1.3) + e.dirY * 0.5;

    this.shakeX = Math.round(oscX * maxAmp * decay);
    this.shakeY = Math.round(oscY * (maxAmp * 0.5) * decay);

    // Clamp
    this.shakeX = Math.max(-3, Math.min(3, this.shakeX));
    this.shakeY = Math.max(-2, Math.min(2, this.shakeY));
  }

  /**
   * Render all active effects as an overlay on top of the board.
   * Called AFTER the main board draw.
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
        case 'bigText':
          this._renderBigText(buf, e, boardX, boardY, boardW);
          break;
        case 'comboZone':
          this._renderComboZone(buf, e);
          break;
        case 'b2bZone':
          this._renderB2BZone(buf, e);
          break;
        case 'garbageIndicator':
          this._renderGarbageIndicator(buf, e, boardX, boardY, boardH);
          break;
        case 'allClear':
          this._renderAllClear(buf, e, boardX, boardY, boardW, boardH);
          break;
      }
    }
  }

  /** Number of active effects (for debug / stats). */
  get count(): number { return this.effects.length; }

  // ------ individual effect renderers ------

  private _renderLockFlash(buf: RenderBuffer, e: LockFlashEffect, bx: number, by: number): void {
    const white: RGB = [255, 255, 255];
    let c: RGB;
    if (e.age === 0) {
      c = lerpRGB(e.color, white, 0.7);
    } else if (e.age === 1) {
      c = brightenRGB(e.color, 1.3);
    } else {
      return;
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
    const opacities = [0.80, 0.50, 0.30, 0.12];
    if (e.age >= opacities.length) return;
    const opacity = opacities[e.age];
    const t = theme();
    for (const [col, startRow, endRow] of e.trails) {
      const px = bx + col * 2;
      for (let row = startRow; row < endRow; row++) {
        const py = by + row;
        if (py >= by && py < buf.height && px >= 0 && px + 1 < buf.width) {
          const rowProgress = (row - startRow) / Math.max(1, endRow - startRow - 1);
          const rowOpacity = opacity * (0.3 + 0.7 * rowProgress);
          const rowFg = dimRGB(e.color, rowOpacity);
          const rowBg = lerpRGB(t.boardA, e.color, rowOpacity * 0.3);
          buf.set(px, py, '░', { fg: rowFg, bg: rowBg });
          buf.set(px + 1, py, '░', { fg: rowFg, bg: rowBg });
        }
      }
    }
  }

  private _renderLineClear(buf: RenderBuffer, e: LineClearEffect, bx: number, by: number): void {
    const t = theme();
    const { age, rows, boardW, color, isTetris } = e;

    if (age <= 3) {
      // Phase 1 (frames 0–3): Bright flash — TETR.IO style
      // White flash that fades through piece color to nothing
      const flashIntensity = 1 - (age / 3);
      const white: RGB = [255, 255, 255];
      const flashColor = lerpRGB(white, color, (1 - flashIntensity) * 0.4);

      for (const row of rows) {
        const py = by + row;
        if (py < 0 || py >= buf.height) continue;
        for (let col = 0; col < boardW; col++) {
          const px = bx + col * 2;
          if (px >= 0 && px + 1 < buf.width) {
            buf.set(px, py, '█', { fg: flashColor });
            buf.set(px + 1, py, '█', { fg: flashColor });
          }
        }
      }
    } else if (age <= 8) {
      // Phase 2 (frames 4–8): Center-out sweep erase (TETR.IO style)
      // Lines dissolve from center outward
      const sweepFrame = age - 4; // 0..4
      const centerCol = Math.floor(boardW / 2);
      const sweepRadius = Math.floor((sweepFrame + 1) * (boardW / 2) / 5);

      for (const row of rows) {
        const py = by + row;
        if (py < 0 || py >= buf.height) continue;
        for (let col = 0; col < boardW; col++) {
          const px = bx + col * 2;
          if (px < 0 || px + 1 >= buf.width) continue;
          const distFromCenter = Math.abs(col - centerCol);

          if (distFromCenter <= sweepRadius) {
            // Swept — show empty with sparkle at edge
            if (distFromCenter === sweepRadius && sweepFrame < 4) {
              // Leading edge — bright particle
              const edgeColor = brightenRGB(color, 1.5);
              buf.set(px, py, '▓', { fg: edgeColor });
              buf.set(px + 1, py, '▓', { fg: edgeColor });
            } else {
              const bgColor = (row + col) % 2 === 0 ? t.boardA : t.boardB;
              buf.set(px, py, ' ', { bg: bgColor });
              buf.set(px + 1, py, ' ', { bg: bgColor });
            }
          } else {
            // Not yet swept — dimming residue
            const fadeFactor = Math.max(0.03, 0.12 - sweepFrame * 0.03);
            const fadeColor = dimRGB(color, fadeFactor);
            buf.set(px, py, '░', { fg: fadeColor });
            buf.set(px + 1, py, '░', { fg: fadeColor });
          }
        }
      }
    }
    // Frames 9+: gravity collapse — handled by the engine itself
  }

  private _renderPopup(buf: RenderBuffer, e: PopupTextEffect, bx: number, by: number, boardW: number): void {
    const { age, life, text, bold, riseSpeed } = e;
    // Rise: text drifts up
    const drift = Math.floor(age * riseSpeed / 8);
    const py = e.startY - drift;
    if (py < 0 || py >= buf.height) return;

    // Fade: full brightness for first 40%, then fade out
    const fadeStart = life * 0.4;
    let color = e.color;
    if (age > fadeStart) {
      const fadeProg = (age - fadeStart) / (life - fadeStart);
      color = dimRGB(e.color, 1 - fadeProg * 0.8);
    }

    // Scale: slight pop-in on first 2 frames
    const scale = age < 2 ? 1.0 : 1.0; // reserved for future scale anim

    let tx: number;
    if (e.absX === -1) {
      // Center on board
      const boardPxW = boardW * 2;
      tx = bx + Math.max(0, Math.floor((boardPxW - text.length) / 2));
    } else {
      tx = e.absX;
    }
    buf.drawText(tx, py, text, { fg: color, bold });
  }

  private _renderBigText(buf: RenderBuffer, e: BigTextEffect, bx: number, by: number, boardW: number): void {
    const { age, life, text, size, flash, riseSpeed, diagonal } = e;
    // Rise
    const drift = Math.floor(age * riseSpeed / 10);
    const py = e.startY - drift;
    if (py < 0 || py + 3 >= buf.height) return;

    // Fade — stay bright ~62% then fade out quickly
    const fadeStart = life * 0.62;
    let color = e.color;
    if (age > fadeStart) {
      const fadeProg = (age - fadeStart) / (life - fadeStart);
      color = dimRGB(e.color, 1 - fadeProg * 0.9);
    }

    // Flash effect on first frames
    if (flash && age < 3) {
      const flashIntensity = 1 - (age / 3);
      color = brightenRGB(color, 1 + flashIntensity * 0.5);
    }

    const style: Style = { fg: color, bold: true };

    if (e.absX === -1) {
      // Center on board
      const boardCenterX = bx + Math.floor(boardW * 2 / 2);
      renderBigTextCentered(buf, boardCenterX, py, text, style, size, diagonal);
    } else {
      renderBigText(buf, e.absX, py, text, style, size, diagonal);
    }
  }

  private _renderComboZone(buf: RenderBuffer, e: ComboZoneEffect): void {
    const { age, life, combo, zoneX, zoneY } = e;

    // Fade
    const fadeStart = life * 0.6;
    let color = e.color;
    if (age > fadeStart) {
      const fadeProg = (age - fadeStart) / (life - fadeStart);
      color = dimRGB(e.color, 1 - fadeProg * 0.8);
    }

    // Flash on spawn
    if (age < 3) {
      color = brightenRGB(color, 1 + (1 - age / 3) * 0.6);
    }

    // Combo display: "COMBO" label + a BLOCKY combo number that GROWS in size as the
    // combo builds (small font at low combo, big blocky + diagonal slant at high combo).
    buf.drawText(zoneX, zoneY, 'COMBO', { fg: dimRGB(color, 0.7), bold: true });
    const size = comboSize(combo); // 'small' then 'big' as it grows
    renderBigText(buf, zoneX, zoneY + 1, String(combo), { fg: color, bold: true }, size, size === 'big');
  }

  private _renderB2BZone(buf: RenderBuffer, e: B2BZoneEffect): void {
    const { age, life, b2b, zoneX, zoneY } = e;

    const fadeStart = life * 0.6;
    let color = e.color;
    if (age > fadeStart) {
      const fadeProg = (age - fadeStart) / (life - fadeStart);
      color = dimRGB(e.color, 1 - fadeProg * 0.8);
    }

    if (age < 3) {
      color = brightenRGB(color, 1 + (1 - age / 3) * 0.4);
    }

    // B2B indicator: "B2B" label + a blocky number (smaller than the combo)
    buf.drawText(zoneX, zoneY, 'B2B', { fg: dimRGB(color, 0.7), bold: true });
    renderBigText(buf, zoneX, zoneY + 1, `x${b2b}`, { fg: color, bold: true }, 'small', false);
  }

  private _renderGarbageIndicator(
    buf: RenderBuffer, e: GarbageIndicatorEffect,
    bx: number, by: number, boardH: number,
  ): void {
    const t = theme();
    const { lineCount } = e;
    const displayLines = Math.min(lineCount, boardH);

    // Pulse rate increases with garbage count (more urgent)
    const pulseRate = lineCount >= 8 ? 3 : lineCount >= 4 ? 6 : 12;
    const bright = Math.floor(e.age / pulseRate) % 2 === 0;
    const barColor: RGB = bright ? t.bad : dimRGB(t.bad, 0.5);

    for (let i = 0; i < displayLines; i++) {
      const py = by + boardH - 1 - i;
      if (py >= 0 && py < buf.height) {
        // Gradient: bottom rows brighter, top rows dimmer
        const gradient = 1 - (i / Math.max(1, displayLines)) * 0.3;
        const gradColor = dimRGB(barColor, gradient);
        buf.set(bx - 2, py, '▮', { fg: gradColor });
      }
    }

    // Warning exclamation if large garbage
    if (lineCount >= 6) {
      const warningY = by + boardH - displayLines - 1;
      if (warningY >= 0 && warningY < buf.height) {
        const warnChar = bright ? '!' : '‼';
        buf.set(bx - 2, warningY, warnChar, { fg: t.warn, bold: true });
      }
    }

    // Red tint on board left border for incoming garbage
    if (bright && lineCount >= 4) {
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
    const gold: RGB = [255, 215, 0];
    const white: RGB = [255, 255, 255];
    const t = theme();

    if (e.age <= 3) {
      // Frames 0–3: Intense gold+white flash across entire board
      const flashIntensity = 1 - (e.age / 3);
      const flashColor = lerpRGB(gold, white, flashIntensity * 0.5);

      for (let row = 0; row < boardH; row++) {
        const py = by + row;
        if (py < 0 || py >= buf.height) continue;
        for (let col = 0; col < boardW; col++) {
          const px = bx + col * 2;
          if (px >= 0 && px + 1 < buf.width) {
            buf.set(px, py, '█', { fg: flashColor });
            buf.set(px + 1, py, '█', { fg: flashColor });
          }
        }
      }
    } else if (e.age <= 8) {
      // Frames 4–8: Gold ripple fading outward from center
      const rippleFrame = e.age - 4; // 0..4
      const centerRow = Math.floor(boardH / 2);
      const centerCol = Math.floor(boardW / 2);
      const maxDist = Math.sqrt(centerRow * centerRow + centerCol * centerCol);

      for (let row = 0; row < boardH; row++) {
        const py = by + row;
        if (py < 0 || py >= buf.height) continue;
        for (let col = 0; col < boardW; col++) {
          const px = bx + col * 2;
          if (px < 0 || px + 1 >= buf.width) continue;

          const dist = Math.sqrt((row - centerRow) ** 2 + (col - centerCol) ** 2);
          const normalDist = dist / maxDist;
          const ripplePos = rippleFrame / 4; // 0→1
          const rippleDelta = Math.abs(normalDist - ripplePos);

          if (rippleDelta < 0.2) {
            const rippleIntensity = 1 - rippleDelta / 0.2;
            const rippleColor = lerpRGB(t.boardA, gold, rippleIntensity * 0.6);
            buf.set(px, py, '░', { fg: gold, bg: rippleColor });
            buf.set(px + 1, py, '░', { fg: gold, bg: rippleColor });
          }
        }
      }
    }
    // After frame 8: the big text effect handles the "ALL CLEAR" display
  }
}
