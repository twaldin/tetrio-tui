// Live QUICK PLAY probe: join X-QP as guest, dump all room/game events, then game.enter.
import { TetrioSession } from '../src/net/session.js';
import { getToken } from './token.js';
import * as fs from 'fs';

const LOG = '/tmp/qp_probe.log';
fs.writeFileSync(LOG, '');
function log(...a: any[]) {
  const line = a.map(x => typeof x === 'string' ? x : JSON.stringify(x, (k,v)=>typeof v==='bigint'?v.toString():v)).join(' ');
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

async function main() {
  const { token, userid } = await getToken();
  const s = new TetrioSession();
  await s.loginToken(token, userid);
  await s.connect();
  log('connected as', userid, 'worker:', JSON.stringify(s.worker));

  const menu = await s.api.getRoomsMenu();
  log('rooms/menu:', JSON.stringify(menu));

  // log every incoming command
  s.on('message', (m: any) => {
    if (m.command === 'ping') return;
    log(`[${m.command}]`, JSON.stringify(m.data, (k,v)=>typeof v==='bigint'?v.toString():v)?.slice(0, 700));
  });

  log('--- joining X-QP ---');
  s.joinRoom('X-QP');
  await new Promise(r => setTimeout(r, 5000));

  log('--- sending game.enter {mods:[], tutorial:false} ---');
  s.send('game.enter', { mods: [], tutorial: false });
  await new Promise(r => setTimeout(r, 8000));

  log('--- done, leaving ---');
  s.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
