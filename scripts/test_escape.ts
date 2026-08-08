import { launchTerminal } from 'tuistory';
async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--token', process.env.TUI_TOKEN!],
    cols: 90, rows: 30, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  await term.press('down'); await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 3000 });
  await term.press('enter');
  await term.waitIdle({ timeout: 500 }).catch(() => {});
  console.log('in game (40 LINES). Pressing escape...');
  const before = await term.text({ immediate: true });
  console.log('in game screen:', before.includes('esc forfeit'));
  await term.press('esc');
  await term.waitIdle({ timeout: 1500 }).catch(() => {});
  const after = await term.text({ immediate: true });
  console.log('after escape, back to menu?', after.includes('SOLO') || after.includes('MULTIPLAYER'));
  console.log('still in game?', after.includes('esc forfeit'));
  term.killProcess();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
