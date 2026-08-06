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
  await term.press('enter'); // MULTIPLAYER
  await term.waitForText('ROOM LISTING', { timeout: 3000 });
  await term.press('down'); await term.press('down'); // ROOM LISTING
  await term.press('enter');
  await term.waitIdle({ timeout: 8000 }).catch(() => {});
  // navigate to an anons-ok room (skip 'no anons' rooms) and join
  await term.press('down');
  await term.press('enter');
  await term.waitIdle({ timeout: 8000 }).catch(() => {});
  console.log('=== LOBBY ===');
  console.log(await term.text({ immediate: true }));
  const data = (term as any).getTerminalData();
  fs.writeFileSync('/tmp/tui_lobby.png', await renderTerminalToImage(data, { fontSize: 14, devicePixelRatio: 2 }));
  console.log('wrote /tmp/tui_lobby.png');
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
