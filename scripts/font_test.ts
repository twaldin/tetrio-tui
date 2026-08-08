import { renderBigText, measureBigText } from '../src/tui/bigtext.js';
import type { Style } from '../src/tui/app.js';
function renderToText(text: string): string {
  const { width, height } = measureBigText(text);
  const grid: string[][] = Array.from({ length: height }, () => Array(width).fill(' '));
  const buf = { set(x: number, y: number, ch: string) { if (y >= 0 && y < height && x >= 0 && x < width) grid[y][x] = ch; }, drawText() {}, width, height } as any;
  renderBigText(buf, 0, 0, text, { fg: [255,255,255] } as Style);
  return grid.map(r => r.join('')).join('\n');
}
for (const s of ['SINGLE', 'DOUBLE', 'TETRIS', 'T-SPIN', 'CLEAR', 'TOP OUT']) {
  console.log('=== ' + s + ' ===');
  console.log(renderToText(s));
}
