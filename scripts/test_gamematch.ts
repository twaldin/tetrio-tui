import { TetrioSession } from '../src/net/session.js';
import { getToken } from './token.js';
async function main() {
  const { token, userid } = await getToken();
  const s = new TetrioSession();
  await s.loginToken(token, userid);
  await s.connect();
  const rooms = await s.api.getRooms();
  const autoRoom = (rooms.rooms || []).find((r: any) => r.allowAnonymous && r.state !== 'ingame');
  console.log('my userid:', userid, '| joining room:', autoRoom?.id);
  s.on('game.match', (d: any) => {
    console.log('FULL game.match:');
    console.log(JSON.stringify(d, (k,v)=>typeof v==='bigint'?v.toString():v));
  });
  s.on('game.start', (d: any) => console.log('game.start:', JSON.stringify(d)));
  s.on('game.enter', (d: any) => console.log('game.enter response:', JSON.stringify(d)));
  s.joinRoom(autoRoom.id);
  await new Promise(r => setTimeout(r, 3000));
  s.send('room.bracket.switch', 'player');
  s.send('game.ready', true);
  await new Promise(r => setTimeout(r, 40000));
  s.close(); process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
