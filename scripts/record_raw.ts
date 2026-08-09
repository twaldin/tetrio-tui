// Raw frame capture — dumps ghostty terminal state as JSON per frame (cheap),
// rendered to PNG later by render_frames.ts (survives long captures: no wasm OOM).
//
// Usage: npx tsx scripts/record_raw.ts <game40|blitz> <outDir>
import { launchTerminal } from 'tuistory';
import * as fs from 'fs';
import * as path from 'path';

const COLS = 100, ROWS = 34;

async function main() {
  const part = process.argv[2] ?? 'game40';
  const OUT_DIR = process.argv[3] ?? `/tmp/tui_raw_${part}`;
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let fi = 0;
  const t0 = Date.now();

  const term = await launchTerminal({
    command: 'npx',
    args: ['tsx', 'src/index.ts', '--offline'],
    cols: COLS, rows: ROWS, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, TUI_AUTOPLAY: '1', TUI_SEED: '20260809' } as any,
    waitForDataTimeout: 15000,
  });

  const grab = () => {
    const data = (term as any).getTerminalData();
    fs.writeFileSync(path.join(OUT_DIR, `f${String(fi++).padStart(4, '0')}.json`), JSON.stringify(data));
  };

  // navigate: HOME -> SOLO -> mode
  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  await term.press('down'); await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 5000 });
  if (part === 'blitz') await term.press('down');
  await term.press('enter');
  await term.waitIdle({ timeout: 900 }).catch(() => {});

  for (let i = 0; i < 16; i++) { grab(); await new Promise((r) => setTimeout(r, 50)); } // calm before

  const maxFrames = part === 'blitz' ? 4200 : 1400;
  for (let i = 0; i < maxFrames; i++) {
    grab();
    await new Promise((r) => setTimeout(r, 45));
    if (i % 40 === 0) {
      const txt = await term.text({ immediate: true });
      if (/esc back/i.test(txt)) break;
    }
  }
  for (let i = 0; i < 70; i++) { grab(); await new Promise((r) => setTimeout(r, 50)); } // hold results

  const secs = (Date.now() - t0) / 1000;
  console.log(`captured ${fi} raw frames in ${secs.toFixed(1)}s (${(fi / secs).toFixed(1)} fps) to ${OUT_DIR}`);
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
