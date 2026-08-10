// Char-leakage soak: play fast for a while, then verify NOTHING lingers that
// shouldn't — bigtext pixels, particles, ghosts, popups. Also compares the
// post-game HOME menu against a fresh launch's menu (image diff).
// Usage: npx tsx scripts/soak_leaks.ts [seconds]
import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';

const SECONDS = parseInt(process.argv[2] ?? '45', 10);
const COLS = 100, ROWS = 34;

// glyphs that may legitimately appear on an idle game screen (box drawing, blocks, letters)
const IDLE_ALLOWED = new Set(' ╭╮╰╯─│┏┓┗┛━┃┌┐└┘╔╗╚╝═║╓╖╙╜╴║▀┤├╡╞┥┝+-|><#=.ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/:_▌▀▄█░▓Γ'.split(''));

async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--offline'],
    cols: COLS, rows: ROWS, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, TUI_AUTOPLAY: '1' } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 20000 });
  const menuFreshTxt = await term.text({ immediate: true });

  await term.press('down'); await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 5000 });
  await term.press('enter');
  await term.waitIdle({ timeout: 800 }).catch(() => {});

  let maxAnomalies = 0;
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < SECONDS) {
    await new Promise((r) => setTimeout(r, 100));
    const txt = await term.text({ immediate: true });
    // crude leak check DURING play: bigtext words must decay — a QUAD older than ~2s is a leak.
    // (we can't time it here precisely, so we track only the idle checks below)
  }

  // IDLE check: stop the game (forfeit) then look for residue on the results screen
  await term.press('escape');
  await new Promise((r) => setTimeout(r, 3000)); // effects fully decay
  const afterTxt = await term.text({ immediate: true });
  const bad: string[] = [];
  for (const line of afterTxt.split('\n')) {
    for (const ch of line) {
      if (!IDLE_ALLOWED.has(ch)) bad.push(ch);
    }
  }
  console.log('post-game disallowed glyphs:', bad.length ? JSON.stringify([...new Set(bad)]) : 'none');

  // menu comparison: back at HOME, text must equal the fresh menu
  await term.press('escape');
  await new Promise((r) => setTimeout(r, 700));
  const menuAfterTxt = await term.text({ immediate: true });
  const freshLines = menuFreshTxt.split('\n').map((l) => l.trimEnd());
  const afterLines = menuAfterTxt.split('\n').map((l) => l.trimEnd());
  let diffs = 0;
  for (let y = 0; y < Math.max(freshLines.length, afterLines.length); y++) {
    if ((freshLines[y] ?? '') !== (afterLines[y] ?? '')) diffs++;
  }
  console.log('menu text diff lines after soak:', diffs);

  // image-level diff of the two menus (catches bg-color leaks invisible in text)
  fs.writeFileSync('/tmp/soak_menu_after.png', await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 15, devicePixelRatio: 1 }));
  term.killProcess();

  const fresh = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--offline'],
    cols: COLS, rows: ROWS, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined } as any,
    waitForDataTimeout: 15000,
  });
  await fresh.waitForText('MULTIPLAYER', { timeout: 20000 });
  fs.writeFileSync('/tmp/soak_menu_fresh.png', await renderTerminalToImage((fresh as any).getTerminalData(), { fontSize: 15, devicePixelRatio: 1 }));
  fresh.killProcess();
  console.log('menu images written for diff');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
