import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--token', process.env.TUI_TOKEN!],
    cols: 110, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  await term.waitIdle({ timeout: 1000 }).catch(() => {});
  // HOME menu
  fs.writeFileSync('/tmp/shot_home.png', await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 15, devicePixelRatio: 2 }));
  // open MULTIPLAYER
  await term.press('enter');
  await term.waitForText('ROOM LISTING', { timeout: 3000 }).catch(() => {});
  fs.writeFileSync('/tmp/shot_mp.png', await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 15, devicePixelRatio: 2 }));
  term.killProcess();
  console.log('done');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
