
import { pack, unpack } from '../src/net/theorypack.js';
import { Replay, ReplayFrame } from '../src/net/structures.js';

const frames = [
  { type: 'start', frame: 0, data: {} },
  { type: 'keydown', frame: 5, data: { key: 'moveLeft', subframe: 0 } },
  { type: 'keyup', frame: 9, data: { key: 'moveLeft', subframe: 0 } },
];
const rep = new Replay(5, 10, frames as any);
const p2 = pack(rep);
console.log('Replay ext pack hex:', Buffer.from(p2).toString('hex'));
const back: any = unpack(p2);
console.log('decoded:', back?.constructor?.name, 'gameid', back?.gameid, 'prov', back?.provisioned, 'frames', back?.frames?.map((f: any) => f.type + '@' + f.frame).join(','));
console.log('frame1 data:', JSON.stringify(back?.frames?.[1]?.data));
