import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
async function main() {
  const theme = process.argv[2] ?? 'tetrio';
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--token', process.env.TUI_TOKEN!],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { TETRIO_THEME: theme, TUI_AUTOPLAY: '1' } as any, waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  await term.waitIdle({ timeout: 1500 }).catch(() => {});
  const png = await renderTerminalToImage(term.getTerminalData(), { fontSize: 15, devicePixelRatio: 1 });
  fs.writeFileSync(`/tmp/home_${theme}.png`, png);
  console.log('captured', theme);
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
