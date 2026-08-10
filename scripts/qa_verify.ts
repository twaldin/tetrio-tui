import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
async function shot(name: string, args: string[]) {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--offline', ...args],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, TUI_AUTOPLAY: '1', TUI_SEED: '31415' } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 20000 });
  await term.press('down'); await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 5000 });
  await term.press('enter');
  await new Promise((r) => setTimeout(r, 6000));
  fs.writeFileSync(`/tmp/verify_${name}.png`, await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 15, devicePixelRatio: 2 }));
  console.log('captured', name);
  term.killProcess();
}
async function main() {
  await shot('dracula_flat_ghost', ['--theme', 'dracula', '--piece-style', 'flat']);
  await shot('tetrio_bevel', ['--theme', 'tetrio', '--piece-style', 'bevel']);
  await shot('tetrio_halfblock', ['--theme', 'tetrio', '--piece-style', 'halfblock']);
  await shot('tetrio_shiny_ghost', ['--theme', 'tetrio', '--piece-style', 'shiny']);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
