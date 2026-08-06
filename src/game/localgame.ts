/**
 * LocalGameController — runs the local player's game: engine + input capture +
 * frame generation (keydown/keyup/full/ige) + sending to the server + applying
 * opponent interactions (IGE). This is the heart of playing.
 */
import { EventEmitter } from 'node:events';
import {
  createGame, startGame, tick, advanceTime, receiveGarbage, NEUTRAL_INPUT,
  type Engine, type InputState, type TickEvents,
} from './engine.js';
import type { PieceType, GameOptions, InputKey } from '../types.js';

/** Maps engine input fields <-> wire ReplayKey names. */
const KEY_TO_WIRE: Record<string, string> = {
  left: 'moveLeft', right: 'moveRight', softDrop: 'softDrop', hardDrop: 'hardDrop',
  rotCW: 'rotateCW', rotCCW: 'rotateCCW', rot180: 'rotate180', hold: 'hold',
  exit: 'exit', reset: 'reset', undo: 'undo', redo: 'redo',
};

export interface ReplayFrameOut {
  type: 'keydown' | 'keyup' | 'full' | 'ige' | 'start' | 'strategy' | 'manual_target';
  frame: number;
  data: unknown;
}

export interface LocalGameEvents {
  frames: (frames: ReplayFrameOut[], provisioned: number) => void; // send game.replay
  gameover: (win: boolean) => void;
  attack: (amount: number, targets: number[]) => void;
  targeting: (targets: number[]) => void;
}

export class LocalGameController extends EventEmitter {
  engine: Engine | null = null;
  gameid = 0;
  frame = 0;
  playing = false;
  private frameBuffer: ReplayFrameOut[] = [];
  private lastProvisioned = 0;
  private fullInterval = 600;   // send a full snapshot every N frames
  private heartbeatInterval = 50; // send a (possibly empty) batch every N frames
  private keyState: InputState = { ...NEUTRAL_INPUT };

  constructor() { super(); }

  /** Start a new local game. gameid assigned by server (game.enter/game.start). */
  start(gameid: number, options: Partial<GameOptions>, seed?: number): void {
    this.gameid = gameid;
    this.engine = createGame(options, seed);
    this.frame = 0;
    this.frameBuffer = [];
    this.playing = true;
    startGame(this.engine);
    // initial frames: start + full snapshot
    this.frameBuffer.push({ type: 'start', frame: 0, data: {} });
    this.frameBuffer.push({ type: 'full', frame: 0, data: this.buildFullState() });
    this.flush(true);
  }

  /** The wire FullState for the `full` frame (opponents reconstruct our board from it). */
  private buildFullState(): unknown {
    const e = this.engine!;
    const s = e.state;
    return {
      diyusi: 0,
      stats: this.buildStats(),
      game: {
        bag: [...s.bag],
        board: s.board.map((r) => r.map((c) => (c === null ? null : c))),
        hold: { locked: s.hold.locked, piece: s.hold.piece },
        g: s.g,
        controlling: {
          inputSoftdrop: this.keyState.softDrop,
          lastshift: -1,
          lShift: { dir: -1, held: this.keyState.left, arr: 0, das: 0 },
          rShift: { dir: 1, held: this.keyState.right, arr: 0, das: 0 },
        },
        falling: s.falling ? {
          type: s.falling.type, x: s.falling.x, y: s.falling.y, r: s.falling.r,
          hy: s.falling.hy ?? 0, irs: 0, kick: 0, keys: 0, flags: 0,
          safelock: 0, lockresets: 0, rotresets: 0, skip: [], locking: s.falling.locking ?? 0,
        } : null,
        handling: s.options as unknown as Record<string, unknown>,
        playing: s.playing,
      },
    };
  }

  private buildStats(): unknown {
    const st = this.engine!.stats;
    return {
      zenlevel: 1, zenprogress: 0,
      clears: {
        singles: 0, doubles: 0, triples: 0, quads: 0, pentas: 0,
        realtspins: st.tspins, minitspins: 0, minitspinsingles: 0, tspinsingles: 0,
        minitspindoubles: 0, tspindoubles: 0, minitspintriples: 0, tspintriples: 0,
        minitspinquads: 0, tspinquads: 0, tspinpentas: 0, allclear: st.allclears,
      },
      garbage: {
        sent: st.garbage.sent, sent_nomult: st.garbage.sent, maxspike: 0, maxspike_nomult: 0,
        received: st.garbage.received, attack: st.garbage.attack, cleared: st.garbage.cleared,
      },
      pieces: st.piecesplaced, inputs: st.inputs, holds: st.holds,
      score: st.score, topcombo: st.combomax, currentcombo: st.currentcombo,
      btb: st.btb, topbtb: st.btbmax, apm: st.apm, pps: st.pps, vsscore: st.vsscore,
      kills: st.kills, time: st.currentTime,
    };
  }

  /** A key went down/up. Drives the engine + records a keydown/keyup frame. */
  setKey(key: string, down: boolean): void {
    if (!this.playing || !this.engine) return;
    const field = wireToField(key);
    if (field) (this.keyState as unknown as Record<string, boolean>)[field] = down;
    if (field) {
      this.frameBuffer.push({
        type: down ? 'keydown' : 'keyup',
        frame: this.frame,
        data: { key, subframe: 0 },
      });
    }
    if (key === 'exit' && down) this.forfeit();
  }

  /** Advance one frame (call at 60fps). */
  tick(): TickEvents | null {
    if (!this.playing || !this.engine) return null;
    this.frame++;
    const events = tick(this.engine, this.keyState);
    advanceTime(this.engine, 1);

    // handle engine events -> ige frames + outgoing attack
    if (events.lines && events.lines.attack > 0) {
      this.emit('attack', events.lines.attack, []);
    }
    if (events.gameover) {
      this.playing = false;
      this.flush(true);
      this.emit('gameover', false);
      return events;
    }

    // periodic full snapshot
    if (this.frame % this.fullInterval === 0) {
      this.frameBuffer.push({ type: 'full', frame: this.frame, data: this.buildFullState() });
    }
    // periodic heartbeat / batch flush
    if (this.frame % this.heartbeatInterval === 0 || this.frameBuffer.length >= 30) {
      this.flush(false);
    }
    return events;
  }

  /** Send a targeting IGE (which opponents to attack). */
  sendTarget(targets: number[]): void {
    this.frameBuffer.push({ type: 'ige', frame: this.frame, data: { type: 'target', targets } });
    this.emit('targeting', targets);
  }

  /** Send a garbage interaction IGE (we attacked opponents). */
  sendGarbageInteraction(amt: number, y: number, targetGameid: number): void {
    this.frameBuffer.push({
      type: 'ige', frame: this.frame,
      data: { type: 'interaction', gameid: this.gameid, target: targetGameid, amt, y },
    });
  }

  /** Apply an incoming IGE from an opponent (they attacked us / we got garbage). */
  applyIGE(ige: { type: string; data?: any }): void {
    if (!this.engine || !this.playing) return;
    if (ige.type === 'interaction' || ige.type === 'interaction_confirm') {
      const d = ige.data;
      if (d?.amt && typeof d.amt === 'number') {
        receiveGarbage(this.engine, Math.round(d.amt), Math.floor(Math.random() * (this.engine.state.options.boardwidth)));
        this.emit('garbage', d.amt);
      }
    }
  }

  forfeit(): void {
    this.playing = false;
    this.flush(true);
    this.emit('gameover', false);
  }

  /** Flush buffered frames to the server as a game.replay. */
  private flush(force: boolean): void {
    if (this.frameBuffer.length === 0 && !force) {
      // still send periodic heartbeat with provisioned counter
    }
    const frames = this.frameBuffer.splice(0, this.frameBuffer.length);
    this.lastProvisioned = this.frame;
    this.emit('frames', frames, this.frame);
  }
}

function wireToField(key: string): keyof InputState | null {
  switch (key) {
    case 'moveLeft': return 'left';
    case 'moveRight': return 'right';
    case 'softDrop': return 'softDrop';
    case 'hardDrop': return 'hardDrop';
    case 'rotateCW': return 'rotCW';
    case 'rotateCCW': return 'rotCCW';
    case 'rotate180': return 'rot180';
    case 'hold': return 'hold';
    default: return null;
  }
}
