import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
async function main() {
  const theme = process.argv[2] ?? 'synthwave';
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--guest', 'themecheck', '--theme', theme],
    cols: 110, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, TUI_AUTOPLAY: '1' } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  await term.press('down'); await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 4000 });
  await term.press('enter');
  await new Promise(r => setTimeout(r, 9000));
  fs.writeFileSync(`/tmp/usertheme_${theme}.png`, await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 14, devicePixelRatio: 2 }));
  console.log('captured', theme);
  term.killProcess(); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
