import { launchTerminal } from 'tuistory';

async function main() {
  const term = await launchTerminal({
    command: 'npx',
    args: ['tsx', 'src/index.ts'],
    cols: 90,
    rows: 30,
    cwd: process.cwd(),
    waitForDataTimeout: 8000,
  });
  await term.waitIdle({ timeout: 5000 }).catch(() => {});
  const loginFrame = await term.text({ immediate: true });
  console.log('===== LOGIN SCREEN =====');
  console.log(loginFrame);
  // navigate: type a username, go to connect
  await term.type('guest-tui-demo');
  await term.press('enter'); // move to connect (account method, focus advances)
  await term.press('enter'); // submit? (may fail - no password) 
  await term.waitIdle({ timeout: 1000 }).catch(() => {});
  const after = await term.text({ immediate: true });
  console.log('===== AFTER INPUT =====');
  console.log(after);
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
