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

