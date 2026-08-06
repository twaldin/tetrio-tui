#!/usr/bin/env bash
# Autoresearch measure: run the render benchmark and report the primary metric (frame_ms).
cd "$(dirname "$0")/.."
out=$(npx tsx scripts/bench_render.mjs 4000 2>/dev/null)
echo "$out"
# Primary metric: frame_ms (lower is better)
echo "$out" | grep -E '^METRIC (frame_ms|fps|alloc_kb_per_frame)' 
