// Record a demo GIF: drive the app through a clean 40-lines run, capture frames, assemble GIF.
import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
import * as path from 'path';

const OUT_DIR = '/tmp/tui_frames';
const COLS = 96, ROWS = 34;

async function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--token', process.env.TUI_TOKEN],
    cols: COLS, rows: ROWS, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined } as any,
    waitForDataTimeout: 15000,
  });

  const frames: string[] = [];
  let fi = 0;
  const snap = async () => {
    const data = (term as any).getTerminalData();
    const png = await renderTerminalToImage(data, { fontSize: 15, devicePixelRatio: 2 });
    const p = path.join(OUT_DIR, `f${String(fi++).padStart(4, '0')}.png`);
    fs.writeFileSync(p, png);
    frames.push(p);
  };

  // login -> home
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  await term.waitIdle({ timeout: 500 }).catch(() => {});
  await snap();
  await snap();

  // navigate to SOLO -> 40 LINES
  await term.press('down');
  await snap();
  await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 3000 }).catch(() => {});
  await snap();
  await term.press('enter');
  await term.waitIdle({ timeout: 800 }).catch(() => {});
  await snap();

  // Play a clean sequence: spread pieces left and right with rotations + a few harddrops.
  const script: string[] = [
    'left','left','left','left','space',
    'right','right','right','right','right','space',
    'left','left','space','right','right','space',
    'x','space','z','space',
    'left','space','right','space',
  ];
  for (const k of script) {
    await term.sendKey(k as any);
    await new Promise(r => setTimeout(r, 160));
    await snap();
  }
  // a few more frames to show the settled board
  await new Promise(r => setTimeout(r, 600)); await snap();

  console.log('captured', frames.length, 'frames');
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
