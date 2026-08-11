/** Verify: after the animation cycles themes, skipping restores the user's configured theme/style. */
import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
import * as path from 'path';

async function launch(dir: string) {
  return await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts'],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, XDG_CONFIG_HOME: dir } as any,
    waitForDataTimeout: 20000,
  });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function accountAccentPng(dir: string, file: string, skipAfterMs: number) {
  const term = await launch(dir);
  try {
    await sleep(skipAfterMs);
    await term.press('space');
    await term.waitForText('not signed in', { timeout: 8000 });
    await sleep(400);
    fs.writeFileSync(`/tmp/st_shots/${file}`, await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 15, devicePixelRatio: 2 }));
  } finally { term.killProcess(); }
}

async function main() {
  const dir = '/tmp/st_cfg_restore';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'tetrio-tui'), { recursive: true });
  // user's configured theme: gruvbox (cycle starts at tetrio idx... wait, savedTheme is gruvbox)
  fs.writeFileSync(path.join(dir, 'tetrio-tui', 'config.json'), JSON.stringify({ video: { theme: 'gruvbox', pieceStyle: 'gradient' } }));
  // A: skip immediately (before any cycle) — account in gruvbox
  await accountAccentPng(dir, 't_restore_early.png', 1200);
  // B: skip after 12s (>=2 cycles happened) — account must STILL be gruvbox
  await accountAccentPng(dir, 't_restore_late.png', 12000);
  console.log('captured');
}
main().catch((e) => { console.error(e); process.exit(1); });
