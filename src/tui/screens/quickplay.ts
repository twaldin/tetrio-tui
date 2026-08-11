/** QUICK PLAY lobby: the X-QP system room (Zenith tower climb).
 *
 * Flow (reverse-engineered from the live client + verified live):
 *   1. room.join "X-QP"            -> server migrates to the QP worker, room.update (state always 'ingame')
 *   2. game.enter {mods:[],tutorial:false} -> server assigns our game via game.replay.enter (player.userid === us)
 *   3. we play; the server simulates our input frames authoritatively and ends the game
 *      (game.replay.end for our gameid). game.match.score carries the tower leaderboard.
 *   4. other players' games stream via game.replay.enter broadcasts; we scope a few
 *      (game.scope.start) to render their boards.
 */
import type { RenderBuffer, Screen, KeyEvent } from '../app.js';
import { THEME, center, drawBox } from '../draw.js';
import type { TetrioClient } from '../../client.js';

export interface QuickPlayScreenOpts {
  onGameStart: () => void;
  onLeave: () => void;
}

export class QuickPlayScreen implements Screen {
  readonly name = 'quickplay';
  private client: TetrioClient;
  private onGameStart: () => void;
  private onLeave: () => void;
  state: 'lobby' | 'starting' | 'ingame' | 'ended' = 'lobby';
  private playersTotal = 0;
  private scores: any[] = [];
  private names = new Map<number, string>();
  private myGameid = 0;
  private elapsed = 0;
  private lastEndReason = '';

  constructor(client: TetrioClient, opts: QuickPlayScreenOpts) {
    this.client = client;
    this.onGameStart = opts.onGameStart;
    this.onLeave = opts.onLeave;
    const s = client.session;
    s.on('game.replay.enter', this.onReplayEnter);
    s.on('game.replay.end', this.onReplayEnd);
    s.on('game.match.score', this.onMatchScore);
    client.on('room.update', this.onRoomUpdate);
    client.on('room.leave', this.onRoomLeave);
  }

  private onRoomUpdate = (room: any): void => {
    if (room?.id === 'X-QP') this.playersTotal = room.players?.length ?? this.playersTotal;
  };
  private onRoomLeave = (): void => { this.cleanup(); };
  private onMatchScore = (d: any): void => {
    const sb = d?.sb ?? [];
    if (Array.isArray(sb)) this.scores = sb.slice(0, 200);
  };
  private onReplayEnter = (d: any): void => {
    const p = d?.player;
    if (!p) return;
    if (p.userid === this.client.userid) {
      this.myGameid = p.gameid;
      this.state = 'ingame';
      this.onGameStart();
    } else {
      this.names.set(p.gameid, p.options?.username ?? String(p.userid).slice(0, 8));
      if (this.names.size > 500) this.names.clear();
    }
  };
  private onReplayEnd = (d: any): void => {
    if (d?.gameid === this.myGameid && this.state === 'ingame') {
      this.state = 'ended';
      this.lastEndReason = d?.data?.gameoverreason ?? 'topout';
    }
  };

  private cleanup(): void {
    const s = this.client.session;
    s.off('game.replay.enter', this.onReplayEnter);
    s.off('game.replay.end', this.onReplayEnd);
    s.off('game.match.score', this.onMatchScore);
    this.client.off('room.update', this.onRoomUpdate);
    this.client.off('room.leave', this.onRoomLeave);
  }

  /** Start (or restart) a climb: ask the server for a game. */
  startClimb(): void {
    if (this.state === 'starting' || this.state === 'ingame') return;
    this.state = 'starting';
    this.elapsed = 0;
    this.client.session.send('game.enter', { mods: [], tutorial: false });
  }

  onShow(): void {
    // returning from a finished game: ready for another climb
    if (this.state === 'ingame') this.state = 'ended';
  }

  onKey(ev: KeyEvent): void {
    if (ev.type !== 'down') return;
    if (ev.key === 'return') this.startClimb();
    else if (ev.key === 'escape') {
      this.cleanup();
      this.client.leaveRoom();
      this.onLeave();
    }
  }

  update(dtMs: number): void {
    if (this.state === 'starting') this.elapsed += dtMs;
  }

  render(buf: RenderBuffer): void {
    buf.fillRect(0, 0, buf.width, buf.height, ' ', { bg: THEME.bg });
    center(buf, 2, 'QUICK PLAY', { fg: [200, 120, 60] as [number, number, number], bold: true });
    center(buf, 3, 'scale the tower! how far can you get?', { fg: THEME.dim });

    const room = this.client.room;
    const w = Math.min(56, buf.width - 12);
    const x = Math.floor((buf.width - w) / 2);
    drawBox(buf, x, 5, w, 5, { fg: THEME.border });
    buf.drawText(x + 2, 6, `room: ${room?.name ?? 'QUICK PLAY'} (X-QP)`, { fg: THEME.text });
    buf.drawText(x + 2, 7, `players here: ${this.playersTotal || room?.players?.length || '…'}`, { fg: THEME.dim });
    buf.drawText(x + 2, 8, `state: ${room?.state ?? 'ingame'} · you climb solo, everyone watches`, { fg: THEME.dim });

    // tower leaderboard (top of the scoreboard by altitude)
    const top = [...this.scores]
      .filter((e) => e?.stats)
      .sort((a, b) => (b.stats.altitude ?? 0) - (a.stats.altitude ?? 0))
      .slice(0, 8);
    if (top.length) {
      buf.drawText(x + 2, 11, 'TOWER LEADERS', { fg: THEME.accent, bold: true });
      top.forEach((e, i) => {
        const nm = this.names.get(e.gameid) ?? `game ${e.gameid}`;
        const alt = (e.stats.altitude ?? 0).toFixed(0);
        buf.drawText(x + 2, 12 + i, `${(i + 1).toString().padStart(2)}. ${nm.slice(0, 18).padEnd(18)} ${alt.padStart(6)}m`, { fg: i === 0 ? THEME.warn : THEME.text });
      });
    }

    const mid = Math.floor(buf.height / 2) + 4;
    if (this.state === 'lobby') {
      center(buf, mid, 'press ENTER to start your climb', { fg: THEME.good, bold: true });
    } else if (this.state === 'starting') {
      center(buf, mid, `joining game… ${(this.elapsed / 1000).toFixed(1)}s`, { fg: THEME.warn, bold: true });
    } else if (this.state === 'ended') {
      center(buf, mid, `run over (${this.lastEndReason}) — ENTER to climb again`, { fg: THEME.warn, bold: true });
    }
    center(buf, buf.height - 3, 'enter start · esc leave quick play', { fg: THEME.dim });
  }
}
