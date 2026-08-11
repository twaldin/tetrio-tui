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
  type: 'keydown' | 'keyup' | 'full' | 'end' | 'ige' | 'start' | 'strategy' | 'manual_target';
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
  /** Optional objective: clear N lines (40L) or survive N seconds (Blitz). */
  objective: { type: 'lines'; count: number } | { type: 'time'; seconds: number } | null = null;
  /** 'playing' | 'win' (objective met) | 'topout'. */
  result: 'playing' | 'win' | 'topout' = 'playing';
  /** Final time in frames when the game ended (60 fps). */
  finalTime = 0;

  constructor() { super(); }

  /** Start a new local game. gameid assigned by server (game.enter/game.start). */
  private _startParams: { options: Partial<GameOptions>; seed?: number; objective?: { type: 'lines'; count: number } | { type: 'time'; seconds: number } } | null = null;

  start(gameid: number, options: Partial<GameOptions>, seed?: number, objective?: { type: 'lines'; count: number } | { type: 'time'; seconds: number }): void {
    this._startParams = { options, seed, objective };
    this.gameid = gameid;
    this.engine = createGame(options, seed);
    this.frame = 0;
    this.frameBuffer = [];
    this.playing = true;
    this.objective = objective ?? null;
    this.result = 'playing';
    this.finalTime = 0;
    startGame(this.engine);
    // initial frames: start + full snapshot. NOTE: no immediate flush — the official client
    // first flushes at ~frame 50 (provisioned = current frame). Flushing at frame 0 gets the
    // batch REJECTED by the server (observed live).
    this.frameBuffer.push({ type: 'start', frame: 0, data: {} });
    this.frameBuffer.push({ type: 'full', frame: 0, data: this.buildFullState() });
  }

  /** Restart the current game with the same options/seed/objective (the retry/reset key). */
  restart(): void {
    if (this._startParams) this.start(this.gameid, this._startParams.options, this._startParams.seed, this._startParams.objective);
  }

  /** The wire FullState for the `full` frame (opponents reconstruct our board from it).
   *  Encoded by NetCodec FullState.encode — every field it reads must be present and
   *  wire-legal (piece letters; garbage cells as 'gb'; irs/ihs in off/hold/tap). */
  private buildFullState(): unknown {
    const e = this.engine!;
    const s = e.state;
    const o = s.options as unknown as Record<string, unknown>;
    const ixs = (m: unknown): string => (m === 'none' ? 'off' : m === 'auto' ? 'hold' : (m as string) ?? 'tap');
    return {
      diyusi: 0,
      stats: this.buildStats(),
      game: {
        bag: [...s.bag],
        board: s.board.map((r) => r.map((c) => (c === null ? null : c === 'g' ? 'gb' : c))),
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
        handling: {
          arr: o.arr ?? 2, sdf: o.sdf ?? 6, safelock: o.safelock ?? true,
          cancel: o.cancel ?? false, may20g: o.may20g ?? true,
          das: o.das ?? 10, dcd: o.dcd ?? 2,
          irs: ixs(o.irs), ihs: ixs(o.ihs),
        },
        playing: s.playing,
      },
    };
  }

  /** Wire Stats struct (NetCodec Stats.encode) — every field it reads is required. */
  private buildStats(): unknown {
    const st = this.engine!.stats;
    return {
      lines: st.lines, level_lines: st.lines, level_lines_needed: 0,
      inputs: st.inputs, holds: st.holds, score: st.score, level: st.level ?? 1,
      combo: st.currentcombo ?? 0, topcombo: st.combomax ?? 0, combopower: 0,
      btb: st.btb ?? 0, topbtb: st.btbmax ?? 0, btbpower: 0,
      tspins: st.tspins ?? 0, piecesplaced: st.piecesplaced ?? 0,
      clears: {
        singles: 0, doubles: 0, triples: 0, quads: 0, pentas: 0,
        realtspins: st.tspins ?? 0, minitspins: 0, minitspinsingles: 0, tspinsingles: 0,
        minitspindoubles: 0, tspindoubles: 0, minitspintriples: 0, tspintriples: 0,
        minitspinquads: 0, tspinquads: 0, tspinpentas: 0, allclear: st.allclears ?? 0,
      },
      garbage: {
        sent: st.garbage.sent, sent_nomult: st.garbage.sent, maxspike: 0, maxspike_nomult: 0,
        received: st.garbage.received, attack: st.garbage.attack, cleared: st.garbage.cleared,
      },
      kills: st.kills ?? 0,
      finesse: { combo: 0, faults: 0, perfectpieces: 0 },
      zenith: {
        altitude: 0, rank: 0, peakrank: 0, avgrankpts: 0, totalbonus: 0,
        targetingfactor: 0, targetinggrace: 0, floor: 0,
        revives: 0, revivesTotal: 0, speedrun: false, speedrun_seen: false,
        splits: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    };
  }

  /** The wire EndStats for the `end` frame — tells the server our game is over + final state. */
  private buildEndStats(reason: 'topout' | 'forfeit' | 'winner'): unknown {
    const st = this.engine?.stats;
    const full = this.buildFullState() as { diyusi: number; stats: unknown; game: unknown };
    return {
      successful: reason === 'winner',
      gameoverreason: reason,
      killer: { gameid: 0, type: 'sizzle', username: '' },
      options: {}, // PlayerOptionsDelta: no changes from the assigned options
      aggregatestats: { apm: st?.apm ?? 0, pps: st?.pps ?? 0, vsscore: st?.vsscore ?? 0 },
      game: full.game,
      stats: full.stats,
      diyusi: full.diyusi,
    };
  }


  /** Directly set the input state (programmatic play / solver). Bypasses the tap model. */
  setInput(input: Partial<InputState>): void {
    Object.assign(this.keyState, input);
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
      this.result = 'topout';
      this.finalTime = this.engine.stats.currentTime;
      this.pushEndFrame('topout');
      this.flush(true);
      this.emit('gameover', false);
      return events;
    }
    // objective: clear N lines (40L) or survive N seconds (Blitz)
    if (this.objective) {
      const met = this.objective.type === 'lines'
        ? this.engine.stats.lines >= this.objective.count
        : this.engine.stats.currentTime >= this.objective.seconds * 60; // time in engine frames (60fps)
      if (met) {
        this.playing = false;
        this.result = 'win';
        this.finalTime = this.engine.stats.currentTime;
        this.pushEndFrame('winner');
        this.flush(true);
        this.emit('gameover', true);
        return events;
      }
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

  /** Queue the `end` frame (EndStats) so the server records the game result. */
  private pushEndFrame(reason: 'topout' | 'forfeit' | 'winner'): void {
    if (!this.engine) return;
    try {
      this.frameBuffer.push({ type: 'end', frame: this.frame, data: this.buildEndStats(reason) });
    } catch { /* never let stats encoding kill the game loop */ }
  }

  forfeit(): void {
    if (this.playing) this.pushEndFrame('forfeit');
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
