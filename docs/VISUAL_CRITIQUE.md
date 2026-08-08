# VISUAL CRITIQUE — tetrio-tui

> Reviewed: all 8 themes (tetrio, tokyo-night, catppuccin, gruvbox, nord, dracula, solarized, monokai), home menu, and 40-lines game screen.
> Standard: compared against TETR.IO official client, lazygit, btop, Charm.sh TUIs.

---

## 🔴 PRIORITY 1 — High-Impact Issues

### 1. Mino rendering produces visible vertical stripes (ALL themes)

**Where:** Every piece on the board, NEXT queue, and HOLD panel.

**What's wrong:** Each 2-char-wide mino cell uses `▐` (right half-block) on the left char and `▌` (left half-block) on the right char, with a `tint(c, 0.25)` highlight and `shade(c, 0.72)` shadow. This creates **four distinct vertical color bands** per mino:

```
[base_bg | tint_fg ‖ shade_fg | base_bg]
```

At terminal resolution this reads as noisy vertical stripes, not a smooth bevel. The pieces look "ribbed" or "corrugated" instead of solid and clean. Compare to TETR.IO's client where each mino is a single solid color with a very subtle per-pixel glossy gradient — something a TUI can't replicate at this scale.

**The fix:**
- **Option A (recommended):** Drop the bevel entirely. Render each mino as two full-block `█` chars with the **same** fg color (the piece color). Solid, clean, iconic.
- **Option B:** Make the bevel *much* more subtle — `tint(c, 0.08)` and `shade(c, 0.93)` — so it's barely perceptible but adds depth without looking striped.
- **Option C:** Edge bevel only — the first mino column of a piece gets a left highlight, the last column gets a right shadow. Per-mino internal bevel is removed.

**Impact:** This is the single most visually damaging issue. Every frame of gameplay shows it.

---

### 2. Board border mixes heavy lines with light rounded corners

**Where:** The main playfield border.

**What's wrong:** The board uses `━` (heavy horizontal) and `┃` (heavy vertical) lines but `╭╮╰╯` (light rounded) corners. This is a **typographic mismatch**. Heavy lines pair with `┏┓┗┛` (heavy corners) or `╔╗╚╝` (double-line corners). Light rounded corners pair with `─│`. Mixing weights looks like a rendering bug to anyone who reads box-drawing.

**The fix:** Use heavy corners `┏┓┗┛` to match the heavy bars. Or switch to light lines `─│` with the existing rounded corners `╭╮╰╯`. The first option (heavy corners) gives the board a more "official," premium feel and differentiates it from the lighter panel boxes. Alternatively, use double-line `═║╔╗╚╝` for a distinctive TETR.IO-style board frame.

---

### 3. Ghost piece is nearly invisible (most themes)

**Where:** The ghost/shadow piece on the board showing where the active piece will land.

**What's wrong:** The ghost is rendered with a `shade(ghost, 0.5)` bg and faint tint/shade fg, using the same `▐`/`▌` bevel as regular pieces. Against the dark checkerboard, the ghost is extremely hard to see — especially in darker themes like tetrio, tokyo-night, and nord. In competitive play, the ghost piece is *critical* for fast hard-drop targeting.

**The fix:**
- Use a **brighter** ghost color — at least 40% brighter than current, or use a distinct visual treatment: hollow outline (e.g. `┌─┐│ │└─┘` per 2×1 mino) instead of filled. 
- Alternatively, use `▒` (medium shade block) or `░` (light shade block) characters for the ghost cells — this reads as "translucent" and clearly says "piece will go here." 
- Ghost should stand out clearly from empty checkerboard cells even in the darkest themes.

---

### 4. Menu selected state is a wall of hot pink — visually jarring

**Where:** Home menu, all menu screens. The selected card.

**What's wrong:** When a menu item is selected, the *entire* card fills with a solid, high-saturation accent color (hot pink `rgb(255, 85, 200)` in the default theme). The text turns near-black. This creates a massive color block that dominates the screen and clashes with the otherwise dark, muted UI. It looks like a CSS `:active` state, not a `:focus` state. Best-in-class TUIs (lazygit, Charm's gum/bubbletea) use a **subtle highlight** — slightly brighter bg, colored border, or an accent bar — not a full color flood.

**The fix:**
- **Selected state:** Keep the panel bg slightly elevated (e.g. `surface` instead of `panel`), add a **bright left accent bar** (already exists: `▌`), make the title text bold+accent-colored, and keep the subtitle in `subtext` color. Do NOT flood the entire card with accent color.
- **Hover/focus glow:** Optionally add a brighter border on the selected card or a subtle `▸` indicator.
- The current unselected treatment (dark card + colored left bar) actually looks *better* than the selected one. Invert the emphasis.

---

## 🟠 PRIORITY 2 — Medium-Impact Issues

### 5. Massive vertical dead space below menu items and below game board

**Where:** Home menu bottom half; game screen bottom ~6 rows.

**What's wrong:** The menu has 4-5 cards at ~3 rows each with 1-row gaps = ~20 rows of content in a 34-row terminal, leaving 10+ rows of pure black below the last card. The "↑↓ select · enter confirm · esc back" hint sits at `buf.height - 3` with nothing between it and the last menu card. Similarly, the game screen has only "esc forfeit" below the board, with 3-5 empty rows.

**The fix:**
- **Menu:** Vertically center the entire card stack, or push the cards closer together (reduce 4-row pitch to 3-row pitch — 2-row cards + 1-row gap).
- **Game:** Add a **timer/lines counter** strip below the board (above "esc forfeit"). In 40-LINES mode, show `LINES: 12/40` prominently. In BLITZ, show the score. This is functionally important AND fills the space.
- Consider a subtle footer bar with session info (theme name, FPS, user).

---

### 6. HOLD and STATS panels are disconnected — visual gap breaks left column

**Where:** Left side of the game screen: HOLD panel (7 rows) then a 1-row gap then STATS panel (11 rows).

**What's wrong:** The two panels float independently with a gap between them. The left column looks like two separate widgets rather than a unified sidebar. Compare to TETR.IO where HOLD and stats form one continuous left rail.

**The fix:** Either merge HOLD and STATS into one continuous panel (HOLD at top, horizontal divider `├─┤`, STATS below), or remove the gap entirely so the boxes are flush. A single tall panel with an internal divider looks much cleaner.

---

### 7. The game timer is invisible

**Where:** Just above the board, at `boardY - 1`, rendered in `_s.dimS` (dim style).

**What's wrong:** The timer (`0:00`, `1:23`, etc.) is rendered in the `dim` color which, in most themes, is nearly invisible against the dark background — especially at a glance during gameplay. The timer is one of the most important stats in sprint/blitz modes.

**The fix:** Render the timer in `subtext` or `text` color, or give it a `bold` attribute. Optionally make it larger (double-height via a bigtext renderer) for sprint modes where it's the primary readout.

---

### 8. NEXT panel pieces lack vertical breathing room

**Where:** NEXT panel, right side of the game screen.

**What's wrong:** Five preview pieces are stacked with 4-row pitch (piece shape = 2-3 rows + 1-2 padding rows). The pieces feel crammed — the bottom pieces especially crowd the panel border. TETR.IO spaces next pieces more generously.

**The fix:** Use 5-row pitch if terminal height allows (5 pieces × 5 rows = 25 rows vs current 22 for the panel). Alternatively, show only 4 next pieces with more spacing if height is tight. The current `boardY + 2 + i * 4` → change to `boardY + 2 + i * 5` if the panel has room.

---

## 🟡 PRIORITY 3 — Polish Issues

### 9. Menu subtitle "terminal client" and horizontal rule look amateur

**Where:** Home menu, top section.

**What's wrong:** The text `terminal client` in faint gray under `TETR.IO`, followed by a centered `─────────────` horizontal rule, looks like a placeholder. The horizontal rule is rendered as 28 chars of `─` via `fillRect` which produces a thin line that doesn't really frame anything — it just adds visual noise between the title and the cards.

**The fix:** Drop the horizontal rule entirely. Make "terminal client" italic (if terminal supports) or use a different character treatment (smaller caps via Unicode, or a dimmed `◆ terminal client ◆`). Or replace with a version string (`v0.1.0-alpha`) in faint text. The title area should be cleaner and tighter.

---

### 10. Solarized theme: board-to-panel contrast is too low

**Where:** Solarized Dark theme, game screen.

**What's wrong:** Solarized's bg `rgb(0, 43, 54)` and panel `rgb(7, 54, 66)` are very close in value. The HOLD and STATS panels barely differentiate from the background. The board checkerboard (`boardA: rgb(0, 34, 43)` / `boardB: rgb(7, 44, 54)`) is also very close to the bg, making the board edge hard to perceive.

**The fix:** Increase the panel value separation — bump panel to at least `rgb(14, 66, 78)` (+7 per channel). Or darken the bg slightly to `rgb(0, 36, 46)` to create more headroom.

---

### 11. ATK/SNT/RCV zeros use semantic colors meaninglessly

**Where:** STATS panel, bottom three rows.

**What's wrong:** `ATK: 0` in accent pink, `SNT: 0` in green, `RCV: 0` in red. Three colored zeros sitting in a row look like a Christmas ornament, not useful data. The semantic color is wasted on zeros — it should activate *when the value is nonzero*.

**The fix:** Show zeros in `dim` or `faint` color. Switch to the semantic color (accent/good/bad) only when the value is > 0. This creates a visual "pop" when relevant — "ATK: 0" is gray, then "ATK: 3" is bright pink. Much better information design.

---

### 12. Breadcrumb text `HOME` in top-left corner is wasted space

**Where:** Top-left corner of the home menu, the text "HOME".

**What's wrong:** On the root menu, showing "HOME" as a breadcrumb is redundant — the user *is* home. It wastes prime screen real estate for zero information.

**The fix:** Only show the breadcrumb when nested (`HOME / SOLO / 40 LINES`). On the root screen, either show nothing or show the username + online count (which the old HomeScreen did: `username` left, `N online` right).

---

### 13. Mini-opponent boards use single-char per cell

**Where:** Versus mode, right side — opponent boards rendered via `drawMiniBoard`.

**What's wrong:** Mini boards use `1 char per cell` (just `█` or ` `) which means the board is 10 chars wide × 20 tall. This is extremely narrow and hard to read — each mino is a single colored character. Individual piece types are indistinguishable; the board reads as a colored blob.

**The fix:** Consider `half-height` rendering for mini boards: use `▀` (upper half block) and `▄` (lower half block) to pack 2 rows per terminal line, making the board 10×10 while keeping cell width at 1. Or use 2-char-wide cells at half height (same as the main board but scaled). The board would be wider but much more legible.

---

### 14. No visual feedback on piece lock (in screenshot render)

**Where:** Game board, moment of piece placement.

**What's wrong:** The effects system (`EffectManager`) has `lockFlash`, `hardDropTrail`, and `lineClear` effects, but these are frame-duration animations that don't appear in static screenshots. In actual gameplay, verify that:
- Lock flash is visible (3 frames may be too fast at 60fps — only 50ms)
- Hard-drop trail renders correctly (the `░` char may not look good in all fonts)
- Line-clear sweep animation is smooth (the left-to-right sweep reveal)

**The fix:** Increase lock flash duration to 5-6 frames (~100ms) for better readability. Test hard-drop trail in multiple terminal emulators (iTerm2, Ghostty, Kitty, Alacritty) — `░` renders differently across fonts.

---

## Summary — Top 5 Actionable Fixes (by Visual Impact)

| # | Issue | Effort |
|---|-------|--------|
| 1 | **Mino rendering stripes** — switch to solid `██` blocks | Low (change 2 lines in `drawMino`/`drawBoard`) |
| 2 | **Board border weight mismatch** — use `┏┓┗┛` heavy corners | Low (change 4 chars in `drawBoardBorder`) |
| 3 | **Ghost piece too faint** — brighten or use `░` treatment | Low (adjust ghost palette + render chars) |
| 4 | **Menu selected state too loud** — subtle highlight not full flood | Medium (rework `drawMenuItem` logic) |
| 5 | **Merge HOLD+STATS into one panel + add timer/lines below board** | Medium (layout refactor in game.ts) |

---

*Critique by visual-critic agent. Screenshots taken at 110×34, font size 14, 2× DPR via Ghostty renderer.*
