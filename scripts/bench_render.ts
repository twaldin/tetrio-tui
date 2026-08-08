import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--token', process.env.TUI_TOKEN!],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { TETRIO_THEME: 'tetrio', TUI_AUTOPLAY: '1' } as any, waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  for (const dpr of [2, 1]) {
    const t0 = Date.now();
    for (let i = 0; i < 10; i++) {
      await renderTerminalToImage(term.getTerminalData(), { fontSize: 15, devicePixelRatio: dpr });
    }
    console.log(`dpr=${dpr}: ${(Date.now() - t0) / 10}ms per render`);
  }
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
