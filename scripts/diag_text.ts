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
  // poll for completion signal
  for (let i = 0; i < 500; i++) {
    await new Promise(r => setTimeout(r, 200));
    const txt = await term.text({ immediate: true });
    if (/esc back/i.test(txt)) {
      console.log('FOUND esc back at iter', i, '(~' + (i * 0.2).toFixed(0) + 's)');
      // print the region around it
      const lines = txt.split('\n');
      lines.forEach((l, idx) => { if (/esc back|\d+\.\d\ds/.test(l)) console.log(idx, JSON.stringify(l)); });
      break;
    }
    if (i === 499) console.log('never found esc back');
  }
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
