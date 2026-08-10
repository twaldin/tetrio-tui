// Turbo autoplay benchmark: time a full 40L and a full 2-min blitz at TUI_TURBO=1.
import { launchTerminal } from 'tuistory';
async function run(mode: '40l' | 'blitz') {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--offline'],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, TUI_AUTOPLAY: '1', TUI_TURBO: '1' } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 20000 });
  await term.press('down'); await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 5000 });
  if (mode === 'blitz') await term.press('down');
  await term.press('enter');
  const t0 = Date.now();
  let final = '';
  for (let i = 0; i < (mode === 'blitz' ? 1500 : 300); i++) {
    await new Promise((r) => setTimeout(r, 200));
    const txt = await term.text({ immediate: true });
    if (/esc back/i.test(txt)) { final = txt; break; }
  }
  const wall = (Date.now() - t0) / 1000;
  const grab = (re: RegExp) => { const m = final.match(re); return m ? m[1] : '?'; };
  if (mode === '40l') {
    console.log(`40L turbo: wall=${wall.toFixed(1)}s | TIME ${grab(/TIME\s+(\S+)/)} | PIECES ${grab(/PIECES\s+(\d+)/)} | PPS ${grab(/PPS\s+(\S+)/)} | MAX B2B ${grab(/MAX B2B\s+(\d+)/)}`);
  } else {
    console.log(`BLITZ turbo: wall=${wall.toFixed(1)}s | SCORE ${grab(/SCORE\s+(\d+)/)} | LINES ${grab(/LINES\s+(\d+)/)} | PIECES ${grab(/PIECES\s+(\d+)/)} | PPS ${grab(/PPS\s+(\S+)/)} | MAX B2B ${grab(/MAX B2B\s+(\d+)/)}`);
  }
  term.killProcess();
}
async function main() {
  await run(process.argv[2] === 'blitz' ? 'blitz' : '40l');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
