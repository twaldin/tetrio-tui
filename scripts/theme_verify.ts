import { setTheme, theme } from '../src/tui/themes.js';
import { THEME, pieceColor } from '../src/tui/draw.js';

console.log('Default theme base:', theme().base);
console.log('THEME.bg (proxy):', THEME.bg);

console.log('setTheme gruvbox:', setTheme('gruvbox'));
console.log('  theme().base:', theme().base);
console.log('  THEME.bg:', THEME.bg);
console.log('  theme().boardFrame:', theme().boardFrame);
console.log('  pieceColor("i"):', pieceColor('i'));
