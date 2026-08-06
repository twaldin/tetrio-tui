import { TetrioSession } from '../src/net/session.js';
import { TetrioClient } from '../src/client.js';
import { getToken } from './token.js';
async function main() {
  const { token, userid } = await getToken();
  const s = new TetrioSession();
  await s.loginToken(token, userid);
  await s.connect();
  const client = new TetrioClient(s);
  console.log('connected', client.userid);
  s.on('room.join', (d: any) => console.log('session room.join ack'));
  s.on('room.update', (d: any) => console.log('session room.update:', d?.name));
  // wait 8s then join via client (like the app)
  await new Promise(r => setTimeout(r, 3000));
  console.log('client.joinRoom GQHU...');
  client.joinRoom('GQHU');
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 1000));
    console.log(`t=${i+1} client.room:`, client.room?.name ?? 'null');
    if (client.room) break;
  }
  s.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
