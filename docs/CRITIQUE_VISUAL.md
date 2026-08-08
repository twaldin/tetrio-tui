# CRITIQUE: tetrio-tui vs real TETR.IO — visual/placement fidelity

Adversarial comparison of `/tmp/final_game/f0000–f0533` (auto-played 40-line sprint) against real
TETR.IO footage (`/tmp/tetrio_footage/frames/`: `sprint_*` = 40 LINES replay, `league_*` /
`gameplay_*` = TETRA LEAGUE versus replays). Timing intentionally out of scope.

NOTE on moving targets: this repo was edited WHILE I analyzed it (game.ts changed on disk
mid-session) and /tmp/final_game was re-captured with a newer build. Where the newest frames
already differ from the original capture, I mark it **[new build]**. Items describe the captured
behavior the parent task refers to; verify current state before re-fixing.

Reference geometry (measured):
- Real sprint (1280x720): board frame x=522..757, y=73..562 (~24px/cell). Clear text "SINGLE":
  x~358..500, y~228..255 → right edge ~1 cell LEFT of board frame, top ~32% down the board
  (~row 6), cap height ~27px ≈ 1.1 board rows. "1 COMBO" directly below at y~289..324. Plain-text
  stats (INPUTS/PIECES/LINES/TIME) stack below that. HOLD box top-left, NEXT box top-right.
- My capture (900x782): board x~345..535, y~125..610 (~19px/col, ~24px/row).

---

## 1. Clear-type text placement — scattered along TOP EDGE vs fixed LEFT of board  [HIGHEST IMPACT]
- REAL: SINGLE/DOUBLE/TRIPLE/QUAD always render at a FIXED anchor left of the board: right edge
  ~1 cell from the board frame, vertically ~row 6 (upper third), entirely inside the free zone
  between HOLD box (above) and stats (below). Never moves, never clips, never overlaps the board.
- MINE (captured): popups spawn at terminal row y=1 with a RANDOM x across the full terminal
  width (game.ts: `px = margin + Math.floor(Math.random()*...)`). Measured x = 36..872px: they
  land over HOLD, over the board, over NEXT, clip off the right screen edge (f0050/f0056: text
  flush against x=872..900, letters cut), and overwrite the "40 LINES" header (f0031/f0350/f0400:
  header glyphs peek through the popup).
- FIX: fixed anchor in the left free zone, right edge ~1–2 cols left of the board frame, top at
  ~board row 5–6. Never random, never above the board.
- [new build] Now left-of-board — BUT too wide for the zone: "SINGLE" spans x=153..368 while the
  board border starts at x=337, so the last ~1.5 letters overlap the board border (f0154/f0224).
  Narrow the font (fewer cols/char) or start further left so the right edge clears the frame by
  ≥2 cols. Vertically it sits at ~41% of board height; real is ~32% — nudge up ~2 rows.

## 2. Clear-text style — magenta, two sizes, diagonal option vs uniform white horizontal
- REAL: clear word is a smooth bold sans-serif, WHITE with a thin dark outline, HORIZONTAL, and
  the SAME SIZE for SINGLE, DOUBLE, TRIPLE and QUAD alike (verified across ~15 clears). The only
  size variation is the smaller magenta "T-SPIN" / "MINI T-SPIN" prefix line above the word.
- MINE (captured): solid blocky █ pixel font in magenta accent (255,85,200); SMALL 4-row font for
  SINGLE/DOUBLE/TRIPLE but BIG 7-row font + diagonal "staircase" slant for TETRIS/T-SPIN
  (game.ts: `isBig = isTetris || isTspin`, `diagonal = isBig`). Even the small font is ~3.8 board
  rows tall vs real's ~1.1 rows — proportionally ~3x too large.
- FIX: render every clear word in ONE size, horizontal, near-white (theme text 235,235,245), with
  the T-SPIN prefix as a smaller accent line above. Drop the big/small split and the diagonal
  slant for clear words (real has no diagonal clear text). If terminal resolution forces a chunky
  font, a 3–4 row font is acceptable — but keep it uniform and white.
- [new build] Words are now white and horizontal — good. Verify the big/diagonal path is unused.

## 3. Terminology — real says "QUAD" and "MINI T-SPIN"; mine says "TETRIS" / "T-SPIN MINI"
- REAL: a 4-line clear displays "QUAD" (seen repeatedly: sprint and league replays; never the
  word TETRIS in-game). Mini T-spins show the prefix "MINI T-SPIN" (in that order) above the word.
- MINE: `typeNames` maps 4 lines to 'TETRIS' (game.ts); the legacy `clearText()` builds
  "T-SPIN MINI ..." (wrong order). The odd `isTspin && pc.lines===4 → 'QUAD'` branch is dead code
  for real play (T-spin quads don't exist) while the common case still says TETRIS.
- FIX: rename the 4-line label to "QUAD"; use "MINI T-SPIN" ordering for the prefix.

## 4. Combo counter — below the board vs "N COMBO" under the clear text
- REAL: combo shows as a big number + small "COMBO" label DIRECTLY UNDER the clear text, left of
  the board (e.g. "1 COMBO" under SINGLE, "4 COMBO" under T-SPIN DOUBLE). It appears from the 2nd
  consecutive clear (displays combo−1) and fades with the text block after ~1.5s. Separately, in
  versus during huge (4-wide) chains, a GIANT hollow outlined italic number (e.g. 20, 21) appears
  below the board bottom-center and lingers/fades — a special flourish, not the everyday counter.
- MINE (captured): a "COMBO" label + small yellow blocky digit BELOW the board at bottom
  center-right (`comboZoneX = boardX + bw − 4`, `comboZoneY = boardY + bh + 1`). Wrong zone, and
  styled like the everyday counter while sitting in the flourish position.
- FIX: everyday combo belongs in the left text block as "N COMBO" (number in warn/yellow, label
  to its right), fading with the block. Optionally add the giant hollow outlined number below the
  board for very high combos in versus.
- [new build] "N COMBO" now sits under the clear text left of the board (f0224: "1 COMBO") —
  matches. Confirm it fades with the block and never renders below the board anymore.

## 5. B2B indicator — real has a gold "B2B xN" line; mine was absent
- REAL: "B2B xN" in GOLD under the clear word (above the combo line), e.g. B2B x2, x5, x10; a
  broken chain flashes "B2B x0" in dark red. Always part of the same left-of-board text block.
- MINE (captured): never visible in 534 frames (singles keep btb ≤ 1, and the old code only showed
  it below the board when btb > 1 — nobody will ever notice it there).
- FIX: include "B2B xN" (accent/gold) in the left text block between the clear word and the combo
  line; flash dark-red "B2B x0" on chain break.
- [new build] `this._action` includes a B2B line when > 0. Could not be visually verified (bot
  never earned B2B in the new capture either). Consider surfacing the x0 break state.

## 6. Ghost piece — solid opaque gray block vs subtle translucent shadow
- REAL: ghost is a faint dark translucent "shadow" of the piece at the landing position — barely
  visible, clearly not a real block (gameplay_0060 close-up).
- MINE: ghost renders as a SOLID OPAQUE GRAY filled piece (f0297/f0450) that reads as a placed
  block; at a glance you can't tell ghost from stack. Worse, `drawBoard` only draws locked minos
  + ghost — the FALLING PIECE IS NEVER DRAWN (game.ts draws `visibleBoard(s.board)` +
  `computeGhostSet`; the colored active piece appears nowhere). Real TETR.IO shows the active
  piece in full color mid-fall above the stack.
- FIX: draw the falling piece in its piece color every frame; restyle the ghost to a dim outline
  / dark translucent fill (the 'outline' pieceStyle already exists — use it for the default
  theme), so the two are unmistakable.

## 7. Line-clear animation — flat white→purple row fade vs white-hot flash + particles
- REAL: clearing rows flash WHITE-HOT (blocks glow through the flash), white sparkle/diamond
  particles scatter upward, then the rows collapse; big clears add screen shake and (in versus)
  an attack beam (sprint_0054–58, league_0499).
- MINE: the row turns solid white, fades uniformly through pink/lavender over ~3–4 frames, then
  collapses (f0051–57). No per-block glow, no particles, no sparkle.
- FIX: keep the white flash phase brighter/longer with per-cell intensity variation, emit a few
  rising sparkle glyphs (▪ ✦ ·) above the clearing row, and keep the collapse snappy. Shake on
  QUAD/T-SPIN already exists in code — verify it reads at capture framerate.

## 8. Sprint HUD — hidden timer, no LINES counter, versus stats in a solo mode
- REAL 40 LINES: plain-text stack left of the board — INPUTS, PIECES, LINES n/40, TIME (running),
  FINESSE bottom-right. No APM/VS/ATK/SNT, no boxed panels.
- MINE: boxed STATS panel with APM/PPS/VS/ATK/SNT/RCV (versus-oriented); a static "40 LINES"
  label above the board; the timer is drawn at `boardY − 1` — THE SAME ROW AS THE BOARD'S TOP
  BORDER — so it is overdrawn by the border and invisible in every frame (verified f0400).
  No lines-remaining/lines-cleared counter anywhere.
- FIX: move the timer into the left stats stack; add "LINES n/40"; in solo sprint drop
  VS/ATK/SNT/RCV for PIECES/INPUTS (FINESSE optional). Never draw text on the border row.
- [new build] stats are now plain text at bottom-left (good) but still APM/PPS/VS/ATK/SNT and
  still no LINES/TIME.

## 9. Solo sprint shows a versus "+N" attack popup, clipped at the right screen edge
- REAL: 40 LINES solo has NO attack UI at all (no opponent).
- MINE [new build]: a giant yellow diagonal "+N" (big font, staircase slant) spawns right of the
  NEXT panel (`boardX + bw*2 + panelW + 6`) and runs off the right edge of the screen
  (f0154/f0224: clipped mid-glyph). Doubly wrong: it shouldn't exist in solo, and where it does
  exist it shouldn't clip.
- FIX: suppress attack popups when `modeLabel` is a solo mode; in versus, show attack near the
  board/garbage meter at a size that fits on screen.

## 10. Lower-priority cosmetic gaps (terminal-feasible subset)
- Board: real has a thin light frame and a translucent interior with thin grid lines; mine has a
  heavy double-line border and an opaque two-tone checkerboard with no grid lines. Consider
  single-line border + subtle grid glyphs.
- Pieces: real minos are glossy with a diagonal shine and visible cell gaps; mine are flat
  two-tone horizontal splits (half-block rendering) with no gaps. Acceptable for TUI, but the
  ghost/active distinction (#6) matters more.
- Danger state: real tints the whole board red and shows "XX" top-out marks when high; mine shows
  nothing at high stack (f0450).
- End screen: real shows a RESULTS table (pieces, PPS, time, lines, LPM, max combo, max B2B, all
  clears, finesse); mine shows a green "CLEAR" box with the final time only.

---
### Impact ranking (summary)
1. Clear-text placement (top-edge scatter → fixed left zone).  [fixed in new build, needs clearance]
2. Combo placement ("N COMBO" belongs in the left text block).  [fixed in new build]
3. Clear-text style: white, horizontal, uniform size, T-SPIN prefix line.  [mostly fixed]
4. Terminology: QUAD, MINI T-SPIN.
5. B2B gold "B2B xN" in the text block.
6. Ghost subtle + falling piece actually drawn.
7. Line-clear flash + particles.
8. Sprint HUD: visible timer + LINES n/40, solo-appropriate stats.
9. Remove solo "+N" attack popup / stop edge clipping.
10. Border/grid/danger/results cosmetics.


---
# RE-REVIEW ADDENDUM (build after fixes) — verified against newest /tmp/final_game (482 frames)

## Verified FIXED
1. Clear-text placement: fixed anchor left of board (x=117..332, top ~31% down), horizontal,
   clears the board frame (frame at x=337). No more top-edge scatter/clipping. ✔
2. Combo: "N COMBO" (yellow number + label) directly under the clear text, left of board. ✔
3. QUAD label confirmed in-game (f0046). No TETRIS wording seen. (T-SPIN / MINI T-SPIN prefix
   not observable — bot never t-spins in this capture; code-level only.)
4. Falling piece now drawn in full color mid-fall (f0100 orange L, f0180 blue I). ✔
5. Ghost is now a subtle dark shadow at the landing site. ✔
6. Solo HUD: PIECES / LINES n/40 / TIME / PPS plain text left of board; timer visible; versus
   stats gone; no +N attack popup in solo. ✔

## REMAINING issues (ranked)
R1. QUAD renders YELLOW (t.warn) — real QUAD is WHITE like every other clear word. Keep the
    clear word white; only the T-SPIN prefix and B2B line are colored.
R2. Clear text still collides with the HOLD panel: the top glyph row pokes through the HOLD
    box's bottom border (zoom-verified f0046). Drop the text block ~2 rows (or shrink HOLD box
    to ~6 rows) so there is visible air between box and text, as in the real game.
R3. Line-clear animation is still a flat full-row white→lavender fade. Real flashes white-hot
    per block and emits rising white sparkle particles. No particles/sweep in mine.
R4. B2B indicator unverifiable in solo sprint (bot never chains quads/t-spins) — needs a versus
    or quad-stacking capture to confirm the gold "B2B xN" line renders.
R5. End screen: green "CLEAR" box + time vs real RESULTS table; also a stray half-drawn panel
    fragment renders at bottom-right of the CLEAR overlay (f0475, x~530..745, y~595..625).
R6. Real versus shows a small stylized combo number flashing AT the clear site on the board
    (rf_0400: "3" and "2" on the boards) — optional flourish, not present in mine.
