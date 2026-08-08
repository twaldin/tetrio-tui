// Record a rich demo: theme showcase (all 8) + a full auto-played 40-LINES game.
import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
import * as path from 'path';

const OUT_DIR = '/tmp/tui_demo2';
const COLS = 100, ROWS = 34;
const THEMES = ['tetrio', 'tokyo-night', 'catppuccin', 'gruvbox', 'nord', 'dracula', 'solarized', 'monokai'];

async function main() {
  const part = process.argv[2] ?? 'game'; // 'themes' | 'game'
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const frames: string[] = [];
  let fi = 0;
  const snapFrames: string[] = [];

  const mkTerm = async (env: Record<string, string | undefined>) => launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--token', process.env.TUI_TOKEN!],
    cols: COLS, rows: ROWS, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, ...env } as any,
    waitForDataTimeout: 15000,
  });

  const grab = async (term: any, label: string, n = 1) => {
    for (let i = 0; i < n; i++) {
      const data = term.getTerminalData();
      const png = await renderTerminalToImage(data, { fontSize: 15, devicePixelRatio: 2 });
      const p = path.join(OUT_DIR, `f${String(fi++).padStart(4, '0')}_${label}.png`);
      fs.writeFileSync(p, png);
      snapFrames.push(p);
    }
  };

  if (part === 'themes') {
    // Theme showcase: for each theme, show the game board with pieces.
    for (const theme of THEMES) {
      const term = await mkTerm({ TETRIO_THEME: theme, TUI_AUTOPLAY: '1' });
      await term.waitForText('MULTIPLAYER', { timeout: 15000 });
      await term.press('down'); await term.press('enter');
      await term.waitForText('40 LINES', { timeout: 3000 }).catch(() => {});
      await term.press('enter');
      await term.waitIdle({ timeout: 1200 }).catch(() => {});
      // let the solver place a few pieces so the board isn't empty
      for (let i = 0; i < 6; i++) { await term.sendKey('space' as any); await new Promise(r => setTimeout(r, 120)); }
      await term.waitIdle({ timeout: 400 }).catch(() => {});
      await grab(term, theme, 2);
      term.killProcess();
    }
  } else {
    // Full auto-played 40-lines game.
    const term = await mkTerm({ TETRIO_THEME: 'tetrio', TUI_AUTOPLAY: '1' });
    await term.waitForText('MULTIPLAYER', { timeout: 15000 });
    await term.press('down'); await term.press('enter');
    await term.waitForText('40 LINES', { timeout: 3000 }).catch(() => {});
    await grab(term, 'start', 1);
    await term.press('enter');
    await term.waitIdle({ timeout: 500 }).catch(() => {});
    // capture frames while the solver plays (it's auto-play)
    for (let i = 0; i < 240 && !((term as any).exitInfo); i++) {
      await new Promise(r => setTimeout(r, 90));
      await grab(term, 'game', 1);
      // stop if 40 lines cleared (the timer/stats show it) — heuristic: check text occasionally
      if (i % 20 === 0) {
        const txt = await term.text({ immediate: true });
        if (/TOP OUT|40:40|GAME OVER|completed/i.test(txt)) { await grab(term, 'end', 3); break; }
      }
    }
    await grab(term, 'end', 4);
    term.killProcess();
  }
  console.log('captured', snapFrames.length, 'frames to', OUT_DIR);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
