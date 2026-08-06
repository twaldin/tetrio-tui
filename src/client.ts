/**
 * High-level TETR.IO client controller.
 * Wraps TetrioSession and maintains observable app state (room, players, league, games)
 * for the TUI to render. Renderer-agnostic — subscribe to events / read state.
 */
import { EventEmitter } from 'node:events';
import { TetrioSession } from './net/session.js';

export interface RoomPlayer {
  _id: string;
  username: string;
  anon: boolean;
  bot: boolean;
  role: string;
  xp: number;
  record: { games: number; wins: number; streak: number };
  bracket: 'player' | 'spectator';
  ready: boolean;
  supporter: boolean;
  country: string | null;
}

export interface RoomState {
  id: string;
  name: string;
  type: string;
  state: string;         // 'lobby' | 'ingame'
  public: boolean;
  owner: string;
  players: RoomPlayer[];
  options: Record<string, any>;
  match: Record<string, any>;
  allowChat: boolean;
}

export interface ChatMessage {
  content: string;
  user?: { username: string; _id: string; role: string };
  system?: boolean;
  ts: number;
}

export interface LeagueMatchInfo {
  opponent?: { username: string; _id: string; tr?: number; rank?: string };
  [key: string]: unknown;
}

export class TetrioClient extends EventEmitter {
  session: TetrioSession;
  room: RoomState | null = null;
  chat: ChatMessage[] = [];
  inLeagueQueue = false;
  leagueMatch: LeagueMatchInfo | null = null;
  /** gameids of live games we're scoping, gameid -> decoded state (filled by game/state layer). */
  games = new Map<number, any>();
  selfBracket: 'player' | 'spectator' = 'player';

  constructor(session: TetrioSession) {
    super();
    this.session = session;
    this.wire();
  }

  get userid(): string | null { return this.session.userid; }
  get myUsername(): string { return this.session.user?.user?.username ?? this.session.auth?.userid ?? 'you'; }

  private wire(): void {
    const s = this.session;
    s.on('room.update', (d: any) => this.onRoomUpdate(d));
    s.on('room.update.player.add', (p: any) => this.onPlayerAdd(p));
    s.on('room.update.player.remove', (d: any) => this.onPlayerRemove(d));
    s.on('room.update.bracket', (d: any) => this.onBracketUpdate(d));
    s.on('room.join', (d: any) => this.emit('room.join', d));
    s.on('room.leave', () => this.onRoomLeave());
    s.on('room.chat', (d: any) => this.onChat(d));
    s.on('room.update.host', (d: any) => this.emit('room.host', d));
    s.on('room.start', (d: any) => this.emit('room.start', d));
    s.on('room.abort', (d: any) => this.emit('room.abort', d));

    s.on('league.match', (d: any) => { this.leagueMatch = d; this.emit('league.match', d); });
    s.on('league.countdown', (d: any) => this.emit('league.countdown', d));
    s.on('league.enter', () => { this.inLeagueQueue = true; this.emit('league.enter'); });
    s.on('league.leave', () => { this.inLeagueQueue = false; this.emit('league.leave'); });

    // game lifecycle events (decoded frames arrive via the game/state layer)
    for (const ev of ['game.enter', 'game.start', 'game.ready', 'game.end', 'game.score', 'game.abort', 'game.replay.state', 'game.replay.end', 'game.match', 'game.match.score']) {
      s.on(ev, (d: any, id?: number) => this.emit(ev, d, id));
    }

    s.on('kick', (r: string) => this.emit('kick', r));
    s.on('close', (r: string) => this.emit('close', r));
    s.on('migrating', (m: any) => this.emit('migrating', m));
  }

  private onRoomUpdate(d: any): void {
    if (!d) return;
    this.room = {
      id: d.id ?? this.room?.id,
      name: d.name ?? '',
      type: d.type ?? 'custom',
      state: d.state ?? 'lobby',
      public: !!d.public,
      owner: d.owner ?? '',
      players: d.players ?? this.room?.players ?? [],
      options: d.options ?? {},
      match: d.match ?? {},
      allowChat: d.allowChat ?? true,
    };
    if (d.id && this.room) this.room.id = d.id;
    this.emit('room.update', this.room);
  }

  private onPlayerAdd(p: any): void {
    if (!this.room || !p) return;
    if (!this.room.players.find((x) => x._id === p._id)) this.room.players.push(p);
    this.emit('room.player.add', p);
    this.emit('room.update', this.room);
  }

  private onPlayerRemove(d: any): void {
    if (!this.room || !d) return;
    const id = typeof d === 'string' ? d : d._id ?? d.userid;
    this.room.players = this.room.players.filter((x) => x._id !== id);
    this.emit('room.player.remove', d);
    this.emit('room.update', this.room);
  }

  private onBracketUpdate(d: any): void {
    if (!this.room || !d) return;
    const p = this.room.players.find((x) => x._id === (d._id ?? d.userid));
    if (p) p.bracket = d.bracket;
    this.emit('room.update', this.room);
  }

  private onRoomLeave(): void {
    this.room = null;
    this.games.clear();
    this.emit('room.leave');
  }

  private onChat(d: any): void {
    const msg: ChatMessage = { content: d?.content ?? '', user: d?.user, system: d?.system, ts: Date.now() };
    this.chat.push(msg);
    if (this.chat.length > 200) this.chat.shift();
    this.emit('chat', msg);
  }

  // --- actions ---
  sendChat(content: string): void { this.session.send('room.chat.send', content); }
  joinRoom(id: string): void { this.session.joinRoom(id); }
  leaveRoom(): void { this.session.leaveRoom(); }
  createRoom(config?: Record<string, unknown>): void { this.session.createRoom(config); }
  switchBracket(bracket: 'player' | 'spectator'): void {
    this.selfBracket = bracket;
    this.session.setBracket(bracket);
  }
  spectate(): void { this.session.spectate(); }
  gameReady(ready = true): void { this.session.gameReady(ready); }
  leagueEnter(): void { this.session.leagueEnter(); }
  leagueLeave(): void { this.session.leagueLeave(); }
  leagueReady(): void { this.session.leagueReady(); }
  scopeGame(gameid: number): void { this.session.scopeStart(gameid); }
  unscopeGame(gameid: number): void { this.session.scopeEnd(gameid); }
}
