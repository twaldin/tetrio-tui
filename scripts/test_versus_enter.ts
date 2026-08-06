import { TetrioSession } from '../src/net/session.js';
import { getToken } from './token.js';
async function main() {
  const { token, userid } = await getToken();
  const s = new TetrioSession();
  await s.loginToken(token, userid);
  await s.connect();
  const rooms = await s.api.getRooms();
  // join the busiest anon-allowed room
  const room = (rooms.rooms || []).filter((r: any) => r.allowAnonymous).sort((a: any, b: any) => (b.count ?? 0) - (a.count ?? 0))[0];
  console.log('my userid:', userid, '| joining:', room?.id, room?.name);
  let entered = false;
  s.on('game.match', (d: any) => {
    console.log('game.match! emitting game.enter...');
    if (!entered) { entered = true; s.send('game.enter', {}); }
  });
  s.on('game.replay.state', (d: any) => {
    const g = d?.data?.game;
    console.log('replay.state gameid:', d?.gameid, 'myGame?', g?.setoptions ? 'has setoptions' : 'no', 'bag:', g?.bag?.length);
  });
  s.on('game.start', (d: any) => console.log('game.start:', JSON.stringify(d)?.slice(0, 200)));
  s.on('game.ready', (d: any) => console.log('game.ready:', JSON.stringify(d)?.slice(0, 200)));
  s.joinRoom(room.id);
  await new Promise(r => setTimeout(r, 3000));
  s.send('room.bracket.switch', 'player');
  s.send('game.ready', true);
  console.log('ready, waiting for a game cycle...');
  await new Promise(r => setTimeout(r, 60000));
  s.close(); process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
