
import { unpack } from '../src/net/theorypack.js';
import * as fs from 'fs';
const hexes = JSON.parse(fs.readFileSync('scratch/_replay_hexes.json', 'utf8'));
for (const h of hexes) {
  try {
    const r: any = unpack(Buffer.from(h, 'hex'));
    const types = (r?.frames ?? []).map((f: any) => f.type + '@' + f.frame).join(', ');
    console.log('Replay gameid', r?.gameid, 'prov', r?.provisioned, 'frames:', types.slice(0, 220));
    const end = (r?.frames ?? []).find((f: any) => f.type === 'end');
    if (end) {
      console.log('  END FRAME:', JSON.stringify(end.data, (k,v)=>typeof v==='bigint'?v.toString():v)?.slice(0, 500));
    }
  } catch (e) { console.log('decode error:', String(e).slice(0, 120)); }
}
