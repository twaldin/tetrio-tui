import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
async function main() {
  const outPath = process.argv[2] ?? '/tmp/tui_shot.png';
  const mode = process.argv[3] ?? 'game';
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--guest', 'pilotdemo'],
    cols: 110, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  if (mode === 'menu') {
    // home menu
  } else if (mode === 'game') {
    await term.press('down'); await term.press('enter');
    await term.waitForText('40 LINES', { timeout: 3000 });
    await term.press('enter');
    await term.waitIdle({ timeout: 800 }).catch(() => {});
    // play deliberately: move left/right to spread pieces, harddrop
    const moves = ['left','left','left','left','space','right','right','right','right','right','space','left','left','space','x','space','right','space','z','space'];
    for (const k of moves) { await term.sendKey(k as any); await new Promise(r => setTimeout(r, 130)); }
    await term.waitIdle({ timeout: 500 }).catch(() => {});
  }
  const data = (term as any).getTerminalData();
  fs.writeFileSync(outPath, await renderTerminalToImage(data, { fontSize: 14, devicePixelRatio: 2 }));
  console.log('wrote', outPath);
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
