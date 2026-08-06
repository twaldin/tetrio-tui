import { Packr, Unpackr } from 'msgpackr';

// ---- 1. Render diff hot path: build an ANSI diff string for a 120x40 frame ----
const W = 120, H = 40;
function makeCells() {
  const cells = new Array(W*H);
  for (let i = 0; i < W*H; i++) cells[i] = { ch: '█', fg: (Math.random()*0xffffff)|0, bg: -1, attr: 0 };
  return cells;
}
const front = makeCells();
const back = makeCells();
// change ~30% of cells
for (let i = 0; i < W*H; i++) if (Math.random() < 0.3) back[i] = { ch: '██', fg: (Math.random()*0xffffff)|0, bg: -1, attr: 1 };

function buildDiff(front, back) {
  let out = '';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = back[y*W+x], f = front[y*W+x];
    if (c.ch===f.ch && c.fg===f.fg && c.bg===f.bg && c.attr===f.attr) continue;
    out += `\x1b[${y+1};${x+1}H\x1b[38;2;${(c.fg>>16)&255};${(c.fg>>8)&255};${c.fg&255}m` + c.ch;
  }
  return out;
}
let t0 = performance.now();
const FRAMES = 1000;
for (let i = 0; i < FRAMES; i++) buildDiff(front, back);
let t1 = performance.now();
const perFrame = (t1-t0)/FRAMES;
console.log(`render diff (120x40, 30% dirty): ${perFrame.toFixed(3)} ms/frame  =>  ${(1000/perFrame).toFixed(0)} fps headroom`);

// ---- 2. NetCodec-ish decode hot path: msgpackr unpack + bit reads ----
const packr = new Packr();
const state = { gameid: 7860, data: { game: { board: Array.from({length:20},()=>Array(10).fill('i')), bag:['i','o','t'], g: 0.02, stats:{apm:120,pps:2.4} } } };
const packed = packr.pack(state);
const unpackr = new Unpackr();
t0 = performance.now();
for (let i = 0; i < 10000; i++) unpackr.unpack(packed);
t1 = performance.now();
console.log(`msgpackr unpack small state: ${((t1-t0)/10000*1000).toFixed(2)} us/op  =>  ${(1000000/((t1-t0)/10000*1000)).toFixed(0)} ops/sec`);

// bit-level read simulation (NetCodec board decode ~ 400 cells)
t0 = performance.now();
for (let i = 0; i < 10000; i++) {
  let acc = 0;
  const buf = packed;
  for (let b = 0; b < 400; b++) { acc += (buf[(i+b) % buf.length] >> (b & 7)) & 1; }
}
t1 = performance.now();
console.log(`400-bit decode loop: ${((t1-t0)/10000*1000).toFixed(2)} us/op  =>  ${(1000000/((t1-t0)/10000*1000)).toFixed(0)} ops/sec`);
