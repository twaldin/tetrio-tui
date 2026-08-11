// Live QP probe 3: full loop with OpponentTracker + re-enter after topout.
import { TetrioSession } from '../src/net/session.js';
import { GameConnection } from '../src/net/gameconn.js';
import { getToken } from './token.js';
import { bestMove } from '../src/game/solver.js';
import { visibleBoard } from '../src/game/engine.js';
import * as fs from 'fs';

const LOG = '/tmp/qp_probe3.log';
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
  log('connected as', userid);
  const gc = new GameConnection(s);
  gc.handling = { arr: 2, das: 10, dcd: 2, sdf: 6 } as any;

  const scoped = new Set<number>();
  let myGid = 0;
  let scoreboardHits = 0;

  s.on('game.replay.enter', (d: any) => {
    const p = d?.player;
    if (!p) return;
    if (p.userid === userid) {
      myGid = p.gameid;
      log('*** MY GAME ASSIGNED: gameid', p.gameid, 'seed', p.options?.seed, 'username opt:', p.options?.username);
      gc.enterGame(p.gameid, p.options ?? {}, p.options?.seed);
    } else if (scoped.size < 4 && !scoped.has(p.gameid)) {
      scoped.add(p.gameid);
      s.scopeStart(p.gameid);
      // register the view the way the app will: options as setoptions so the tracker simulates from start
      gc.opponents.setFullState(p.gameid, { game: { setoptions: p.options } }, { userid: p.userid, username: p.options?.username ?? p.userid });
    }
  });
  s.on('game.replay.state', (d: any) => log('replay.state', d?.gameid, typeof d?.data === 'string' ? d.data : 'SNAPSHOT'));
  s.on('game.match.score', (d: any) => {
    const mine = (d?.sb ?? []).find((e: any) => e.gameid === myGid);
    if (mine && scoreboardHits++ < 5) log('*** SCOREBOARD me:', JSON.stringify(mine));
  });
  s.on('rejected', () => log('!!! REJECTED'));
  s.on('game.replay.end', (d: any) => {
    if (d?.gameid === myGid) log('*** MY game.replay.end:', JSON.stringify(d?.data));
  });

  s.joinRoom('X-QP');
  await new Promise(r => setTimeout(r, 3000));
  log('--- game.enter ---');
  s.send('game.enter', { mods: [], tutorial: false });
  await new Promise(r => setTimeout(r, 1500));

  let dropCooldown = 0;
  let reentered = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 45000) {
    if (gc.inGame && gc.controller.playing && gc.controller.engine) {
      const e = gc.controller.engine;
      if (e.falling && dropCooldown <= 0) {
        const mv = bestMove(visibleBoard(e.state.board), e.falling.type, e.state.bag, e.hold, !e.holdLocked);
        e.falling.x = mv.x; e.falling.r = mv.r;
        gc.setKey('hardDrop', true);
        gc.tick();
        gc.setKey('hardDrop', false);
        gc.tick();
        dropCooldown = 1;
      } else {
        dropCooldown--;
        gc.tick();
      }
    } else if (gc.inGame && !gc.controller.playing && !reentered) {
      reentered = true;
      log('--- topped out; waiting 2s then re-entering ---');
      await new Promise(r => setTimeout(r, 2000));
      gc.inGame = false;
      s.send('game.enter', { mods: [], tutorial: false });
    } else {
      gc.tick();
    }
    gc.opponents.tickAll();
    await new Promise(r => setTimeout(r, 16));
  }
  const st = gc.controller.engine?.stats;
  log('*** final: pieces', st?.piecesplaced, 'score', st?.score, 'inGame', gc.inGame, 'playing', gc.controller.playing, 'myGid', myGid);
  for (const [gid, v] of gc.opponents.views) {
    const nonEmpty = v.board ? v.board.filter((row: any[]) => row.some((c: any) => c)).length : 0;
    log(`opp ${gid} user=${v.username} alive=${v.alive} boardRows=${nonEmpty} lastFrame=${v.lastFrame}`);
  }
  s.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
