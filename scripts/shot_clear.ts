import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--token', process.env.TUI_TOKEN!, '--autoplay'],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, TETRIO_THEME: 'tetrio' } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  await term.press('down'); await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 3000 });
  await term.press('enter');
  // capture several frames to catch a line clear
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 200));
    const data = (term as any).getTerminalData();
    fs.writeFileSync(`/tmp/clear_${String(i).padStart(2,'0')}.png`, await renderTerminalToImage(data, { fontSize: 15, devicePixelRatio: 2 }));
  }
  term.killProcess();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
