# Perf Optimization Learnings — tetrio-tui render hot path

## Baseline
- frame_ms ≈ 0.0365
- fps ≈ 27500
- alloc_kb_per_frame ≈ 0.43
- heap_delta_mb ≈ 1.7

---

## Iteration 1: Replace computeGhost board copy with packed Set
- **Hypothesis**: computeGhost copies entire board (40×10=400 cells) every frame via `board.map(r => r.slice())`. Replace with a Set<number> of ~4 packed ghost cell positions.
- **Before**: frame_ms=0.0365, alloc_kb=0.43, heap_delta=1.7MB
- **After**: frame_ms=0.035, alloc_kb=0.2, heap_delta=0.65MB
- **Decision**: KEEP ✅ — 4% faster, 53% fewer allocations per frame

---

## Iteration 2: Pre-compute piece color styles for drawBoard
- **Hypothesis**: drawBoard creates new Style objects ({fg: c}) and calls shade(c, 0.82) per filled cell per frame. Pre-compute MINO_STYLE, MINO_STYLE_SHADED, GHOST_STYLE, BOARD_STYLE_A/B as module-level constants.
- **Before**: frame_ms=0.035, alloc_kb=0.2, heap_delta=0.65MB
- **After**: frame_ms=0.0353, alloc_kb=0.12, heap_delta=0.47MB
- **Decision**: KEEP ✅ — 40% fewer allocs, marginal frame_ms (within noise)

---

## Iteration 3: In-place effect aging (eliminate filter() array alloc)
- **Hypothesis**: `this.effects.filter(...)` creates a new array every frame. Replace with in-place compaction using writeIdx.
- **Before**: frame_ms=0.0353, alloc_kb=0.12, heap_delta=0.47MB
- **After**: frame_ms=0.035, alloc_kb=0.064, heap_delta=0.26MB
- **Decision**: KEEP ✅ — 47% fewer allocs

---

## Iteration 5: Board style cache + THEME Proxy elimination
- **Hypothesis**: drawBoard creates tint/shade/Style objects per cell; game.ts render() hits THEME Proxy 26 times per frame. Cache all board styles in a theme-invalidating cache; replace THEME.xxx with direct theme() call cached as `t`.
- **Before**: frame_ms=0.098, alloc_kb=0.245
- **After**: frame_ms=0.097, alloc_kb=0.02
- **Note**: The themes.ts Proxy-based refactor (committed in iteration 4 alongside engine.ts fix) caused a 3x regression from 0.035→0.098. The Proxy itself isn't slow (theme() returns a singleton), but the new rendering uses ▐▌ with fg+bg instead of ██ with fg-only, and adds drawBoardBorder/drawPanel with fillRect, increasing total buf.set calls from ~2000 to ~5000 per frame.
- **Decision**: KEEP ✅ — 92% alloc reduction, frame_ms marginal (within noise)

---

## Iteration 6: Cache Style objects in game.ts render()
- **Hypothesis**: 23 Style object literals created per render frame ({fg: t.dim}, etc.). Cache them in a theme-invalidating style registry `rs()`.
- **Before**: frame_ms=0.097
- **After**: frame_ms=0.096
- **Decision**: KEEP ✅ — marginal frame improvement, reduces alloc pressure. V8 handles small objects well, so the speedup from eliminating 23 allocs is small.

---

## Iteration 7: Optimize present() in driver.ts
- **Hypothesis**: present() creates new CellBuffer + 3740 spread copies every frame, uses O(n²) string concatenation for output.
- **Changes**: Reuse front buffer with in-place field copy; use string array + join instead of repeated string concat.
- **Impact on benchmark**: None (bench doesn't measure present()). No regression in render metrics.
- **Decision**: KEEP ✅ — eliminates major allocation hotspot in the real rendering pipeline

---

## Iteration 8: Optimize CellBuffer set/fillRect/drawText in driver.ts
- **Hypothesis**: CellBuffer.set() recomputes rgbToNum per char in loop; fillRect calls set() 3740 times with per-call overhead; drawText iterates with for-of then calls set() per char.
- **Changes**: Pre-compute fg/bg/attr once in set(); inline fillRect loop with pre-computed values and clamped bounds; drawText delegates to set() with full string.
- **Impact on benchmark**: None (bench uses BenchBuf). No regression.
- **Decision**: KEEP ✅ — optimizes the real CellBuffer hot path for actual terminal rendering

---

## Iteration 9: Eliminate bag.slice + forEach in render
- **Hypothesis**: `s.bag.slice(0,5)` + `.forEach()` creates array + closure per frame. Replace with direct for-loop on `s.bag[i]`.
- **Before/After**: frame_ms within noise, eliminates 1 array + 5 closure allocs per frame
- **Decision**: KEEP ✅ — micro-opt, no regression

---

## Iteration 10: Reuse computeGhostSet Set across frames
- **Hypothesis**: `new Set<number>()` created every frame. Reuse module-level Set with .clear().
- **Before**: frame_ms=0.097
- **After**: frame_ms=0.095
- **Decision**: KEEP ✅ — 2% improvement, eliminates Set allocation per frame

---

