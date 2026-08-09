import { launchTerminal } from 'tuistory';
async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts'], // resumes the saved token
    cols: 100, rows: 34, cwd: process.cwd(), env: {} as any, waitForDataTimeout: 20000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 20000 });
  await term.press('down'); await term.press('enter'); // SOLO
  await term.waitForText('40 LINES', { timeout: 3000 }).catch(() => {});
  await term.press('enter'); // start 40L
  await term.waitIdle({ timeout: 800 }).catch(() => {});
  await term.press('a'); // left keybind
  await new Promise(r => setTimeout(r, 200));
  await term.press('space'); // hard drop
  await term.waitIdle({ timeout: 500 }).catch(() => {});
  const txt = await term.text({ immediate: true });
  const pieces = /PIECES\s+(\d+)/.exec(txt);
  console.log('pieces placed after a + space:', pieces?.[1] ?? 'unknown', '| board shows game:', /PIECES/.test(txt));
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
