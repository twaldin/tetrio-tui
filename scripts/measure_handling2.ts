// Verify the kitty-native hold path: flip detection first, then hold with ZERO
// repeats — the key must stay held past 120ms (legacy timeout) purely on kitty.
import { launchTerminal } from 'tuistory';
import * as fs from 'fs';

async function main() {
  const logFile = process.env.TUI_INPUT_LOG ?? '/tmp/ilog2.jsonl';
  fs.rmSync(logFile, { force: true });
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--offline'],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, TUI_INPUT_LOG: logFile, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME } as any,
    waitForDataTimeout: 15000,
  });
  await term.waitForText('MULTIPLAYER', { timeout: 20000 });
  // flip kitty detection immediately: send a kitty-form release
  term.writeRaw('\x1b[1;1:3D');
  await new Promise((r) => setTimeout(r, 200));
  await term.press('down'); await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 5000 });
  await term.press('enter');
  await term.waitIdle({ timeout: 800 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 500));

  term.writeRaw('\x1b[D');            // hold left (no repeats!)
  await new Promise((r) => setTimeout(r, 600));
  term.writeRaw('\x1b[1;1:3D');       // kitty release
  await new Promise((r) => setTimeout(r, 300));
  term.killProcess();

  const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const kd = lines.find((l) => l.kind === 'key' && l.key === 'moveLeft' && l.type === 'down');
  const ku = lines.find((l) => l.kind === 'key' && l.key === 'moveLeft' && l.type === 'up');
  console.log('keydown kitty:', kd?.kitty, '| keyup received:', !!ku, ku ? `after ${ku.t - kd.t}ms` : '');
  const moves = lines.filter((l) => l.kind === 'move' && l.t >= kd.t);
  console.log('moves:', moves.map((m) => `x=${m.x}@${m.t - kd.t}ms`).join('  '));
  const postRelease = moves.filter((m) => ku && m.t > ku.t + 30);
  console.log('moves AFTER release (should be none):', postRelease.length);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
