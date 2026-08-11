import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts'],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, XDG_CONFIG_HOME: '/tmp/tui_cfg' } as any,
    waitForDataTimeout: 15000,
  });
  await new Promise((r) => setTimeout(r, 5000)); // animation plays
  fs.writeFileSync('/tmp/startup_anim.png', await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 15, devicePixelRatio: 2 }));
  console.log('anim captured');
  await term.press('space'); // skip
  await new Promise((r) => setTimeout(r, 800));
  const txt = await term.text({ immediate: true });
  console.log('after skip:', txt.includes('CONTINUE') || txt.includes('LOG IN') ? 'ACCOUNT PAGE OK' : 'UNEXPECTED');
  console.log(txt.split('\n').filter((l: string) => l.trim()).slice(0, 14).join('\n'));
  fs.writeFileSync('/tmp/startup_account.png', await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 15, devicePixelRatio: 2 }));
  term.killProcess(); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
