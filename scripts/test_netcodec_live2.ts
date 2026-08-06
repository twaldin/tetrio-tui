import { Unpackr, Packr, addExtension } from 'msgpackr';
import { ExtensionBase } from '../src/net/netcodec.js';
import { initStructures } from '../src/net/structures.js';
import * as fs from 'fs';
initStructures();
const packr = new Packr(); const unpackr = new Unpackr();
ExtensionBase.LoadExtensions({ addExtension: (e: any) => addExtension(e), pack: (v: any) => packr.pack(v), useBuffer: (b: any) => packr.useBuffer(b), unpack: (b: any) => unpackr.unpack(b) } as never);
const entries = JSON.parse(fs.readFileSync('docs/captures/game_full_log.json', 'utf8'));
const GENERIC = JSON.parse(fs.readFileSync('docs/command_table.json', 'utf8')).generic;
function* frames(hex: string): Generator<{ cmd: string; payload: Buffer }> {
  const buf = Buffer.from(hex, 'hex');
  const code = buf[0] & 0x3f; const off = (buf[0] & 0x80) ? 4 : 1;
  const payload = buf.subarray(off);
  if (code === 43) { const c = payload[0]; yield { cmd: GENERIC[String(c)] || `cmd${c}`, payload: payload.subarray(1) }; }
  else if (code === 7) { for (let s = 0; s < payload.length;) { const n = payload.readUInt32BE(s); s += 4; yield* frames(payload.subarray(s, s + n).toString('hex')); s += n; } }
}
let fullShown = 0, igeShown = 0, stateShown = 0;
const typeCounts: Record<string, number> = {};
for (const e of entries) {
  if (e.type !== 'ws-recv' || !e.hex) continue;
  for (const f of frames(e.hex)) {
    if (f.cmd === 'game.replay') {
      try {
        const d: any = unpackr.unpack(f.payload);
        for (const fr of d.frames ?? []) {
          typeCounts[fr.type] = (typeCounts[fr.type] ?? 0) + 1;
          if (fr.type === 'full' && fullShown < 1) {
            fullShown++;
            const g = fr.data?.game;
            console.log('--- FULL frame ---');
            console.log('bag:', g?.bag, 'hold:', g?.hold, 'playing:', g?.playing, 'falling:', JSON.stringify(g?.falling).slice(0,150));
            if (g?.board) {
              console.log('board (first/last rows):');
              const vis = g.board.slice(-20);
              console.log(vis.map((r: any[]) => r.map((c: any) => c ? c[0] : '.').join('')).join('\n'));
            }
          }
          if (fr.type === 'ige' && igeShown < 3) { igeShown++; console.log('--- IGE ---', JSON.stringify(fr.data).slice(0, 300)); }
        }
      } catch (err) {}
    }
    if (f.cmd === 'game.replay.state' && stateShown < 1) {
      stateShown++;
      const d: any = unpackr.unpack(f.payload);
      console.log('--- game.replay.state ---', 'gameid:', d.gameid);
      console.log('setoptions keys:', Object.keys(d?.data?.game?.setoptions ?? {}).slice(0, 20).join(','));
    }
  }
}
console.log('\nframe type counts:', JSON.stringify(typeCounts));
