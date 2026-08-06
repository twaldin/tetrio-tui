/**
 * Effect demo: crafted to trigger line clears for showcasing effects.
 * Captures frames at key moments (hard drops, line clears).
 */
import { launchTerminal } from 'tuistory';
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';

async function main() {
  const term = await launchTerminal({
    command: 'npx', args: ['tsx', 'src/index.ts', '--guest', 'fxdemo3'],
    cols: 110, rows: 34, cwd: process.cwd(),
    env: { FORCE_COLOR: undefined, NO_COLOR: undefined } as any,
    waitForDataTimeout: 15000,
  });

  await term.waitForText('MULTIPLAYER', { timeout: 15000 });
  await term.press('down');
  await term.press('enter');
  await term.waitForText('40 LINES', { timeout: 3000 });
  await term.press('enter');
  await term.waitIdle({ timeout: 800 }).catch(() => {});

  let frameIdx = 0;
  async function snap(label: string) {
    const data = (term as any).getTerminalData();
    const img = await renderTerminalToImage(data, { fontSize: 14, devicePixelRatio: 2 });
    const name = `fx3_${String(frameIdx).padStart(2, '0')}_${label}`;
    fs.writeFileSync(`/tmp/${name}.png`, img);
    console.log(`captured ${name}`);
    frameIdx++;
  }

  async function keys(seq: string[]) {
    for (const k of seq) {
      await term.sendKey(k as any);
      await new Promise(r => setTimeout(r, 40));
    }
  }

  // Strategy: fill bottom rows methodically, then line clear
  // Piece movement: drop pieces flat across the board
  // We don't control which pieces come, but we can use hold to manage

  // Place pieces quickly in a flat pattern
  // Each "round": move to position, hard drop, capture
  const placements = [
    { keys: ['left','left','left','left','space'], delay: 20, label: 'drop1' },
    { keys: ['right','right','right','right','space'], delay: 20, label: 'drop2' },
    { keys: ['left','left','space'], delay: 20, label: 'drop3' },
    { keys: ['right','right','space'], delay: 20, label: 'drop4' },
    { keys: ['space'], delay: 20, label: 'drop5' },
    { keys: ['x','left','left','left','left','space'], delay: 20, label: 'drop6_rot' },
    { keys: ['x','right','right','right','right','space'], delay: 20, label: 'drop7_rot' },
    { keys: ['x','left','space'], delay: 20, label: 'drop8' },
    { keys: ['x','right','space'], delay: 20, label: 'drop9' },
    { keys: ['x','space'], delay: 20, label: 'drop10' },
    { keys: ['left','left','left','space'], delay: 20, label: 'drop11' },
    { keys: ['right','right','right','space'], delay: 20, label: 'drop12' },
    { keys: ['left','space'], delay: 20, label: 'drop13' },
    { keys: ['right','space'], delay: 20, label: 'drop14' },
    { keys: ['z','space'], delay: 20, label: 'drop15' },
    { keys: ['z','left','left','space'], delay: 20, label: 'drop16' },
    { keys: ['z','right','right','space'], delay: 20, label: 'drop17' },
    { keys: ['space'], delay: 20, label: 'drop18' },
    { keys: ['left','left','left','left','space'], delay: 20, label: 'drop19' },
    { keys: ['right','right','right','right','space'], delay: 20, label: 'drop20' },
  ];

  for (const p of placements) {
    await keys(p.keys);
    // Capture immediately after hard drop (effect in frame 0)
    await new Promise(r => setTimeout(r, 16));
    await snap(p.label);
    // Brief delay for effect to progress, capture again
    await new Promise(r => setTimeout(r, 50));
    await snap(p.label + '_after');
  }

  term.killProcess();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
