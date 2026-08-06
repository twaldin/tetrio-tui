import { launchTerminal } from 'tuistory';
async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--guest', 'pilotdemo'],
    cols: 110, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  await term.press('down');
  await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 3000 });
  await term.press('enter');
  await term.waitIdle({ timeout: 800 }).catch(() => {});
  // harddrop 6 pieces in a row, alternating left/right
  const moves = ['left','left','space','right','right','space','x','space','z','space','down','space','space'];
  for (const k of moves) { await term.sendKey(k as any); await new Promise(r => setTimeout(r, 90)); }
  await term.waitIdle({ timeout: 600 }).catch(() => {});
  const frame = await term.text({ immediate: true });
  console.log(frame);
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
