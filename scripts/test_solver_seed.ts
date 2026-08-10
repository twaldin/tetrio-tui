import { launchTerminal } from 'tuistory';
async function main() {
  const seed = process.argv[2] ?? '31415';
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--offline'],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, TUI_AUTOPLAY: '1', TUI_TURBO: '1', TUI_SEED: seed } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 20000 });
  await term.press('down'); await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 5000 });
  await term.press('enter');
  let final = '';
  for (let i = 0; i < 400; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const txt = await term.text({ immediate: true });
    if (/esc back/i.test(txt)) { final = txt; break; }
  }
  console.log('seed', seed, '=>', /TOP OUT/i.test(final) ? 'TOP OUT (FAIL)' : 'CLEAR (ok)', final.match(/LINES\s+(\S+)/)?.[0] ?? '');
  term.killProcess(); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
