#!/usr/bin/env node
/** tetrio-tui entry point. */
import { App } from './tui/app.js';
import { TerminalDriver } from './tui/driver.js';
import { LoginScreen, type LoginResult } from './tui/screens/login.js';
import { TetrioSession } from './net/session.js';
import { TetrioApp } from './tui/main.js';
import { setTheme, getThemeKey } from './tui/themes.js';

const HELP = `tetrio-tui — a terminal TETR.IO client

usage: tetrio-tui [options]
  --guest [name]        play as a guest (skip login screen)
  --token <jwt>         log in with a session token
  --help                show this help
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help')) { console.log(HELP); process.exit(0); }

  const driver = new TerminalDriver();
  const app = new App(driver);

  // Load theme: CLI --theme > env TETRIO_THEME > config store default ('tetrio').
  {
    const themeArg = args.indexOf('--theme');
    const cliTheme = themeArg >= 0 ? args[themeArg + 1] : undefined;
    const envTheme = process.env.TETRIO_THEME;
    const chosen = cliTheme ?? envTheme;
    if (chosen) setTheme(chosen);
  }
  const session = new TetrioSession();
  const tetrioApp = new TetrioApp(app, session);

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
    app.push(loginScreen);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
