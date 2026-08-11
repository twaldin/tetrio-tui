/**
 * Startup-flow pty tests (startup animation + account screen).
 * Subcommands: fresh | offline | session | noanim | cycle | keys
 * Each uses an isolated XDG_CONFIG_HOME under /tmp.
 */
import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
import * as path from 'path';

const COLS = 100, ROWS = 34;
const SHOTS = '/tmp/st_shots';
fs.mkdirSync(SHOTS, { recursive: true });

function mkCfgDir(name: string): string {
  const dir = `/tmp/st_cfg_${name}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'tetrio-tui'), { recursive: true });
  return dir;
}
function cfgDir(name: string): string { return `/tmp/st_cfg_${name}`; }

async function launch(dir: string) {
  return await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts'],
    cols: COLS, rows: ROWS, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined, XDG_CONFIG_HOME: dir } as any,
    waitForDataTimeout: 20000,
  });
}
async function shot(term: any, file: string) {
  fs.writeFileSync(path.join(SHOTS, file), await renderTerminalToImage((term as any).getTerminalData(), { fontSize: 15, devicePixelRatio: 2 }));
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function lines(txt: string): string { return txt.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim()).slice(0, 20).join('\n'); }

// ---------- test 1: fresh launch -> animation -> key -> account page ----------
async function testFresh() {
  const dir = mkCfgDir('fresh');
  const term = await launch(dir);
  try {
    await sleep(3000);
    const t1 = await term.text({ immediate: true });
    await shot(term, 't1_anim_a.png');
    await sleep(2000);
    const t2 = await term.text({ immediate: true });
    await shot(term, 't1_anim_b.png');
    console.log('ANIM_FRAMES_DIFFER:', t1 !== t2 ? 'PASS' : 'FAIL');
    console.log('ANIM_HAS_PRESS_ANY_KEY:', /press any key/i.test(t1) ? 'PASS' : 'FAIL');
    await term.press('space');
    await sleep(1000);
    const t3 = await term.text({ immediate: true });
    await shot(term, 't1_account.png');
    const ok = /not signed in/i.test(t3) && /LOG IN/.test(t3) && /PLAY AS GUEST/.test(t3) && /PLAY OFFLINE/.test(t3);
    console.log('ACCOUNT_PAGE_NOT_SIGNED_IN:', ok ? 'PASS' : 'FAIL');
    if (!ok) console.log('--- got ---\n' + lines(t3));
    console.log('ACCOUNT_NO_SESSION_ITEMS:', !/CONTINUE AS/.test(t3) ? 'PASS' : 'FAIL');
  } finally { term.killProcess(); }
}

// ---------- test 2: PLAY OFFLINE -> HOME menu ----------
async function testOffline() {
  const term = await launch(cfgDir('fresh'));
  try {
    await sleep(1500);
    await term.press('space'); // skip anim
    await term.waitForText('not signed in', { timeout: 8000 });
    await term.press('down');
    await term.press('down');
    await term.press('enter'); // PLAY OFFLINE
    await sleep(1200);
    const t = await term.text({ immediate: true });
    await shot(term, 't2_home.png');
    const ok = /MULTIPLAYER/.test(t) && /SOLO/.test(t) && /TETRA CHANNEL/.test(t) && /CONFIG/.test(t);
    console.log('OFFLINE_TO_HOME:', ok ? 'PASS' : 'FAIL');
    if (!ok) console.log('--- got ---\n' + lines(t));
  } finally { term.killProcess(); }
}

// ---------- test 3: fake session -> CONTINUE AS TESTUSER, LOG OUT ----------
async function testSession() {
  const dir = mkCfgDir('sess');
  const sessFile = path.join(dir, 'tetrio-tui', 'session.json');
  fs.writeFileSync(sessFile, JSON.stringify({ token: 'x', userid: 'abc123', username: 'testuser', savedAt: Date.now() }));
  const term = await launch(dir);
  try {
    await sleep(1500);
    await term.press('space'); // skip anim
    await sleep(1000);
    const t = await term.text({ immediate: true });
    await shot(term, 't3_account.png');
    const ok = /CONTINUE AS TESTUSER/.test(t) && /SWITCH ACCOUNT/.test(t) && /LOG OUT/.test(t);
    console.log('SESSION_ACCOUNT_PAGE:', ok ? 'PASS' : 'FAIL');
    if (!ok) console.log('--- got ---\n' + lines(t));
    // navigate to LOG OUT (3rd item) and select it
    await term.press('down');
    await term.press('down');
    await term.press('enter');
    await sleep(1000);
    const t2 = await term.text({ immediate: true });
    await shot(term, 't3_logout.png');
    console.log('SESSION_FILE_DELETED:', !fs.existsSync(sessFile) ? 'PASS' : 'FAIL');
    console.log('LOGIN_FORM_SHOWN:', /LOGIN/.test(t2) ? 'PASS' : 'FAIL');
    if (!/LOGIN/.test(t2)) console.log('--- got ---\n' + lines(t2));
  } finally { term.killProcess(); }
}

// ---------- test 4: startupAnimation=false -> straight to account ----------
async function testNoanim() {
  const dir = mkCfgDir('noanim');
  fs.writeFileSync(path.join(dir, 'tetrio-tui', 'config.json'), JSON.stringify({ video: { startupAnimation: false } }));
  const term = await launch(dir);
  try {
    const t0 = Date.now();
    await term.waitForText('not signed in', { timeout: 10000 });
    const dt = Date.now() - t0;
    console.log('NOANIM_ACCOUNT_FAST:', dt < 4000 ? `PASS (${dt}ms)` : `FAIL (${dt}ms)`);
    const t = await term.text({ immediate: true });
    console.log('NOANIM_NO_ANIM_TEXT:', /press any key/i.test(t) ? 'FAIL (animation shown)' : 'PASS');
    await shot(term, 't4_account.png');
  } finally { term.killProcess(); }
  // set it back to true and confirm animation returns
  fs.writeFileSync(path.join(dir, 'tetrio-tui', 'config.json'), JSON.stringify({ video: { startupAnimation: true } }));
  const term2 = await launch(dir);
  try {
    await sleep(2500);
    const t = await term2.text({ immediate: true });
    console.log('ANIM_RESTORED:', /press any key/i.test(t) ? 'PASS' : 'FAIL');
  } finally { term2.killProcess(); }
}

// ---------- test 5: theme/style cycling over time ----------
async function testCycle() {
  const dir = mkCfgDir('cycle');
  const term = await launch(dir);
  try {
    await sleep(2500);
    await shot(term, 't5_cycle_0s.png');
    await sleep(8000);
    await shot(term, 't5_cycle_8s.png');
    await sleep(8000);
    await shot(term, 't5_cycle_16s.png');
    console.log('cycle frames captured (compare in python)');
  } finally { term.killProcess(); }
}

// ---------- test 7: esc on login form -> back to account page ----------
async function testEsc() {
  const dir = mkCfgDir('esc');
  const term = await launch(dir);
  try {
    await sleep(1500);
    await term.press('space'); // skip anim
    await term.waitForText('not signed in', { timeout: 8000 });
    await term.press('enter'); // LOG IN (first item)
    await term.waitForText('LOGIN', { timeout: 4000 });
    await term.press('escape');
    await sleep(800);
    const t = await term.text({ immediate: true });
    console.log('ESC_BACK_TO_ACCOUNT:', /not signed in/.test(t) && /PLAY OFFLINE/.test(t) ? 'PASS' : 'FAIL');
    if (!/not signed in/.test(t)) console.log('--- got ---\n' + lines(t));
  } finally { term.killProcess(); }
  // esc on a root login form (after LOG OUT) quits the app
  const dir2 = mkCfgDir('esc2');
  fs.writeFileSync(path.join(dir2, 'tetrio-tui', 'session.json'), JSON.stringify({ token: 'x', userid: 'abc123', username: 'testuser' }));
  const term2 = await launch(dir2);
  try {
    let exited = false;
    term2.onExit(() => { exited = true; });
    await sleep(1500);
    await term2.press('space');
    await term2.waitForText('CONTINUE AS TESTUSER', { timeout: 8000 });
    await term2.press('down');
    await term2.press('down');
    await term2.press('enter'); // LOG OUT
    await term2.waitForText('LOGIN', { timeout: 4000 });
    await term2.press('escape');
    await sleep(1500);
    console.log('ESC_ROOT_LOGIN_QUITS:', exited || term2.isDead ? 'PASS' : 'FAIL');
  } finally { term2.killProcess(); }
}

// ---------- test 6: any key skips immediately (3 keys) ----------
async function testKeys() {
  for (const key of ['space', 'a', 'return'] as const) {
    const dir = mkCfgDir(`key_${key}`);
    const term = await launch(dir);
    try {
      await sleep(1800); // animation running
      const t0 = Date.now();
      term.sendKey(key);
      await term.waitForText('not signed in', { timeout: 3000 });
      const dt = Date.now() - t0;
      console.log(`SKIP_KEY[${key}]:`, dt < 1500 ? `PASS (${dt}ms)` : `FAIL (${dt}ms)`);
      const t = await term.text({ immediate: true });
      // 'return' must not ALSO trigger the first menu item after the skip
      if (key === 'return') {
        console.log('RETURN_NO_DOUBLE_FIRE:', /not signed in/.test(t) && /LOG IN/.test(t) ? 'PASS' : 'FAIL');
      }
    } finally { term.killProcess(); }
  }
}

async function main() {
  const which = process.argv[2];
  if (which === 'fresh') await testFresh();
  else if (which === 'offline') await testOffline();
  else if (which === 'session') await testSession();
  else if (which === 'noanim') await testNoanim();
  else if (which === 'cycle') await testCycle();
  else if (which === 'keys') await testKeys();
  else if (which === 'esc') await testEsc();
  else console.log('unknown subcommand', which);
}
main().catch((e) => { console.error(e); process.exit(1); });
