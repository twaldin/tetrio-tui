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
  if ((buf[0] & 0x3f) !== 43) continue;
  const off = (buf[0] & 0x80) ? 4 : 1;
  if (GENERIC[String(buf[off])] !== 'game.replay') continue;
  shown++;
  if (shown > 3) break;
  const payload = buf.subarray(off + 1);
  console.log(`=== batch #${shown} (${payload.length}b) hex: ${payload.toString('hex').slice(0, 120)}`);
  const d = unpackr.unpack(payload);
  console.log('top-level type:', d?.constructor?.name ?? typeof d, '| keys:', Object.keys(d ?? {}));
  if (d?.frames) {
    for (const f of d.frames.slice(0, 4)) {
      console.log('  frame:', f?.constructor?.name ?? typeof f, f.type, 'frame#', f.frame, 'data type:', f.data?.constructor?.name ?? typeof f.data);
    }
  }
}
