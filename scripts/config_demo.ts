#!/usr/bin/env node
/**
 * config_demo.ts — renders the CONFIG screens standalone (pty/manual testing).
 *
 * Run:  npx tsx scripts/config_demo.ts [--config-dir DIR] [--print]
 *
 *   --config-dir DIR   load/save config from DIR instead of a fresh temp dir
 *                      (your real ~/.config/tetrio-tui is never touched)
 *   --print            print the loaded config as JSON and exit (no TUI)
 *
 * Keys: ↑↓ select · ←→ adjust (shift = big step) · enter edit · esc back.
 * On the CONTROLS screen: enter starts "press a key…" capture, bksp clears.
 * esc from the root CONFIG menu (or ctrl+c anywhere) quits.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { App } from '../src/tui/app.js';
import { TerminalDriver } from '../src/tui/driver.js';
import { MenuScreen } from '../src/tui/screens/menu.js';
import { createConfigMenuNode } from '../src/tui/screens/config.js';
import { ConfigStore } from '../src/config/store.js';

function parseArgs(argv: string[]): { dir: string; print: boolean } {
  let dir = '';
  let print = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--config-dir' && i + 1 < argv.length) dir = argv[++i];
    else if (argv[i] === '--print') print = true;
  }
  if (!dir) dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tetrio-tui-config-demo-'));
  return { dir, print };
}

const { dir, print } = parseArgs(process.argv.slice(2));
const store = new ConfigStore({ dir });

if (print) {
  process.stdout.write(`${JSON.stringify(store.get(), null, 2)}\n`);
  process.exit(0);
}

const driver = new TerminalDriver();
const app = new App(driver);
app.targetFps = store.video.targetFps;

let quit = (): void => {};
{
  let quitting = false;
  quit = () => {
    if (quitting) return;
    quitting = true;
    app.stop();
    process.stdout.write(`config saved to ${store.path}\n`);
    process.exit(0);
  };
}
process.on('SIGINT', quit);
process.on('SIGTERM', quit);

const node = createConfigMenuNode({
  store,
  onBack: () => app.pop(),
  onChange: (cfg) => { app.targetFps = cfg.video.targetFps; },
});
const root = new MenuScreen(node, {
  breadcrumb: ['CONFIG'],
  onBack: quit,
  pushScreen: (s) => app.push(s),
});

// ctrl+c arrives as a key event in raw mode, not SIGINT — handle it globally.
driver.onKey((ev) => { if (ev.ctrl && ev.key === 'c') quit(); });

driver.start();
app.start();
app.push(root);
