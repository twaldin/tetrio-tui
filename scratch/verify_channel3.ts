
import path from 'node:path';
import { launchTerminal } from 'tuistory';
const projectRoot = '/Users/twaldin/tetrio-tui';
const demo = path.join('scripts', 'channel_demo.ts');
const env = { COLORTERM: 'truecolor', FORCE_COLOR: undefined, NO_COLOR: undefined };

// xp/ar box width re-check
let session = await launchTerminal({
  command: process.execPath,
  args: ['--import', 'tsx', demo, '--mock', '--open', 'ar'],
  cols: 90, rows: 34, cwd: projectRoot, env,
});
try {
  await session.waitForText('vincehd', { timeout: 8000 });
  const ar = await session.text({ immediate: true });
  console.log('=== AR LEADERBOARD (width fix) ===');
  console.log(ar.split('\n').slice(2, 12).join('\n'));
} finally { session.close(); }

// LIVE api check
session = await launchTerminal({
  command: process.execPath,
  args: ['--import', 'tsx', demo, '--open', 'league'],
  cols: 90, rows: 34, cwd: projectRoot, env,
});
try {
  await session.waitForText(/fetching leaderboard/, { timeout: 4000 }).catch(() => {});
  await session.waitForText('TR', { timeout: 20000 });
  await session.waitIdle({ timeout: 4000 }).catch(() => {});
  const live = await session.text({ immediate: true });
  console.log('=== LIVE LEAGUE LEADERBOARD ===');
  console.log(live.split('\n').slice(2, 14).join('\n'));
} finally { session.close(); }
console.log('DONE');
