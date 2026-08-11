/** Verify: CONTINUE AS with a dead token — does the user see the failure? */
import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const dir = '/tmp/st_cfg_continue';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'tetrio-tui'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tetrio-tui', 'session.json'), JSON.stringify({ token: 'x', userid: 'abc123', username: 'testuser' }));
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts'],
    cols: 100, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, XDG_CONFIG_HOME: dir } as any,
    waitForDataTimeout: 20000,
  });
  try {
    await new Promise((r) => setTimeout(r, 1500));
    await term.press('space');           // skip anim
    await term.waitForText('CONTINUE AS TESTUSER', { timeout: 8000 });
    await term.press('enter');           // CONTINUE AS TESTUSER (first item)
    // wait for the network attempt to fail (fake token)
    await new Promise((r) => setTimeout(r, 10000));
    const t = await term.text({ immediate: true });
    fs.writeFileSync('/tmp/st_shots/t_continue_result.png', await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 15, devicePixelRatio: 2 }));
    console.log('--- screen after failed continue ---');
    console.log(t.split('\n').map((l: string) => l.trimEnd()).filter((l: string) => l.trim()).slice(0, 20).join('\n'));
    const showsError = /error|fail|invalid|connect|LOGIN/i.test(t);
    console.log('USER_SEES_FEEDBACK:', showsError ? 'YES' : 'NO — silent failure');
  } finally { term.killProcess(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
