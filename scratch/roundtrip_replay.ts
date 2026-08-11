// Round-trip: real client's game.replay frames -> decode -> re-encode -> byte-diff.
import { Unpackr, Packr, addExtension } from 'msgpackr';
import { ExtensionBase } from '../src/net/netcodec.js';
import { initStructures } from '../src/net/structures.js';
import * as fs from 'fs';
initStructures();
const packr = new Packr(); const unpackr = new Unpackr();
ExtensionBase.LoadExtensions({ addExtension: (e: any) => addExtension(e), pack: (v: any) => packr.pack(v), useBuffer: (b: any) => packr.useBuffer(b), unpack: (b: any) => unpackr.unpack(b) } as never);

const entries = JSON.parse(fs.readFileSync('docs/captures/game_full_log.json', 'utf8'));
const GENERIC = JSON.parse(fs.readFileSync('docs/command_table.json', 'utf8')).generic;
let total = 0, exact = 0, diffs = 0;
for (const e of entries) {
  if (e.type !== 'ws-send' || !e.hex) continue;
  const buf = Buffer.from(e.hex, 'hex');
  const code = buf[0] & 0x3f;
  const off = (buf[0] & 0x80) ? 4 : 1;
  if (code !== 43) continue;
  const cmdCode = buf[off];
  if (GENERIC[String(cmdCode)] !== 'game.replay') continue;
  total++;
  const payload = buf.subarray(off + 1);
  try {
    const decoded = unpackr.unpack(payload);
    const reencoded = packr.pack(decoded);
    if (Buffer.compare(Buffer.from(reencoded), payload) === 0) exact++;
    else {
      diffs++;
      if (diffs <= 3) {
        console.log(`--- DIFF #${total}: orig len ${payload.length} vs reenc len ${reencoded.length}`);
        for (let i = 0; i < Math.min(payload.length, reencoded.length); i++) {
          if (payload[i] !== reencoded[i]) { console.log(`first diff @${i}: orig ${payload[i].toString(16)} vs ${reencoded[i].toString(16)}`); break; }
        }
        console.log('decoded head:', JSON.stringify(decoded, (k,v)=>typeof v==='bigint'?v.toString():v).slice(0, 300));
      }
    }
  } catch (err) { console.log(`#${total} error:`, (err as Error).message); }
}
console.log(`game.replay frames: ${total}, byte-exact re-encode: ${exact}, diffs: ${diffs}`);
