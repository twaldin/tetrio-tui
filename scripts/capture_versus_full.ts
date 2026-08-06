import { TetrioSession } from '../src/net/session.js';
import { getToken } from './token.js';
import * as fs from 'fs';
async function main() {
  const { token, userid } = await getToken();
  const s = new TetrioSession();
  await s.loginToken(token, userid);
  await s.connect();
  const rooms = await s.api.getRooms();
  // join the busiest anon-allowed room
  const room = (rooms.rooms || []).filter((r: any) => r.allowAnonymous).sort((a: any, b: any) => (b.count ?? 0) - (a.count ?? 0))[0];
  console.log('my userid:', userid, '| joining:', room?.id, room?.name, 'players:', room?.count);
  const log: any[] = [];
  s.on('message', (m: any) => {
    if (!['social.online', 'ping'].includes(m.command)) {
      log.push({ command: m.command, id: m.id, data: m.data, t: Date.now() });
      if (['game.match', 'game.start', 'game.enter', 'game.replay.state', 'room.start', 'game.ready'].includes(m.command))
        console.log(`[${m.command}]`, JSON.stringify(m.data, (k,v)=>typeof v==='bigint'?v.toString():v).slice(0, 200));
    }
  });
  s.joinRoom(room.id);
  await new Promise(r => setTimeout(r, 4000));
  s.send('room.bracket.switch', 'player');
  s.send('game.ready', true);
  console.log('player + ready, waiting for a game cycle (up to 90s)...');
  await new Promise(r => setTimeout(r, 90000));
  fs.writeFileSync('/tmp/versus_full_log.json', JSON.stringify(log, null, 1));
  console.log('captured', log.length, 'messages');
  s.close(); process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
