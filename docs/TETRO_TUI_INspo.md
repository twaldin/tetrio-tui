# tetro-tui Inspiration Report

Source studied: [Strophox/tetro-tui](https://github.com/Strophox/tetro-tui) (cloned to `/tmp/tetro-tui`), a Rust/crossterm terminal Tetris with an extremely deep cosmetic system. Key source files: `src/settings/graphics_settings/*.rs` (tile symbols, TUI symbols, colorings, effects), `src/game_renderers/main_buffered.rs` (board assembly).

**Core rendering model:** every board cell is **2 terminal columns wide** (a `TileTexture = [char; 2]`). Tiles can be *dual-colored*: each tile has a primary + secondary color, and a global flag `use_primary_col_as_tile_bg_secondary_as_fg` flips whether the glyph is drawn in primary (no bg) or in secondary *on a primary-colored background* (solid fill look). This one flag is what makes the same `Γ ` glyph render as either a thin corner mark or a glossy filled bevel block.

---

## (a) Piece-rendering styles (exact characters)

Each preset defines 6 textures: `grid` (empty-cell dot), `locked` (stack), `player` (active piece), `shadow` (ghost), `hatched` (forfeit/block-out marker), `crossed` (lock-out marker). All are 2 chars wide.

| # | Preset name | Grid | Locked | Player (active) | Ghost (shadow) | Hatched | Crossed | Look |
|---|-------------|------|--------|-----------------|----------------|---------|---------|------|
| 1 | **ASCII** | ` .` | `##` | `[]` | `::` | `//` | `XX` | Classic roguelike; ghost is a dotted outline. (locked alt considered: `$$`) |
| 2 | **Blocks UTF8** | ` ⢀` | `██` | `▓▓` | `░░` | `╱╱` | `╳╳` | Solid full blocks; active slightly darker (▓) than stack (██); ghost is light-shade ░. Grid is a single braille dot in the cell corner. |
| 3 | **Shiny blocks UTF8** (Guideline look) | ` .` | `Γ ` | `Γ ` | `░░` | `╱╱` | `╳╳` | The trick: rendered with **primary color as background**, secondary (lighter) color as glyph → each mino is a solid color fill with a bright top-left corner highlight `Γ`. This is the modern "guideline/TETR.IO glossy bevel" look from only 2 chars. |
| 4 | **Braille** | ` ⢀` | `⣿⣿` | `⣏⣹` | `⠰⠆` | `⡜⡜` | `⡱⢎` | Locked = full braille cell (⣿); active = `⣏⣹` (bottom-heavy dots, reads as a rounded bevel); ghost = two sparse dot clusters. Very "dot-matrix" aesthetic. |
| 5 | **NES simulacra** (per-piece textures!) | ` .` | O,I,T=`▙▟` / S,Z,L,J=`Γ ` | same per-piece split | `()` | `//` | `XX` | Different glyphs **per tetromino**: O/I/T use chunky `▙▟` (bottom-corner blocks); S/Z/L/J use corner `Γ `. Combined with NES dual-coloring (fg+bg per piece, NES hardware palette, palette changes per level incl. "glitched" palettes 138+) to mimic NES Tetris two-tone tiles. Ghost is literally `()` parentheses. |
| 6 | **Elektronika 60** | ` .` | `▮▮` | `▮▮` | `▯▯` | `//` | `XX` | Soviet Elektronika-60 original: `▮` (black vertical rectangle) minoes, hollow `▯` ghost, monochrome amber, dot grid always on. |

Commented-out alternates found in source (ideas the author tried): `$$`, `▒▒`, `▛▜`, `🬴🬸`, `█▀`, `▛▀`, `▄▟`, `⣎⣽`, `L]`, `🭽 `, `◤ `, `⠋ `; ghost alternates `⡁⢈` `⡐⠌` `⠠⠂`; grid alternate ` ⌟`.

### Preview (next/hold) piece styles — separate mini renderers!

**Small tetromino symbols** — one row tall, string per piece [O, I, S, Z, T, L, J]:

| Preset | O | I | S | Z | T | L | J | Encoding |
|--------|---|---|---|---|---|---|---|----------|
| **Blocks UTF8** | `██` | `▄▄▄▄` | `▄█▀` | `▀█▄` | `▄█▄` | `▄▄█` | `█▄▄` | **Half-block vertical compression**: each char encodes 2 vertical halves (`▀`=top only, `▄`=bottom only, `█`=both) → a 2-row piece fits in ONE terminal row. |
| **Braille** | `⣿⣿` | `⣤⣤⣤⣤` | `⣤⣿⠛` | `⠛⣿⣤` | `⣤⣿⣤` | `⣤⣤⣿` | `⣿⣤⣤` | Braille dots (`⣤`=bottom row dots, `⠛`, `⣿`) at 2×4 dot resolution per char. |
| **Dots ASCII** | `::` | `....` | `.:'` | `':.` | `.:.` | `..:` | `:..` | Quarter-height encoding with `' '` `.` `'` `:` (dot low/high). |

**Mini tetromino symbols** — a single char per whole piece [O, I, S, Z, T, L, J], for ultra-long queues:

| Preset | Chars |
|--------|-------|
| **Letters** | `O I S Z T L J` |
| **Braille** | `⠶ ⡇ ⠳ ⠞ ⠗ ⠧ ⠼` (each braille char is a 2×4 pixel thumbnail of the piece shape!) |

A `normalsize_preview_limit` setting controls how many queue entries render full-size before falling back to small/mini symbols.

### Effect animation glyph sets (double-width tiles)

| Effect | Presets | Frame sequences |
|--------|---------|-----------------|
| **Hard drop** | Particle trail ASCII | `@@` `$$` `%%` `**` `++` `~~` `..` (decaying, 150ms, faster decay toward top via `y_decay`) |
| | Streak trail/beam ASCII | `||` `¦¦` `::` `..` |
| | Colored/White beam UTF8 | `▒▒` `░░` (75ms; white variant force-recolors) |
| | Braille helix | `⢆⠱` alternating white/piece color |
| **Lock** | Flash white | recolor only, 125ms |
| | Transforming ASCII | `[]`→`()`→`{}`→`<>`→`==` (175ms) |
| | Pulsing block UTF8 | `██`→`▓▓`→`▒▒`→`░░`→`▒▒`→`▓▓` all white (150ms) |
| | Spiraling Braille | `⢀⠁`→`⢈⡁`→`⢊⡡`→`⢎⡱`→`⢮⡳`→`⢾⡷` (200ms) |
| **Line clear: inline wipes** | Left-to-right / Outward / White inward / Burn outward | per-column delayed disappearance; Burn recolors white→yellow→orange→red sweeping outward |
| **Line clear: particles** | Pop, Confetti, Stardust, Blast, Sparks | real particle physics: `pos = origin + momentum·t + accel·t²/2` with random + x-position-dependent momentum; Sparks Braille decays glyph `⢾⡷`→`⡱⢎`→`⡡⢊`→`⡁⢈`→`⡀⠈`; Sparks ASCII decays `@@`→`$$`→`##`→`%%`→`**`→`++`→`~~`→`..` |

### Auxiliary symbol sets

| Purpose | Unicode | ASCII | Braille |
|---------|---------|-------|---------|
| Menu selection pointers | `▶` `◀` | `>>` `<<` | `⠕⠕` `⠪⠪` |
| Lock-delay countdown (fills up) | `⠈⠘⠸⢸⣸⣼⣾⣿` (braille fill!) | digits `1`–`9` | same as unicode |
| Replay progress bar | ` ▏▎▍▌▋▊█` (eighth-block fill) | ` .:!` + `\|` | ` ⡀⡄⡆⡇⡏⡟⡿` + `⣿` |
| Action/button glyphs | `←→↺↻↔↓↨⇓⇐⇒⇋` (L,R,rotCCW,rotCW,180,softdrop,harddrop,sonic,…) | `<>LR@v!w{}H` | same as unicode |

---

## (b) Border / frame styles (exact box-drawing characters)

Frame glyph layout (from `main_buffered.rs`):
- **boardframe** = `[top-left, top, top-right, right, bottom-right, bottom, bottom-left, left]`
- **holdframe** = `[top/bottom edge, top-left corner, left edge, bottom-left corner]` — the hold box is **open on the right**, visually flowing into the board's top-left; the label `hold` is written *into* the top border.
- **nextframe** = `[top/bottom edge, top-right, right, join-left (┤ separator end), bottom-right, join-down (┬), label top-border char]` — queue entries separated by dashed lines ending in `┤`; label `next` embedded in top border.
- Optional **boardframe2** = `[outer-left, outer-bottom-a, outer-bottom-b, outer-right]` second frame around the board.

| # | Preset | Board frame (tl,t,tr,r,br,b,bl,l) | Hold | Next | Heading line | Visual |
|---|--------|-----------------------------------|------|------|--------------|--------|
| 1 | **ASCII** | `+` `-` `+` `\|` `#` `=` `#` `\|` | `-+\|+` | `-+\|+++-` | `-` | `+----next----+` top, `\|` sides, bottom `#====#`. Heavier bottom (`#=`)= "floor". |
| 2 | **Frame UTF8** (default) | `╓` `╴` `╖` `║` `╜` `▀` `╙` `║` | `─┌│└` | `─┐│┤┘┬╴` | `─` | **Mixed single/double**: double-line vertical sides `║`, *dashed* top edge `╴╴╴`, and the bottom edge is **`▀▀▀▀` (upper-half-blocks)** — the board floor looks like a solid bar. Corners `╓╖╙╜` (double-V/single-H junctions). |
| 3 | **Rounded frame UTF8** | same board as #2 | `─╭│╰` | `─╮│┤╯┬╴` | `─` | Only hold/next get rounded corners `╭╮╰╯`; board keeps `║`/`▀`. |
| 4 | **No frame UTF8** | 8 spaces | spaces | spaces | ` ` | Fully borderless "floating" board (zen). |
| 5 | **No hold/next-frame UTF8** | same board as #2 | spaces | spaces | `─` | Board framed, widgets frameless — clean middle ground. |
| 6 | **Braille** | `⡖` `⠂` `⢲` `⢸` `⠚` `⠒` `⠓` `⡇` | `⠒⡖⡇⠓` | `⠒⢲⢸⢺⠚⢲⠂` | `⠒` | Entire frame from braille dots: sides `⢸`/`⡇`, dashed top `⠂`, corners `⡖⢲⠓⠚`. Matches braille tile set. |
| 7 | **Elektronika 60** | ` ` ` ` ` ` `!` `!` `=` `!` ` ` | none | none | `=` | Open top; `!` … `!` sides (read as `<!` and `!>` with boardframe2); bottom `!==...==!`. **boardframe2** = `<` `\` `/` `>` → outer chevrons `<`/`>` at sides and a `\/\/\/\/\/` zigzag "stand" row under the board. Pure retro. |

Layout diagram from the source (shows how pieces slot together):

```text
        ┌─hold─╓╶╶╶╶╶╶╶╶╶╶╴╴╴╴╴╴╴╴╴╴╖────next────┐
        │ ▄▄█  ║                    ║      ██    │
        └──────║                    ║  ██████    │
               ║                    ║╴╴╴╴╴╴╴╴╴╴╴╴┤   <- dashed queue separators
  Time: 0m56s  ║                    ║    ██      │
  Lines: 0     ║                    ║  ██████    │
               ║                    ║╴╴╴╴╴╴╴╴┬───┘
               ║                    ║  ▄█▀   │      <- half-block previews
               ╙▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀╜  (←↓→↺↔↻⇐⇓⇒⤓⇋)
                     Stage 24                          <- mode/event text under board
                +9, Mono J-spin x2
```

HUD headings use the heading-line char around titles: `───basic keybinds───` / `==basic keybinds==`.

---

## (c) Features/cosmetics worth adding to tetrio-tui, ranked by impact/effort

tetrio-tui currently has: 4 piece styles (bevel/flat/outline/gradient), rounded-corner boxes only, 8 themes, an effect manager (shake/flash/popup). Ranked suggestions:

1. **Half-block preview compression** (HIGH impact / LOW effort) — render next/hold previews one terminal row tall using `▀`/`▄`/`█` (`I`=`▄▄▄▄`, `S`=`▄█▀`, `T`=`▄█▄`…). Halves queue height; great for long TETR.IO-style queues. Add as a new `pieceStyles.ts` entry — the drawMino signature already supports 2-wide cells.
2. **Border-style presets + embedded labels + queue separators** (HIGH / LOW) — abstract the box glyphs into a preset table: ASCII (`+-|`), single (`┌─┐│`), rounded (`╭─╮│`), heavy/double mix (tetro-tui's signature: `║` sides, dashed `╴` top, `▀` half-block floor, `╓╖╙╜` corners), borderless. Add label-in-border (`───next───┐`) and dashed separators between queue pieces ending in `┤`. The `▀`-floor trick alone makes the board look materially more "grounded".
3. **"Shiny/guideline" piece style via fg/bg inversion** (HIGH / LOW) — one flag: draw the mino glyph in a *lighter secondary* color on the *primary* color background with glyph `Γ ` (or tetrio-tui's existing bevel glyph). Gives the glossy modern look with zero new glyph work, and pairs naturally with per-piece primary/secondary palette pairs.
4. **Braille as a rendering primitive** (MEDIUM-HIGH / MEDIUM) — (i) braille mini-pieces: one char per piece for huge queues (`⠶⡇⠳⠞⠗⠧⠼`); (ii) braille lock-delay meter that fills `⠈⠘⠸⢸⣸⣼⣾⣿` next to the active piece — a genuinely useful gameplay HUD element tetrio-tui lacks; (iii) optional braille tile set (`⣿⣿`/`⣏⣹`/`⠰⠆`) and braille spark/helix effects.
5. **Game-state tile textures: crossed/hatched/spawn indicator** (MEDIUM / LOW) — distinct textures for lock-out (`╳╳`/`XX`), block-out/forfeit (`╱╱`), and a "spawn shadow" showing where the next piece enters (toggle `show_spawn`). Cheap, improves game-over clarity.
6. **Decay-glyph particle effects** (MEDIUM / LOW-MEDIUM) — tetrio-tui has particles; adopt tetro-tui's *glyph-decay* idiom: hard-drop trails that step through `@@→$$→%%→**→++→~~→..` or `||→¦¦→::→..` with a `y_decay` factor (top of trail fades faster); lock pulse `██→▓▓→▒▒→░░→▒▒→▓▓`; line-clear "burn" recolor sweep white→yellow→orange→red moving outward from the clear center.
7. **Eighth-block progress bars** (LOW-MEDIUM / LOW) — ` ▏▎▍▌▋▊█` sub-cell fill for replay seek, finesse/rating meters, or app-transmission bars. One helper function.
8. **Monochrome & accessibility themes** (MEDIUM / LOW) — `Terminal Default` (all `Color::Reset`), `Just amber` (#ff9400 on #251200), `Just white/black` — plus a global monochrome flag mapping every texture set sensibly (Elektronika preset shows the coherent end state: `▮▮`+`▯▯`+dot grid+`!==`frame+`\/\/` stand).
9. **Per-level palette cycling** (LOW / MEDIUM) — NES-style: tile palette rotates per level (10 base palettes, then "glitched" ones at 138+). Fun for marathon progression; needs per-level palette lookup only.
10. **Grid dot toggle** (LOW / LOW) — optional empty-cell texture ` .` or ` ⢀` (single corner dot). Helps finesse/placement practice; one conditional in board draw.

Big-picture takeaways: the **2-char-wide tile + dual-color (fg/bg invertible) model** and the **uniform "symbol preset" table** (every cosmetic dimension — tiles, frames, previews, effects, pointers — is a preset slot with ASCII/UTF8/Braille/retro variants) are the two architectural ideas worth stealing; they let users mix-and-match a coherent theme (their `GraphicsSettings` presets: Default/Guideline/Minimal/Braille/Elektronika/NES/Compatibility).
