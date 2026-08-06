/**
 * Offline effects test: uses engine directly to guarantee line clears and
 * render multiple frames showing effects in action. Outputs PNG screenshots.
 */
import { createGame, startGame, tick, advanceTime, NEUTRAL_INPUT, BUFFER_ROWS } from '../src/game/engine.js';
import type { InputState } from '../src/game/engine.js';
import { visibleBoard } from '../src/game/engine.js';
import { PIECE_ROTATIONS } from '../src/game/pieces.js';
import { GameScreen } from '../src/tui/screens/game.js';
import { LocalGameController } from '../src/game/localgame.js';
import { OpponentTracker } from '../src/game/state.js';
import type { RenderBuffer, Style, RGB } from '../src/tui/app.js';
import * as fs from 'fs';

// Minimal RenderBuffer with color tracking for PNG export
class ColorBuf implements RenderBuffer {
  width: number; height: number;
  private chars: string[];
  private fgs: (RGB | null)[];
  private bgs: (RGB | null)[];
  private bolds: boolean[];

  constructor(w: number, h: number) {
    this.width = w; this.height = h;
    const n = w * h;
    this.chars = new Array(n).fill(' ');
    this.fgs = new Array(n).fill(null);
    this.bgs = new Array(n).fill(null);
    this.bolds = new Array(n).fill(false);
  }
  set(x: number, y: number, ch: string, style?: Style): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const idx = y * this.width + x;
    this.chars[idx] = ch;
    if (style?.fg) this.fgs[idx] = style.fg;
    if (style?.bg) this.bgs[idx] = style.bg;
    if (style?.bold) this.bolds[idx] = true;
  }
  fillRect(x: number, y: number, w: number, h: number, ch: string, style?: Style): void {
    for (let r = y; r < y + h; r++) {
      for (let c = x; c < x + w; c++) { this.set(c, r, ch, style); }
    }
  }
  drawText(x: number, y: number, text: string, style?: Style): void {
    for (let i = 0; i < text.length; i++) this.set(x + i, y, text[i], style);
  }

  /** Export as PPM image → convert to PNG via temp file. */
  toPPM(): Buffer {
    const pw = this.width * 8; // 8px per char
    const ph = this.height * 16; // 16px per char
    const header = `P6\n${pw} ${ph}\n255\n`;
    const pixels = Buffer.alloc(pw * ph * 3);
    for (let cy = 0; cy < this.height; cy++) {
      for (let cx = 0; cx < this.width; cx++) {
        const idx = cy * this.width + cx;
        const bg = this.bgs[idx] ?? [8, 8, 14];
        const fg = this.fgs[idx] ?? [235, 235, 245];
        const ch = this.chars[idx];
        const isFilled = ch !== ' ' && ch !== '';

        for (let py = 0; py < 16; py++) {
          for (let px = 0; px < 8; px++) {
            const pixIdx = ((cy * 16 + py) * pw + cx * 8 + px) * 3;
            let color: RGB;
            if (isFilled) {
              // Simple: filled chars use fg color, empty use bg
              const isChar = py >= 2 && py < 14 && px >= 1 && px < 7;
              color = isChar ? (fg as RGB) : (bg as RGB);
            } else {
              color = bg as RGB;
            }
            pixels[pixIdx] = color[0];
            pixels[pixIdx + 1] = color[1];
            pixels[pixIdx + 2] = color[2];
          }
        }
      }
    }
    return Buffer.concat([Buffer.from(header, 'ascii'), pixels]);
  }
}

async function main() {
  // Create controller + game screen
  const ctrl = new LocalGameController();
  const screen = new GameScreen({
    controller: ctrl,
    opponents: new OpponentTracker(),
    onExit: () => {},
    modeLabel: '40 LINES',
  });

  // Start game with known seed
  ctrl.start(1, { boardwidth: 10, boardheight: 20, g: 0.02 }, 42);

  // Helper: do N ticks
  function doTicks(n: number) {
    for (let i = 0; i < n; i++) screen.update(16);
  }

  // Helper: press key for one tick
  function press(key: string) {
    ctrl.setKey(key, true);
    screen.update(16);
    ctrl.setKey(key, false);
    screen.update(16);
  }

  // Helper: render + save
  function capture(name: string) {
    const buf = new ColorBuf(110, 34);
    screen.render(buf);
    const ppm = buf.toPPM();
    fs.writeFileSync(`/tmp/${name}.ppm`, ppm);
    console.log(`  captured ${name}`);
  }

  console.log('=== Effect Demo ===');

  // Let game start
  doTicks(5);

  // Place several pieces to build rows
  // Drop piece 1
  press('moveLeft'); press('moveLeft'); press('moveLeft'); press('moveLeft');
  press('hardDrop');
  capture('fx_drop1_flash');
  doTicks(2);
  capture('fx_drop1_fade');

  // Drop piece 2 - right
  press('moveRight'); press('moveRight'); press('moveRight'); press('moveRight');
  press('hardDrop');
  capture('fx_drop2_flash');
  doTicks(3);
  capture('fx_drop2_fade');

  // Drop piece 3 - center
  press('hardDrop');
  capture('fx_drop3_flash');
  doTicks(3);

  // Drop piece 4
  press('moveLeft'); press('moveLeft');
  press('hardDrop');
  capture('fx_drop4_flash');
  doTicks(3);

  // Drop piece 5
  press('moveRight'); press('moveRight');
  press('hardDrop');
  capture('fx_drop5');
  doTicks(3);

  // Continue dropping to fill a row
  for (let i = 0; i < 10; i++) {
    const dirs = ['moveLeft','moveRight','','moveLeft','moveLeft','moveRight','moveRight','','moveLeft','moveRight'];
    if (dirs[i]) press(dirs[i]);
    if (i % 3 === 0) press('rotateCW');
    press('hardDrop');
    capture(`fx_drop${6 + i}`);
    doTicks(2);
    capture(`fx_drop${6 + i}_after`);
  }

  console.log('\nDone! Check /tmp/fx_drop*.ppm files');
  console.log('Convert: for f in /tmp/fx_drop*.ppm; do convert "$f" "${f%.ppm}.png"; done');
}

main().catch(console.error);
