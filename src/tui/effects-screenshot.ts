import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Inline the buffer logic to avoid complex imports
type RGB = [number, number, number];
interface Style { fg?: RGB; bg?: RGB; bold?: boolean; dim?: boolean; }

class ScreenshotBuffer {
  width: number;
  height: number;
  cells: { ch: string; fg: RGB | null; bg: RGB | null; bold: boolean }[];

  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.cells = new Array(w * h).fill(null).map(() => ({ ch: ' ', fg: null, bg: null, bold: false }));
  }
  set(x: number, y: number, ch: string, style?: Style): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const c = this.cells[y * this.width + x];
    c.ch = ch;
    if (style?.fg) c.fg = style.fg;
    if (style?.bg) c.bg = style.bg;
    c.bold = style?.bold ?? false;
  }
  fillRect(x: number, y: number, w: number, h: number, ch: string, style?: Style): void {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        this.set(x + dx, y + dy, ch, style);
  }
  drawText(x: number, y: number, text: string, style?: Style): void {
    for (let i = 0; i < text.length; i++) this.set(x + i, y, text[i], style);
  }
  toAnsi(): string {
    const CSI = '\x1b[';
    let out = '';
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const c = this.cells[y * this.width + x];
        const parts: string[] = [];
        if (c.fg) parts.push(`38;2;${c.fg[0]};${c.fg[1]};${c.fg[2]}`);
        if (c.bg) parts.push(`48;2;${c.bg[0]};${c.bg[1]};${c.bg[2]}`);
        if (c.bold) parts.push('1');
        if (parts.length > 0) out += `${CSI}${parts.join(';')}m`;
        out += c.ch;
      }
      out += `${CSI}0m\n`;
    }
    return out;
  }
}

// Now import the actual effects
import { EffectManager, dimRGB, brightenRGB, lerpRGB } from './effects.js';
import { renderBigText, renderBigTextCentered, measureBigText, comboSize } from './bigtext.js';
import { theme } from './themes.js';

const outDir = join(process.cwd(), 'docs', 'screenshots');
try { mkdirSync(outDir, { recursive: true }); } catch {}

const W = 72, H = 28;
const t = theme();
const bg: RGB = t.bg;

function saveFrame(name: string, buf: ScreenshotBuffer) {
  writeFileSync(join(outDir, `${name}.ansi`), buf.toAnsi());
  console.log(`Saved ${name}.ansi`);
}

// Screenshot 1: Big text font showcase
{
  const buf = new ScreenshotBuffer(W, H);
  buf.fillRect(0, 0, W, H, ' ', { bg });
  buf.drawText(2, 1, '=== BIG TEXT FONT SHOWCASE ===', { fg: t.accent, bold: true });

  renderBigText(buf as any, 2, 3, 'TETRIS', { fg: [255, 220, 90] }, 'big');
  renderBigText(buf as any, 30, 3, '+4', { fg: [255, 150, 80] }, 'big');
  renderBigText(buf as any, 2, 7, 'T-SPIN', { fg: [200, 90, 240] }, 'big');
  renderBigText(buf as any, 2, 11, 'DOUBLE', { fg: [90, 235, 100] }, 'small');
  renderBigText(buf as any, 2, 14, 'TRIPLE', { fg: [250, 165, 60] }, 'small');
  renderBigText(buf as any, 2, 17, '0123456789', { fg: [80, 230, 250] }, 'big');
  renderBigText(buf as any, 2, 21, 'ALL CLEAR!', { fg: [255, 215, 0] }, 'big');
  renderBigText(buf as any, 46, 11, 'SINGLE', { fg: [255, 255, 255] }, 'small');
  renderBigText(buf as any, 46, 14, 'COMBO', { fg: [255, 220, 90] }, 'small');

  // Show small vs big size
  buf.drawText(2, 25, 'big = 3 rows tall    small = 2 rows tall', { fg: t.dim });

  saveFrame('01-bigtext-showcase', buf);
}

// Screenshot 2: Combo counter growing (multiple frames)
for (const combo of [2, 5, 8, 12]) {
  const buf = new ScreenshotBuffer(W, H);
  buf.fillRect(0, 0, W, H, ' ', { bg });
  buf.drawText(2, 1, `=== COMBO x${combo} ===`, { fg: t.accent, bold: true });

  // Fake board
  const bx = 32, by = 3;
  for (let row = 0; row < 20; row++) {
    buf.set(bx - 1, by + row, '┃', { fg: t.borderBright });
    buf.set(bx + 20, by + row, '┃', { fg: t.borderBright });
    for (let col = 0; col < 10; col++) {
      const bgc = (row + col) % 2 === 0 ? t.boardA : t.boardB;
      if (row >= 16) {
        // Some pieces at bottom
        const pc: RGB = row % 2 === 0 ? t.pieces.t : t.pieces.s;
        buf.set(bx + col * 2, by + row, '█', { fg: pc });
        buf.set(bx + col * 2 + 1, by + row, '█', { fg: pc });
      } else {
        buf.set(bx + col * 2, by + row, ' ', { bg: bgc });
        buf.set(bx + col * 2 + 1, by + row, ' ', { bg: bgc });
      }
    }
  }

  // Combo zone (left of board, like TETR.IO)
  const comboColor: RGB = combo >= 8 ? [255, 100, 100] : combo >= 4 ? [255, 200, 80] : [255, 220, 90];
  const size = comboSize(combo);
  buf.drawText(5, by + 12, 'COMBO', { fg: dimRGB(comboColor, 0.7), bold: true });
  renderBigText(buf as any, 5, by + 13, String(combo), { fg: comboColor, bold: true }, size);

  // Clear type on board
  const clearLabel = combo >= 4 ? 'TETRIS' : combo >= 3 ? 'TRIPLE' : 'DOUBLE';
  const clearColor: RGB = clearLabel === 'TETRIS' ? [255, 220, 90] : [255, 255, 255];
  renderBigTextCentered(buf as any, bx + 10, by + 8, clearLabel, { fg: clearColor, bold: true }, 'small');

  // Attack amount
  const atk = combo + 1;
  buf.drawText(bx + 7, by + 11, `+${atk}`, { fg: [255, 150, 80], bold: true });

  // B2B if high combo
  if (combo >= 4) {
    buf.drawText(5, by + 18, 'B2B', { fg: dimRGB(t.accent as RGB, 0.7), bold: true });
    renderBigText(buf as any, 5, by + 19, String(combo - 2), { fg: t.accent }, 'small');
  }

  saveFrame(`02-combo-x${combo}`, buf);
}

// Screenshot 3: Line clear animation frames
{
  const fx = new EffectManager();
  fx.spawnLineClear([16, 17, 18, 19], 10, 'i', true);
  fx.spawnShake('heavy', 0, 1);
  fx.spawnBigText('TETRIS', [255, 220, 90], -1, 8, 'big', true, 1);

  for (const frameNum of [0, 2, 5, 8]) {
    // Advance to the right frame
    while (fx.count > 0 || frameNum === 0) {
      break;
    }

    const buf = new ScreenshotBuffer(W, H);
    buf.fillRect(0, 0, W, H, ' ', { bg });
    buf.drawText(2, 1, `=== LINE CLEAR (frame ${frameNum}) ===`, { fg: t.accent, bold: true });

    const bx = 25 + fx.shakeX, by = 3 + fx.shakeY;
    for (let row = 0; row < 20; row++) {
      buf.set(bx - 1, by + row, '┃', { fg: t.borderBright });
      buf.set(bx + 20, by + row, '┃', { fg: t.borderBright });
      for (let col = 0; col < 10; col++) {
        const bgc = (row + col) % 2 === 0 ? t.boardA : t.boardB;
        if (row >= 12 && row <= 15) {
          buf.set(bx + col * 2, by + row, '█', { fg: t.pieces.t });
          buf.set(bx + col * 2 + 1, by + row, '█', { fg: t.pieces.t });
        } else {
          buf.set(bx + col * 2, by + row, ' ', { bg: bgc });
          buf.set(bx + col * 2 + 1, by + row, ' ', { bg: bgc });
        }
      }
    }

    fx.render(buf as any, bx, by, 10, 20);
    fx.advance();

    saveFrame(`03-lineclear-frame${frameNum}`, buf);
  }
}

// Screenshot 4: All Clear
{
  const fx = new EffectManager();
  fx.spawnAllClear(25, 3, 10);

  for (const frameNum of [0, 3, 6]) {
    const buf = new ScreenshotBuffer(W, H);
    buf.fillRect(0, 0, W, H, ' ', { bg });
    buf.drawText(2, 1, `=== ALL CLEAR (frame ${frameNum}) ===`, { fg: t.accent, bold: true });

    const bx = 25 + fx.shakeX, by = 3 + fx.shakeY;
    for (let row = 0; row < 20; row++) {
      for (let col = 0; col < 10; col++) {
        const bgc = (row + col) % 2 === 0 ? t.boardA : t.boardB;
        buf.set(bx + col * 2, by + row, ' ', { bg: bgc });
        buf.set(bx + col * 2 + 1, by + row, ' ', { bg: bgc });
      }
    }

    fx.render(buf as any, bx, by, 10, 20);
    fx.advance();

    saveFrame(`04-allclear-frame${frameNum}`, buf);
  }
}

// Screenshot 5: T-Spin display
{
  const buf = new ScreenshotBuffer(W, H);
  buf.fillRect(0, 0, W, H, ' ', { bg });
  buf.drawText(2, 1, '=== T-SPIN DISPLAYS ===', { fg: t.accent, bold: true });

  // T-Spin Double
  renderBigText(buf as any, 2, 4, 'T-SPIN', { fg: [200, 90, 240], bold: true }, 'big');
  renderBigText(buf as any, 2, 8, 'DOUBLE', { fg: [200, 90, 240] }, 'small');
  buf.drawText(2, 11, '+6', { fg: [255, 100, 100], bold: true });

  // T-Spin Triple
  renderBigText(buf as any, 36, 4, 'T-SPIN', { fg: [255, 100, 200], bold: true }, 'big');
  renderBigText(buf as any, 36, 8, 'TRIPLE', { fg: [255, 100, 200] }, 'small');
  buf.drawText(36, 11, '+8', { fg: [255, 100, 100], bold: true });

  // Mini T-Spin
  renderBigText(buf as any, 2, 14, 'T-SPIN MINI', { fg: [180, 120, 220] }, 'small');
  buf.drawText(2, 17, 'SINGLE +1', { fg: [180, 120, 220] });

  // Garbage indicator
  buf.drawText(2, 20, '=== GARBAGE INDICATOR ===', { fg: t.accent, bold: true });
  for (let i = 0; i < 6; i++) {
    const gCol: RGB = i < 3 ? t.bad : dimRGB(t.bad, 0.6);
    buf.set(36, 22 - i, '▮', { fg: gCol });
  }
  buf.set(36, 15, '!', { fg: t.warn, bold: true });
  buf.drawText(38, 20, '← 6 lines incoming', { fg: t.dim });

  saveFrame('05-tspin-displays', buf);
}

console.log('\nAll screenshots saved to docs/screenshots/');
