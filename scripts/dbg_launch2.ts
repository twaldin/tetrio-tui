import { launchTerminal } from 'tuistory';
async function tryLaunch(args: string[], tag: string) {
  const t0 = Date.now();
  try {
    const term = await launchTerminal({
      command: 'npx', args: ['tsx', 'src/index.ts', ...args],
      cols: 100, rows: 34, cwd: process.cwd(),
      env: { FORCE_COLOR: undefined, NO_COLOR: undefined } as any,
      waitForDataTimeout: 30000,
    });
    await term.waitForText('MULTIPLAYER', { timeout: 30000 });
    console.log(tag, 'OK in', ((Date.now() - t0) / 1000).toFixed(1) + 's');
    term.killProcess();
  } catch (e) {
    console.log(tag, 'FAILED after', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
}
async function main() {
  await tryLaunch(['--offline'], 'plain');
  await tryLaunch(['--offline', '--theme', 'tetrio'], 'with-theme');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
