// QA matrix capture: themes x piece styles x borders x modes — adversarial review fodder.
// Usage: npx tsx scripts/qa_matrix.ts <pieces|borders|modes|fonts|menus> [outBase]
import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
import * as path from 'path';

const COLS = 100, ROWS = 34;
const THEMES = ['tetrio', 'tokyo-night', 'catppuccin', 'gruvbox', 'nord', 'dracula', 'solarized', 'monokai'];
const PIECE_STYLES = ['bevel', 'flat', 'outline', 'gradient', 'halfblock', 'shiny'];
const BORDERS = ['rounded', 'single', 'double', 'heavy', 'mixed', 'ascii', 'none'];

async function main() {
  const part = process.argv[2] ?? 'pieces';
  const OUT = process.argv[3] ?? `/tmp/qa_${part}`;
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const mk = (args: string[] = [], env: Record<string, string> = {}) => launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--offline', ...args],
    cols: COLS, rows: ROWS, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, TUI_AUTOPLAY: '1', TUI_SEED: '31415', ...env } as any,
    waitForDataTimeout: 15000,
  });
  const snap = async (term: any, name: string) => {
    const png = await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 15, devicePixelRatio: 2 });
    fs.writeFileSync(path.join(OUT, name + '.png'), png);
  };
  const intoGame = async (term: any, mode = 0) => {
    await term.waitForText('MULTIPLAYER', { timeout: 20000 });
    await term.press('down'); await term.press('enter');
    await term.waitForText('40 LINES', { timeout: 5000 });
    for (let i = 0; i < mode; i++) await term.press('down');
    await term.press('enter');
    await term.waitIdle({ timeout: 800 }).catch(() => {});
  };

  if (part === 'pieces') {
    // 8 themes x 6 piece styles, mid-game with stack + falling piece + ghost
    for (const th of THEMES) {
      for (const ps of PIECE_STYLES) {
        const term = await mk(['--theme', th, '--piece-style', ps]);
        await intoGame(term);
        await new Promise((r) => setTimeout(r, 6000)); // stack builds, ghost visible
        await snap(term, `${th}__${ps}`);
        term.killProcess();
      }
    }
  } else if (part === 'borders') {
    for (const bs of BORDERS) {
      const term = await mk(['--border-style', bs]);
      await intoGame(term);
      await new Promise((r) => setTimeout(r, 6000));
      await snap(term, `border__${bs}`);
      term.killProcess();
    }
  } else if (part === 'modes') {
    // blitz HUD, zen, practice, minimal, results screens
    const blitz = await mk(); await intoGame(blitz, 1);
    await new Promise((r) => setTimeout(r, 8000)); await snap(blitz, 'mode__blitz'); blitz.killProcess();
    const zen = await mk(); await intoGame(zen, 3);
    await new Promise((r) => setTimeout(r, 6000)); await snap(zen, 'mode__zen'); zen.killProcess();
    const prac = await mk(); await intoGame(prac, 4);
    await new Promise((r) => setTimeout(r, 6000)); await snap(prac, 'mode__practice'); prac.killProcess();
    const min = await mk(['--minimal']); await intoGame(min);
    await new Promise((r) => setTimeout(r, 7000)); await snap(min, 'mode__minimal'); min.killProcess();
    // CLEAR results: full 40L autoplay (~40s). Poll for a results-only marker —
    // 'esc back' also appears on TOP OUT (matched early = false capture).
    const fin = await mk(); await intoGame(fin);
    for (let i = 0; i < 240; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const txt = await fin.text({ immediate: true });
      if (/MAX COMBO/i.test(txt)) break;
    }
    await snap(fin, 'mode__results_clear'); fin.killProcess();
    // TOP OUT: hard-drop straight up the middle at high gravity? easiest: stack center fast
    const top = await mk([], { TUI_SEED: '1' }); await intoGame(top);
    for (let i = 0; i < 200; i++) { await top.press('space'); await new Promise((r) => setTimeout(r, 25)); }
    await new Promise((r) => setTimeout(r, 600));
    await snap(top, 'mode__topout'); top.killProcess();
  } else if (part === 'fonts') {
    // capture clear-word moments (QUAD / SINGLE big text) + b2b indicator across themes
    for (const th of ['tetrio', 'catppuccin', 'gruvbox']) {
      const term = await mk(['--theme', th]);
      await intoGame(term);
      // poll until a clear word shows (QUAD/SINGLE/TRIPLE) then snapshot
      let got = false;
      for (let i = 0; i < 200 && !got; i++) {
        await new Promise((r) => setTimeout(r, 120));
        const txt = await term.text({ immediate: true });
        if (/QUAD|TRIPLE|SINGLE|DOUBLE/.test(txt)) { await snap(term, `font_${th}__clearword`); got = true; }
      }
      if (!got) await snap(term, `font_${th}__clearword_miss`);
      term.killProcess();
    }
  } else if (part === 'menus') {
    for (const th of THEMES) {
      const term = await mk(['--theme', th]);
      await term.waitForText('MULTIPLAYER', { timeout: 20000 });
      await new Promise((r) => setTimeout(r, 400));
      await snap(term, `menu_${th}__home`);
      // config video screen
      await term.press('down'); await term.press('down'); await term.press('down'); await term.press('enter');
      await term.waitForText('VIDEO', { timeout: 5000 });
      await term.press('down'); await term.press('down'); await term.press('enter');
      await term.waitForText('PIECE STYLE', { timeout: 5000 });
      await snap(term, `menu_${th}__config_video`);
      term.killProcess();
    }
  }
  console.log('done', part, fs.readdirSync(OUT).length, 'shots in', OUT);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
