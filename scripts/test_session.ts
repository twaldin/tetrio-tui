import { TetrioSession } from '../src/net/session.js';

async function main() {
  const s = new TetrioSession();
  s.on('debug', (m) => console.log('  [debug]', m));
  s.on('error', (e) => console.log('  [err]', e.message));
  await s.loginAnonymous('guest-tui-test__');
  console.log('logged in:', s.userid);
  const auth = await s.connect();
  console.log('authorized. worker:', JSON.stringify(auth?.worker), 'online:', auth?.social?.total_online);

  // join a room (spectate a busy one)
  let gotRoom = false;
  s.on('room.update', (d) => {
    if (!gotRoom) { gotRoom = true; console.log('ROOM UPDATE:', d?.name, 'type:', d?.type, 'state:', d?.state, 'players:', d?.players?.length); }
  });
  s.on('migrating', (m) => console.log('  migrating ->', m.endpoint));
  s.on('room.join', (d) => console.log('room.join ack:', JSON.stringify(d).slice(0, 120)));
  s.on('game.replay.state', (d) => console.log('game.replay.state gameid:', d?.gameid, 'seed:', d?.data?.game?.setoptions?.seed));
  s.on('game.replay.end', (d) => console.log('game.replay.end:', d?.gameid, d?.data?.gameoverreason));

  console.log('joining GQHU...');
  s.joinRoom('GQHU');
  await new Promise((r) => setTimeout(r, 5000));
  console.log('spectating...');
  s.spectate();
  await new Promise((r) => setTimeout(r, 8000));
  s.close();
  process.exit(0);
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
