import { launchTerminal } from 'tuistory';
async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts'],
    cols: 100, rows: 34, cwd: process.cwd(), env: {} as any, waitForDataTimeout: 15000,
  });
  // if it resumes, we should see the HOME screen (MULTIPLAYER), not the login screen
  const txt = await term.waitForText('MULTIPLAYER', { timeout: 15000 }).then(() => 'HOME').catch(() => 'LOGIN');
  const content = await term.text({ immediate: true });
  const isLogin = /password|username.*:/i.test(content) && !/MULTIPLAYER/.test(content);
  console.log('resumed to:', txt, '| shows login screen:', isLogin);
  term.killProcess();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
