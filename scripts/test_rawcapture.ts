import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--offline'],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  const data = (term as any).getTerminalData();
  console.log('type:', typeof data, 'keys:', Object.keys(data ?? {}).slice(0, 10));
  const json = JSON.stringify(data);
  console.log('json bytes:', json.length);
  fs.writeFileSync('/tmp/rawframe.json', json);
  // round-trip render
  const back = JSON.parse(fs.readFileSync('/tmp/rawframe.json', 'utf8'));
  const png = await renderTerminalToImage(back, { fontSize: 15, devicePixelRatio: 1 });
  fs.writeFileSync('/tmp/rawframe.png', png);
  console.log('round-trip render OK, png bytes:', png.length);
  term.killProcess(); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
