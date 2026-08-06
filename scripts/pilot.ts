import { launchTerminal } from 'tuistory';

async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--guest', 'pilotdemo'],
    cols: 110, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined } as any,
    waitForDataTimeout: 15000,
  });
  // Wait for the HOME menu to actually appear
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  await term.waitIdle({ timeout: 1000 }).catch(() => {});
  console.log('=== HOME (ready) ===');
  console.log(await term.text({ immediate: true }));

  // Navigate to SOLO (index 1), open it
  await term.press('down');
  await term.waitIdle({ timeout: 400 }).catch(() => {});
  await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 3000 }).catch(() => {});
  console.log('=== SOLO MENU ===');
  console.log(await term.text({ immediate: true }));

  // Start 40 LINES
  await term.press('enter');
  await term.waitIdle({ timeout: 800 }).catch(() => {});
  console.log('=== GAME ===');
  // play a few moves
  for (const k of ['left','space','left','space','x','space','right','space','space']) {
    await term.sendKey(k as any);
    await new Promise(r => setTimeout(r, 120));
  }
  await term.waitIdle({ timeout: 500 }).catch(() => {});
  console.log(await term.text({ immediate: true }));
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
