import { launchTerminal } from 'tuistory';
async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--guest', 'demo', '--theme', 'tetrio'],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, TUI_AUTOPLAY: '1', TUI_SEED: '20260809' } as any,
    waitForDataTimeout: 15000,
  });
  try {
    await term.waitForText('MULTIPLAYER', { timeout: 15000 });
    console.log('home OK');
    await term.press('down'); await term.press('enter');
    await new Promise(r => setTimeout(r, 1500));
    const txt = await term.text({ immediate: true });
    console.log('--- screen after down+enter ---');
    console.log(txt.slice(0, 1200));
  } catch (e) {
    console.log('FAILED, screen:');
    try { console.log((await term.text({ immediate: true })).slice(0, 1200)); } catch {}
  }
  term.killProcess(); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
