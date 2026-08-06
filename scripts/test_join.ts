import { TetrioSession } from '../src/net/session.js';
import { TetrioClient } from '../src/client.js';
async function main() {
  const s = new TetrioSession();
  await s.loginAnonymous('tui-jointest');
  await s.connect();
  const client = new TetrioClient(s);
  console.log('connected', client.userid);
  s.on('room.update', (d: any) => console.log('ROOM.UPDATE:', d?.name, d?.state, 'players:', d?.players?.length));
  s.on('room.join', (d: any) => console.log('ROOM.JOIN ack:', JSON.stringify(d).slice(0, 100)));
  s.on('message', (m: any) => { if (!['social.online'].includes(m.command)) console.log('  msg:', m.command); });
  console.log('joining GQHU...');
  client.joinRoom('GQHU');
  await new Promise(r => setTimeout(r, 6000));
  console.log('client.room:', client.room ? client.room.name : 'null');
  s.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
