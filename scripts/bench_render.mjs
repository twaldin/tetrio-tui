// Performance benchmark for the TUI render hot path.
// Measures: render FPS, frame time, allocation rate (GC), memory.
// Usage: node scripts/bench_render.mjs [iterations]
// Outputs "METRIC name=value" lines for the autoresearch loop.
import { performance } from 'node:perf_hooks';
import { LocalGameController } from '../src/game/localgame.ts';
import { GameScreen } from '../src/tui/screens/game.ts';
import { OpponentTracker } from '../src/game/state.ts';

// A minimal in-memory RenderBuffer matching the contract (no terminal IO).
class BenchBuf {
  constructor(w, h) {
    this.width = w; this.height = h;
    this.cells = new Array(w * h).fill(null).map(() => ({ ch: ' ', fg: -1, bg: -1, attr: 0 }));
  }
  set(x, y, ch, st = {}) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    for (let i = 0; i < ch.length; i++) {
      const cx = x + i; if (cx >= this.width) break;
      const c = this.cells[y * this.width + cx];
      c.ch = ch[i];
      if (st.fg !== undefined) c.fg = st.fg === null ? -1 : (st.fg[0] << 16) | (st.fg[1] << 8) | st.fg[2];
      if (st.bg !== undefined) c.bg = st.bg === null ? -1 : (st.bg[0] << 16) | (st.bg[1] << 8) | st.bg[2];
    }
  }
  fillRect(x, y, w, h, ch, st = {}) { for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) this.set(c, r, ch, st); }
  drawText(x, y, t, st = {}) { this.set(x, y, t, st); }
  drawBox(x, y, w, h, st = {}) {}
}

// We need to import TS directly; use tsx via a wrapper. This file is run with tsx.
async function main() {
  const ITER = Number(process.argv[2] ?? 3000);
  const W = 110, H = 34;
  const ctrl = new LocalGameController();
  ctrl.start(1, { boardwidth: 10, boardheight: 20, g: 1 }, 42);
  const screen = new GameScreen({ controller: ctrl, opponents: new OpponentTracker(), onExit: () => {}, modeLabel: '40 LINES' });
  const buf = new BenchBuf(W, H);

  // Warm up
  for (let i = 0; i < 200; i++) { ctrl.tick(); screen.render(buf); }
  if (global.gc) global.gc();

  const memBefore = process.memoryUsage();
  const t0 = performance.now();
  for (let i = 0; i < ITER; i++) {
    ctrl.tick();
    screen.render(buf);
  }
  const t1 = performance.now();
  const memAfter = process.memoryUsage();

  const totalMs = t1 - t0;
  const frameMs = totalMs / ITER;
  const fps = 1000 / frameMs;
  const heapDeltaMB = (memAfter.heapUsed - memBefore.heapUsed) / 1e6;
  const rssDeltaMB = (memAfter.rss - memBefore.rss) / 1e6;
  const allocPerFrameKB = (memAfter.heapUsed - memBefore.heapUsed) / 1e3 / ITER;

  console.log(`METRIC frame_ms=${frameMs.toFixed(4)}`);
  console.log(`METRIC fps=${fps.toFixed(1)}`);
  console.log(`METRIC heap_delta_mb=${heapDeltaMB.toFixed(2)}`);
  console.log(`METRIC rss_delta_mb=${rssDeltaMB.toFixed(2)}`);
  console.log(`METRIC alloc_kb_per_frame=${allocPerFrameKB.toFixed(3)}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
