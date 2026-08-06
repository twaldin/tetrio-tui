/** Tetra League screen: matchmaking queue, match found, countdown. */
import type { RenderBuffer, Screen, KeyEvent } from '../app.js';
import { THEME, center, drawBox } from '../draw.js';
import type { TetrioClient } from '../../client.js';

export class LeagueScreen implements Screen {
  readonly name = 'league';
  private client: TetrioClient;
  private onGameStart: () => void;
  private onLeave: () => void;
  state: 'idle' | 'queue' | 'match' | 'countdown' = 'idle';
  private match: any = null;
  private queueTime = 0;
  private me: any = null;

  constructor(client: TetrioClient, opts: { onGameStart: () => void; onLeave: () => void }) {
    this.client = client;
    this.onGameStart = opts.onGameStart;
    this.onLeave = opts.onLeave;
    client.on('league.match', (d: any) => { this.state = 'match'; this.match = d; });
    client.on('league.countdown', (d: any) => { this.state = 'countdown'; });
    client.on('game.start', () => this.onGameStart());
    this.me = client.session.user?.user;
  }

  onShow(): void {
    this.state = 'queue';
    this.client.leagueEnter();
  }
  onHide(): void {
    if (this.state === 'queue') this.client.leagueLeave();
  }

  onKey(ev: KeyEvent): void {
    if (ev.type !== 'down') return;
    if (ev.key === 'escape') {
      this.client.leagueLeave();
      this.onLeave();
    }
    if (ev.key === 'r' && this.state === 'match') this.client.leagueReady();
  }

  update(dtMs: number): void {
    if (this.state === 'queue') this.queueTime += dtMs;
  }

  render(buf: RenderBuffer): void {
    buf.fillRect(0, 0, buf.width, buf.height, ' ', { bg: THEME.bg });
    center(buf, 2, 'TETRA LEAGUE', { fg: THEME.league, bold: true });
    // my rating card
    const lg = this.me?.league;
    if (lg) {
      const w = Math.min(40, buf.width - 20);
      const x = Math.floor((buf.width - w) / 2);
      drawBox(buf, x, 4, w, 6, { fg: THEME.border });
      buf.drawText(x + 2, 5, `${this.me.username}`, { fg: THEME.accent2, bold: true });
      buf.drawText(x + 2, 6, `TR ${lg.tr?.toFixed(0) ?? 'unranked'}  [${(lg.rank ?? 'z').toUpperCase()}]`, { fg: THEME.accent });
      buf.drawText(x + 2, 7, `APM ${lg.apm?.toFixed(0) ?? '-'}  PPS ${lg.pps?.toFixed(1) ?? '-'}  VS ${lg.vs?.toFixed(0) ?? '-'}`, { fg: THEME.dim });
      buf.drawText(x + 2, 8, `${lg.gameswon ?? 0}W / ${lg.gamesplayed ?? 0} played`, { fg: THEME.dim });
    }

    const mid = Math.floor(buf.height / 2) + 2;
    if (this.state === 'queue') {
      center(buf, mid, 'SEARCHING FOR OPPONENT…', { fg: THEME.warn, bold: true });
      const secs = Math.floor(this.queueTime / 1000);
      center(buf, mid + 2, `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`, { fg: THEME.dim });
      center(buf, mid + 4, spinnerFrame(this.queueTime), { fg: THEME.accent });
    } else if (this.state === 'match') {
      center(buf, mid, 'MATCH FOUND!', { fg: THEME.good, bold: true });
      const opp = this.match?.opponent ?? this.match;
      if (opp) {
        center(buf, mid + 2, `vs ${opp.username ?? '?'}`, { fg: THEME.accent, bold: true });
        center(buf, mid + 3, `TR ${opp.tr?.toFixed(0) ?? '?'} [${(opp.rank ?? 'z').toUpperCase()}]`, { fg: THEME.dim });
      }
      center(buf, mid + 5, 'get ready…', { fg: THEME.dim });
    } else if (this.state === 'countdown') {
      center(buf, mid, 'STARTING…', { fg: THEME.good, bold: true });
    }
    center(buf, buf.height - 3, 'esc leave queue', { fg: THEME.dim });
  }
}

function spinnerFrame(t: number): string {
  const frames = ['◐', '◓', '◑', '◒'];
  return frames[Math.floor(t / 150) % frames.length];
}
