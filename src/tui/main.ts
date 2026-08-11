/** Main app controller: full webapp menu tree + screen hosting. */
import { App, type Screen } from './app.js';
import { MenuScreen, type MenuNode, type MenuItem } from './screens/menu.js';
import { GameScreen } from './screens/game.js';
import { THEME, center } from './draw.js';
import { TetrioSession } from '../net/session.js';
import { TetrioClient } from '../client.js';
import { LocalGameController } from '../game/localgame.js';
import { OpponentTracker } from '../game/state.js';
import { GameConnection } from '../net/gameconn.js';
import * as fs from 'node:fs';
import { LeagueScreen } from './screens/league.js';
import { RoomListingScreen, RoomLobbyScreen } from './screens/lobby.js';
import { ChannelApi } from '../net/channel.js';
import { createChannelScreen } from './screens/channel.js';
import { ConfigStore, type HandlingConfig } from '../config/store.js';
import { createConfigMenuNode } from './screens/config.js';
import { setTheme } from './themes.js';
import { setPieceStyle } from './pieceStyles.js';
import { setBorderStyle } from './draw.js';
import { setEffectsEnabled, setMinimalMode } from './renderPrefs.js';
import type { GameOptions } from '../types.js';

export class TetrioApp {
  app: App;
  session: TetrioSession;
  client: TetrioClient;
  opponents: OpponentTracker;
  gameconn: GameConnection;
  private channelApi = new ChannelApi();
  /** persisted config (public read for launch-flow decisions) */
  readonly configStore = new ConfigStore();

  constructor(app: App, session: TetrioSession) {
    // debug dump set up in showHome
    this.app = app;
    this.session = session;
    this.client = new TetrioClient(session);
    this.opponents = new OpponentTracker();
    this.gameconn = new GameConnection(session);
    this.gameconn.handling = this.configStore.handling as unknown as Partial<GameOptions>;
    this.wireGame();
    this.setupDebugDump();
    this.applyConfig();
    session.on('room.join', (d: any) => { this.lastRoomEvent = `join ack: ${JSON.stringify(d).slice(0, 80)}`; });
    session.on('room.update', (d: any) => { this.lastRoomEvent = `update: ${d?.name} ${d?.state}`; });
    session.on('server.migrate', (d: any) => { this.lastRoomEvent = `migrate ${d?.endpoint}`; });
    session.on('kick', (r: any) => { this.lastRoomEvent = `KICK ${r}`; });
    session.on('nope' as any, (d: any) => { this.lastRoomEvent = `NOPE ${JSON.stringify(d)}`; });
  }

  get connected(): boolean { return !!this.session.ribbon?.isConnected(); }
  get loggedIn(): boolean { return this.session.user?.user?.role !== 'anon' && !!this.session.user; }

  private lastRoomEvent = '';
  private push(s: Screen): void { this.app.push(s); }

  private setupDebugDump(): void {
    if (!process.env.TUI_DEBUG) return;
    setInterval(() => {
      const state = {
        connected: this.connected,
        loggedIn: this.loggedIn,
        ribbonState: this.session.ribbon ? { connected: this.session.ribbon.isConnected(), id: this.session.ribbon.id, reason: (this.session.ribbon as any).lastCloseReason } : null,
        lastRoomEvent: this.lastRoomEvent,
        recvid: (this.session.ribbon as any)?.recvid,
        msgLog: this.session.msgLog.slice(-20),
        room: this.client.room ? { id: this.client.room.id, name: this.client.room.name, players: this.client.room.players.length } : null,
        userid: this.client.userid,
        screenStack: (this.app as any)['stack']?.map((s: any) => s.name),
      };
      fs.writeFileSync('/tmp/app_debug.json', JSON.stringify(state, null, 1));
    }, 1000);
  }
  private menu(node: MenuNode): MenuScreen {
    return new MenuScreen(node, {
      breadcrumb: [node.title],
      onBack: () => {
        // At the root (HOME), escape quits the app. In submenus, escape pops back.
        if (node.title === 'HOME') { this.session.close(); process.exit(0); }
        else this.app.pop();
      },
      pushScreen: (s) => this.push(s),
      popScreen: () => this.app.pop(),
    });
  }

  showHome(): void {
    const online = '';
    const home: MenuNode = {
      title: 'HOME',
      items: [
        { id: 'multi', label: 'MULTIPLAYER', sub: 'play online with friends and foes', color: THEME.accent, submenu: this.multiplayerMenu() },
        { id: 'solo', label: 'SOLO', sub: 'challenge yourself and top the leaderboards', color: THEME.solo, submenu: this.soloMenu() },
        { id: 'channel', label: 'TETRA CHANNEL', sub: 'leaderboards, achievements, replays and more', color: THEME.channel, submenu: this.channelMenu() },
        { id: 'config', label: 'CONFIG', sub: 'tweak your TETR.IO experience', color: THEME.config, submenu: this.configMenu() },
      ],
    };
    this.app.replace(this.menu(home));
  }

  private multiplayerMenu(): MenuNode {
    return {
      title: 'MULTIPLAYER', color: THEME.accent,
      items: [
        { id: 'quickplay', label: 'QUICK PLAY', sub: 'scale the tower! how far can you get?', color: [200, 120, 60], action: () => this.notImpl('QUICK PLAY') },
        { id: 'league', label: 'TETRA LEAGUE', sub: 'fight players of your skill in ranked duels', color: THEME.league, disabled: !this.loggedIn, action: () => this.launchLeague() },
        { id: 'custom', label: 'CUSTOM GAME', sub: 'create public and private rooms', color: THEME.solo, action: () => this.launchRoomCreate() },
        { id: 'listing', label: 'ROOM LISTING', sub: 'join public games', color: THEME.channel, action: () => this.launchRoomListing() },
      ],
    };
  }

  private soloMenu(): MenuNode {
    return {
      title: 'SOLO', color: THEME.solo,
      items: [
        { id: '40l', label: '40 LINES', sub: 'clear 40 lines as fast as you can', color: THEME.solo, action: () => this.launchSolo('40l') },
        { id: 'blitz', label: 'BLITZ', sub: 'rack up as much score as possible in 2 minutes', color: THEME.warn, action: () => this.launchSolo('blitz') },
        { id: 'zenith', label: 'QUICK PLAY', sub: 'scale the tower (requires online)', color: [200, 120, 60], action: () => this.notImpl('QUICK PLAY') },
        { id: 'zen', label: 'ZEN', sub: 'just relax and stack', color: THEME.good, action: () => this.launchSolo('zen') },
        { id: 'custom', label: 'PRACTICE', sub: 'versus practice vs no opponent', color: THEME.accent2, action: () => this.launchSolo('practice') },
      ],
    };
  }

  private channelMenu(): MenuNode {
    return {
      title: 'TETRA CHANNEL', color: THEME.channel,
      items: [
        {
          id: 'channel', label: 'OPEN TETRA CHANNEL', sub: 'leaderboards, achievements, replays and more',
          color: THEME.channel,
          action: () => this.push(createChannelScreen({
            api: this.channelApi,
            pushScreen: (s) => this.push(s),
            popScreen: () => this.app.pop(),
          })),
        },
      ],
    };
  }

  private configMenu(): MenuNode {
    return createConfigMenuNode({
      store: this.configStore,
      onBack: () => this.app.pop(),
      onChange: () => this.applyConfig(),
    });
  }

  /** Apply the persisted config (theme, handling, keybinds, piece style) to the running app. */
  private applyConfig(): void {
    const cfg = this.configStore.get();
    if (cfg.video?.theme) setTheme(cfg.video.theme);
    if (cfg.video?.pieceStyle) setPieceStyle(cfg.video.pieceStyle);
    if (cfg.video?.borderStyle) setBorderStyle(cfg.video.borderStyle);
    setEffectsEnabled(cfg.video?.effects ?? true);
    setMinimalMode(cfg.video?.minimal ?? false);
    this.gameconn.handling = cfg.handling as unknown as Partial<GameOptions>; // next versus game gets it
    this.app.requestRender();
  }

  // --- launchers ---
  private launchSolo(mode: string): void {
    const ctrl = new LocalGameController();
    const options: Partial<GameOptions> = soloOptionsFor(mode, this.configStore.handling);
    // offline: no server — start immediately with our own gameid + seed
    const objective = mode === '40l' ? { type: 'lines' as const, count: 40 } : mode === 'blitz' ? { type: 'time' as const, seconds: 120 } : undefined;
    const seed = process.env.TUI_SEED ? parseInt(process.env.TUI_SEED, 10) : Math.floor(Math.random() * 0x7fffffff);
    ctrl.start(1, options, seed, objective);
    const label = { '40l': '40 LINES', blitz: 'BLITZ', zen: 'ZEN', practice: 'PRACTICE' }[mode] ?? mode.toUpperCase();
    const screen = new GameScreen({
      controller: ctrl, opponents: this.opponents, onExit: () => { ctrl.forfeit(); this.app.pop(); }, modeLabel: label, autoPlay: process.env.TUI_AUTOPLAY === '1' || process.argv.includes('--autoplay'),
    });
    screen.setKeymap(this.gameKeymap()); // apply the configured keybinds
    this.push(screen);
  }

  /** Build the game keymap (key -> action) by inverting the configured keybinds (action -> keys). */
  private gameKeymap(): Record<string, string> {
    const kb = this.configStore.get().keybinds as unknown as Record<string, string[]>;
    const map: Record<string, string> = { escape: 'exit' };
    for (const [action, keys] of Object.entries(kb)) {
      if (!Array.isArray(keys)) continue;
      for (const key of keys) if (typeof key === 'string' && key) map[key.toLowerCase()] = action;
    }
    return map;
  }

  private launchLeague(): void {
    if (!this.loggedIn) { this.notImpl('TETRA LEAGUE\n(needs a registered account)'); return; }
    this.push(new LeagueScreen(this.client, {
      onGameStart: () => this.enterVersusGame('TETRA LEAGUE'),
      onLeave: () => this.app.pop(),
    }));
  }

  private launchRoomCreate(): void {
    if (!this.loggedIn) { this.notImpl('CUSTOM GAME\n(anonymous users may not create rooms)'); return; }
    this.session.send('room.create', { auto: false });
    this.push(new RoomLobbyScreen(this.client, {
      onGameStart: () => this.enterVersusGame('CUSTOM GAME'),
      onLeave: () => this.app.pop(),
    }));
  }

  private launchRoomListing(): void {
    this.push(new RoomListingScreen(this.client, {
      onJoin: (id) => {
        this.client.joinRoom(id);
        this.push(new RoomLobbyScreen(this.client, {
          onGameStart: () => this.enterVersusGame('CUSTOM GAME'),
          onLeave: () => this.app.pop(),
        }));
      },
      onSpectate: (id) => {
        this.client.joinRoom(id);
        this.client.switchBracket('spectator');
        this.client.spectate();
        this.enterVersusGame('SPECTATING');
      },
      onBack: () => this.app.pop(),
    }));
  }

  /** Enter an online versus/league game: start the GameConnection + show the game screen. */
  private enterVersusGame(label: string): void {
    // The GameConnection begins when the server assigns our gameid (wireGame handles it).
    // Show the versus game screen; it renders my board + opponents.
    const screen = new GameScreen({
      controller: this.gameconn.controller,
      opponents: this.gameconn.opponents,
      onExit: () => { this.gameconn.leave(); this.session.send('game.forfeit'); this.app.pop(); },
      modeLabel: label,
    });
    screen.setKeymap(this.gameKeymap()); // apply the configured keybinds
    this.push(screen);
  }

  /** Wire the GameConnection to the session for gameid assignment + game events. */
  private wireGame(): void {
    // The GameConnection already wires session events. We add the gameid-assignment hook here:
    // when the server starts a game we're in, enter it (game.enter -> gameid -> start controller).
    this.session.on('game.start', (d: any) => this.onVersusStart(d));
    this.session.on('game.match', (d: any) => this.onVersusStart(d));
    this.client.on('room.update', (room: any) => { if (room?.state === 'ingame') this.maybeEnterRoomGame(); });
    this.session.on('game.replay.state', (d: any) => { if (!this.gameconn.inGame && d?.gameid) this.onVersusStart(d); });
  }

  private onVersusStart(d: any): void {
    if (this.gameconn.inGame) return;
    // Find our gameid from the match's player list (match my userid).
    const players = d?.players ?? d?.users ?? [];
    let myGameid = 0;
    const me = players.find((p: any) => p.userid === this.client.userid || p._id === this.client.userid || p.id === this.client.userid);
    if (me) myGameid = me.gameid ?? me.id ?? 0;
    if (!myGameid) myGameid = d?.gameid ?? d?.game?.gameid ?? 1;
    const options = d?.options ?? d?.game?.setoptions ?? d?.setoptions ?? {};
    const seed = options?.seed;
    this.gameconn.enterGame(myGameid, options, seed);
    // Scope all opponent games so we receive their frames.
    for (const p of players) {
      const gid = p.gameid ?? p.id;
      if (gid && gid !== myGameid) this.session.scopeStart(gid);
    }
  }

  /** When a room game begins and I'm a player, emit game.enter to join my game instance. */
  private maybeEnterRoomGame(): void {
    const room = this.client.room;
    if (!room) return;
    const me = room.players.find((p) => p._id === this.client.userid);
    if (me && me.bracket === 'player' && room.state === 'ingame' && !this.gameconn.inGame) {
      this.session.send('game.enter', {});
    }
  }

  private notImpl(name: string): void {
    const scr: Screen = {
      name: 'todo',
      render: (buf) => {
        buf.fillRect(0, 0, buf.width, buf.height, ' ', { bg: THEME.bg });
        center(buf, Math.floor(buf.height / 2) - 1, name, { fg: THEME.accent, bold: true });
        center(buf, Math.floor(buf.height / 2) + 1, this.connected ? 'coming online…' : 'requires online connection', { fg: THEME.dim });
        center(buf, buf.height - 3, 'esc back', { fg: THEME.dim });
      },
      onKey: (ev) => { if (ev.key === 'escape') this.app.pop(); },
    };
    this.push(scr);
  }
}

function soloOptionsFor(mode: string, handling?: HandlingConfig): Partial<GameOptions> {
  const base: Partial<GameOptions> = {
    boardwidth: 10, boardheight: 20, g: 0.02, locktime: 30, lockresets: 15,
    allow180: true, allow_harddrop: true, hasgarbage: false, bagtype: '7-bag',
    kickset: 'SRS+', spinbonuses: 'all-mini+', combotable: 'multiplier',
    garbagemultiplier: 1, nextcount: 5, infinite_hold: false,
  };
  if (mode === 'zen') { base.g = 0.0; }
  // player handling config is applied 1:1 — this is what the game FEELS like.
  // (frames @60fps, fractional allowed, matching TETR.IO's HANDLING sliders)
  if (handling) Object.assign(base, handling);
  return base;
}
