import { TetrioSession } from '../src/net/session.js';
import { GameConnection } from '../src/net/gameconn.js';
import { getToken } from './token.js';
async function main() {
  const { token, userid } = await getToken();
  const s = new TetrioSession();
  await s.loginToken(token, userid);
  await s.connect();
  const gc = new GameConnection(s);
  console.log('connected, joining GQHU to spectate...');
  s.joinRoom('GQHU');
  await new Promise(r => setTimeout(r, 4000));
  s.send('room.bracket.switch', 'spectator');
  s.spectate();
  console.log('spectating...');
  let oppBoards = 0;
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const views = [...gc.opponents.views.values()];
    const withBoard = views.filter(v => v.board && v.board.some((row: any[]) => row.some((c: any) => c)));
    if (withBoard.length > oppBoards) {
      oppBoards = withBoard.length;
      console.log(`t=${i} opponents tracked: ${views.length}, with board content: ${withBoard.length}`);
    }
  }
  console.log('FINAL: opponents with boards:', oppBoards);
  // Print one opponent board
  const v = [...gc.opponents.views.values()].find(x => x.board && x.board.some((r: any[]) => r.some((c: any) => c)));
  if (v?.board) {
    const vis = v.board.slice(-20);
    console.log('sample opponent board:');
    console.log(vis.map((r: any[]) => r.map((c: any) => c ? (c[0] ?? 'g') : '.').join('')).join('\n'));
  }
  s.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
