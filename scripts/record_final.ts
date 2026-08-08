// Final demo: theme showcase (longer, each theme shown) + a calm, complete 40-lines game.
import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
import * as path from 'path';

const OUT_DIR = process.argv[3] ?? '/tmp/tui_final';
const COLS = 100, ROWS = 34;
const THEMES = ['tetrio', 'tokyo-night', 'catppuccin', 'gruvbox', 'nord', 'dracula', 'solarized', 'monokai'];

async function main() {
  const part = process.argv[2] ?? 'game';
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let fi = 0;
  const frames: string[] = [];

  const mkTerm = async (env: Record<string, string | undefined>) => launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--token', process.env.TUI_TOKEN!],
    cols: COLS, rows: ROWS, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, ...env } as any,
    waitForDataTimeout: 15000,
  });
  const grab = async (term: any, n = 1) => {
    for (let i = 0; i < n; i++) {
      const png = await renderTerminalToImage(term.getTerminalData(), { fontSize: 15, devicePixelRatio: 2 });
      const p = path.join(OUT_DIR, `f${String(fi++).padStart(4, '0')}.png`);
      fs.writeFileSync(p, png);
      frames.push(p);
    }
  };

  if (part === 'themes') {
    for (const theme of THEMES) {
      const term = await mkTerm({ TETRIO_THEME: theme, TUI_AUTOPLAY: '1' });
      await term.waitForText('MULTIPLAYER', { timeout: 15000 });
      await term.press('down'); await term.press('enter');
      await term.waitForText('40 LINES', { timeout: 3000 }).catch(() => {});
      await term.press('enter');
      await term.waitIdle({ timeout: 2500 }).catch(() => {});
      await grab(term, 5); // ~5 frames per theme for a longer showcase
      term.killProcess();
    }
  } else {
    const term = await mkTerm({ TETRIO_THEME: 'tetrio', TUI_AUTOPLAY: '1' });
    await term.waitForText('MULTIPLAYER', { timeout: 15000 });
    await term.press('down'); await term.press('enter');
    await term.waitForText('40 LINES', { timeout: 3000 }).catch(() => {});
    await grab(term, 2); // menu
    await term.press('enter');
    // CALM BEFORE: hold on the empty board a moment
    await term.waitIdle({ timeout: 800 }).catch(() => {});
    await grab(term, 4);
    // the game plays itself at a calm pace; capture frames
    for (let i = 0; i < 220; i++) {
      await new Promise(r => setTimeout(r, 120));
      await grab(term, 1);
      const txt = await term.text({ immediate: true });
      if (/TOP OUT|completed|40.*40/i.test(txt)) { await grab(term, 6); break; }
    }
    // CALM AFTER: hold the final board
    await grab(term, 8);
    term.killProcess();
  }
  console.log('captured', frames.length, 'frames to', OUT_DIR);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
