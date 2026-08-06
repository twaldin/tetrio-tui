# SRS/SRS+ kick tables for tetrio-tui (board coords: x right, y DOWN, +y = toward floor)

Rotations: 0=spawn, R=CW, 2=180, L=CCW. Each entry = list of (dx, dy) offsets tried in order.
TETR.IO SRS+ == standard SRS for CW/CCW + SRS-X for 180. Validate against captures; adjust if needed.

## JLSTZ (and T-spin) kicks
0->R: (0,0) (-1,0) (-1,-1) (0,2) (-1,2)
R->0: (0,0) (1,0) (1,1) (0,-2) (1,-2)
R->2: (0,0) (1,0) (1,1) (0,-2) (1,-2)
2->R: (0,0) (-1,0) (-1,-1) (0,2) (-1,2)
2->L: (0,0) (1,0) (1,-1) (0,2) (1,2)
L->2: (0,0) (-1,0) (-1,1) (0,-2) (-1,-2)
L->0: (0,0) (-1,0) (-1,1) (0,-2) (-1,-2)
0->L: (0,0) (1,0) (1,-1) (0,2) (1,2)

## I kicks
0->R: (0,0) (-2,0) (1,0) (-2,1) (1,-2)
R->0: (0,0) (2,0) (-1,0) (2,-1) (-1,2)
R->2: (0,0) (-1,0) (2,0) (-1,-2) (2,1)
2->R: (0,0) (1,0) (-2,0) (1,2) (-2,-1)
2->L: (0,0) (2,0) (-1,0) (2,-1) (-1,2)
L->2: (0,0) (-2,0) (1,0) (-2,1) (1,-2)
L->0: (0,0) (1,0) (-2,0) (1,2) (-2,-1)
0->L: (0,0) (-1,0) (2,0) (-1,-2) (2,1)

## O kicks (O doesn't rotate meaningfully)
all: (0,0)

## 180 (SRS-X)
0->2: (0,0) (0,1) (1,1) (-1,1) (1,0) (-1,0)
2->0: (0,0) (0,-1) (-1,-1) (1,-1) (-1,0) (1,0)
R->L: (0,0) (1,0) (1,-1) (1,1) (0,-1) (0,1)
L->R: (0,0) (-1,0) (-1,-1) (-1,1) (0,-1) (0,1)

## TETR.IO versus attack table (multiplier combotable, b2b chaining off, b2b charging on)
base attack: single=0, double=1, triple=2, tetris=4, tspin_mini=0, tspin=2, tspin_double=4, tspin_triple=6
all_clear = +10 (or options.allclear_garbage)
combo (multiplier table, by combo count 0..): 0,0,1,1,1,2,2,3,3,4,4,4,5,...
  (TETR.IO multiplier combo: combo 2 -> +1, scaling; make data-driven COMBO_TABLE array)
b2b: consecutive tetrises/tspins keep b2b; with b2b charging: each b2b-clear past b2bcharge_at adds attack.
back-to-back bonus: +1 when b2b > 0 for tetris/tspin (b2b chaining OFF means no +1 chain, but charging adds)

## piece spawn / sizes
spawn positions: I and O spawn at column 4 (0-indexed ~3-4), others column 3. Rotation point per SRS.
board: options.boardwidth x options.boardheight (default 10x20), y=0 top.
