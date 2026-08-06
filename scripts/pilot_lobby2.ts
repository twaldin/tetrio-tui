import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--guest', 'pilotdemo'],
    cols: 110, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  await term.press('enter');
  await term.waitForText('ROOM LISTING', { timeout: 3000 });
  await term.press('down'); await term.press('down');
  await term.press('enter'); // open room listing
  await term.waitIdle({ timeout: 3000 }).catch(() => {});
  // join GQHU by id
  await term.press('j');
  await term.type('GQHU');
  await term.press('enter');
  await term.waitIdle({ timeout: 5000 }).catch(() => {});
  console.log(await term.text({ immediate: true }));
  const data = (term as any).getTerminalData();
  fs.writeFileSync('/tmp/tui_lobby2.png', await renderTerminalToImage(data, { fontSize: 14, devicePixelRatio: 2 }));
  console.log('wrote /tmp/tui_lobby2.png');
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
