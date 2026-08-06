import { Unpackr, Packr, addExtension } from 'msgpackr';
import { ExtensionBase } from '../src/net/netcodec.js';
import { initStructures } from '../src/net/structures.js';
import * as fs from 'fs';
initStructures();
const packr = new Packr(); const unpackr = new Unpackr();
ExtensionBase.LoadExtensions({ addExtension: (e: any) => addExtension(e), pack: (v: any) => packr.pack(v), useBuffer: (b: any) => packr.useBuffer(b), unpack: (b: any) => unpackr.unpack(b) } as never);
const entries = JSON.parse(fs.readFileSync('docs/captures/game_full_log.json', 'utf8'));
const GENERIC = JSON.parse(fs.readFileSync('docs/command_table.json', 'utf8')).generic;
let shown = 0;
for (const e of entries) {
  if (e.type !== 'ws-send' || !e.hex) continue;
  const buf = Buffer.from(e.hex, 'hex');
  const code = buf[0] & 0x3f;
  const off = (buf[0] & 0x80) ? 4 : 1;
  if (code !== 43) continue;
  const cmdCode = buf[off];
  const name = GENERIC[String(cmdCode)];
  if (name !== 'game.replay') continue;
  shown++;
  if (shown <= 6) {
    try {
      const decoded = unpackr.unpack(buf.subarray(off + 1));
      console.log(`--- C>S game.replay #${shown} (len ${buf.length}) ---`);
      console.log(JSON.stringify(decoded, (k, v) => typeof v === 'bigint' ? v.toString() : v).slice(0, 500));
    } catch (err) { console.log(`#${shown} decode err:`, (err as Error).message, 'hex:', e.hex.slice(0, 80)); }
  }
}
console.log('total C>S game.replay:', shown);
