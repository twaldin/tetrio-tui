import { TetrioSession } from '../src/net/session.js';
import { getToken } from './token.js';
async function main() {
  const { token, userid } = await getToken();
  const s = new TetrioSession();
  await s.loginToken(token, userid);
  await s.connect();
  console.log('connected, joining GQHU + spectating...');
  s.joinRoom('GQHU');
  await new Promise(r => setTimeout(r, 4000));
  s.send('room.bracket.switch', 'spectator');
  s.spectate();
  let gameids: number[] = [];
  s.on('game.spectate', (d: any) => {
    const players = d?.players ?? [];
    gameids = players.map((p: any) => p.gameid).filter(Boolean);
    console.log('game.spectate: gameids to scope:', gameids.join(','));
    for (const gid of gameids) s.scopeStart(gid);
  });
  s.on('game.replay.state', (d: any) => {
    const g = d?.data?.game;
    console.log('replay.state gameid:', d?.gameid, 'hasBoard:', !!g?.board, 'bag:', g?.bag?.length, 'playing:', g?.playing);
    if (g?.board) {
      const vis = g.board.slice(-20);
      const nonempty = vis.filter((r: any[]) => r.some((c: any) => c)).length;
      console.log('  board non-empty rows:', nonempty);
    }
  });
  s.on('game.replay', (d: any) => {
    if (d?.gameid) console.log('replay frames for gameid', d.gameid, 'frames:', d.frames?.length);
  });
  await new Promise(r => setTimeout(r, 15000));
  s.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
