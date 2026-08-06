/**
 * configscreen.test.ts — pty snapshot test for scripts/config_demo.ts,
 * driven by tuistory (same pattern as test/tui/snapshot.test.ts).
 *
 * Verifies: the CONFIG menu renders, CONTROLS shows current keybinds,
 * "press a key…" capture rebinding works (and saves to disk), HANDLING
 * steppers adjust values with live ms hints, and esc quits cleanly.
 */

import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from 'vitest';
import { launchTerminal, type Session } from 'tuistory';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const demoEntry = path.join('scripts', 'config_demo.ts');

function launchDemo(configDir: string): Promise<Session> {
  // FORCE_COLOR/NO_COLOR unset so node can't print its env warning into the pty
  // (see snapshot.test.ts).
  return launchTerminal({
    command: process.execPath,
    args: ['--import', 'tsx', demoEntry, '--config-dir', configDir],
    cols: 90,
    rows: 34,
    cwd: projectRoot,
    env: { COLORTERM: 'truecolor', FORCE_COLOR: undefined, NO_COLOR: undefined },
  });
}

function waitForExit(session: Session, ms = 5000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const deadline = Date.now() + ms;
    const poll = (): void => {
      if (session.exitInfo) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      setTimeout(poll, 50);
    };
    session.onExit(() => resolve(true));
    poll();
  });
}

test('config demo: menu renders, rebinding works and persists, handling steppers, clean exit', async () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tetrio-tui-config-pty-'));
  const session = await launchDemo(configDir);
  try {
    // --- root CONFIG menu ---
    await session.waitForText('CONTROLS', { timeout: 20000 });
    const root = await session.text({ immediate: true });
    expect(root).toContain('CONFIG');
    expect(root).toContain('HANDLING');
    expect(root).toContain('VIDEO');
    expect(root).toContain('AUDIO');

    // --- CONTROLS screen ---
    await session.press('return');
    await session.waitForText('MOVE LEFT', { timeout: 5000 });
    const controls = await session.text({ immediate: true });
    expect(controls).toContain('ROTATE 180');
    expect(controls).toContain('HOLD');
    expect(controls).toContain('RESET TO DEFAULTS');
    // default bind for moveLeft is the left arrow
    const moveLeftLine = controls.split('\n').find((l) => l.includes('MOVE LEFT')) ?? '';
    expect(moveLeftLine).toContain('←');

    // --- capture mode: bind 'j' to MOVE LEFT ---
    await session.press('return');
    await session.waitForText('press a key', { timeout: 5000 });
    await session.press('j');
    await session.waitIdle({ timeout: 2000 }).catch(() => {});
    const after = await session.text({ immediate: true });
    const boundLine = after.split('\n').find((l) => l.includes('MOVE LEFT')) ?? '';
    expect(boundLine).toContain('J');
    expect(boundLine).toContain('←');   // original bind kept (multiple binds per action)

    // saved to disk immediately
    const saved = JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf8'));
    expect(saved.keybinds.moveLeft).toContain('j');
    expect(saved.keybinds.moveLeft).toContain('left');

    // --- HANDLING screen: stepper + live hint ---
    await session.press('escape');      // back to root
    await session.waitIdle({ timeout: 2000 }).catch(() => {});
    await session.press('down');        // -> HANDLING
    await session.press('return');
    await session.waitForText('DAS', { timeout: 5000 });
    const handling = await session.text({ immediate: true });
    expect(handling).toContain('ARR');
    expect(handling).toContain('167ms');           // DAS 10F hint
    await session.press('down');                   // -> DAS row
    await session.press('right');                  // 10 -> 11
    await session.waitForText('183ms', { timeout: 5000 });
    const savedHandling = JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf8'));
    expect(savedHandling.handling.das).toBe(11);

    // --- clean exit: esc to root, esc again quits ---
    await session.press('escape');
    await session.waitIdle({ timeout: 2000 }).catch(() => {});
    await session.press('escape');
    expect(await waitForExit(session)).toBe(true);
    expect(session.exitInfo?.exitCode).toBe(0);
  } finally {
    session.close();
    fs.rmSync(configDir, { recursive: true, force: true });
  }
}, 30000);
