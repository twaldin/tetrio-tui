import { launchTerminal } from 'tuistory';
async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--token', process.env.TUI_TOKEN!],
    cols: 90, rows: 30, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  // navigate to CONFIG (down x3), enter
  await term.press('down'); await term.press('down'); await term.press('down');
  await term.press('enter');
  await term.waitIdle({ timeout: 800 }).catch(() => {});
  const inConfig = await term.text({ immediate: true });
  console.log('in CONFIG?', inConfig.includes('CONFIG') || inConfig.includes('CONTROLS'));
  // escape back to home
  await term.press('esc');
  await term.waitIdle({ timeout: 800 }).catch(() => {});
  const afterEsc = await term.text({ immediate: true });
  console.log('back to HOME after esc?', afterEsc.includes('MULTIPLAYER') && afterEsc.includes('TETRA CHANNEL'));
  // escape again should quit (the process will exit)
  term.killProcess();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
