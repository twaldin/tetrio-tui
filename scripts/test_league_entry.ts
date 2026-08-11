// TETRA LEAGUE entry diagnostic (READ-ONLY: enters queue, waits briefly, leaves — never plays).
import { TetrioSession } from '../src/net/session.js';
import * as fs from 'fs';
import os from 'os';
import path from 'path';

const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(2) + 's';

async function main() {
  const sf = path.join(os.homedir(), '.config', 'tetrio-tui', 'session.json');
  const saved = JSON.parse(fs.readFileSync(sf, 'utf8'));
  console.log('saved user:', saved.username, saved.userid);
  const s = new TetrioSession();
  await s.loginToken(saved.token, saved.userid);
  await s.connect();
  const me = s.user?.user;
  console.log(ts(), 'connected as', me?.username, 'role:', me?.role, ' league:', JSON.stringify(me?.league ? { tr: me.league.tr, rank: me.league.rank, gamesplayed: me.league.gamesplayed } : null));
  s.on('league.enter', () => console.log(ts(), 'league.enter ACK (in queue)'));
  s.on('league.match', (d: any) => console.log(ts(), '!!! league.match FOUND:', JSON.stringify(d).slice(0, 300)));
  s.on('league.countdown', () => console.log(ts(), 'league.countdown'));
  s.on('notify', (d: any) => console.log(ts(), '[notify]', JSON.stringify(d)));
  s.on('rejected', () => console.log(ts(), '!!! REJECTED'));
  console.log(ts(), '--- league.enter ---');
  s.send('league.enter');
  await new Promise(r => setTimeout(r, 12000));
  console.log(ts(), '--- league.leave (never played) ---');
  s.send('league.leave');
  await new Promise(r => setTimeout(r, 1500));
  s.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
