import { loadUserThemes, THEMES, themeKeys, setTheme, theme } from '../src/tui/themes.js';
const res = loadUserThemes();
console.log('load results:', JSON.stringify(res));
console.log('theme keys:', themeKeys().join(', '));
if (!setTheme('synthwave')) { console.log('FAIL: synthwave not registered'); process.exit(1); }
const t = theme();
console.log('accent:', t.accent, 'pieces.i:', t.pieces.i, 'borders:', (t as any).borders, 'words:', (t as any).words);
if (t.accent[0] !== 255 || t.accent[1] !== 46) { console.log('FAIL: accent parse'); process.exit(1); }
console.log('OK: disk theme loads, colors+borders+words parsed');
