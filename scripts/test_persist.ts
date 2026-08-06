import { TetrioSession } from '../src/net/session.js';
import { getToken } from './token.js';
async function main() {
  const { token, userid } = await getToken();
  console.log('using token for', userid);
  const s = new TetrioSession();
  await s.loginToken(token, userid);
  await s.connect();
  console.log('t=0 connected:', s.ribbon?.isConnected(), 'id:', s.ribbon?.id);
  s.on('close', (r) => console.log('CLOSED:', r));
  s.on('error', (e) => console.log('ERR:', e.message));
  for (let i = 1; i <= 16; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (i % 4 === 0) console.log(`t=${i} connected:`, s.ribbon?.isConnected());
  }
  s.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
