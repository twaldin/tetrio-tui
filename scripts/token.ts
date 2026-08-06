// Reusable anonymous token cache to avoid CAPTCHA rate-limiting.
import { TetrioApi } from '../src/net/api.js';
import * as fs from 'fs';

const TOKEN_FILE = '/tmp/tui_token.json';

export async function getToken(): Promise<{ token: string; userid: string }> {
  if (fs.existsSync(TOKEN_FILE)) {
    const cached = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    // verify it still works
    try {
      const api = new TetrioApi();
      await api.getEnvironment();
      api.token = cached.token; api.userid = cached.userid;
      await api.getMe(cached.userid);
      return cached;
    } catch { /* fall through to re-join */ }
  }
  const api = new TetrioApi();
  await api.getEnvironment();
  const auth = await api.anonymousJoin(`tui-${Math.random().toString(36).slice(2, 6)}`);
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(auth));
  return auth;
}
