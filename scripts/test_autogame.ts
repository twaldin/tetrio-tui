import { TetrioSession } from '../src/net/session.js';
import { GameConnection } from '../src/net/gameconn.js';
import { getToken } from './token.js';
async function main() {
  const { token, userid } = await getToken();
  const s = new TetrioSession();
  await s.loginToken(token, userid);
  await s.connect();
  console.log('connected', userid);
  // list rooms, find an auto-start one
  const rooms = await s.api.getRooms();
  const autoRoom = (rooms.rooms || []).find((r: any) => r.allowAnonymous && r.state !== 'ingame');
  console.log('rooms:', (rooms.rooms||[]).length, 'autoRoom:', autoRoom?.id, autoRoom?.name, autoRoom?.state);
  const gc = new GameConnection(s);
  gc.on('start', (gid) => console.log('*** GAME START, my gameid:', gid));
  gc.on('end', (r) => console.log('*** GAME END:', JSON.stringify(r)));
  s.on('game.start', (d: any) => console.log('game.start:', JSON.stringify(d).slice(0, 300)));
  s.on('game.match', (d: any) => console.log('game.match:', JSON.stringify(d).slice(0, 300)));
  s.on('game.replay.state', (d: any) => console.log('replay.state for gameid:', d?.gameid));
  if (!autoRoom) { console.log('no joinable room found'); process.exit(0); }
  s.joinRoom(autoRoom.id);
  await new Promise(r => setTimeout(r, 3000));
  // make sure we're a player and ready
  s.send('room.bracket.switch', 'player');
  s.send('game.ready', true);
  console.log('joined as player + ready, waiting for game...');
  await new Promise(r => setTimeout(r, 45000));
  console.log('done. inGame:', gc.inGame);
  s.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
