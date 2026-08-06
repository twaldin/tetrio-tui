
import path from 'node:path';
import { launchTerminal } from 'tuistory';

const projectRoot = '/Users/twaldin/tetrio-tui';
const demo = path.join('scripts', 'channel_demo.ts');

const session = await launchTerminal({
  command: process.execPath,
  args: ['--import', 'tsx', demo, '--mock'],
  cols: 90,
  rows: 34,
  cwd: projectRoot,
  env: { COLORTERM: 'truecolor', FORCE_COLOR: undefined, NO_COLOR: undefined },
});
try {
  await session.waitForText('LEADERBOARDS', { timeout: 20000 });
  const root = await session.text({ immediate: true });
  console.log('=== ROOT MENU ===');
  console.log(root);

  // enter LEADERBOARDS submenu
  await session.press('return');
  await session.waitForText('ACHIEVEMENT RATING', { timeout: 5000 });
  // enter TETRA LEAGUE leaderboard
  await session.press('return');
  await session.waitForText('vincehd', { timeout: 10000 });
  const lb = await session.text({ immediate: true });
  console.log('=== LEAGUE LEADERBOARD (page 1) ===');
  console.log(lb);

  // scroll to bottom to trigger pagination
  for (let i = 0; i < 24; i++) await session.press('down');
  await session.waitForText('player002', { timeout: 10000 }).catch(() => {});
  await session.waitIdle({ timeout: 3000 }).catch(() => {});
  const lb2 = await session.text({ immediate: true });
  console.log('=== LEAGUE LEADERBOARD (after scroll/pagination) ===');
  console.log(lb2);

  // open a profile from the leaderboard
  await session.press('home');
  await session.press('return');
  await session.waitForText('TETRA LEAGUE', { timeout: 10000 });
  await session.waitForText('RECORDS', { timeout: 10000 });
  const prof = await session.text({ immediate: true });
  console.log('=== PROFILE ===');
  console.log(prof);

  // back to leaderboard, back to submenu, back to root
  await session.press('escape');
  await session.press('escape');
  await session.press('escape');

  // news feed
  await session.press('down'); // REPLAYS
  await session.press('return');
  await session.waitForText('global feed', { timeout: 10000 });
  const news = await session.text({ immediate: true });
  console.log('=== NEWS FEED ===');
  console.log(news);
  await session.press('escape');

  // profile lookup flow
  await session.press('down'); // MY PROFILE
  await session.press('return');
  await session.waitForText('PLAYER LOOKUP', { timeout: 5000 });
  for (const ch of 'vincehd') await session.press(ch);
  await session.press('return');
  await session.waitForText('VINCEHD', { timeout: 10000 });
  const prof2 = await session.text({ immediate: true });
  console.log('=== LOOKUP PROFILE (vincehd) ===');
  console.log(prof2);

  // esc back to root and quit
  await session.press('escape'); // profile -> lookup
  await session.press('escape'); // lookup -> root
  await session.press('escape'); // root -> quit
  await new Promise((r) => setTimeout(r, 800));
  console.log('=== EXIT ===', session.exitInfo);
} finally {
  session.close();
}
