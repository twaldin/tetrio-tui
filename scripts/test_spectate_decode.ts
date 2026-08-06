import { TetrioSession } from '../src/net/session.js';
import { getToken } from './token.js';
async function main() {
  const { token, userid } = await getToken();
  const s = new TetrioSession();
  await s.loginToken(token, userid);
  await s.connect();
  console.log('connected, joining GQHU + spectating...');
  s.joinRoom('GQHU');
  await new Promise(r => setTimeout(r, 4000));
  s.send('room.bracket.switch', 'spectator');
  s.on('game.spectate', (d: any) => {
    console.log('game.spectate response:', JSON.stringify(d, (k,v)=>typeof v==='bigint'?v.toString():v).slice(0, 800));
  });
  s.spectate();
  await new Promise(r => setTimeout(r, 5000));
  s.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
