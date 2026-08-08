# TETR.IO Visual Effects Specification for Terminal Translation

> **Source footage**: Three TETR.IO gameplay videos downloaded from YouTube and analyzed at 10fps (1563 total frames).
>
> | Video | Title | URL | Duration | Frames |
> |-------|-------|-----|----------|--------|
> | League match | "only in tetrio 💀💀💀" | https://www.youtube.com/watch?v=yyQSGZnOKs0 | 110s | 1106 |
> | Sprint WR | "TETRIS 40 LINES in 13.43 seconds by WestL" | https://www.youtube.com/watch?v=DXSJ6wMrRQk | 22s | 222 |
> | TL replay | "[TETR.IO] call an ambulance" | https://www.youtube.com/watch?v=z3ZHCvi5cdc | 23s | 235 |
>
> Frame references use the format `league_NNNN`, `sprint_NNNN`, `gameplay_NNNN`.

---

## 1. Board & Piece Rendering

### 1.1 Board Grid
**Observed** (league_0010, gameplay_0050): The 10×20 playfield has a subtle dark grid overlay — thin lines between cells, slightly lighter than the black background (~#1a1a2e). The board has a white/light outer border (1-2px). Above the visible playfield there are 2-3 extra rows for piece spawning (partially visible).

**Terminal translation**:
- Board area: 10 columns × 20 rows. Each cell = 2 chars wide (`██`) for square aspect ratio.
- Grid: Use dim gray (`\x1b[90m`) dots or thin box-drawing chars between empty cells (`·` or `┊`).
- Border: Bright white box-drawing characters (`┌─┐│└─┘`). Use `\x1b[1;37m` (bold white).

### 1.2 Piece Colors (Guideline Standard)
**Observed** (gameplay_0050, league_0050, sprint_0050):

| Piece | Color | Hex (approx) | ANSI 256 |
|-------|-------|-------------|----------|
| I | Cyan | #00f0f0 | `\x1b[38;5;51m` (bright cyan) |
| O | Yellow | #f0f000 | `\x1b[38;5;226m` (bright yellow) |
| T | Purple | #a000f0 | `\x1b[38;5;129m` (purple) |
| S | Green | #00f000 | `\x1b[38;5;46m` (bright green) |
| Z | Red | #f00000 | `\x1b[38;5;196m` (bright red) |
| J | Blue | #0000f0 | `\x1b[38;5;21m` (blue) |
| L | Orange | #f0a000 | `\x1b[38;5;208m` (orange) |

### 1.3 Block Rendering / Bevel Effect
**Observed** (league_0050, gameplay_0050): Each block has a 3D bevel appearance:
- **Top-left highlight**: Lighter shade of the piece color
- **Bottom-right shadow**: Darker shade
- **Center face**: Main piece color
- **Small inner detail**: A tiny cross/plus mark ('+') at the center of each cell visible in some skins

**Terminal translation**:
- Primary: `██` in the piece's color (full-block chars `\u2588\u2588`)
- Enhanced option: Use half-block characters for bevel. Top row: `▓█` (brighter left), Bottom: `█▒` (dimmer right). Or use the simpler approach: `▓▓` for ghost, `██` for locked.
- The inner '+' mark can be rendered as `┼┼` in a slightly dimmer shade if the terminal supports it.

### 1.4 Ghost Piece
**Observed** (league_0050, league_0080): The ghost piece appears at the bottom of the drop path as a dim, outlined version of the active piece — same shape, much lower opacity/brightness.

**Terminal translation**:
- Use dim version of the piece color: `\x1b[2m` (dim attribute) + piece color
- Or use outline characters: `▒▒` or `░░` in piece color
- Alternatively: `[]` in dim piece color

### 1.5 Hold Box
**Observed** (league_0010, gameplay_0050): Located to the LEFT of the board. Labeled "HOLD" at top in white. Shows one piece in miniature. When hold is used (piece swapped), the held piece appears slightly dimmed.

**Terminal translation**:
- Box: `┌HOLD──┐` / `│      │` / `└──────┘` — 6 chars wide inner
- Piece rendered in miniature (2 cells wide per block)
- When hold just used: dim the piece color for 1 second

### 1.6 Next Queue
**Observed** (league_0010, sprint_0050): Located to the RIGHT of the board. Labeled "NEXT" at top. Shows 5 upcoming pieces vertically stacked, each in a small box/space.

**Terminal translation**:
- `┌NEXT──┐` header
- 5 pieces stacked vertically, each taking ~3 rows (piece + gap)
- Each piece rendered in its color using `██` blocks

---

## 2. Line Clear Animation

### 2.1 Standard Line Clear (Single/Double/Triple)
**Observed** (league_0055-0057, league_0070, sprint_0150):

**Frame-by-frame sequence** (at 60fps in-game, ~6 frames per 10fps capture):
1. **Frame 0 (lock)**: Piece locks into place with a brief white flash on the locked cells
2. **Frame 1-2 (flash)**: The completed row(s) flash bright WHITE — all cells in the cleared row turn white/bright for ~100ms (1-2 frames at 10fps, ~6 frames at 60fps)
3. **Frame 2-3 (dissolve)**: The white row begins dissolving — cells shrink/fade from center outward (or left-to-right), with colored particle fragments flying outward
4. **Frame 3-4 (collapse)**: Rows above drop down to fill the gap. Small colored triangle particles scatter in all directions
5. **Frame 5+ (settle)**: Board settled, particles fade

**Particle details** (league_0054-0056): Small colored triangles (3-5 pixels) scatter from cleared rows. Colors match the blocks that were in the cleared row. 4-8 particles per cleared row, flying outward with gravity.

**Terminal translation**:
```
Frame 0: Normal piece placement
Frame 1: Cleared row → `████████████████████` in bright white (\x1b[1;97m)
Frame 2: Cleared row → `▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓` fading white
Frame 3: Cleared row → `░░░░░░░░░░░░░░░░░░░░` dim
Frame 4: Row gone, pieces above drop. Optional: 2-3 particle chars (`·`, `*`, `✦`) in random positions nearby for 2 frames
```
- Duration: 4-6 terminal frames (~200-400ms total at ~15fps TUI refresh)
- Particles: Randomly place 2-4 `✦` or `·` characters in dim piece colors near the cleared area, remove after 2 frames

### 2.2 Quad (Tetris) Line Clear
**Observed** (league_0060, league_0090): Same as above but more dramatic:
- Brighter/longer flash (extends 1 extra frame)
- More particles (8-12 per clear)
- Horizontal energy beam effect (a bright streak traveling across the cleared rows)

**Terminal translation**:
- Use the same 4-frame flash sequence but extend frame 1-2 by one frame
- Add a bright horizontal line that sweeps across: `═══════════════════` in bright yellow, left-to-right over 2 frames
- More scattered particles (`✦`, `✧`, `·`)

---

## 3. Action Text Display

### 3.1 Clear Type Label
**Observed** (league_0060, league_0100, gameplay_0100):

Action text appears to the LEFT of the board, stacked vertically:
```
  T-SPIN       ← smaller, above (when applicable)
  DOUBLE       ← LARGE, bold, white text (the clear type)
  B2B x4       ← smaller, orange/gold text
  2 COMBO      ← number + "COMBO", below
```

**Text hierarchy**:
- **Clear type prefix**: `T-SPIN` or `MINI T-SPIN` in smaller orange/yellow text above the main label
- **Clear type**: `SINGLE`, `DOUBLE`, `TRIPLE`, `QUAD` — LARGE bold white text
- **B2B counter**: `B2B x1`, `B2B x2`, etc. — orange/gold, smaller, below
- **Combo counter**: Number + `COMBO` — white, below B2B

**Timing**: Text appears instantly on line clear, persists for ~1.5-2 seconds (15-20 frames at 10fps), then fades out. New clears replace the text immediately.

**Terminal translation**:
```
Position: To the left of the board (cols 0-12 before the board starts)
Row 1: "T-SPIN" in yellow (\x1b[33m) — only if T-spin
Row 2: "QUAD" in bold bright white (\x1b[1;97m) — large
Row 3: "B2B x5" in yellow (\x1b[33m) — if B2B active
Row 4: "3 COMBO" in white (\x1b[37m) — if combo active
```
- Fade: After 1.5s, switch to dim (`\x1b[2m`), then remove after 0.5s more

### 3.2 Center Action Text (Opponent's View)
**Observed** (league_0060, league_0080, gameplay_0150): In versus mode, the action text for the BETWEEN area (between the two boards) is displayed in LARGE bold text:
```
    T-SPIN
    DOUBLE
    B2B x1
    1 COMBO
```
This appears between the two boards, centered. Same hierarchy as above.

---

## 4. ALL CLEAR Effect

### 4.1 Animation Sequence
**Observed** (league_0054-0070):

The ALL CLEAR is the most dramatic visual effect in TETR.IO:

1. **Frame 0-1** (league_0054): Text "ALL CLEAR" flies in from bottom-left, initially rotated/tilted at ~30°, red/orange tinted
2. **Frame 2-3** (league_0055): Text stabilizes to center of board, fully upright, large bold yellow/orange glowing text with dark outline
3. **Frame 3-20+** (league_0055-0080): Text persists at center of board for ~2-3 seconds, with a gentle glow pulsation (brightness oscillates slightly)
4. **Frame 20-30** (league_0080-0095): Text slowly fades, becoming more transparent/dim, still visible as ghost text behind gameplay
5. **Frame 30+**: Text fully gone

**Text style**: "ALL CLEAR" in two lines:
```
ALL
CLEAR
```
Large, bold, yellow (#FFD700) with orange glow, dark outline/shadow for readability over the board.

**Terminal translation**:
```
┌──────────────────┐
│                  │
│    ALL           │  ← Bold bright yellow (\x1b[1;33m), large
│    CLEAR         │  ← Same style
│                  │
└──────────────────┘
```
- Frame 1: Flash in bright white first (`\x1b[1;97m`)
- Frame 2+: Switch to bright yellow (`\x1b[1;33m`)
- Frame 15+: Switch to dim yellow (`\x1b[2;33m`)
- Frame 20+: Remove
- Overlay on top of the board content (pieces still visible around/through the text)
- Duration: ~2 seconds at TUI refresh rate

---

## 5. Attack & Spike Display

### 5.1 Attack Counter
**Observed** (league_0060, league_0090, league_0140): A large number appears BELOW the player's username/board, showing the total attack lines sent. Initially appears when first attack happens, then updates.

- Position: Centered below the board/username
- Style: Large bold number, yellow/gold color with slight glow
- The number animates: old number → new number with a brief scale-up pulse

**Terminal translation**:
- Position: 1-2 rows below the board, centered
- Large number in bold yellow: `\x1b[1;33m14\x1b[0m`
- On update: flash bright white for 1 frame, then return to yellow
- Could use figlet-style large digits for dramatic effect:
  ```
  ██ ██   ← large "14" using block chars
  ```

### 5.2 Spike Counter (Board Center)
**Observed** (league_0080, league_0095, gameplay_0100): A large number appears in the CENTER of the board briefly, showing how many lines were just sent in a single action/combo. This is BLUE colored and fades quickly.

- Style: Large blue/cyan number, semi-transparent over the board
- Timing: Appears for ~0.5-1 second, fades
- Example: "5" or "6" or "17"

**Terminal translation**:
- Render a large number in bright cyan (`\x1b[1;36m`) centered on the board
- Use 3×3 block-digit font for single digits, 3×5 for double digits
- Overlay for 4-6 frames then remove

---

## 6. Garbage / Incoming Attack System

### 6.1 Garbage Meter (Red Bar)
**Observed** (gameplay_0200, gameplay_0210, league_1000): A vertical red/orange bar appears on the LEFT edge of the board, indicating pending garbage lines. The bar grows from bottom to top, with each segment representing one garbage line.

- Position: 1-column wide, on the left edge of the board (inside the border)
- Color: Red (#FF0000) to orange (#FF4400) gradient, brighter when more garbage pending
- Each unit = 1 row height

**Terminal translation**:
- Use the leftmost column inside the board border
- Render `▐` or `█` characters in red (`\x1b[91m`) for each pending garbage line
- Stack from bottom to top
- Flash/pulse when garbage is about to drop

### 6.2 Garbage X Markers
**Observed** (league_0090, league_0100, league_1000): Red `X` characters appear ABOVE the opponent's board when sending garbage. These show how many garbage lines are queued:
```
  XX
  XX
```
or
```
  X
  XXX
```
Arranged in a cluster above the board top.

**Terminal translation**:
- Position: 1-2 rows above the board top, centered
- Bright red (`\x1b[1;91m`) `X` characters
- Quantity matches lines being sent
- Appear on send, persist briefly (~1 second), then fade

### 6.3 Garbage Blocks (In Board)
**Observed** (league_0220, gameplay_0150, gameplay_0200): Garbage lines appear as uniform-colored blocks (gray/darker shade) with a single-column gap. All blocks in a garbage row are the same gray color, distinguishable from normal colored pieces.

**Terminal translation**:
- Use dark gray (`\x1b[90m`) `██` for garbage blocks
- Each garbage row has one random gap (empty cell)
- Slightly different shade from the empty board grid

---

## 7. Danger State

### 7.1 Board Border Color Change
**Observed** (league_0090, league_0100, gameplay_0100, league_1000): When the stack is dangerously high (above row 15-16) or large garbage is incoming, the board border changes from white to RED/ORANGE.

- **Normal**: White border (`\x1b[1;37m`)
- **Warning**: Orange border (`\x1b[38;5;208m`) — stack at ~75% height
- **Danger**: Red border (`\x1b[1;91m`) — stack at ~85%+ or massive garbage incoming
- The border color transitions smoothly (animated)

**Terminal translation**:
- Swap border box-drawing chars color based on stack height:
  - Height < 15: white
  - Height 15-17: yellow (`\x1b[33m`)
  - Height 18+: red (`\x1b[91m`)
- When incoming garbage > 8: red border regardless of height

### 7.2 Caution Sign (⚠)
**Observed** (league_0090, league_0100, league_0140, gameplay_0220): A yellow diamond-shaped warning sign with `!` appears centered on the board when the player is in danger (stack very high + garbage incoming).

**Terminal translation**:
- Render `⚠` or `[!]` in bright yellow (`\x1b[1;33m`) centered on the board
- Flash on/off every 500ms
- Show when: stack height > 17 AND garbage pending > 4

### 7.3 Fire / Corner Glow Effects
**Observed** (league_0100, league_1000): In extreme danger, animated fire/glow effects appear at the 4 corners of the board border. These are orange/yellow flame-like particle effects.

**Terminal translation**:
- At the 4 corners of the board border, cycle through fire characters:
  ```
  Frame 1: 🔥 or ╳
  Frame 2: ✦
  Frame 3: ·
  ```
- Use orange/red colors (`\x1b[38;5;208m`, `\x1b[91m`)
- Cycle at ~4fps (every 250ms)
- Only in extreme danger (stack > 18 or garbage > 12)

---

## 8. Hard Drop Effect

### 8.1 Hard Drop Trail
**Observed** (league_0080, sprint_0150): When a piece is hard-dropped, a vertical trail/streak appears from the piece's original position to its final position. The trail is the piece's color, semi-transparent, and fades quickly.

**Terminal translation**:
- When hard drop occurs, draw `│` or `║` characters in the piece's color (dim) from the piece's original row to its final row, in each occupied column
- Duration: 2-3 frames then remove
- Color: Piece color with dim attribute (`\x1b[2m`)
- Alternative: Use `░` characters for the trail

### 8.2 Lock Flash
**Observed** (league_0050, sprint_0050): When a piece locks, the cells briefly flash bright white before settling to the piece's normal color.

**Terminal translation**:
- On lock: render the piece cells as bright white (`\x1b[1;97m██`) for 1 frame
- Next frame: return to normal piece color
- Duration: 1 frame (~66ms)

### 8.3 Lock Sparkles
**Observed** (sprint_0100): Small 4-pointed star/sparkle shapes (`✦`, `✧`) appear at the piece's landing position on lock, typically at the corners of the piece.

**Terminal translation**:
- On lock: place 2-4 `✦` characters in white (`\x1b[1;97m`) adjacent to the locked piece
- Duration: 2 frames then remove
- Position: randomly in cells adjacent to the piece

---

## 9. Combo System Display

### 9.1 Combo Counter
**Observed** (league_0080, league_0090, gameplay_0150): The combo counter appears as part of the action text stack on the left side of the board:
```
DOUBLE
2 COMBO
```

**Format**: `{number} COMBO` where the number is the current combo count (1-indexed: first consecutive clear = "1 COMBO").

**Scaling effect**: As combo gets higher, the text gets larger/more prominent. At combo 5+, the font appears bigger. At combo 10+, very dramatic.

**Terminal translation**:
- Show `N COMBO` below the clear type text
- Combo 1-4: normal size white text
- Combo 5-9: bold white text (`\x1b[1;97m`)
- Combo 10+: bold + blinking or extra-bright, consider large digit rendering
- Color: white, transitions to yellow at high combos

---

## 10. B2B (Back-to-Back) System

### 10.1 B2B Counter Display
**Observed** (league_0070, league_0100, league_0240): B2B counter appears as `B2B x{N}` below the clear type:
```
T-SPIN
QUAD
B2B x9
```

**Style**: Orange/gold text, smaller than the clear type. The `x{N}` portion uses a different shade.

**B2B definition**: Consecutive "difficult" clears (T-spins, Quads/Tetrises, All Clears) without any "easy" clears (Singles, Doubles, Triples without T-spin) in between.

**Terminal translation**:
- Text: `B2B x{N}` in yellow/orange (`\x1b[33m`)
- Position: Below clear type text, left of board
- `BACK-TO-BACK` (full text) used in sprint/solo mode (sprint_0100)
- `B2B` (abbreviation) used in versus mode

---

## 11. Screen Shake

### 11.1 Shake Behavior
**Observed** (gameplay_0150): The entire board visibly shifts/tilts during large attacks. Both boards can shake simultaneously. The shake is rotational (slight tilt) and translational (slight horizontal/vertical displacement).

**Triggers and intensity**:
- **Single/Double**: No shake
- **Triple**: Slight shake (~1px displacement, 2-3 frames)
- **Quad (Tetris)**: Medium shake (~3px, 4-5 frames)
- **T-Spin Double/Triple**: Medium shake
- **All Clear**: Large shake (~5px, 6-8 frames)
- **Large spike (10+ lines)**: Very large shake
- **Receiving garbage**: The RECEIVING player's board shakes

**Decay**: Shake intensity decays exponentially over 4-8 frames.

**Terminal translation**:
Since terminal cells can't sub-pixel shift, simulate with:
- **Offset rendering**: Shift the entire board left/right by 1-2 columns for 2-3 frames
- **Pattern**: Frame 1: shift right 1, Frame 2: shift left 1, Frame 3: normal (rapid oscillation)
- **Vertical**: Shift board up/down by 1 row for 1 frame
- **Alternative**: Flash the board border in a contrasting color for 2 frames
- Recommendation: For terminal, prefer border flash + brief color inversion over physical displacement to avoid rendering artifacts

---

## 12. Countdown & Game Start

### 12.1 Pre-Game Countdown
**Observed** (league_0010, league_0030):

Countdown sequence displayed in the CENTER of the board:
1. `3` — Large gold/yellow number, appears for ~1 second
2. `2` — Same style (not captured in our frames, between 0010-0030)
3. `1` — Same style (league_0030)
4. `GO!` — Flash, then gameplay begins

**Style**: Large serif-style number in gold/amber color, with slight transparency over the empty board. The number fades in and out.

**Terminal translation**:
```
Countdown digits using 3×5 block font:
 ███
   █     ← "3" in bold yellow (\x1b[1;33m)
 ███
   █
 ███

Duration: 1 second per digit
Transition: Brief blank (100ms) between digits
```
- Position: Center of the 10×20 board
- After "1": Flash "GO!" in bright green for 0.5s

---

## 13. Game End / KO

### 13.1 Top-Out / KO
**Observed** (gameplay_0220-0230): When a player tops out (board fills beyond row 20):
- The board freezes
- A brief flash/darken effect
- Transition to results screen

### 13.2 Results Screen (Versus)
**Observed** (gameplay_0230-0235): Match results show:
- Player names with scores: `DOREMY 4 VS CABOOZLED_PIE 7`
- Per-round stats in horizontal bars:
  - Left player: blue bars
  - Right player: red/orange bars
  - Stats shown: PPS, APM, VS Score
  - Round duration in center

### 13.3 Results Screen (Sprint)
**Observed** (sprint_0180-0200): Sprint completion shows:
- `FINAL TIME` header
- Large time display: `0:13.430`
- `STATS` section with:
  - PIECES PLACED, PIECES PER SECOND, KEYS PRESSED, KEYS PER PIECE, KEYS PER SECOND, HOLDS, SCORE, TIME, LINES, LINES PER MINUTE, T-SPINS, MAXIMUM COMBO, MAXIMUM BACK-TO-BACK CHAIN, ALL CLEARS, FINESSE %, FINESSE FAULTS
- `HANDLING` section: ARR, DAS, SDF values

**Terminal translation**:
- Clear the board area, render results in a bordered box
- Use aligned columns: stat name left, value right
- Header in bold, values in normal
- Use dim separators between stat rows

---

## 14. HUD / Stats Display

### 14.1 Stats Panel (Left Side)
**Observed** (league_0050, gameplay_0050):

Versus mode stats appear below-left of the board:
```
   PIECES
 44, 4.60/S      ← piece count, pieces per second
     ATTACK
 43, 269.69/M    ← attack lines, attack per minute
       TIME
 0:09.567         ← elapsed time
```

Sprint mode stats:
```
    INPUTS
 270, 3.03/P     ← input count, inputs per piece
     PIECES
  89, 7.45/S     ← pieces, pieces per second
      LINES
   32/40          ← lines cleared / target
       TIME
 0:11.950         ← elapsed time
```

**Terminal translation**:
- Right-align labels, left-align values
- Use dim white for labels, bright white for values
- Update in real-time

### 14.2 VS Score
**Observed** (league_0050, gameplay_0050): Between the two boards in versus mode, a "VS SCORE" metric is displayed for each player.

```
VS SCORE
 545.45
```

---

## 15. Piece Colors — Full Terminal Palette

### Recommended 256-color ANSI palette for pieces:

```
I-piece (Cyan):
  Normal:  \x1b[38;5;51m██\x1b[0m     (bright cyan)
  Light:   \x1b[38;5;123m▓▓\x1b[0m    (light cyan, for bevel highlight)
  Dark:    \x1b[38;5;37m▒▒\x1b[0m     (dark cyan, for shadow)
  Ghost:   \x1b[2;38;5;51m░░\x1b[0m   (dim cyan)

O-piece (Yellow):
  Normal:  \x1b[38;5;226m██\x1b[0m
  Light:   \x1b[38;5;228m▓▓\x1b[0m
  Dark:    \x1b[38;5;178m▒▒\x1b[0m
  Ghost:   \x1b[2;38;5;226m░░\x1b[0m

T-piece (Purple):
  Normal:  \x1b[38;5;129m██\x1b[0m
  Light:   \x1b[38;5;171m▓▓\x1b[0m
  Dark:    \x1b[38;5;91m▒▒\x1b[0m
  Ghost:   \x1b[2;38;5;129m░░\x1b[0m

S-piece (Green):
  Normal:  \x1b[38;5;46m██\x1b[0m
  Light:   \x1b[38;5;118m▓▓\x1b[0m
  Dark:    \x1b[38;5;34m▒▒\x1b[0m
  Ghost:   \x1b[2;38;5;46m░░\x1b[0m

Z-piece (Red):
  Normal:  \x1b[38;5;196m██\x1b[0m
  Light:   \x1b[38;5;203m▓▓\x1b[0m
  Dark:    \x1b[38;5;124m▒▒\x1b[0m
  Ghost:   \x1b[2;38;5;196m░░\x1b[0m

J-piece (Blue):
  Normal:  \x1b[38;5;21m██\x1b[0m
  Light:   \x1b[38;5;63m▓▓\x1b[0m
  Dark:    \x1b[38;5;19m▒▒\x1b[0m
  Ghost:   \x1b[2;38;5;21m░░\x1b[0m

L-piece (Orange):
  Normal:  \x1b[38;5;208m██\x1b[0m
  Light:   \x1b[38;5;214m▓▓\x1b[0m
  Dark:    \x1b[38;5;166m▒▒\x1b[0m
  Ghost:   \x1b[2;38;5;208m░░\x1b[0m

Garbage (Gray):
  Normal:  \x1b[38;5;242m██\x1b[0m    (dark gray)
```

---

## 16. Effect Priority & Layering

When multiple effects overlap, TETR.IO uses this z-order (back to front):

1. **Board grid** (background)
2. **Locked pieces** (normal blocks)
3. **Ghost piece** (semi-transparent)
4. **Active/falling piece** (full color)
5. **Line clear flash** (white overlay on cleared rows)
6. **Hard drop trail** (semi-transparent column)
7. **Particles** (scattered fragments)
8. **Lock sparkles** (white stars)
9. **Garbage meter** (red bar, left edge)
10. **Danger caution sign** (⚠, center)
11. **ALL CLEAR text** (large, center)
12. **Spike counter** (large number, center)
13. **Combo counter** (board center area)
14. **Action text** (QUAD, T-SPIN, etc., left side)
15. **Board border** (color changes for danger)
16. **Corner fire effects** (danger corners)
17. **Garbage X markers** (above board)
18. **Attack counter** (below board)

**Terminal translation**: Render in this order. Later items overwrite earlier items at the same cell position. Use a layered buffer: base layer (board), overlay layer (effects), text layer (labels).

---

## 17. Timing Reference Table

| Effect | Duration (real) | Duration (TUI frames @15fps) | Notes |
|--------|----------------|------------------------------|-------|
| Lock flash | ~67ms (4 game frames) | 1 frame | White flash on lock |
| Lock sparkles | ~133ms (8 frames) | 2 frames | ✦ near locked piece |
| Line clear flash | ~167ms (10 frames) | 2-3 frames | White → fade rows |
| Line clear collapse | ~100ms (6 frames) | 1-2 frames | Rows drop down |
| Hard drop trail | ~200ms (12 frames) | 3 frames | Dim colored trail |
| Particles | ~500ms (30 frames) | 7-8 frames | Scatter & fade |
| Action text | ~2000ms (120 frames) | 30 frames | QUAD, T-SPIN, etc. |
| ALL CLEAR text | ~3000ms (180 frames) | 45 frames | Fade in → persist → fade out |
| B2B/Combo text | ~2000ms (120 frames) | 30 frames | Below action text |
| Spike counter | ~1000ms (60 frames) | 15 frames | Large number on board |
| Attack counter | Persistent | Always shown | Updates on attack |
| Danger border | Persistent while danger | While stack > 15 | Red/orange border |
| Caution sign | Persistent + flash | 500ms on/off cycle | ⚠ flashing |
| Corner fire | Persistent + animate | 250ms cycle | During extreme danger |
| Screen shake | ~300-500ms | 4-7 frames | Oscillating offset |
| Countdown digit | ~1000ms each | 15 frames each | 3, 2, 1, GO |
| Garbage X marks | ~1000ms | 15 frames | Above opponent board |

---

## 18. Unicode Glyph Reference for Terminal

```
Block characters:
  ██  Full block (U+2588) — primary piece rendering
  ▓▓  Dark shade (U+2593) — bevel highlight / ghost
  ▒▒  Medium shade (U+2592) — bevel shadow
  ░░  Light shade (U+2591) — ghost piece / fading
  []  Square brackets — alternative ghost piece

Box drawing:
  ┌─┐  Top border
  │ │  Side borders
  └─┘  Bottom border
  ═══  Double horizontal — energy beam effect

Effects:
  ✦   4-pointed star (U+2726) — lock sparkle
  ✧   outlined star (U+2727) — particle
  ·   middle dot (U+00B7) — subtle particle
  ⚠   warning sign (U+26A0) — danger indicator
  ×   multiplication sign — garbage marker
  ╳   box drawing X — fire effect

Digits (large format, 3 wide × 5 tall using ██):
  ███   █   ███  ███  █ █  ████  ███  ████  ███  ███
  █ █  ██     █    █  █ █  █    █       █  █ █  █ █
  █ █   █   ███  ███  ████ ███  ████   █   ███  ████
  █ █   █   █      █    █    █  █ █   █   █ █    █
  ███  ███  ████ ███    █  ███  ███   █   ███  ███
```

---

## 19. Key Frame Reference Index

| Frame | What It Shows | Key Effects Visible |
|-------|--------------|-------------------|
| league_0010 | Pre-game countdown "3" | Board layout, HOLD/NEXT, countdown digit |
| league_0050 | Early gameplay | Piece colors, grid, ghost piece, basic layout |
| league_0054 | ALL CLEAR entrance | Text flying in rotated, particles, attack "14" |
| league_0060 | QUAD + ALL CLEAR | "QUAD" text, "ALL CLEAR" overlay, "T-SPIN DOUBLE" |
| league_0090 | Danger state | Red border, XX garbage markers, ⚠ caution, fire corners |
| league_0100 | MINI T-SPIN + danger | B2B text, fire effects, ⚠ sign, garbage stacking |
| league_0130 | T-SPIN QUAD + particles | Line clear particles, large action text, combo |
| league_0150 | DOUBLE + screen shake | Board displacement, fire corners, high garbage |
| league_0240 | B2B x11 streak | Golden sparkle border, high B2B counter |
| league_1000 | Mutual danger | Both boards red, ⚠ on both, fire everywhere |
| sprint_0050 | Sprint gameplay | Single-player layout, FINESSE stat, background |
| sprint_0100 | Sprint ALL CLEAR | ALL CLEAR text, "BACK-TO-BACK" text, sparkles |
| sprint_0180 | Sprint results | FINAL TIME display, full stats screen |
| gameplay_0050 | TL early game | Two-player layout, piece bevel detail, clean state |
| gameplay_0100 | T-SPIN TRIPLE | Action text, hard drop trail, danger transition |
| gameplay_0150 | 14 COMBO + shake | Massive screen shake, board tilt, huge combo |
| gameplay_0230 | Match results | VS results screen, per-round stats, score bars |
