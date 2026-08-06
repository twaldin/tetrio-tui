import { TetrioSession } from '../src/net/session.js';

function logAll(s: TetrioSession, tag: string) {
  const interesting = ['room.update', 'room.join', 'game.enter', 'game.ready', 'game.start', 'game.match', 'game.advance', 'game.end', 'game.score', 'room.start', 'room.abort', 'game.replay.state'];
  for (const ev of interesting) {
    s.on(ev as any, (d: any) => console.log(`[${tag}] ${ev}:`, JSON.stringify(d).slice(0, 300)));
  }
}

async function main() {
  // HOST creates a room
  const host = new TetrioSession();
  await host.loginAnonymous('tui-host');
  await host.connect();
  console.log('HOST connected', host.userid);
  logAll(host, 'HOST');

  // GUEST joins
  const guest = new TetrioSession();
  await guest.loginAnonymous('tui-guest');
  await guest.connect();
  console.log('GUEST connected', guest.userid);
  logAll(guest, 'GUEST');

  // HOST creates a room (public, default config)
  let roomId = '';
  host.on('room.join', (d: any) => { if (d?.id) roomId = d.id; });
  console.log('HOST creating room...');
  host.send('room.create', { auto: false });
  await new Promise(r => setTimeout(r, 3000));
  console.log('room id:', roomId);

  if (roomId) {
    console.log('GUEST joining', roomId);
    guest.send('room.join', roomId);
    await new Promise(r => setTimeout(r, 3000));
    // HOST starts the game
    console.log('HOST starting game...');
    host.send('room.start');
    await new Promise(r => setTimeout(r, 8000));
  }
  host.close(); guest.close();
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
