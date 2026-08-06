import { TetrioSession } from '../src/net/session.js';
import * as fs from 'fs';
async function main() {
  const s = new TetrioSession();
  await s.loginAnonymous('tui-cap');
  await s.connect();
  const log: any[] = [];
  s.on('message', (m: any) => { log.push({ command: m.command, data: m.data, id: m.id, t: Date.now() }); });
  console.log('joining GQHU as player...');
  s.joinRoom('GQHU');
  await new Promise(r => setTimeout(r, 4000));
  // switch to player bracket
  s.send('room.bracket.switch', 'player');
  console.log('switched to player, waiting for a game to start...');
  // wait up to 90s for a game
  await new Promise(r => setTimeout(r, 90000));
  fs.writeFileSync('/tmp/versus_start_log.json', JSON.stringify(log, null, 1));
  console.log('captured', log.length, 'messages');
  s.close();
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
