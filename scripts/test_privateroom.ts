import { TetrioSession } from '../src/net/session.js';
import { getToken } from './token.js';
async function main() {
  const { token, userid } = await getToken();
  const s = new TetrioSession();
  await s.loginToken(token, userid);
  await s.connect();
  console.log('connected', userid);
  s.on('message', (m: any) => {
    if (['room.join','room.update','notify','kick','nope'].includes(m.command)) console.log(`  [${m.command}]`, JSON.stringify(m.data).slice(0, 150));
  });
  // try creating a PRIVATE room
  console.log('creating private room...');
  s.send('room.create', { public: false, auto: false });
  await new Promise(r => setTimeout(r, 5000));
  s.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
