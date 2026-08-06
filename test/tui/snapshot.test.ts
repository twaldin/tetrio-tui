/**
 * snapshot.test.ts — pty snapshot tests for the TUI demo, driven by tuistory.
 *
 * Launches `tsx src/tui/demo.ts` in a real pty (ghostty terminal model),
 * snapshots the visible screen, sends a scripted key sequence, and asserts
 * on the rendered content.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test, expect } from 'vitest';
import { launchTerminal, type Session } from 'tuistory';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const demoEntry = path.join('src', 'tui', 'demo.ts');

function launchDemo(args: string[] = []): Promise<Session> {
  // NOTE: FORCE_COLOR/NO_COLOR are unset (zigpty drops undefined values) so a
  // polluted parent env can't make node print its "NO_COLOR is ignored" warning
  // into the pty — stray output would scroll the alt screen and desync the
  // renderer's diff model.
  return launchTerminal({
    command: process.execPath,
    args: ['--import', 'tsx', demoEntry, '--static', '--seed', '42', ...args],
    cols: 90,
    rows: 34,
    cwd: projectRoot,
    env: { COLORTERM: 'truecolor', FORCE_COLOR: undefined, NO_COLOR: undefined },
  });
}

test('demo renders board, hold, next queue and stats panel', async () => {
  const session = await launchDemo();
  try {
    await session.waitForText('NEXT', { timeout: 20000 });
    const text = await session.text({ immediate: true });

    // titled panels
    expect(text).toContain('TETRIO-TUI');
    expect(text).toContain('HOLD');
    expect(text).toContain('NEXT');
    expect(text).toContain('STATS');
    expect(text).toContain('SCORE');
    expect(text).toContain('LINES');

    // board frame corners (unicode box drawing)
    expect(text).toContain('┌');
    expect(text).toContain('┐');
    expect(text).toContain('└');
    expect(text).toContain('┘');

    // the falling piece + next-queue previews render as block glyphs
    expect(text).toContain('██');

    // help line
    expect(text).toContain('quit');
  } finally {
    session.close();
  }
}, 30000);

test('scripted keys move and hard-drop the piece; q exits cleanly', async () => {
  const session = await launchDemo();
  try {
    await session.waitForText('NEXT', { timeout: 20000 });
    const before = await session.text({ immediate: true });

    // steer the piece: two lefts, a CCW rotate, then hard drop
    await session.press('left');
    await session.press('left');
    await session.press('z');
    await session.press('space');

    // after the hard drop, PIECES goes 0 -> 1 and blocks land on the bottom row
    await session.waitForText(/PIECES\s+0*1\b/, { timeout: 5000 });
    const after = await session.text({ immediate: true });
    expect(after).not.toBe(before);

    const lines = after.split('\n');
    // board interior is rows 2..21 (0-based lines); bottom interior row = 21
    const bottomRow = lines[21] ?? '';
    expect(bottomRow).toContain('██');

    // hold: pressing c fills the HOLD box
    await session.press('c');
    await session.waitIdle({ timeout: 2000 }).catch(() => {});
    const withHold = await session.text({ immediate: true });
    const holdLines = withHold.split('\n').slice(1, 6).join('\n');
    expect(holdLines).toContain('HOLD');
    expect(holdLines).toContain('██');

    // clean exit: q quits and restores the terminal (process exits 0)
    await session.press('q');
    const exited = await new Promise<boolean>((resolve) => {
      const deadline = Date.now() + 5000;
      const poll = (): void => {
        if (session.exitInfo) return resolve(true);
        if (Date.now() > deadline) return resolve(false);
        setTimeout(poll, 50);
      };
      session.onExit(() => resolve(true));
      poll();
    });
    expect(exited).toBe(true);
    expect(session.exitInfo?.exitCode).toBe(0);
  } finally {
    session.close();
  }
}, 30000);
