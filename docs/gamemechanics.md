# TETR.IO exact game-mechanics reference (extracted from https://tetr.io/js/tetrio.js, v19)

Source: tetrio.js client bundle, extracted 2026-07. Conventions below:
- Board: W=boardwidth(10), H=boardheight(20), B=boardbuffer(20), T=H+B=40 rows total.
  Buffer rows are at the TOP (rows 0..B-1); the visible field is rows B..T-1.
- Coordinates: x right, **y DOWN positive**. Row y=0 = top of buffer.
- Falling piece anchor: matrix origin + (dx, dy). dx,dy per piece below.
- Collision: cell (x + cx - dx, y + cy - dy); **y is ceil()ed** for lookup; out-of-bounds (incl. y<0) = occupied.
- Rotation indices: 0=spawn, 1=CW, 2=180, 3=CCW. Kick key "ab" = from a to b.
- All tunable numeric constants live in one `constants` object (kicksets, cornerTable, scoring, garbage tables).

## 1. Piece definitions (tetrominoes.matrix)
w,h,dx,dy + data[4 rotations][cells as (x,y,flags)]:
- z,l,s,j,t: w=3,h=3,dx=1,dy=1
- i: w=4,h=4,dx=1,dy=1, kickset_special:"i" (uses i_kicks)
- o: w=2,h=2,dx=0,dy=1, disallow_kick:true (no rotation possible)
- (custom pieces i1,i2,i3,l3,i5,oo exist; ignore for versus)
Spawn shapes (rotation 0), anchor-relative:
- t: (1,0)(0,1)(1,1)(2,1)  — flat side down
- z: (0,0)(1,0)(1,1)(2,1)  | s: (1,0)(2,0)(0,1)(1,1)
- l: (2,0)(0,1)(1,1)(2,1)  | j: (0,0)(0,1)(1,1)(2,1)
- i: (0,1)(1,1)(2,1)(3,1)
- o: (0,0)(1,0)(0,1)(1,1)
Per-cell flags encode spin-detection geometry (used internally; cornerTable below is the usable form).

## 2. Spawn rule (falling manager Next())
- spawn_rotation = kickset.spawn_rotation[type] ?? 0 (SRS+: all 0)
- offset = kickset.additional_offsets[type]?.[rot] ?? (0,0) (SRS+: none)
- **x = ceil(W/2) - 1 + offsetX**  (anchor x; so t: anchor 4 → box cols 3-5; i: box cols 3-6; o: cols 4-5)
- **y = B - 2.04 + offsetY**      (anchor y; B=20 → y=17.96; lowest spawn cell at row B-2 = 2 rows above visible)
- hy (hard-drop ghost) = B - 2
- If spawn pos illegal → "clutch": walk piece up (y--) until legal (only if lastwasclear && clutch option); else blockout → topout ("garbagesmash" if lastwasattack).
- version>=17 && Is20G() → SlamToFloor() at spawn.
- IRS ('tap'): rotations pressed during ARE/sleep accumulate piece.irs (mod 4); applied as a real rotation w/ kicks at spawn.
  IRS 'hold': at spawn, irs = (CCW? -1) + (CW? +1) + (180? +2) if keys held. IHS analogous via ACTION_IHS flag → Hold() at spawn.

## 3. Kick tables — keys "from to", 0=spawn 1=CW 2=180 3=CCW; offsets (dx,dy), **y DOWN**;
   the implicit [0,0] basic-rotation test is NOT listed (try basic first, then these in order).
   kick index: 0 = basic OR first kick (see ComputeKick — index n into this array; spin upgrade checks kick===3,
   i.e. the 4th listed kick = the classic TST kick).

### SRS+ JLSTZ (== SRS for CW/CCW; TETR.IO default, league)
01: (-1,0)(-1,-1)(0,2)(-1,2)    10: (1,0)(1,1)(0,-2)(1,-2)
12: (1,0)(1,1)(0,-2)(1,-2)      21: (-1,0)(-1,-1)(0,2)(-1,2)
23: (1,0)(1,-1)(0,2)(1,2)       32: (-1,0)(-1,1)(0,-2)(-1,-2)
30: (-1,0)(-1,1)(0,-2)(-1,-2)   03: (1,0)(1,-1)(0,2)(1,2)
180: 02: (0,-1)(1,-1)(-1,-1)(1,0)(-1,0)
     13: (1,0)(1,-2)(1,-1)(0,-2)(0,-1)
     20: (0,1)(-1,1)(1,1)(-1,0)(1,0)
     31: (-1,0)(-1,-2)(-1,-1)(0,-2)(0,-1)

### SRS+ I ("symmetric I-piece rotation"; differs from SRS!)
01: (1,0)(-2,0)(-2,1)(1,-2)     10: (-1,0)(2,0)(-1,2)(2,-1)
12: (-1,0)(2,0)(-1,-2)(2,1)     21: (-2,0)(1,0)(-2,-1)(1,2)
23: (2,0)(-1,0)(2,-1)(-1,2)     32: (1,0)(-2,0)(1,-2)(-2,1)
30: (1,0)(-2,0)(1,2)(-2,-1)     03: (-1,0)(2,0)(2,1)(-1,-2)
180: 02: (0,-1)   13: (1,0)   20: (0,1)   31: (-1,0)

### SRS (plain) — same JLSTZ table; I = classic guideline table, **180 kicks EMPTY** ([] = 180 = basic only)
i_kicks: 01: (-2,0)(1,0)(-2,1)(1,-2)  10: (2,0)(-1,0)(2,-1)(-1,2)
         12: (-1,0)(2,0)(-1,-2)(2,1)  21: (1,0)(-2,0)(1,2)(-2,-1)
         23: (2,0)(-1,0)(2,-1)(-1,2)  32: (-2,0)(1,0)(-2,1)(1,-2)
         30: (1,0)(-2,0)(1,2)(-2,-1)  03: (-1,0)(2,0)(-1,-2)(2,1)

### SRS-X 180 (if ever needed; CW/CCW same as SRS)
02: (1,0)(2,0)(1,1)(2,1)(-1,0)(-2,0)(-1,1)(-2,1)(0,-1)(3,0)(-3,0)
13: (0,1)(0,2)(-1,1)(-1,2)(0,-1)(0,-2)(-1,-1)(-1,-2)(1,0)(0,3)(0,-3)
20: (-1,0)(-2,0)(-1,-1)(-2,-1)(1,0)(2,0)(1,-1)(2,-1)(0,1)(-3,0)(3,0)
31: (0,1)(0,2)(1,1)(1,2)(0,-1)(0,-2)(1,-1)(1,-2)(-1,0)(0,3)(0,-3)
I 180: 02: (-1,0)(-2,0)(1,0)(2,0)(0,1)  13: (0,1)(0,2)(0,-1)(0,-2)(-1,0)
       20: (1,0)(2,0)(-1,0)(-2,0)(0,-1) 31: (0,1)(0,2)(0,-1)(0,-2)(1,0)

### Kick application details (ComputeKick)
- target = (x + kx + ddx, floor(y) + 0.1 + ky + ddy), where (ddx,ddy) = additional_offsets[to] - [from] (0 in SRS+).
- anti-infinity: if totalRotations > lockresets+15, use y + ky (no floor+0.1 snap); also gravity speeds up.
- After successful rotation: lockresets++/rotresets++ (caps 31/63); if lockresets < options.lockresets → locking=0 (move reset).

## 4. Spin detection (all-mini+ / T-spins / etc.) — rbm.IsTSpin()
Requires: piece grounded (cannot move y+1) AND last action was a rotation (fm.HasRotated()).
3-corner rule using cornerTable (offsets relative to anchor; OOB = occupied):
- n = filled corners; if n<3 → no spin (for corner-rule pieces).
- For t: corners (all rotations): (-1,-1)[3,0], (1,-1)[0,1], (1,1)[1,2], (-1,1)[2,3].
  i = count of filled corners among the two "facing" corners for current r (corner qualifies if r in its dir pair).
  mini if (type mini-capable && i != 2). **kick===3 (4th listed kick) upgrades to "normal"** (TST-kick rule).
- cornerTable also exists per-rotation for z,l,s,j (4 corners, no dir pairs — never mini).
Rule resolution per spinbonuses option:
- "all-mini+"/"all-mini"/"mini-only": corner-rule result if any; else IMMOBILE check (cannot move L/R/U/D):
  all-mini+: immobile → "mini" for ALL pieces (T too). all-mini: immobile → mini. "all"/"all+": immobile → "normal".
- "T-spins": corner rule only (t). "T-spins+": corner rule OR immobile→mini. "handheld": corner rule (t,s,z,l,j).
- "stupid": grounded → normal. "none": never.
Only T is in types_mini (only T can be mini). flags ROTATION_SPIN/ROTATION_MINI set at rotation time.
NOTE: non-T spins under all-mini+ use the MINI attack rows (TSPIN_MINI_*), see below.

## 5. Attack (garbage) table — constants.garbage
SINGLE:0  DOUBLE:1  TRIPLE:2  QUAD:4  PENTA:5  (beyond penta: PENTA + (n-5))
TSPIN_MINI:0  TSPIN:0  TSPIN_MINI_SINGLE:0  TSPIN_SINGLE:2  TSPIN_MINI_DOUBLE:1
TSPIN_DOUBLE:4  TSPIN_MINI_TRIPLE:2  TSPIN_TRIPLE:6  TSPIN_MINI_QUAD:4  TSPIN_QUAD:10  TSPIN_PENTA:12
BACKTOBACK_BONUS:1  BACKTOBACK_BONUS_LOG:0.8
COMBO_MINIFIER:1  COMBO_MINIFIER_LOG:1.25  COMBO_BONUS:0.25
ALL_CLEAR:10 (but option allclear_garbage; league=5)
combotable: none:[0]; classic guideline:[0,1,1,2,2,3,3,4,4,4,5]; modern guideline:[0,1,1,2,2,2,3,3,3,3,3,3,4]
("multiplier" is NOT a table — see formula)
handheld spinbonuses: non-T spin attack halved.

### Attack computation (lcm clear function), per lock with n=lines cleared:
d = garbage table value by (n, spin, mini).
- combo: stats.combo++ per clear (any combotable != "none"); combo>1:
  - "multiplier": d *= 1 + 0.25*(combo-1);  if combo>2: d = max(d, log1p(1.0*(combo-1)*1.25))
  - other tables: d += table[min(combo-2, len-1)]  (combo=2 → table[0] = 0)
- b2b: chain increments a: +1 for QUAD+ (n>=4) or full spin (NOT mini); +allclear_b2b if all-clear.
  a==0 && n>0 → b2b chain RESETS to 0 (singles/doubles/triples AND mini spins break b2b!).
  bonus (applied when (n||a) && btb>1 after increment):
  - b2bchaining: d += 1 * ( floor(1 + log1p((btb-1)*0.8)) + (btb==2 ? 0 : frac(1+log1p((btb-1)*0.8))/3) )
  - else: d += 1 (b2bextras on: +2 if quad or spin-with-lines)
  - u = allclear_b2b_sends || !(allclear_b2b===a && allclear) — if !u, no b2b bonus this clear.
- garbagespecialbonus (league ON): +1 if cleared >=1 garbage row AND (quad or full spin).
- garbagetargetbonus "offensive" (multi-enemy): +0/1/3/5/7/9 for 1/2/3/4/5/6+ enemies... (0-1: +0, 2: +1, 3: +3, 4: +5, 5: +7, 6+: +9)
- final: atk = AutoRound(d * garbagemultiplier);  garbageattackcap>0 caps: floor(min(cap, atk)).
- AutoRound by roundmode: "down" (DEFAULT) = floor; "rng" = floor + (rngex.nextFloat() < frac ? 1 : 0).
- All-clear: separate — AutoRound(allclear_garbage * garbagemultiplier) sent the same way; score += 3500*level.

### Dispatch (garbageblocking):
- "combo blocking"/"limited blocking": FightLines(atk) — cancels incoming first (below).
- "none": attack stat += atk; Offence(atk) directly (NO cancellation possible).
- Blocking decision: combo blocking → garbage entry blocked on locks that cleared lines or generated attack;
  limited blocking → never blocks; none → never blocks.
- b2bcharging: while chaining, NO immediate b2b bonus beyond +1 (that's the else branch; charging skips chaining branch).
  When the chain BREAKS (non-quad/non-fullspin clear) and btb > b2bcharge_at:
  surge = floor((btb - b2bcharge_at + b2bcharge_base) * garbagemultiplier), sent as 3 chunks
  [round(s/3), round(s/3), s - 2*round(s/3)] through FightLines. Then btb=0.

### FightLines(s) — cancellation:
1. stats.garbage.attack += s  (APM counts this — includes canceled)
2. bonus i: cancelmultiplier: i += AutoRound(cancelmultiplier*s - s) (default 1 → 0);
   openerphase (league 14): if piecesplaced <= 14 && pendingIncoming >= stats.garbage.sent → i += s (attack DOUBLED when behind in opener)
3. Cancel: first against garbageareentries (in-ARE lines), then impendingdamage queue (amt-- per entry);
   each canceled line: 1 from s (or i). Canceling re-rolls next hole column w/ prob messiness_change.
4. Leftover s>0 → Offence(s): stats.garbage.sent += s; sent to targets.
   (limited blocking: cancellation still happens; entry just isn't blocked by clears.)

## 6. Garbage receiving / entry
Incoming attack → impendingdamage queue entry {amt, column?, status: spawn/caution/danger/sleeping, delay}.
- garbageabsolutecap>0: queue total capped (excess shielded).
- Entry (TakeAllDamage): up to floor(min(garbagecap, garbagecapmax)) lines per call:
  - hole column: entry.column if set; else lastcolumn; re-roll (RerollColumn) when:
    chunk exhausted w/ prob messiness_change (default 1 → every chunk), per line w/ prob messiness_inner (default 0),
    or messiness_timeout frames since last tank. messiness_nosame: never repeat last column.
    RerollColumn: uniform over ColumnWidth = W - garbageholesize + 1 (minus margins if messiness_center: round(W/5)).
    garbagefavor!=0: weighted toward columns near existing holes.
  - hole cells: start column, expand right then left (wrap at edges) to garbageholesize cells.
  - row: all cells 'gb' except hole columns; insert at bottom, TOP ROW DROPPED (board.shift()).
    If row 0 becomes fully occupied → AreWeToppedYet → game over ("garbagesmash"). PushLine refused when row 0 full.
    Falling piece overlapping pushed garbage is pushed up 1 row; if impossible → topout.
  - entry modes: "instant" = push immediately; "continuous" = via garbageareentries, 1 line per garbageare(5) frames;
    "delayed" = per-line WaitFrames(garbageare * (i+1)).
- Blocking: with combo blocking, on locks that cleared/attacked, entry waits (nextwilltank=false; garbagearelockeduntil
  bumped by garbagearebump=12). With are=0 & instant entry & not blocked: TakeAllDamage immediately at lock.
  Otherwise ProcessGarbageARE feeds garbageareentries at 1 per garbageare frames.
- Clearing rows containing 'gb'/'gbd' cells: stats.garbage.cleared += count (feeds VS score + garbagespecialbonus).

## 7. Gravity / soft drop / 20G (fall manager, per frame, e=frame fraction)
r = GetEffectiveGravity() * e  (glock>0 scales: (1-glock/180)^2*g while glock<=180 else 0; default glock=0 → g)
gincrease: g += gincrease/60 per frame once frame > gmargin (i.e. gincrease per SECOND).
garbagemultiplier += garbageincrease/60 per frame once frame > garbagemargin.
soft drop (inputSoftdrop): sdf==41 → r = 400*e; else r = g*sdf, min 0.05*sdf. (SDF REPLACES gravity.)
ShouldLock (lockresets exhausted) && grounded → r=20 + FORCELOCK flag.
Anti-infinity: rotresets > lockresets+15 → r += 0.5*(rotresets-(lockresets+15)).
Fall applied in ≤1-cell increments (_InternalFall): new y = round(1e6*(y+e))/1e6 (+1e-6 if integer);
must be legal at BOTH new y and y+1 (else grounded). On falling to new lowest row (y > hy): hy=ceil(y),
lockresets=0, rotresets=0 (NB: locking TIMER not reset).
20G: effective g >= boardheight → at spawn SlamToFloor; gravitymay20g gates.
Grounded → _InternalLocking(≈1/frame): locking += 1; lock when locking > locktime(30) OR ShouldLock.
ShouldLock = lockresets >= lockresets option(15). Move/rotate success: locking=0 (if !ShouldLock), lockresets++.
safelock: after lock-delay lock with handling.safelock → piece.safelock=7 frames; hard drop blocked while >0.

## 8. DAS/ARR/DCD (input manager)
State per direction: {held, das, arr}; lastshift (-1/1); inputSoftdrop.
KeyDown L/R: stats.inputs++, falling.keys++, ActivateShift: held=true, das=0 (hoisted replay key: das-dcd),
arr=handling.arr, lastshift=dir; then immediate 1-cell shift (if legal).
KeyUp L/R: held=false, das=0; lastshift = other dir if still held; if handling.cancel: OTHER dir das=0, arr=handling.arr.
Per frame (_ProcessShift, for the direction matching lastshift only):
  n = max(0, t - max(0, das - dasCharged)); dasCharged = min(dasCharged + t, das); if < das → done.
  arrAccum += n; if arrAccum < arr → done.
  shifts = arr==0 ? boardwidth : floor(arrAccum/arr); arrAccum -= arr*shifts; shift that many cells.
Each successful shift: lockresets++ (cap 31), locking=0 (move reset, if !ShouldLock).
DCD (_InternalDCD): after rotations, if piece HasHitWall && handling.dcd: das = min(das, das-dcd), arr=arr (both dirs).

## 9. Bag RNG — class C (Park–Miller minimal standard)
constructor(seed): _seed = seed % 2147483647; if <=0: _seed += 2147483646; if 0 → 1.
next(): _seed = 16807 * _seed % 2147483647
nextFloat(): (next() - 1) / 2147483646
shuffleArray(a): for s=a.length-1 down to 1: j=floor(nextFloat()*(s+1)); swap a[s],a[j].
Two instances, BOTH seeded from options.seed: rng (bag) and rngex (garbage columns, rounding, etc.).
7-bag: pieces = minotypes ["z","l","o","s","i","j","t"] (this order), shuffleArray, append to queue.
Queue refills to >=14 pieces (bag.shift() per spawn). Other bag types exist (14-bag, 7+X, classic, pairs, ...).

## 10. Stats
- stats.garbage.attack += s on EVERY FightLines (pre-cancel; APM basis). stats.garbage.sent += s in Offence (post-cancel).
  sent_nomult += floor(s / garbagemultiplier). garbage.cleared += garbage rows cleared.
- apm = attack / (frame/3600); pps = piecesplaced / (frame/60);
  vsscore = ((attack + garbage.cleared) / max(1,piecesplaced)) * pps * 100.
- Score: SINGLE 100, DOUBLE 300, TRIPLE 500, QUAD 800, PENTA 1200, TSPIN_MINI 100, TSPIN 400,
  TSM_SINGLE 200, TS_SINGLE 800, TSM_DOUBLE 400, TS_DOUBLE 1200, TSM_TRIPLE 800, TS_TRIPLE 1600,
  TSM_QUAD 1600, TS_QUAD 2600, TS_PENTA 3200; b2b score x1.5; COMBO 50*(combo-1); ALL_CLEAR 3500;
  softdrop 1/cell, harddrop 2/cell. All x level at the end.

## 11. Frame order (main loop, 60fps)
1. pull inputs → 2. ProcessAllShift (DAS/ARR) → 3. Fall (gravity+lock) → 4. interrupts →
5. waiting frames (ARE spawns) → 6. ProcessGarbageARE → 7. hesitated attacks → 8. gincrease etc.
Key events carry subframe (0..0.9): _ProcessSubframe runs ProcessAllShift+Fall for the sub-delta BEFORE the event.

## 12. Key option defaults (v19) & TETRA LEAGUE preset
defaults: are 0, lineclear_are 0, g .02, gincrease 0, gmargin 0, gravitymay20g true, garbagemultiplier 1,
receivemultiplier 1, cancelmultiplier 1, garbageholesize 1, garbagequeue false, garbageentry "instant",
garbageare 5, garbagearebump 12, garbagecap 8, garbagecapmax 40, garbageblocking "combo blocking",
passthrough "zero", openerphase 0, roundmode "down", spinbonuses "T-spins", combotable "multiplier",
kickset "SRS+", bagtype "7-bag", messiness_change 1, messiness_inner 0, messiness_nosame false,
messiness_center false, messiness_timeout 0, b2bchaining false, b2bcharging false, b2bcharge_at 4,
b2bcharge_base 0, allclears true, allclear_garbage 10, allclear_b2b 0, allclear_b2b_sends false,
allclear_b2b_dupes true, allow_harddrop true, allow180 false, nextcount 5, clutch true, nolockout false,
boardwidth 10, boardheight 20, boardbuffer 20, locktime 30, lockresets 15, garbagefavor 0.
handling defaults (from handshake capture): arr 2, das 10, dcd 2(?), sdf 6, safelock true, cancel false,
may20g true, irs "tap", ihs "tap". room_handling: arr 2, das 10, sdf 6.
TETRA LEAGUE preset: spinbonuses=all-mini+, allow180=1, kickset=SRS+, g=0.02, gincrease=0.0035,
gmargin=7200, garbagemultiplier=1, garbageblocking="combo blocking", garbagemargin=10800,
garbageincrease=0.008, locktime=30, garbagespeed=20, garbagecap=8, garbagecapmax=40, b2bchaining=0,
b2bcharging=1, combotable=multiplier, clutch=1, passthrough=zero, nolockout=1, allclears=1,
openerphase=14, allclear_garbage=5, allclear_b2b=1, roundmode=down, garbagespecialbonus=1, ft=7.

## Extracted raw constants
Full kicksets/cornerTable/garbage/scoring/tetrominoes JSON: docs/tetrio_constants.json
