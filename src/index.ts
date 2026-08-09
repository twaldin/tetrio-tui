#!/usr/bin/env node
/** tetrio-tui entry point. */
import { App } from './tui/app.js';
import { TerminalDriver } from './tui/driver.js';
import { LoginScreen, type LoginResult } from './tui/screens/login.js';
import { TetrioSession } from './net/session.js';
import { TetrioApp } from './tui/main.js';
import { setTheme, getThemeKey } from './tui/themes.js';
import { setPieceStyle } from './tui/pieceStyles.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HELP = `tetrio-tui — a terminal TETR.IO client

usage: tetrio-tui [options]
  --guest [name]        play as a guest (skip login screen)
  --token <jwt>         log in with a session token
  --help                show this help
`;

// --- session token persistence (~/.config/tetrio-tui/session.json) ---
function sessionFile(): string {
  const home = process.env.HOME ?? os.homedir();
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'tetrio-tui', 'session.json');
}
function loadSavedSession(): { token: string; userid: string } | null {
  try {
    const d = JSON.parse(fs.readFileSync(sessionFile(), 'utf8'));
    if (d?.token && d?.userid) return { token: d.token, userid: d.userid };
  } catch {}
  return null;
}
function saveSession(token: string, userid: string): void {
  try {
    const f = sessionFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ token, userid, savedAt: Date.now() }));
  } catch {}
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help')) { console.log(HELP); process.exit(0); }

  const driver = new TerminalDriver();
  const app = new App(driver);
  const session = new TetrioSession();
  const tetrioApp = new TetrioApp(app, session);

  // Load theme AFTER the app is constructed (its applyConfig applies the persisted config),
  // so the precedence is CLI --theme > env TETRIO_THEME > config store.
  {
    const themeArg = args.indexOf('--theme');
    const cliTheme = themeArg >= 0 ? args[themeArg + 1] : undefined;
    const envTheme = process.env.TETRIO_THEME;
    const chosen = cliTheme ?? envTheme;
    if (chosen) setTheme(chosen);
  }
  // Load piece style: CLI --piece-style > env TETRIO_PIECE_STYLE > config store.
  {
    const styleArg = args.indexOf('--piece-style');
    const cliStyle = styleArg >= 0 ? args[styleArg + 1] : undefined;
    const envStyle = process.env.TETRIO_PIECE_STYLE;
    const chosen = cliStyle ?? envStyle;
    if (chosen) setPieceStyle(chosen);
  }

  let shuttingDown = false;
  const shutdown = (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try { session.close(); } catch {}
    app.stop();
    process.exit(code);
  };
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  const doConnect = async (login: LoginResult) => {
    try {
      if (login.method === 'account') {
        await session.loginAccount(login.username!, login.password!, login.totp);
      } else if (login.method === 'token') {
        const token = login.token!;
        const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64').toString() || '{}');
        await session.loginToken(token, payload.sub ?? '');
      } else {
        await session.loginAnonymous(login.username);
      }
      await session.connect();
      if (session.api.token && session.userid) saveSession(session.api.token, session.userid); // persist login across sessions
      tetrioApp.showHome();
    } catch (e: any) {
      loginScreen.setError(String(e?.body?.error?.msg ?? e?.message ?? e));
      app.requestRender();
    }
  };

  const loginScreen = new LoginScreen(doConnect);
  session.on('error', () => app.requestRender());

  driver.start();
  app.start();
  const guestIdx = args.indexOf('--guest');
  const tokenIdx = args.indexOf('--token');
  if (tokenIdx >= 0) {
    doConnect({ method: 'token', token: args[tokenIdx + 1] });
  } else if (guestIdx >= 0) {
    doConnect({ method: 'anonymous', username: args[guestIdx + 1] && !args[guestIdx + 1].startsWith('--') ? args[guestIdx + 1] : undefined });
  } else {
    // resume a saved session token if present (login persists across sessions)
    const saved = loadSavedSession();
    if (saved) {
      doConnect({ method: 'token', token: saved.token });
    } else {
      app.push(loginScreen);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
