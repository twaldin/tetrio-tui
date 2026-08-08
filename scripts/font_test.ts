import { renderBigText, measureBigText } from '../src/tui/bigtext.js';
import type { Style } from '../src/tui/app.js';
function rt(text: string, size: 'big'|'small', diag=false): string {
  const { width, height } = measureBigText(text, size, diag);
  const grid: string[][] = Array.from({ length: height }, () => Array(width).fill(' '));
  const buf = { set(x: number, y: number, ch: string) { if (y>=0&&y<height&&x>=0&&x<width) grid[y][x]=ch; }, drawText(){}, width, height } as any;
  renderBigText(buf, 0, 0, text, { fg: [255,255,255] } as Style, size, diag);
  return grid.map(r => r.join('')).join('\n');
}
console.log('=== SINGLE (small, blocky) ===');  console.log(rt('SINGLE','small'));
console.log('=== TETRIS (big, blocky) ===');    console.log(rt('TETRIS','big'));
console.log('=== T-SPIN (big, blocky, diagonal) ==='); console.log(rt('T-SPIN','big',true));
