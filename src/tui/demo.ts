#!/usr/bin/env node
/**
 * demo.ts — visual verification for the TUI renderer.
 *
 * Renders a 10x20 board, hold box, 5-piece next queue and a stats panel,
 * with a falling piece you can steer. Not a full engine — just enough to
 * exercise rendering + raw key handling.
 *
 * Run:  npx tsx src/tui/demo.ts [--seed N] [--static] [--fps N]
 *   --static   disable gravity (deterministic; piece only moves via keys)
 *   --seed N   seed the 7-bag RNG (default 42)
 *   --fps N    frame rate (default 60)
 *
 * Keys: left/right/down arrows, z/x rotate, a = 180, space = hard drop,
 *       c = hold, r = reset, q / esc / ctrl+c = quit.
 */

import { Screen, rgb, type Color, type Style } from './renderer.js';

// ---------------------------------------------------------------------------
// tiny seeded RNG + 7-bag
// ---------------------------------------------------------------------------

type PieceType = 'i' | 'o' | 't' | 's' | 'z' | 'l' | 'j';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Bag {
  private rand: () => number;
  queue: PieceType[] = [];
  constructor(seed: number) {
    this.rand = mulberry32(seed);
    this.refill();
    this.refill();
  }
  private refill(): void {
    const pieces: PieceType[] = ['i', 'o', 't', 's', 'z', 'l', 'j'];
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    this.queue.push(...pieces);
  }
  next(): PieceType {
    if (this.queue.length <= 7) this.refill();
    return this.queue.shift()!;
  }
  peek(n: number): PieceType[] {
    return this.queue.slice(0, n);
  }
}

// ---------------------------------------------------------------------------
// pieces
// ---------------------------------------------------------------------------

const SHAPES: Record<PieceType, number[][]> = {
  i: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  o: [[1,1],[1,1]],
  t: [[0,1,0],[1,1,1],[0,0,0]],
  s: [[0,1,1],[1,1,0],[0,0,0]],
  z: [[1,1,0],[0,1,1],[0,0,0]],
  l: [[0,0,1],[1,1,1],[0,0,0]],
  j: [[1,0,0],[1,1,1],[0,0,0]],
};

const PIECE_COLORS: Record<PieceType, Color> = {
  i: rgb(0, 240, 240),
  o: rgb(240, 240, 0),
  t: rgb(176, 0, 240),
  s: rgb(0, 240, 0),
  z: rgb(240, 0, 0),
  l: rgb(240, 160, 0),
  j: rgb(60, 60, 248),
};

function rotateCW(m: number[][]): number[][] {
  const n = m.length;
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[x][n - 1 - y] = m[y][x];
  return out;
}

// ---------------------------------------------------------------------------
// mini game state
// ---------------------------------------------------------------------------

const BOARD_W = 10;
const BOARD_H = 20;

interface ActivePiece {
  type: PieceType;
  matrix: number[][];
  x: number;
  y: number; // float for gravity
}

class DemoGame {
  board: (PieceType | null)[][];
  bag: Bag;
  active: ActivePiece;
  hold: PieceType | null = null;
  holdUsed = false;
  gravity: number; // cells per frame
  lockTimer = 0;
  score = 0;
  lines = 0;
  pieces = 0;
  startTime = Date.now();
  toppedOut = false;

  constructor(seed: number, gravity: number) {
    this.board = Array.from({ length: BOARD_H }, () => new Array<PieceType | null>(BOARD_W).fill(null));
    this.bag = new Bag(seed);
    this.gravity = gravity;
    this.active = this.spawn();
  }

  spawn(): ActivePiece {
    const type = this.bag.next();
    const matrix = SHAPES[type].map((r) => [...r]);
    return { type, matrix, x: type === 'o' ? 4 : 3, y: 0 };
  }

  collides(matrix: number[][], px: number, py: number): boolean {
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        if (!matrix[y][x]) continue;
        const bx = px + x;
        const by = py + y;
        if (bx < 0 || bx >= BOARD_W || by >= BOARD_H) return true;
        if (by >= 0 && this.board[by][bx]) return true;
      }
    }
    return false;
  }

  move(dx: number, dy: number): boolean {
    const nx = this.active.x + dx;
    const ny = Math.floor(this.active.y) + dy;
    if (this.collides(this.active.matrix, nx, ny)) return false;
    this.active.x = nx;
    this.active.y = ny;
    if (dx !== 0 && !this.grounded()) this.lockTimer = 0;
    return true;
  }

  grounded(): boolean {
    return this.collides(this.active.matrix, this.active.x, Math.floor(this.active.y) + 1);
  }

  rotate(times: number): void {
    let m = this.active.matrix;
    for (let i = 0; i < ((times % 4) + 4) % 4; i++) m = rotateCW(m);
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!this.collides(m, this.active.x + kick, Math.floor(this.active.y))) {
        this.active.matrix = m;
        this.active.x += kick;
        if (!this.grounded()) this.lockTimer = 0;
        return;
      }
    }
  }

  ghostY(): number {
    let gy = Math.floor(this.active.y);
    while (!this.collides(this.active.matrix, this.active.x, gy + 1)) gy++;
    return gy;
  }

  hardDrop(): void {
    const gy = this.ghostY();
    this.score += (gy - Math.floor(this.active.y)) * 2;
    this.active.y = gy;
    this.lock();
  }

  softDrop(): void {
    if (this.move(0, 1)) this.score += 1;
  }

  holdSwap(): void {
    if (this.holdUsed) return;
    const cur = this.active.type;
    if (this.hold === null) {
      this.hold = cur;
      this.active = this.spawn();
    } else {
      const h = this.hold;
      this.hold = cur;
      this.active = { type: h, matrix: SHAPES[h].map((r) => [...r]), x: h === 'o' ? 4 : 3, y: 0 };
    }
    this.holdUsed = true;
  }

  lock(): void {
    const py = Math.floor(this.active.y);
    let lockedAbove = true;
    for (let y = 0; y < this.active.matrix.length; y++) {
      for (let x = 0; x < this.active.matrix[y].length; x++) {
        if (!this.active.matrix[y][x]) continue;
        const by = py + y;
        const bx = this.active.x + x;
        if (by >= 0 && by < BOARD_H && bx >= 0 && bx < BOARD_W) {
          this.board[by][bx] = this.active.type;
          lockedAbove = false;
        }
      }
    }
    this.pieces++;
    this.holdUsed = false;
    this.lockTimer = 0;
    // line clears
    let cleared = 0;
    for (let y = BOARD_H - 1; y >= 0; y--) {
      if (this.board[y].every((c) => c !== null)) {
        this.board.splice(y, 1);
        this.board.unshift(new Array<PieceType | null>(BOARD_W).fill(null));
        cleared++;
        y++;
      }
    }
    if (cleared > 0) {
      this.lines += cleared;
      this.score += [0, 100, 300, 500, 800][cleared];
    }
    if (lockedAbove) {
      this.toppedOut = true;
    }
    this.active = this.spawn();
    if (this.collides(this.active.matrix, this.active.x, 0)) this.toppedOut = true;
  }

  reset(seed: number): void {
    this.board = Array.from({ length: BOARD_H }, () => new Array<PieceType | null>(BOARD_W).fill(null));
    this.bag = new Bag(seed);
    this.hold = null;
    this.holdUsed = false;
    this.score = 0;
    this.lines = 0;
    this.pieces = 0;
    this.lockTimer = 0;
    this.toppedOut = false;
    this.startTime = Date.now();
    this.active = this.spawn();
  }

  /** One 60fps tick of gravity + lock delay. */
  tick(): void {
    if (this.toppedOut) return;
    if (this.gravity > 0) {
      this.active.y += this.gravity;
      if (this.grounded()) {
        this.active.y = Math.floor(this.active.y);
      }
    }
    if (this.grounded()) {
      this.lockTimer++;
      if (this.lockTimer >= 30) this.lock();
    } else {
      this.lockTimer = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// demo main
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { seed: number; staticMode: boolean; fps: number } {
  let seed = 42;
  let staticMode = false;
  let fps = 60;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--static') staticMode = true;
    else if (argv[i] === '--seed' && i + 1 < argv.length) seed = Number(argv[++i]) || 0;
    else if (argv[i] === '--fps' && i + 1 < argv.length) fps = Number(argv[++i]) || 60;
  }
  return { seed, staticMode, fps };
}

const MIN_COLS = 44;
const MIN_ROWS = 31;

// layout
const BOARD_X = 1;
const BOARD_Y = 1;
const CELL_W = 2;
const SIDE_X = 25;
const SIDE_W = 18;

const FRAME_BORDER: Style = { fg: rgb(120, 120, 140) };
const EMPTY_STYLE: Style = { bg: rgb(14, 14, 22) };
const GHOST_STYLE: Style = { fg: rgb(80, 80, 96), dim: true };
const LABEL_STYLE: Style = { fg: rgb(200, 200, 220), bold: true };
const VALUE_STYLE: Style = { fg: rgb(240, 240, 160) };

function drawPreview(screen: Screen, type: PieceType, cx: number, cy: number, dim: boolean): void {
  const m = SHAPES[type];
  // trim empty rows/cols for centering
  const rows = m.filter((r) => r.some((v) => v));
  let minX = 99, maxX = -1;
  for (const r of m) for (let x = 0; x < r.length; x++) if (r[x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  const w = maxX - minX + 1;
  const ox = cx - Math.floor((w * CELL_W) / 2);
  const style: Style = { fg: PIECE_COLORS[type], dim };
  rows.forEach((r, dy) => {
    for (let x = minX; x <= maxX; x++) {
      if (r[x]) {
        screen.set(ox + (x - minX) * CELL_W, cy + dy, '█', style);
        screen.set(ox + (x - minX) * CELL_W + 1, cy + dy, '█', style);
      }
    }
  });
}

function draw(screen: Screen, game: DemoGame): void {
  screen.clear();
  const cols = screen.columns;
  const rows = screen.rows;
  if (cols < MIN_COLS || rows < MIN_ROWS) {
    screen.drawText(1, 1, `terminal too small: ${cols}x${rows}, need >= ${MIN_COLS}x${MIN_ROWS}`, { fg: rgb(240, 80, 80) });
    return;
  }

  // board frame + cells
  const bw = BOARD_W * CELL_W + 2;
  const bh = BOARD_H + 2;
  screen.drawBox(BOARD_X, BOARD_Y, bw, bh, FRAME_BORDER, 'TETRIO-TUI');
  const ix = BOARD_X + 1;
  const iy = BOARD_Y + 1;
  for (let y = 0; y < BOARD_H; y++) {
    for (let x = 0; x < BOARD_W; x++) {
      const cell = game.board[y][x];
      const style: Style = cell ? { fg: PIECE_COLORS[cell] } : EMPTY_STYLE;
      const ch = cell ? '█' : ' ';
      screen.set(ix + x * CELL_W, iy + y, ch, style);
      screen.set(ix + x * CELL_W + 1, iy + y, ch, style);
    }
  }

  if (!game.toppedOut) {
    // ghost
    const gy = game.ghostY();
    const ay = Math.floor(game.active.y);
    const m = game.active.matrix;
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;
        const gY = gy + y;
        if (gY !== ay + y && gY >= 0) {
          screen.set(ix + (game.active.x + x) * CELL_W, iy + gY, '▒', GHOST_STYLE);
          screen.set(ix + (game.active.x + x) * CELL_W + 1, iy + gY, '▒', GHOST_STYLE);
        }
      }
    }
    // active piece
    const style: Style = { fg: PIECE_COLORS[game.active.type] };
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;
        if (ay + y >= 0) {
          screen.set(ix + (game.active.x + x) * CELL_W, iy + ay + y, '█', style);
          screen.set(ix + (game.active.x + x) * CELL_W + 1, iy + ay + y, '█', style);
        }
      }
    }
  }

  // side panel
  screen.drawBox(SIDE_X, 1, SIDE_W, 5, FRAME_BORDER, 'HOLD');
  if (game.hold) drawPreview(screen, game.hold, SIDE_X + Math.floor(SIDE_W / 2), 2, game.holdUsed);

  screen.drawBox(SIDE_X, 6, SIDE_W, 17, FRAME_BORDER, 'NEXT');
  const upcoming = game.bag.peek(5);
  upcoming.forEach((t, i) => drawPreview(screen, t, SIDE_X + Math.floor(SIDE_W / 2), 8 + i * 3, false));

  screen.drawBox(SIDE_X, 23, SIDE_W, 7, FRAME_BORDER, 'STATS');
  const elapsed = Math.floor((Date.now() - game.startTime) / 1000);
  screen.drawText(SIDE_X + 2, 24, 'SCORE', LABEL_STYLE);
  screen.drawText(SIDE_X + 9, 24, String(game.score).padStart(7), VALUE_STYLE);
  screen.drawText(SIDE_X + 2, 25, 'LINES', LABEL_STYLE);
  screen.drawText(SIDE_X + 9, 25, String(game.lines).padStart(7), VALUE_STYLE);
  screen.drawText(SIDE_X + 2, 26, 'PIECES', LABEL_STYLE);
  screen.drawText(SIDE_X + 9, 26, String(game.pieces).padStart(7), VALUE_STYLE);
  screen.drawText(SIDE_X + 2, 27, 'TIME', LABEL_STYLE);
  screen.drawText(SIDE_X + 9, 27, `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`, VALUE_STYLE);
  if (game.toppedOut) {
    screen.drawText(SIDE_X + 2, 28, 'TOP OUT!', { fg: rgb(240, 60, 60), bold: true });
  }

  screen.drawText(BOARD_X, 30, '←→ move  ↓ soft  space hard  z/x rot  a 180  c hold  r reset  q quit', { fg: rgb(130, 130, 150) });
}

async function main(): Promise<void> {
  const { seed, staticMode, fps } = parseArgs(process.argv.slice(2));
  const screen = new Screen({ fps });
  const game = new DemoGame(seed, staticMode ? 0 : 1 / 24);
  let running = true;

  const cleanup = (): void => {
    running = false;
    screen.exit();
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
  };

  // --- minimal raw key handling (demo-grade, no full input module) ---
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    let leftover = '';
    const SEQ: Record<string, string> = {
      '\x1b[A': 'up', '\x1bOA': 'up',
      '\x1b[B': 'down', '\x1bOB': 'down',
      '\x1b[C': 'right', '\x1bOC': 'right',
      '\x1b[D': 'left', '\x1bOD': 'left',
    };
    process.stdin.on('data', (data: string) => {
      let buf = leftover + data;
      leftover = '';
      while (buf.length > 0) {
        let key: string | null = null;
        let used = 1;
        if (buf[0] === '\x1b') {
          const three = buf.slice(0, 3);
          if (SEQ[three]) { key = SEQ[three]; used = 3; }
          else if (buf.length < 3 && ('\x1b['.startsWith(buf) || '\x1bO'.startsWith(buf))) {
            leftover = buf; // incomplete escape sequence, wait for more bytes
            return;
          } else if (buf[1] === '[' || buf[1] === 'O') {
            used = 2; // unknown CSI/SS3, drop introducer
            key = null;
          } else {
            key = 'escape';
          }
        } else if (buf[0] === '\x03') key = 'ctrl+c';
        else if (buf[0] === ' ') key = 'space';
        else key = buf[0];
        buf = buf.slice(used);
        if (key === null) continue;
        // apply immediately: sub-frame input response
        if (game.toppedOut) {
          if (key === 'r') game.reset(seed);
        } else if (key === 'left') game.move(-1, 0);
        else if (key === 'right') game.move(1, 0);
        else if (key === 'down') game.softDrop();
        else if (key === 'up' || key === 'x') game.rotate(1);
        else if (key === 'z') game.rotate(-1);
        else if (key === 'a') game.rotate(2);
        else if (key === 'space') game.hardDrop();
        else if (key === 'c') game.holdSwap();
        else if (key === 'r') game.reset(seed);
        if (key === 'q' || key === 'escape' || key === 'ctrl+c') {
          cleanup();
          process.exit(0);
        }
      }
    });
  }

  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('exit', () => { screen.exit(); });

  screen.enter();
  while (running) {
    game.tick();
    draw(screen, game);
    await screen.present();
  }
}

await main();
