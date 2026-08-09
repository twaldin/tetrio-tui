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
  for (let iter = 0; iter < 120; iter++) {
    await new Promise(r => setTimeout(r, 60));
    const txt = await term.text({ immediate: true });
    const lines = txt.split('\n');
    for (let li = 0; li < lines.length; li++) {
      const l = lines[li];
      // the figlet clear word rows contain patterns like |_/ \_ or __) etc on the left area
      if (/[_\/\\|()]/.test(l) && l.indexOf('┃') < 0 && l.trim().length > 3 && li > 8 && li < 20) {
        const first = l.search(/\S/);
        console.log(`iter ${iter} row ${li} first=${first}: ${JSON.stringify(l.slice(0, 42))}`);
      }
    }
  }
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
