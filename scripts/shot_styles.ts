import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';

// Capture the autoplay game screen once per piece-style / border-style / minimal combo.
async function shot(name: string, extraArgs: string[], env: Record<string, string> = {}) {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--guest', 'styleshot', ...extraArgs],
    cols: 110, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, TUI_AUTOPLAY: '1', ...env } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  await term.press('down'); await term.press('enter');       // SOLO
  await term.waitForText('40 LINES', { timeout: 4000 });
  await term.press('enter');                                  // start 40L autoplay
  await new Promise(r => setTimeout(r, 9000));                // let some pieces land
  const png = await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 14, devicePixelRatio: 2 });
  fs.writeFileSync(`/tmp/style_${name}.png`, png);
  console.log('captured', name);
  term.killProcess();
}

async function main() {
  const which = process.argv[2] ?? 'all';
  if (which === 'all' || which === 'pieces') {
    for (const ps of ['bevel', 'flat', 'outline', 'gradient', 'halfblock', 'shiny']) {
      await shot(`piece_${ps}`, ['--piece-style', ps]);
    }
  }
  if (which === 'all' || which === 'borders') {
    for (const bs of ['rounded', 'single', 'double', 'heavy', 'mixed', 'ascii', 'none']) {
      await shot(`border_${bs}`, ['--border-style', bs]);
    }
  }
  if (which === 'all' || which === 'minimal') {
    await shot('minimal', ['--minimal']);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
