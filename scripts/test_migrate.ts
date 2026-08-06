import { TetrioSession } from '../src/net/session.js';
import { getToken } from './token.js';
async function main() {
  const { token, userid } = await getToken();
  const s = new TetrioSession();
  await s.loginToken(token, userid);
  await s.connect();
  console.log('connected, waiting 10s like the app...');
  await new Promise(r => setTimeout(r, 10000));
  console.log('joining GQHU...');
  let recvid = 0;
  s.on('message', (m: any) => {
    if (['room.join','room.update','server.migrate','server.migrated','packets','session','kick','nope'].includes(m.command))
      console.log(`  [${m.command}]`, JSON.stringify(m.data).slice(0, 120), 'msgid:', m.id);
  });
  s.on('close', (r) => console.log('CLOSED:', r));
  s.joinRoom('GQHU');
  await new Promise(r => setTimeout(r, 8000));
  console.log('done');
  s.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
