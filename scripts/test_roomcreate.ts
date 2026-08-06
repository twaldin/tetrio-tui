import { TetrioSession } from '../src/net/session.js';
async function main() {
  const host = new TetrioSession();
  await host.loginAnonymous('tui-host');
  await host.connect();
  console.log('HOST connected', host.userid);
  host.on('message', (m: any) => console.log('[HOST]', m.command, JSON.stringify(m.data).slice(0, 250)));
  console.log('creating room...');
  host.send('room.create', { auto: false });
  await new Promise(r => setTimeout(r, 6000));
  host.close();
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
