import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--token', process.env.TUI_TOKEN!],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, TETRIO_THEME: 'tetrio', TUI_AUTOPLAY: '1' } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  await term.press('down'); await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 3000 });
  await term.press('enter');
  // let the solver play for a while
  await new Promise(r => setTimeout(r, 6000));
  fs.writeFileSync('/tmp/autoplay.png', await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 15, devicePixelRatio: 2 }));
  // check the text to see progress
  console.log(await term.text({ immediate: true }));
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
