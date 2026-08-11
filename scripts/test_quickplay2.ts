// Live QUICK PLAY full-loop probe: join X-QP, game.enter, play with solver, scope opponents.
import { TetrioSession } from '../src/net/session.js';
import { GameConnection } from '../src/net/gameconn.js';
import { getToken } from './token.js';
import { bestMove } from '../src/game/solver.js';
import { visibleBoard } from '../src/game/engine.js';
import * as fs from 'fs';

const LOG = '/tmp/qp_probe2.log';
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

  s.on('game.replay.enter', (d: any) => {
    const p = d?.player;
    if (!p) return;
    if (p.userid === userid) {
      myGid = p.gameid;
      log('*** MY GAME ASSIGNED: gameid', p.gameid, 'seed', p.options?.seed);
      gc.enterGame(p.gameid, p.options ?? {}, p.options?.seed);
      // scope a few already-known opponents
      for (const gid of [...scoped].slice(0, 3)) { /* already scoped */ }
    } else if (scoped.size < 4 && !scoped.has(p.gameid)) {
      scoped.add(p.gameid);
      log('scoping opponent gameid', p.gameid, p.userid);
      s.scopeStart(p.gameid);
    }
  });
  let stateDumps = 0;
  s.on('game.replay.state', (d: any) => {
    log('replay.state for scoped game', d?.gameid, 'keys:', Object.keys(d?.data ?? {}).join(','));
    if (stateDumps++ < 2) log('STATE DUMP:', JSON.stringify(d?.data)?.slice(0, 900));
  });
  let frameBatches = 0;
  s.on('game.replay', (d: any) => {
    if (d?.gameid !== myGid && frameBatches < 5) { frameBatches++; log('opponent frames for', d?.gameid, 'n=', d?.frames?.length, 'types:', d?.frames?.map((f:any)=>f.type).join(','));
      const full = (d?.frames ?? []).find((f: any) => f.type === 'full');
      if (full) log('FULL FRAME:', JSON.stringify(full).slice(0, 600));
    }
  });
  s.on('game.match.score', (d: any) => {
    const mine = (d?.sb ?? []).find((e: any) => e.gameid === myGid);
    if (mine) log('*** SCOREBOARD has me:', JSON.stringify(mine).slice(0, 300));
  });
  s.on('game.end', (d: any) => log('*** game.end', JSON.stringify(d).slice(0, 200)));
  s.on('rejected', (d: any) => log('!!! REJECTED', JSON.stringify(d)));
  s.on('unknown' as any, (d: any) => log('!!! UNKNOWN CODE', JSON.stringify(d)));
  s.on('notify', (d: any) => log('[notify]', JSON.stringify(d)));
  gc.on('end', (r) => log('*** gc end', JSON.stringify(r)));

  s.joinRoom('X-QP');
  await new Promise(r => setTimeout(r, 3000));
  log('--- game.enter ---');
  s.send('game.enter', { mods: [], tutorial: false });
  await new Promise(r => setTimeout(r, 2000));
  log('inGame:', gc.inGame, 'myGid:', myGid);

  // drive the controller with the solver for ~30s
  let dropCooldown = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 30000 && gc.inGame) {
    if (gc.controller.playing && gc.controller.engine) {
      const e = gc.controller.engine;
      if (e.falling && dropCooldown <= 0) {
        const mv = bestMove(visibleBoard(e.state.board), e.falling.type, e.state.bag, e.hold, !e.holdLocked);
        e.falling.x = mv.x; e.falling.r = mv.r;
        gc.setKey('hardDrop', true);
        gc.controller.tick();
        gc.setKey('hardDrop', false);
        gc.controller.tick(); // let the engine see the release edge
        dropCooldown = 2;
      } else {
        dropCooldown--;
        gc.controller.tick();
      }
    } else {
      gc.controller.tick();
    }
    await new Promise(r => setTimeout(r, 16));
  }
  const st = gc.controller.engine?.stats;
  log('*** after play: pieces', st?.piecesplaced, 'lines', st?.lines, 'score', st?.score, 'playing', gc.controller.playing);
  log('opponent views:', gc.opponents.views.size, 'with boards:', [...gc.opponents.views.values()].filter(v=>v.board).length);
  s.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
