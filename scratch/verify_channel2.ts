
import path from 'node:path';
import { launchTerminal } from 'tuistory';

const projectRoot = '/Users/twaldin/tetrio-tui';
const demo = path.join('scripts', 'channel_demo.ts');
const env = { COLORTERM: 'truecolor', FORCE_COLOR: undefined, NO_COLOR: undefined };

// 1) XP leaderboard + error state (lookup 'nobody' -> 404)
let session = await launchTerminal({
  command: process.execPath,
  args: ['--import', 'tsx', demo, '--mock', '--open', 'xp'],
  cols: 90, rows: 34, cwd: projectRoot, env,
});
try {
  await session.waitForText('kimjoohyeon', { timeout: 8000 }).catch(() => {});
  await session.waitForText('vincehd', { timeout: 8000 });
  const xp = await session.text({ immediate: true });
  console.log('=== XP LEADERBOARD ===');
  console.log(xp.split('\n').slice(0, 12).join('\n'));
} finally { session.close(); }

// error state: profile lookup for 'nobody'
session = await launchTerminal({
  command: process.execPath,
  args: ['--import', 'tsx', demo, '--mock'],
  cols: 90, rows: 34, cwd: projectRoot, env,
});
try {
  await session.waitForText('MY PROFILE', { timeout: 8000 });
  await session.press('down');
  await session.press('down');
  await session.press('return');
  await session.waitForText('PLAYER LOOKUP', { timeout: 5000 });
  for (const ch of 'nobody') await session.press(ch);
  await session.press('return');
  await session.waitForText('no such user', { timeout: 8000 });
  const err = await session.text({ immediate: true });
  console.log('=== LOOKUP ERROR STATE ===');
  console.log(err.split('\n').slice(6, 20).join('\n'));
} finally { session.close(); }
console.log('DONE');
