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
  for (let iter = 0; iter < 150; iter++) {
    await new Promise(r => setTimeout(r, 50));
    const txt = await term.text({ immediate: true });
    const lines = txt.split('\n');
    for (let li = 0; li < lines.length; li++) {
      const l = lines[li];
      if (/COMBO|B2B/.test(l)) {
        const first = l.search(/\S/);
        const boardB = l.indexOf('┃');
        console.log(`row ${li}: actionFirstCol=${first} boardBorder=${boardB} | ${JSON.stringify(l.slice(0, 45))}`);
      }
    }
  }
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
