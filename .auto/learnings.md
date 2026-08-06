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

