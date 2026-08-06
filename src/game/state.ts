/**
 * OpponentTracker — reconstructs other players' boards from their frame streams.
 *
 * TETR.IO is deterministic-lockstep: each client sends its inputs (keydown/keyup frames),
 * and opponents simulate the same game locally using the shared seed. `full` frames are
 * periodic authoritative snapshots we resync to (so drift self-corrects).
 *
 * For the MVP this is best-effort: we render the latest known board (from the most recent
 * `full`/state snapshot) and nudge it with inputs. Exactness is a polish item.
 */
import { createGame, startGame, tick, type Engine } from './engine.js';
import type { BoardGrid, GameOptions } from '../types.js';

export interface OpponentView {
  gameid: number;
  userid?: string;
  username?: string;
  board: BoardGrid | null;
  alive: boolean;
  engine: Engine | null;
  lastFrame: number;
}

export class OpponentTracker {
  views = new Map<number, OpponentView>();

  /** Register a game's initial full state (from game.replay.state / a `full` frame). */
  setFullState(gameid: number, full: { game?: any }, meta?: { userid?: string; username?: string }): void {
    const g = full.game ?? {};
    let view = this.views.get(gameid);
    if (!view) {
      view = { gameid, board: null, alive: true, engine: null, lastFrame: 0, ...meta };
      this.views.set(gameid, view);
    }
    if (g.board) view.board = g.board as BoardGrid;
    // (Re)create the engine from the snapshot options so simulation matches.
    if (g.setoptions) {
      view.engine = createGame(g.setoptions as Partial<GameOptions>, g.setoptions.seed);
      if (g.board) view.engine.state.board = g.board.map((r: unknown[]) => r.slice());
      startGame(view.engine);
    }
  }

  /** Apply a frame to a game's reconstruction. */
  applyFrame(gameid: number, frame: { type: string; frame: number; data: any }): void {
    const view = this.views.get(gameid);
    if (!view) return;
    view.lastFrame = Math.max(view.lastFrame, frame.frame);
    switch (frame.type) {
      case 'full':
        if (frame.data?.game?.board) {
          view.board = frame.data.game.board as BoardGrid;
          if (view.engine) view.engine.state.board = (frame.data.game.board as any[][]).map((r) => r.slice());
        }
        break;
      case 'keydown':
      case 'keyup':
        // Drive the opponent's simulated engine with their input.
        if (view.engine) {
          const key = frame.data?.key;
          const down = frame.type === 'keydown';
          applyWireKey(view.engine, key, down);
        }
        break;
      case 'ige':
        // game events (targeting, garbage) — affect the opponent's board indirectly.
        break;
    }
  }

  /** Tick all opponent engines forward (keeps them animating between snapshots). */
  tickAll(): void {
    for (const view of this.views.values()) {
      if (view.engine && view.alive) {
        tick(view.engine, currentInput(view.engine));
        view.board = view.engine.state.board;
      }
    }
  }

  markDead(gameid: number): void {
    const view = this.views.get(gameid);
    if (view) view.alive = false;
  }

  remove(gameid: number): void { this.views.delete(gameid); }
  clear(): void { this.views.clear(); }
}

function applyWireKey(engine: Engine, key: string, down: boolean): void {
  // Store held-state on the engine for the next tick. We stash it on a side channel.
  const anyE = engine as unknown as { __held?: Record<string, boolean> };
  anyE.__held = anyE.__held ?? {};
  anyE.__held[key] = down;
}

function currentInput(engine: Engine) {
  const anyE = engine as unknown as { __held?: Record<string, boolean> };
  const h = anyE.__held ?? {};
  return {
    left: !!h.moveLeft, right: !!h.moveRight, softDrop: !!h.softDrop, hardDrop: !!h.hardDrop,
    rotCW: !!h.rotateCW, rotCCW: !!h.rotateCCW, rot180: !!h.rotate180, hold: !!h.hold,
  };
}
