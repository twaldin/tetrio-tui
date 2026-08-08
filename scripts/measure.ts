import { measureBigText } from '../src/tui/bigtext.js';
for (const s of ['SINGLE','DOUBLE','TRIPLE','TETRIS','QUAD','T-SPIN','MINI T-SPIN']) {
  console.log(s, 'small:', JSON.stringify(measureBigText(s,'small')), 'big:', JSON.stringify(measureBigText(s,'big')));
}
console.log('combo 8 big:', JSON.stringify(measureBigText('8','big')), 'small:', JSON.stringify(measureBigText('8','small')));
