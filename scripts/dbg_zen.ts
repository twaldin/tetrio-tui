import { launchTerminal } from 'tuistory';
async function main() {
  const term = await launchTerminal({
    command: process.execPath,
    args: ['--import', 'tsx', 'src/index.ts', '--offline'],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { COLORTERM: 'truecolor', FORCE_COLOR: undefined, NO_COLOR: undefined, TUI_SEED: '4242' } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 20000 });
  await term.press('down'); await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 5000 });
  const solo = await term.text({ immediate: true });
  console.log('=== SOLO MENU ==='); console.log(solo.split('\n').filter((l: string) => l.trim()).slice(0, 14).join('\n'));
  await term.press('down'); await term.press('down');
  await term.press('enter');
  await new Promise(r => setTimeout(r, 1200));
  const txt = await term.text({ immediate: true });
  console.log('=== AFTER 2xDOWN+ENTER ==='); console.log(txt.split('\n').filter((l: string) => l.trim()).slice(0, 18).join('\n'));
  term.killProcess(); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
