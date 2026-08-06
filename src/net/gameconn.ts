/**
 * GameConnection — orchestrates an online versus/league game:
 * local engine (my board) <-> server frames <-> opponent reconstruction.
 */
import { EventEmitter } from 'node:events';
import { TetrioSession } from '../net/session.js';
import { LocalGameController, type ReplayFrameOut } from '../game/localgame.js';
import { OpponentTracker } from '../game/state.js';
import type { GameOptions } from '../types.js';

export interface OnlineGameEvents {
  start: (gameid: number) => void;
  end: (result: { win: boolean; reason?: string }) => void;
  opponentsChanged: () => void;
}

export class GameConnection extends EventEmitter {
  session: TetrioSession;
  controller: LocalGameController;
  opponents: OpponentTracker;
  myGameid = 0;
  myUserid: string;
  inGame = false;

  constructor(session: TetrioSession) {
    super();
    this.session = session;
    this.controller = new LocalGameController();
    this.opponents = new OpponentTracker();
    this.myUserid = session.userid ?? '';
    this.wire();
  }

  private wire(): void {
    const s = this.session;
    // outgoing frames from my controller -> server
    this.controller.on('frames', (frames: ReplayFrameOut[], provisioned: number) => {
      if (!this.inGame) return;
      this.session.send('game.replay', { gameid: this.myGameid, provisioned, frames });
    });
    this.controller.on('gameover', () => {
      // we topped out / forfeited locally
      this.emit('end', { win: false, reason: 'topout' });
    });

    // incoming server messages
    s.on('game.replay', (d: any) => this.onOpponentReplay(d));
    s.on('game.replay.state', (d: any) => this.onReplayState(d));
    s.on('game.replay.board', (d: any) => this.onReplayBoard(d));
    s.on('game.replay.end', (d: any) => this.onReplayEnd(d));
    s.on('game.score', (d: any) => this.emit('score', d));
    s.on('game.match.score', (d: any) => this.emit('matchscore', d));
    s.on('game.advance', (d: any) => this.emit('advance', d));
    s.on('game.end', (d: any) => this.onGameEnd(d));
    s.on('game.start', (d: any) => this.onGameStart(d));
    s.on('game.spectate', (d: any) => this.onSpectateList(d));
  }

  /** Enter a versus game. Called when the room/league assigns our gameid + options. */
  enterGame(gameid: number, options: Partial<GameOptions>, seed?: number): void {
    this.myGameid = gameid;
    this.inGame = true;
    this.controller.start(gameid, options, seed);
    this.emit('start', gameid);
  }

  /** Player input -> controller (and thus -> server frames). */
  setKey(key: string, down: boolean): void {
    if (this.inGame) this.controller.setKey(key, down);
  }

  tick(): void {
    if (this.inGame) this.controller.tick();
  }

  /** When we spectate, the server sends the watchable game list; scope each game's frames. */
  private onSpectateList(d: any): void {
    const players = d?.players ?? [];
    for (const p of players) {
      const gid = p?.gameid;
      if (gid && gid !== this.myGameid) {
        this.session.scopeStart(gid);
        // pre-register the view with the userid so we can label it
        this.opponents.setFullState(gid, {}, { userid: p.userid, username: p.username });
      }
    }
  }

  private onOpponentReplay(d: any): void {
    // an opponent's frame batch
    const gameid = d?.gameid;
    if (gameid === undefined || gameid === this.myGameid) return;
    const frames = d?.frames ?? [];
    for (const frame of frames) {
      if (frame.type === 'ige') this.controller.applyIGE(frame.data);
      else this.opponents.applyFrame(gameid, frame);
    }
    this.emit('opponentsChanged');
  }

  private onReplayState(d: any): void {
    const gameid = d?.gameid;
    if (gameid === this.myGameid) return;
    this.opponents.setFullState(gameid, d?.data ?? {}, {});
    this.emit('opponentsChanged');
  }

  private onReplayBoard(d: any): void {
    // compact board update (game.replay.board)
    const gameid = d?.gameid;
    if (gameid === this.myGameid) return;
    if (d?.data?.board) {
      const view = this.opponents.views.get(gameid);
      if (view) view.board = d.data.board;
    }
    this.emit('opponentsChanged');
  }

  private onReplayEnd(d: any): void {
    const gameid = d?.gameid;
    this.opponents.markDead(gameid);
    this.emit('opponentsChanged');
  }

  private onGameStart(d: any): void {
    this.emit('gamestart', d);
  }

  private onGameEnd(d: any): void {
    this.inGame = false;
    this.emit('end', { win: d?.win ?? false, reason: d?.reason });
  }

  leave(): void {
    this.inGame = false;
    this.controller.forfeit();
    this.opponents.clear();
  }
}
