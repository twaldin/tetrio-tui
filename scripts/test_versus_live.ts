// Live versus test: join a busy room as a player, wait for a game, play (send frames).
import { TetrioSession } from '../src/net/session.js';
import { GameConnection } from '../src/net/gameconn.js';
import { getToken } from './token.js';
async function main() {
  const { token, userid } = await getToken();
  const s = new TetrioSession();
  await s.loginToken(token, userid);
  await s.connect();
  console.log('connected', userid);
  const gc = new GameConnection(s);
  gc.on('start', (gid) => console.log('*** GAME START, my gameid:', gid));
  gc.on('end', (r) => console.log('*** GAME END:', JSON.stringify(r)));
  gc.on('opponentsChanged', () => console.log('  opponents:', gc.opponents.views.size, 'games tracked'));

  // join a busy room as player
  console.log('joining GQHU as player...');
  s.joinRoom('GQHU');
  await new Promise(r => setTimeout(r, 4000));
  s.send('room.bracket.switch', 'player');
  console.log('in player bracket, waiting for game.start...');

  // watch for game start and enter
  s.on('game.start', (d: any) => {
    console.log('game.start:', JSON.stringify(d).slice(0, 400));
  });
  s.on('game.match', (d: any) => {
    console.log('game.match:', JSON.stringify(d).slice(0, 400));
  });
  s.on('game.replay.state', (d: any) => console.log('replay.state gameid:', d?.gameid));

  // wait for a game to start (rooms restart every round)
  await new Promise(r => setTimeout(r, 60000));
  console.log('done waiting. inGame:', gc.inGame);
  s.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
