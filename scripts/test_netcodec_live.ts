import { Unpackr, Packr, addExtension } from 'msgpackr';
import { ExtensionBase } from '../src/net/netcodec.js';
import { initStructures } from '../src/net/structures.js';
import * as fs from 'fs';

initStructures();
const packr = new Packr();
const unpackr = new Unpackr();
// Adapt: LoadExtensions expects an object with addExtension/pack/useBuffer/unpack.
ExtensionBase.LoadExtensions({
  addExtension: (e: any) => addExtension(e),
  pack: (v: any) => packr.pack(v),
  useBuffer: (b: any) => packr.useBuffer(b),
  unpack: (b: any) => unpackr.unpack(b),
} as never);

const entries = JSON.parse(fs.readFileSync('docs/captures/game_full_log.json', 'utf8'));
const GENERIC = JSON.parse(fs.readFileSync('docs/command_table.json', 'utf8')).generic;

function* frames(hex: string): Generator<{ cmd: string; payload: Buffer }> {
  const buf = Buffer.from(hex, 'hex');
  const code = buf[0] & 0x3f;
  const F_ID = (buf[0] & 0x80) !== 0;
  let off = 1; if (F_ID) off = 4;
  const payload = buf.subarray(off);
  if (code === 43) {
    const cmdCode = payload[0];
    yield { cmd: GENERIC[String(cmdCode)] || `cmd${cmdCode}`, payload: payload.subarray(1) };
  } else if (code === 7) {
    for (let s = 0; s < payload.length;) { const n = payload.readUInt32BE(s); s += 4; yield* frames(payload.subarray(s, s + n).toString('hex')); s += n; }
  }
}

let replayCount = 0, stateCount = 0, okCount = 0;
for (const e of entries) {
  if (e.type !== 'ws-recv' || !e.hex) continue;
  for (const f of frames(e.hex)) {
    if (f.cmd === 'game.replay') {
      replayCount++;
      try {
        const decoded = unpackr.unpack(f.payload);
        okCount++;
        if (replayCount <= 2) {
          console.log(`--- game.replay #${replayCount} ---`);
          console.log(JSON.stringify(decoded, (k, v) => typeof v === 'bigint' ? v.toString() : v).slice(0, 700));
        }
      } catch (err) { if (replayCount <= 5) console.log(`replay #${replayCount} err:`, (err as Error).message); }
    }
  }
}
console.log(`\ntotals: ${replayCount} game.replay, decoded OK: ${okCount}`);
