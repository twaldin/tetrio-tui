import { renderBigText, measureBigText } from '../src/tui/bigtext.js';
import type { Style } from '../src/tui/app.js';
function rt(text: string, size: any): string {
  const { width, height } = measureBigText(text, size);
  const grid: string[][] = Array.from({ length: height }, () => Array(width).fill(' '));
  const buf = { set(x: number, y: number, ch: string) { if (y>=0&&y<height&&x>=0&&x<width) grid[y][x]=ch; }, drawText(){}, width, height } as any;
  renderBigText(buf, 0, 0, text, { fg: [255,255,255] } as Style, size);
  return grid.map(r => r.join('')).join('\n');
}
console.log('=== SINGLE mini (w=' + measureBigText('SINGLE','mini').width + ') ===');
console.log(rt('SINGLE','mini'));
console.log('=== QUAD mini ===');
console.log(rt('QUAD','mini'));
