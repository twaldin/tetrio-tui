// Demo recorder v3 — theme showcase, piece-style × border combos, minimal vs
// animated, full 40L game (GIF) and a 2-minute BLITZ game (MP4). All games are
// auto-played by the B2B-chaining solver.
//
// Usage: npx tsx scripts/record_demo3.ts <themes|configs|minimal|game40|blitz> [outDir]
import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
import * as path from 'path';

const COLS = 100, ROWS = 34;
const BUILT_IN_THEMES = ['tetrio', 'tokyo-night', 'catppuccin', 'gruvbox', 'nord', 'dracula', 'solarized', 'monokai'];
// piece-style × border combos that each read distinctly
const CONFIG_COMBOS: [string, string][] = [
  ['bevel', 'rounded'],
  ['flat', 'none'],
  ['shiny', 'double'],
  ['halfblock', 'mixed'],
  ['outline', 'single'],
  ['gradient', 'heavy'],
  ['flat', 'ascii'],
];

async function main() {
  const part = process.argv[2] ?? 'game40';
  const OUT_DIR = process.argv[3] ?? `/tmp/tui_demo3_${part}`;
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let fi = 0;
  const frames: string[] = [];

  const mkTerm = (extraArgs: string[] = [], env: Record<string, string | undefined> = {}) => launchTerminal({
    command: 'npx',
    args: ['tsx', 'src/index.ts', '--offline', ...extraArgs],
    cols: COLS, rows: ROWS, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, TUI_AUTOPLAY: '1', TUI_SEED: '20260809', ...env } as any,
    waitForDataTimeout: 15000,
  });

  let grabDpr = 2; // stills are crisp; game sections drop to 1 for capture speed
  const grab = async (term: any, n = 1) => {
    for (let i = 0; i < n; i++) {
      const png = await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 15, devicePixelRatio: grabDpr });
      const p = path.join(OUT_DIR, `f${String(fi++).padStart(4, '0')}.png`);
      fs.writeFileSync(p, png);
      frames.push(p);
    }
  };

  /** Launch into a solo game (mode = '40l' | 'blitz') with the given CLI args; returns the live term. */
  const intoGame = async (mode: '40l' | 'blitz', extraArgs: string[] = [], env = {}) => {
    const term = await mkTerm(extraArgs, env);
    await term.waitForText('MULTIPLAYER', { timeout: 15000 });
    await term.press('down'); await term.press('enter');            // SOLO
    await term.waitForText('40 LINES', { timeout: 5000 });
    if (mode === 'blitz') await term.press('down');                 // highlight BLITZ
    await term.press('enter');
    await term.waitIdle({ timeout: 900 }).catch(() => {});
    return term;
  };

  if (part === 'themes') {
    // Each theme in-game with a handful of pieces on the board (~0.6s each at 20fps).
    for (const theme of BUILT_IN_THEMES) {
      const term = await intoGame('40l', ['--theme', theme]);
      await new Promise((r) => setTimeout(r, 5200)); // a few pieces land
      await grab(term, 12);
      term.killProcess();
    }
  } else if (part === 'configs') {
    for (const [ps, bs] of CONFIG_COMBOS) {
      const term = await intoGame('40l', ['--piece-style', ps, '--border-style', bs]);
      await new Promise((r) => setTimeout(r, 5200));
      await grab(term, 11);
      term.killProcess();
    }
  } else if (part === 'minimal') {
    // animated first (big text + effects), then minimal — same seed so the boards match.
    const a = await intoGame('40l', []);
    await new Promise((r) => setTimeout(r, 9000));   // deep enough for a clear + big text
    await grab(a, 26);
    a.killProcess();
    const m = await intoGame('40l', ['--minimal']);
    await new Promise((r) => setTimeout(r, 9000));
    await grab(m, 26);
    m.killProcess();
  } else if (part === 'game40') {
    grabDpr = 1; // fast capture ≈ real-time playback at 20fps
    const term = await intoGame('40l');
    await grab(term, 16); // calm before (~0.8s)
    // autoplay to completion (~2.7 PPS solver pace); poll for the results screen
    for (let i = 0; i < 2400; i++) {
      await grab(term, 1);
      if (i % 25 === 0) {
        const txt = await term.text({ immediate: true });
        if (/esc back/i.test(txt)) break;
      }
    }
    await grab(term, 60); // hold the CLEAR + results (~3s)
    term.killProcess();
  } else if (part === 'blitz') {
    grabDpr = 1;
    const term = await intoGame('blitz');
    await grab(term, 20); // calm before
    // 2-minute game: capture as fast as renders allow (≈20fps) until TIME UP
    for (let i = 0; i < 4000; i++) {
      await grab(term, 1);
      if (i % 50 === 0) {
        const txt = await term.text({ immediate: true });
        if (/esc back/i.test(txt)) break;
      }
    }
    await grab(term, 80); // hold TIME UP + score results
    term.killProcess();
  }
  console.log('captured', frames.length, 'frames to', OUT_DIR);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
