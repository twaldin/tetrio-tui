import { measureBigText } from '../src/tui/bigtext.js';
for (const s of ['SINGLE','DOUBLE','TRIPLE','QUAD']) {
  console.log(s, 'mini:', JSON.stringify(measureBigText(s,'mini')));
}
