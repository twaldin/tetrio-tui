/**
 * Effects demo: renders sample effect frames to the terminal for screenshot capture.
 * Usage: npx tsx src/tui/effects-demo.ts
 */
import { Buffer } from './renderer.js';
import type { RenderBuffer, Style, RGB } from './app.js';
import { EffectManager, lerpRGB, brightenRGB, dimRGB } from './effects.js';
import { renderBigText, renderBigTextCentered, measureBigText, comboSize, renderComboCounter, renderB2BCounter } from './bigtext.js';
import { theme } from './themes.js';

// Adapt Buffer to RenderBuffer interface
class DemoBuffer implements RenderBuffer {
  private buf: Buffer;
  constructor(w: number, h: number) { this.buf = new Buffer(w, h); }
  get width() { return this.buf.width; }
  get height() { return this.buf.height; }
  set(x: number, y: number, ch: string, style?: Style): void {
    const s = style ?? {};
    const fg = s.fg ? ((s.fg as any)[0] << 16 | (s.fg as any)[1] << 8 | (s.fg as any)[2]) : -1;
    const bg = s.bg ? ((s.bg as any)[0] << 16 | (s.bg as any)[1] << 8 | (s.bg as any)[2]) : -1;
    this.buf.set(x, y, ch, { fg, bg, bold: s.bold, dim: s.dim, underline: s.underline });
  }
  fillRect(x: number, y: number, w: number, h: number, ch: string, style?: Style): void {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        this.set(x + dx, y + dy, ch, style);
  }
  drawText(x: number, y: number, text: string, style?: Style): void {
    for (let i = 0; i < text.length; i++) this.set(x + i, y, text[i], style);
  }
  /** Dump to ANSI terminal output */
  toAnsi(): string {
    const CSI = '\x1b[';
    let out = `${CSI}2J${CSI}H`; // clear + home
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const c = this.buf.get(x, y);
        if (!c) continue;
        let seq = `${CSI}`;
        const parts: string[] = ['0'];
        if (c.fg !== -1) parts.push(`38;2;${(c.fg >> 16) & 255};${(c.fg >> 8) & 255};${c.fg & 255}`);
        if (c.bg !== -1) parts.push(`48;2;${(c.bg >> 16) & 255};${(c.bg >> 8) & 255};${c.bg & 255}`);
        if (c.attrs & 1) parts.push('1');
        out += `${CSI}${parts.join(';')}m${c.char}`;
      }
      out += `${CSI}0m\n`;
    }
    return out;
  }
}

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const W = 70, H = 30;
  const t = theme();
  const bg: RGB = t.bg;

  console.log('\x1b[?1049h\x1b[?25l'); // alt screen, hide cursor

  // Demo 1: Big text showcase
  {
    const buf = new DemoBuffer(W, H);
    buf.fillRect(0, 0, W, H, ' ', { bg });
    buf.drawText(2, 1, '=== BIG TEXT FONT SHOWCASE ===', { fg: t.accent, bold: true });

    renderBigText(buf, 2, 3, 'TETRIS', { fg: [255, 220, 90] }, 'big');
    renderBigText(buf, 2, 7, 'T-SPIN', { fg: [200, 90, 240] }, 'big');
    renderBigText(buf, 2, 11, 'DOUBLE', { fg: [90, 235, 100] }, 'small');
    renderBigText(buf, 2, 14, 'TRIPLE', { fg: [250, 165, 60] }, 'small');
    renderBigText(buf, 2, 17, '12345', { fg: [80, 230, 250] }, 'big');
    renderBigText(buf, 2, 21, '67890', { fg: [250, 80, 90] }, 'big');
    renderBigText(buf, 2, 25, 'ALL CLEAR', { fg: [255, 215, 0] }, 'big');

    process.stdout.write(buf.toAnsi());
    await sleep(3000);
  }

  // Demo 2: Combo counter growing
  {
    for (let combo = 1; combo <= 12; combo++) {
      const buf = new DemoBuffer(W, H);
      buf.fillRect(0, 0, W, H, ' ', { bg });
      buf.drawText(2, 1, `=== COMBO COUNTER (x${combo}) ===`, { fg: t.accent, bold: true });

      // Fake board outline
      const bx = 30, by = 3;
      for (let row = 0; row < 20; row++) {
        buf.set(bx - 1, by + row, '┃', { fg: t.borderBright });
        buf.set(bx + 20, by + row, '┃', { fg: t.borderBright });
        for (let col = 0; col < 10; col++) {
          const bgc = (row + col) % 2 === 0 ? t.boardA : t.boardB;
          buf.set(bx + col * 2, by + row, ' ', { bg: bgc });
          buf.set(bx + col * 2 + 1, by + row, ' ', { bg: bgc });
        }
      }

      // Combo zone (left of board)
      const comboColor: RGB = combo >= 8 ? [255, 100, 100] : combo >= 4 ? [255, 200, 80] : [255, 220, 90];
      const size = comboSize(combo);
      buf.drawText(5, by + 12, 'COMBO', { fg: dimRGB(comboColor, 0.7), bold: true });
      renderBigText(buf, 5, by + 13, String(combo), { fg: comboColor, bold: true }, size);

      // Clear type on board
      const clearLabels = ['SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
      const label = clearLabels[Math.min(combo - 1, 3) % 4];
      const labelColor: RGB = label === 'TETRIS' ? [255, 220, 90] : [255, 255, 255];
      renderBigTextCentered(buf, bx + 10, by + 8, label, { fg: labelColor, bold: true }, 'small');

      // Attack popup
      const atkAmt = combo + 1;
      buf.drawText(bx + 7, by + 11, `+${atkAmt}`, { fg: [255, 150, 80], bold: true });

      process.stdout.write(buf.toAnsi());
      await sleep(500);
    }
  }

  // Demo 3: Effect animation sequence (line clear + shake)
  {
    const fx = new EffectManager();

    // Simulate a tetris clear
    fx.spawnLineClear([16, 17, 18, 19], 10, 'i', true);
    fx.spawnShake('heavy', 0, 1);
    fx.spawnBigText('TETRIS', [255, 220, 90], -1, 8, 'big', true, 1);
    fx.spawnPopup('+4', [255, 150, 80], -1, 13, true, 1);
    fx.spawnComboZone(5, [255, 220, 90], 5, 15);

    for (let frame = 0; frame < 25; frame++) {
      const buf = new DemoBuffer(W, H);
      buf.fillRect(0, 0, W, H, ' ', { bg });
      buf.drawText(2, 1, `=== TETRIS CLEAR (frame ${frame}) ===`, { fg: t.accent, bold: true });

      const bx = 25 + fx.shakeX, by = 3 + fx.shakeY;

      // Draw board
      for (let row = 0; row < 20; row++) {
        buf.set(bx - 1, by + row, '┃', { fg: t.borderBright });
        buf.set(bx + 20, by + row, '┃', { fg: t.borderBright });
        for (let col = 0; col < 10; col++) {
          const bgc = (row + col) % 2 === 0 ? t.boardA : t.boardB;
          // Add some "pieces" on the board
          if (row >= 14 && row <= 15 && col >= 3 && col <= 6) {
            buf.set(bx + col * 2, by + row, '█', { fg: t.pieces.t });
            buf.set(bx + col * 2 + 1, by + row, '█', { fg: t.pieces.t });
          } else {
            buf.set(bx + col * 2, by + row, ' ', { bg: bgc });
            buf.set(bx + col * 2 + 1, by + row, ' ', { bg: bgc });
          }
        }
      }

      // Render effects
      fx.render(buf, bx, by, 10, 20);
      fx.advance();

      process.stdout.write(buf.toAnsi());
      await sleep(100);
    }
  }

  // Demo 4: All Clear
  {
    const fx = new EffectManager();
    fx.spawnAllClear(25, 3, 10);

    for (let frame = 0; frame < 30; frame++) {
      const buf = new DemoBuffer(W, H);
      buf.fillRect(0, 0, W, H, ' ', { bg });
      buf.drawText(2, 1, `=== ALL CLEAR (frame ${frame}) ===`, { fg: t.accent, bold: true });

      const bx = 25 + fx.shakeX, by = 3 + fx.shakeY;
      for (let row = 0; row < 20; row++) {
        for (let col = 0; col < 10; col++) {
          const bgc = (row + col) % 2 === 0 ? t.boardA : t.boardB;
          buf.set(bx + col * 2, by + row, ' ', { bg: bgc });
          buf.set(bx + col * 2 + 1, by + row, ' ', { bg: bgc });
        }
      }

      fx.render(buf, bx, by, 10, 20);
      fx.advance();

      process.stdout.write(buf.toAnsi());
      await sleep(100);
    }
  }

  // Hold for viewing
  await sleep(2000);
  console.log('\x1b[?25h\x1b[?1049l'); // show cursor, leave alt screen
  console.log('Demo complete!');
}

main().catch(console.error);
