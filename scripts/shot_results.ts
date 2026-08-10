import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--offline'],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, TUI_AUTOPLAY: '1', TUI_TURBO: '1', TUI_SEED: '20260809' } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 20000 });
  await term.press('down'); await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 5000 });
  await term.press('enter');
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const txt = await term.text({ immediate: true });
    if (/MAX COMBO/i.test(txt)) break;
  }
  fs.writeFileSync('/tmp/verify_results.png', await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 15, devicePixelRatio: 2 }));
  console.log('captured results');
  term.killProcess(); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
