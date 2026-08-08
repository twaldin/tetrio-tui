
/** PTY end-to-end mouse verification against scripts/config_demo.ts (tuistory). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchTerminal } from 'tuistory';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tetrio-tui-mouse-pty-'));

const session = await launchTerminal({
  command: process.execPath,
  args: ['--import', 'tsx', path.join('scripts', 'config_demo.ts'), '--config-dir', configDir],
  cols: 90,
  rows: 34,
  cwd: projectRoot,
  env: { COLORTERM: 'truecolor', FORCE_COLOR: undefined, NO_COLOR: undefined },
});

const assert = (c: boolean, msg: string) => { if (!c) { console.error('FAIL: ' + msg); process.exit(1); } else console.log('ok: ' + msg); };

try {
  // driver enabled SGR mouse tracking?
  await session.waitForText('CONTROLS', { timeout: 20000 });
  assert(session.getRawOutput().includes('\x1b[?1006h'), 'driver wrote SGR mouse enable (1006h)');
  assert(session.getRawOutput().includes('\x1b[?1003h'), 'driver wrote any-event tracking enable (1003h)');

  // 1. click HANDLING -> selects AND activates (enters the HANDLING screen)
  await session.click('HANDLING');
  await session.waitForText('ARR', { timeout: 5000 });
  assert(true, 'click on menu item activated it (HANDLING screen shown)');
  await session.press('escape');
  await session.waitForText('CONTROLS', { timeout: 5000 });

  // 2. hover over VIDEO moves the selection (then enter opens VIDEO)
  //    root menu items at 0-based rows 5,9,13,17 -> VIDEO label row 13, col ~45
  session.writeRaw('\x1b[<35;46;14M');
  await session.waitIdle();
  await session.press('return');
  await session.waitForText('PIECE STYLE', { timeout: 5000 });
  assert(true, 'hover moved selection (enter after hover opened VIDEO)');

  // 3. click a config row: EFFECTS toggle -> [ OFF ]
  await session.click('EFFECTS');
  await session.waitForText('[ OFF ]', { timeout: 5000 });
  const saved = JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf8'));
  assert(saved.video.effects === false, 'clicking a config row toggled + persisted (effects=false)');

  // 4. scroll wheel moves the selection: scroll down twice from EFFECTS -> COLOR MODE(1) TARGET FPS(2)... rows: EFFECTS, COLOR MODE, TARGET FPS
  await session.scrollDown(1);
  await session.waitIdle();
  await session.press('return');   // now on COLOR MODE -> cycles truecolor -> 256
  await session.waitForText(/‹ 256 ›/, { timeout: 5000 });
  assert(true, 'scroll moved selection, enter cycled COLOR MODE');

  // 5. keyboard still works: down+return from COLOR MODE... scroll up first to be safe
  await session.press('escape');
  await session.waitForText('CONTROLS', { timeout: 5000 });
  await session.press('return');   // idx preserved? root menu kept its own idx; CONTROLS idx 0... it was hovered to VIDEO? no - that was hover on root menu (idx=2 VIDEO). enter should reopen VIDEO
  const t = await session.text({ immediate: true });
  assert(t.includes('PIECE STYLE') || t.includes('MOVE LEFT'), 'keyboard navigation still functional after mouse use');

  // 6. clean exit restores mouse mode
  await session.press('escape');   // back to root if we entered a screen
  await session.press('escape');   // quit from root
  await new Promise((r) => setTimeout(r, 800));
  assert(session.getRawOutput().includes('\x1b[?1003l'), 'driver wrote mouse disable (1003l) on exit');
  console.log('ALL PTY MOUSE ASSERTIONS PASSED');
} finally {
  session.close();
}
process.exit(0);
