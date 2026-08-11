// Live QP pilot: guest login -> MULTIPLAYER -> QUICK PLAY -> start climb (autoplay) -> screenshot mid-match.
import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';

async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--guest', 'qppilot' + Math.random().toString(36).slice(2, 5)],
    cols: 120, rows: 36, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, TUI_AUTOPLAY: '1', TUI_DEBUG: '1' } as any,
    waitForDataTimeout: 20000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 20000 });
  await term.press('enter'); // MULTIPLAYER
  await new Promise(r => setTimeout(r, 800));
  await term.press('enter'); // QUICK PLAY (first item)
  await term.waitForText('QUICK PLAY', { timeout: 8000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000)); // room join + migrate
  console.log('=== QP LOBBY ===');
  console.log(await term.text({ immediate: true }));
  fs.writeFileSync('/tmp/tui_qp_lobby.png', await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 14, devicePixelRatio: 2 }));

  await term.press('enter'); // start climb
  console.log('pressed enter (start climb); waiting for game…');
  await new Promise(r => setTimeout(r, 4000));
  console.log('=== after 4s ===');
  console.log(await term.text({ immediate: true }));

  // let autoplay play ~25s, then screenshot mid-match
  await new Promise(r => setTimeout(r, 25000));
  console.log('=== after ~29s (mid-match) ===');
  console.log(await term.text({ immediate: true }));
  fs.writeFileSync('/tmp/tui_qp_game.png', await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 14, devicePixelRatio: 2 }));
  console.log('wrote /tmp/tui_qp_lobby.png and /tmp/tui_qp_game.png');

  // debug state
  try { console.log('app_debug:', fs.readFileSync('/tmp/app_debug.json', 'utf8')); } catch {}
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
