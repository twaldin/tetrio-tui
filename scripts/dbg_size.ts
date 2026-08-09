import { launchTerminal } from 'tuistory';
async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--token', process.env.TUI_TOKEN!],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { TETRIO_THEME: 'tetrio', TUI_AUTOPLAY: '1' } as any, waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  await term.press('down'); await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 3000 }).catch(() => {});
  await term.press('enter');
  await term.waitForText('PIECES', { timeout: 5000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 300));
  const txt = await term.text({ immediate: true });
  const lines = txt.split('\n');
  // find the board border column (┃) and the HOLD panel left edge
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const boardIdx = l.indexOf('┃');
    const holdIdx = l.indexOf('HOLD');
    const piecesIdx = l.indexOf('PIECES');
    if (boardIdx >= 0 || holdIdx >= 0 || piecesIdx >= 0) {
      console.log(`row ${i}: board┃=${boardIdx} HOLD=${holdIdx} PIECES=${piecesIdx} len=${l.length}`);
    }
  }
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
