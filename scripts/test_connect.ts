import { TetrioApi } from '../src/net/api.js';
import { Ribbon } from '../src/net/ribbon.js';

async function main() {
  const api = new TetrioApi();
  const env = await api.getEnvironment();
  const auth = await api.anonymousJoin('guest-tui-test__');
  console.log('userid:', auth.userid);
  const ribbonInfo = await api.getRibbon();
  const endpoint = `wss://tetr.io${ribbonInfo.endpoint}`;
  const ribbon = new Ribbon(endpoint);
  ribbon.on('error', (e) => console.log('ribbon error:', e.message));
  ribbon.on('kick', (r) => console.log('KICKED:', r));
  ribbon.on('nope' as any, (d: any) => console.log('NOPE:', d));
  const authorized = new Promise((resolve) => ribbon.on('authorized', resolve));
  ribbon.connect();
  await new Promise((r) => ribbon.on('open', r));
  console.log('session open, id:', ribbon.id);
  const handling = { arr: 2, das: 10, dcd: 2, sdf: 6, safelock: true, cancel: false, may20g: true, irs: 'tap', ihs: 'tap' };
  const sig = api.buildSignature();
  ribbon.send('server.authorize', { token: api.token, handling, signature: sig, i: (sig as any).client?.commit?.id ?? 'x' });
  const authData: any = await Promise.race([authorized, new Promise((r) => setTimeout(() => r('TIMEOUT'), 6000))]);
  console.log('AUTHORIZE RESULT:', JSON.stringify(authData).slice(0, 300));
  // send presence
  ribbon.send('social.presence', { status: 'online', detail: 'menus' });
  ribbon.on('message', (m) => console.log('  msg:', m.command, JSON.stringify(m.data).slice(0, 150)));
  await new Promise((r) => setTimeout(r, 3000));
  ribbon.close();
  process.exit(0);
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
