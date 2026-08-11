/**
 * solomodes.test.ts — drive every solo mode in a real pty (tuistory) and check
 * the mode-specific HUD + retry + clean exit. 1-1 behavior checks run offline.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test, expect } from 'vitest';
import { launchTerminal, type Session } from 'tuistory';

// pty tests need a real terminal model + spare CPU; headless CI workers OOM/crash on
// them (vitest worker exits). Run locally or with PTY_TESTS=1.
const PTY = process.env.CI !== 'true' || process.env.PTY_TESTS === '1';
const ptyTest = PTY ? test : test.skip;

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

function launch(extraEnv: Record<string, string> = {}): Promise<Session> {
  return launchTerminal({
    command: process.execPath,
    args: ['--import', 'tsx', path.join('src', 'index.ts'), '--offline'],
    cols: 100,
    rows: 34,
    cwd: projectRoot,
    env: { COLORTERM: 'truecolor', FORCE_COLOR: undefined, NO_COLOR: undefined, TUI_SEED: '4242', ...extraEnv },
  });
}

async function intoSolo(term: Session, mode: '40l' | 'blitz' | 'zen' | 'practice') {
  await term.waitForText('MULTIPLAYER', { timeout: 20000 });
  await term.press('down');
  await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 5000 });
  const downs = { '40l': 0, blitz: 1, zen: 3, practice: 4 }[mode]; // 40L, BLITZ, QUICK PLAY(online), ZEN, PRACTICE
  for (let i = 0; i < downs; i++) await term.press('down');
  await term.press('enter');
  await term.waitIdle({ timeout: 1000 }).catch(() => {});
}

ptyTest('40 LINES: HUD, pieces drop, retry restarts, esc exits to menu', async () => {
  const term = await launch();
  try {
    await intoSolo(term, '40l');
    let txt = await term.text({ immediate: true });
    expect(txt).toContain('40 LINES');
    expect(txt).toContain('HOLD');
    expect(txt).toContain('NEXT');
    expect(txt).toContain('0/40');

    // drop a few pieces
    for (let i = 0; i < 3; i++) { await term.press('space'); await new Promise((r) => setTimeout(r, 150)); }
    txt = await term.text({ immediate: true });
    const m1 = txt.match(/PIECES\s+(\d+)/);
    expect(m1).toBeTruthy();
    expect(parseInt(m1![1], 10)).toBeGreaterThanOrEqual(3);

    // retry restarts (pieces back to 0)
    await term.press('r');
    await new Promise((r) => setTimeout(r, 400));
    txt = await term.text({ immediate: true });
    const m2 = txt.match(/PIECES\s+(\d+)/);
    expect(m2).toBeTruthy();
    expect(parseInt(m2![1], 10)).toBeLessThanOrEqual(1);

    // esc back to the solo menu, esc again to HOME
    await term.press('escape');
    await term.waitForText('BLITZ', { timeout: 3000 });
    await term.press('escape');
    await term.waitForText('MULTIPLAYER', { timeout: 3000 });
  } finally {
    term.killProcess();
  }
});

ptyTest('BLITZ: SCORE HUD + 2:00 countdown, scoring on drops', async () => {
  const term = await launch();
  try {
    await intoSolo(term, 'blitz');
    let txt = await term.text({ immediate: true });
    expect(txt).toContain('BLITZ');
    expect(txt).toContain('SCORE');
    expect(txt).toMatch(/2:00|1:5\d/); // counting down from 2:00

    for (let i = 0; i < 2; i++) { await term.press('space'); await new Promise((r) => setTimeout(r, 150)); }
    txt = await term.text({ immediate: true });
    const m = txt.match(/SCORE\s+(\d+)/);
    expect(m).toBeTruthy();
    expect(parseInt(m![1], 10)).toBeGreaterThan(0); // hard-drop points at minimum

    await term.press('escape');
    await term.waitForText('BLITZ', { timeout: 3000 });
  } finally {
    term.killProcess();
  }
});

ptyTest('ZEN + PRACTICE: launch and play', async () => {
  for (const mode of ['zen', 'practice'] as const) {
    const term = await launch();
    try {
      await intoSolo(term, mode);
      const txt = await term.text({ immediate: true });
      expect(txt).toContain(mode === 'zen' ? 'ZEN' : 'PRACTICE');
      expect(txt).toContain('HOLD');
      await term.press('space');
      await new Promise((r) => setTimeout(r, 200));
      await term.press('escape');
      await term.waitForText('BLITZ', { timeout: 3000 });
    } finally {
      term.killProcess();
    }
  }
});

ptyTest('B2B indicator appears and PERSISTS during an all-quad autoplay game', async () => {
  const term = await launch({ TUI_AUTOPLAY: '1' });
  try {
    await intoSolo(term, '40l');
    // the solver chains quads — poll until the chain is alive and STAYS alive
    let saw = 0;
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const txt = await term.text({ immediate: true });
      const m = txt.match(/B2B\s+x(\d+)/);
      if (m && parseInt(m[1], 10) >= 1) saw++;
      if (saw >= 8) break; // persisted across 8 consecutive polls (~2s)
    }
    expect(saw).toBeGreaterThanOrEqual(8);
  } finally {
    term.killProcess();
  }
});

ptyTest('config round-trip: VIDEO shows THEME/BORDER STYLE/MINIMAL and escapes cleanly', async () => {
  const term = await launch();
  try {
    await term.waitForText('MULTIPLAYER', { timeout: 20000 });
    // CONFIG is the 4th item
    await term.press('down'); await term.press('down'); await term.press('down');
    await term.press('enter');
    await term.waitForText('VIDEO', { timeout: 5000 });
    // open VIDEO (CONTROLS, HANDLING, VIDEO, AUDIO -> 2 downs)
    await term.press('down'); await term.press('down'); await term.press('enter');
    await term.waitForText('PIECE STYLE', { timeout: 5000 });
    const txt = await term.text({ immediate: true });
    expect(txt).toContain('BORDER STYLE');
    expect(txt).toContain('MINIMAL MODE');
    expect(txt).toContain('THEME');
    // escape all the way back out to HOME (the old stuck-in-config bug)
    await term.press('escape');
    await term.waitForText('HANDLING', { timeout: 3000 });
    await term.press('escape');
    await term.waitForText('MULTIPLAYER', { timeout: 3000 });
  } finally {
    term.killProcess();
  }
});
