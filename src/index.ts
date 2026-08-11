#!/usr/bin/env node
/** tetrio-tui entry point. */
import { App } from './tui/app.js';
import { TerminalDriver } from './tui/driver.js';
import { LoginScreen, type LoginResult } from './tui/screens/login.js';
import { TetrioSession } from './net/session.js';
import { TetrioApp } from './tui/main.js';
import { setTheme, getThemeKey, loadUserThemes } from './tui/themes.js';
import { StartupScreen } from './tui/screens/startup.js';
import { AccountScreen } from './tui/screens/account.js';
import { setPieceStyle } from './tui/pieceStyles.js';
import { setBorderStyle } from './tui/draw.js';
import { setMinimalMode } from './tui/renderPrefs.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HELP = `tetrio-tui — a terminal TETR.IO client

usage: tetrio-tui [options]
  --guest [name]        play as a guest (skip login screen)
  --offline             no network at all — straight to the home menu (solo play)
  --token <jwt>         log in with a session token
  --help                show this help
`;

// --- session token persistence (~/.config/tetrio-tui/session.json) ---
function sessionFile(): string {
  const home = process.env.HOME ?? os.homedir();
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'tetrio-tui', 'session.json');
}
function loadSavedSession(): { token: string; userid: string; username?: string } | null {
  try {
    const d = JSON.parse(fs.readFileSync(sessionFile(), 'utf8'));
    if (d?.token && d?.userid) return { token: d.token, userid: d.userid, username: d.username };
  } catch {}
  return null;
}
function saveSession(token: string, userid: string, username?: string): void {
  try {
    const f = sessionFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ token, userid, username: username ?? '', savedAt: Date.now() }));
  } catch {}
}
function clearSession(): void {
  try { fs.rmSync(sessionFile(), { force: true }); } catch {}
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help')) { console.log(HELP); process.exit(0); }

  // Register disk themes FIRST so the persisted config's theme key can resolve to them.
  loadUserThemes();

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
  // Load border style: CLI --border-style > env TETRIO_BORDER_STYLE > config store.
  {
    const styleArg = args.indexOf('--border-style');
    const cliStyle = styleArg >= 0 ? args[styleArg + 1] : undefined;
    const envStyle = process.env.TETRIO_BORDER_STYLE;
    const chosen = cliStyle ?? envStyle;
    if (chosen) setBorderStyle(chosen);
  }
  // Minimal mode: CLI --minimal > env TETRIO_MINIMAL > config store.
  {
    const cliMinimal = args.includes('--minimal');
    const envMinimal = process.env.TETRIO_MINIMAL === '1';
    if (cliMinimal || envMinimal) setMinimalMode(true);
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
      // persist login across sessions — but never overwrite a saved ACCOUNT session with a
      // throwaway guest/anon token (guests can't use matchmaking anyway and the user would
      // lose their real login).
      if (session.api.token && session.userid && session.user?.user?.role !== 'anon') {
        saveSession(session.api.token, session.userid, session.user?.user?.username);
      }
      tetrioApp.showHome();
    } catch (e: any) {
      loginScreen.setError(String(e?.body?.error?.msg ?? e?.message ?? e));
      // Surface the failure — CONTINUE AS / --token land here without the login
      // form on screen, so an error set on the hidden login screen is invisible.
      if (app.top() !== loginScreen) app.push(loginScreen);
      app.requestRender();
    }
  };

  const loginScreen = new LoginScreen(doConnect, () => {
    // esc on the login form: back to the account page when it's underneath, else quit
    if (app.top() !== loginScreen) return;
    if (app.size > 1) app.pop();
    else shutdown(0);
  });
  session.on('error', () => app.requestRender());

  driver.start();
  app.start();
  const guestIdx = args.indexOf('--guest');
  const tokenIdx = args.indexOf('--token');
  if (args.includes('--offline')) {
    // fully offline: no login, no ribbon — solo modes are 100% local
    tetrioApp.showHome();
  } else if (tokenIdx >= 0) {
    doConnect({ method: 'token', token: args[tokenIdx + 1] });
  } else if (guestIdx >= 0) {
    doConnect({ method: 'anonymous', username: args[guestIdx + 1] && !args[guestIdx + 1].startsWith('--') ? args[guestIdx + 1] : undefined });
  } else {
    // Every launch lands on the ACCOUNT page (TETR.IO login page equivalent) —
    // continue / switch / log out / guest / offline — after the startup animation.
    const showAccount = () => {
      const saved = loadSavedSession();
      // replace (not push): the account page is the flow root — nothing (in
      // particular not the finished startup screen) should sit beneath it
      app.replace(new AccountScreen({
        savedUser: saved?.username || (saved?.userid ? `user ${saved.userid.slice(0, 8)}` : null),
        onChoice: ({ action }) => {
          if (action === 'continue') {
            const s = loadSavedSession();
            if (s) doConnect({ method: 'token', token: s.token });
            else app.pop();
          } else if (action === 'logout') {
            clearSession();
            app.pop();            // back to nothing -> push the account page fresh
            app.push(loginScreen);
          } else if (action === 'login') {
            app.push(loginScreen);
          } else if (action === 'guest') {
            doConnect({ method: 'anonymous' });
          } else {
            // offline
            tetrioApp.showHome();
          }
        },
      }));
    };
    const cfg = tetrioApp.configStore.get();
    if (cfg.video?.startupAnimation !== false) {
      app.push(new StartupScreen(showAccount));
    } else {
      showAccount();
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
