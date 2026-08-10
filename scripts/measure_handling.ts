// Measure real input latency + DAS/ARR timing end-to-end through the TUI.
// Hold left via a raw kitty press (no release), log key events + piece-x with ms
// timestamps (TUI_INPUT_LOG), then read back exact timings.
// Usage: TUI_INPUT_LOG=/tmp/ilog.jsonl XDG_CONFIG_HOME=/tmp/tui_cfg npx tsx scripts/measure_handling.ts
import { launchTerminal } from 'tuistory';
import * as fs from 'fs';

async function main() {
  const logFile = process.env.TUI_INPUT_LOG ?? '/tmp/ilog.jsonl';
  fs.rmSync(logFile, { force: true });

  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--offline'],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: {
      FORCE_COLOR: undefined, NO_COLOR: undefined,
      TUI_INPUT_LOG: logFile,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 20000 });
  await term.press('down'); await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 5000 });
  await term.press('enter');
  await term.waitIdle({ timeout: 800 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 500)); // let the first piece settle

  // HOLD left: raw kitty press, no release (kitty protocol => true hold)
  term.writeRaw('\x1b[D');
  await new Promise((r) => setTimeout(r, 700));
  // release via kitty release event
  term.writeRaw('\x1b[1;1:3D');
  await new Promise((r) => setTimeout(r, 300));

  // TAP right once (press + kitty release)
  term.writeRaw('\x1b[C');
  await new Promise((r) => setTimeout(r, 60));
  term.writeRaw('\x1b[1;1:3C');
  await new Promise((r) => setTimeout(r, 300));

  term.killProcess();

  const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const keyDown = lines.find((l) => l.kind === 'key' && l.key === 'moveLeft' && l.type === 'down');
  const keyUp = lines.find((l) => l.kind === 'key' && l.key === 'moveLeft' && l.type === 'up');
  console.log('kitty active:', keyDown?.kitty);
  console.log('keydown at:', keyDown?.t, 'keyup at:', keyUp?.t, keyUp ? `(${keyUp.t - keyDown.t}ms held)` : '(NO KEYUP!)');
  const moves = lines.filter((l) => l.kind === 'move' && l.t >= keyDown.t && (!keyUp || l.t <= keyUp.t + 100));
  console.log('moves during hold:', moves.map((m) => `x=${m.x}@${m.t - keyDown.t}ms`).join('  '));
  const firstMove = moves[0];
  if (firstMove) console.log('press->first-move latency:', firstMove.t - keyDown.t, 'ms');
  if (moves.length > 1) console.log('first auto-shift at:', moves[1].t - keyDown.t, 'ms (DAS target 112ms)');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
