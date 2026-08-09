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
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 100));
    const txt = await term.text({ immediate: true });
    const lines = txt.split('\n');
    for (let li = 0; li < lines.length; li++) {
      const l = lines[li];
      const m = l.indexOf('ING') >= 0 || /S *I *N/.test(l); // SINGLE in figlet is spread; find the clear word row
      if (/HOLD/.test(l) || m) {
        // find first non-space
        const firstNonSpace = l.search(/\S/);
        if (firstNonSpace >= 0 && (m)) { console.log('row', li, 'firstNonSpace', firstNonSpace, JSON.stringify(l.slice(0, 40))); }
      }
    }
    break;
  }
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
