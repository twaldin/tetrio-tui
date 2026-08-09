import { launchTerminal } from 'tuistory';
async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--guest', 'blitzcheck'],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, TUI_AUTOPLAY: '1', TUI_SEED: '7' } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  await term.press('down'); await term.press('enter');
  await term.waitForText('BLITZ', { timeout: 5000 });
  await term.press('down'); await term.press('enter');
  await new Promise(r => setTimeout(r, 12000));
  const txt = await term.text({ immediate: true });
  const hasScore = txt.includes('SCORE');
  const hasBlitz = txt.includes('BLITZ');
  console.log('BLITZ title:', hasBlitz, '| SCORE hud:', hasScore);
  const m = txt.match(/SCORE\s+(\d+)/);
  console.log('score value:', m ? m[1] : 'none', '| time row:', /TIME\s+\d:\d\d/.test(txt) ? 'ok' : 'missing');
  term.killProcess(); process.exit(hasScore && hasBlitz ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
