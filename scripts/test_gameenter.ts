import { TetrioSession } from '../src/net/session.js';
import { getToken } from './token.js';
async function main() {
  const { token, userid } = await getToken();
  const s = new TetrioSession();
  await s.loginToken(token, userid);
  await s.connect();
  const rooms = await s.api.getRooms();
  const autoRoom = (rooms.rooms || []).find((r: any) => r.allowAnonymous && r.state !== 'ingame');
  console.log('my userid:', userid, '| joining:', autoRoom?.id);
  s.on('game.match', (d: any) => {
    console.log('game.match got', d?.rrb?.scoreboard?.length, 'players; emitting game.enter...');
    s.send('game.enter', {});
  });
  // capture everything after
  for (const ev of ['game.enter','game.replay.state','game.replay','game.start','game.ready','game.scope.start']) {
    s.on(ev as any, (d: any) => console.log(`[${ev}]`, JSON.stringify(d, (k,v)=>typeof v==='bigint'?v.toString():v).slice(0, 250)));
  }
  s.joinRoom(autoRoom.id);
  await new Promise(r => setTimeout(r, 3000));
  s.send('room.bracket.switch', 'player');
  s.send('game.ready', true);
  await new Promise(r => setTimeout(r, 40000));
  s.close(); process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
