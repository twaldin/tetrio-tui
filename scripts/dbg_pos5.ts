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
  for (let iter = 0; iter < 200; iter++) {
    await new Promise(r => setTimeout(r, 50));
    const txt = await term.text({ immediate: true });
    const lines = txt.split('\n');
    // rows 10-17 are the action-text area; print first non-space col of each
    const boardRow = lines.findIndex(l => l.includes('┃'));
    for (let li = 10; li < 18 && li < lines.length; li++) {
      const l = lines[li];
      const first = l.search(/\S/);
      if (first >= 0 && first < 30 && l.trim().length > 2) {
        console.log(`iter ${iter} row ${li} firstCol=${first}: ${JSON.stringify(l.slice(0, 42))}`);
      }
    }
  }
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
