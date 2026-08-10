import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
async function main() {
  const style = process.argv[2] ?? 'bevel';
  const theme = process.argv[3] ?? 'tetrio';
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--offline', '--piece-style', style, '--theme', theme],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, TUI_SEED: '5' } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 20000 });
  await term.press('down'); await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 5000 });
  await term.press('enter');
  await term.waitIdle({ timeout: 700 }).catch(() => {});
  // drop 3 pieces to build a small stack, then let the 4th float (ghost visible)
  for (let i = 0; i < 3; i++) { await term.press('space'); await new Promise((r) => setTimeout(r, 250)); }
  await new Promise((r) => setTimeout(r, 150));
  fs.writeFileSync(`/tmp/ghost_${style}_${theme}.png`, await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 15, devicePixelRatio: 2 }));
  console.log('captured', style, theme);
  term.killProcess(); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
