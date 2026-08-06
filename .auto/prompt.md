# Perf autoresearch: tetrio-tui render hot path

OBJECTIVE: continually make the TUI renderer + game loop faster and leaner.
Primary metric: `frame_ms` (lower is better). Secondary: `fps` (higher), `alloc_kb_per_frame` (lower, ~0 = no per-frame allocation), `heap_delta_mb` (should not grow across many frames).

IN SCOPE (only optimize these):
- src/tui/driver.ts (TerminalDriver: cell buffer, diff present loop, SGR emission)
- src/tui/draw.ts (drawBoard, drawPiecePreview, drawPanel, drawBox, drawMenuItem)
- src/tui/screens/game.ts (render method, computeGhost, effects)
- src/game/engine.ts (tick, hot path) — ONLY perf; do NOT change game semantics/rules.

OUT OF SCOPE: game rules/mechanics, protocol, network, other screens.

RULES:
- Keep `npx tsc --noEmit -p tsconfig.json` clean and `npm test` passing (run .auto/measure.sh, then tsc + tests after each change).
- Keep the VISUAL output identical (the board/menus must render the same content). Optimize HOW, not WHAT.
- Make ONE focused change per iteration. Run the benchmark before+after. Keep if frame_ms improves (or allocations drop) without breaking tests; otherwise `git checkout -- <file>` to revert.
- Commit each kept improvement: `git commit -m "perf: <what>"`.
- Prefer: fewer allocations (reuse buffers, avoid per-cell objects/strings), early-out on unchanged cells, cheaper SGR (cache current style), avoid re-splitting strings, avoid Date.now in hot loops, avoid creating arrays/objects per frame/cell.
- Read the benchmark + the code first. Log each experiment's hypothesis + result to .auto/learnings.md.
