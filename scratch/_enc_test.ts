
import { pack, unpack } from '../src/net/theorypack.js';
import { Replay, ReplayFrame } from '../src/net/structures.js';

const plain = { gameid: 5, provisioned: 10, frames: [{ type: 'start', frame: 0, data: {} }] };
const p1 = pack(plain);
console.log('plain object pack:', Buffer.from(p1).toString('hex'));

const rep = new Replay(5, 10, [{ type: 'start', frame: 0, data: {} } as any]);
const p2 = pack(rep);
console.log('Replay ext pack:  ', Buffer.from(p2).toString('hex'));

// what does the server expect? game.replay data decoded as Replay ext
const back: any = unpack(p2);
console.log('decoded Replay:', back.constructor.name, back.gameid, back.provisioned, back.frames?.[0]?.type);
