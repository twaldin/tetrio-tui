/**
 * TETRA CHANNEL screens: LEADERBOARDS, REPLAYS (global news feed) and MY PROFILE.
 *
 * Data comes from the public TETRA CHANNEL REST API via ChannelApi
 * (src/net/channel.ts). All screens follow the menu.ts patterns:
 * arrow keys + enter + esc, THEME colors, boxes, loading spinners, error states.
 *
 * Wiring: call createChannelScreen(deps) (or build a MenuNode with
 * createChannelMenuNode) and push it onto the App stack:
 *
 *   const api = new ChannelApi();
 *   app.push(createChannelScreen({
 *     api,
 *     pushScreen: (s) => app.push(s),
 *     popScreen: () => app.pop(),
 *   }));
 */
import type { RenderBuffer, Screen, KeyEvent, RGB } from '../app.js';
import { THEME, drawBox, center } from '../draw.js';
import { MenuScreen, type MenuNode } from './menu.js';
import {
  ChannelApi,
  ChannelApiError,
  type LeaderboardEntry,
  type NewsItem,
  type UserLeaderboardKind,
  type UserProfile,
  type UserSummaries,
} from '../../net/channel.js';

// ---------------------------------------------------------------------------
// shared bits
// ---------------------------------------------------------------------------

/** Everything the channel screens need from the host app. */
export interface ChannelDeps {
  api: ChannelApi;
  pushScreen: (s: Screen) => void;
  popScreen: () => void;
}

const SPINNER = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];
const SPINNER_MS = 80;

function spinnerFrame(ms: number): string {
  return SPINNER[Math.floor(ms / SPINNER_MS) % SPINNER.length];
}

function errMsg(e: unknown): string {
  if (e instanceof ChannelApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Keep `cursor` inside [scroll, scroll + visible). */
function clampScroll(cursor: number, scroll: number, visible: number): number {
  if (cursor < scroll) return cursor;
  if (cursor >= scroll + visible) return Math.max(0, cursor - visible + 1);
  return scroll;
}

// --- formatting helpers (exported for reuse) --------------------------------

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** "15.403s" / "1:02.345" from milliseconds. */
export function fmtTimeMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = totalSec - m * 60;
  if (m > 0) return `${m}:${s.toFixed(3).padStart(6, '0')}`;
  return `${s.toFixed(3)}s`;
}

/** "2m ago" / "3h ago" / "5d ago" from an ISO timestamp. */
export function fmtRelTime(tsIso: string, now = Date.now()): string {
  const t = Date.parse(tsIso);
  if (!Number.isFinite(t)) return '';
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

/** Approximate TETR.IO rank colors. */
export const RANK_COLORS: Record<string, RGB> = {
  'x+': [255, 133, 255],
  x: [255, 69, 255],
  u: [167, 89, 255],
  ss: [255, 158, 47],
  's+': [255, 178, 66],
  s: [255, 200, 96],
  's-': [255, 219, 138],
  'a+': [84, 220, 130],
  a: [64, 200, 112],
  'a-': [48, 176, 96],
  'b+': [86, 158, 255],
  b: [66, 138, 235],
  'b-': [50, 116, 205],
  'c+': [150, 160, 185],
  c: [130, 140, 165],
  'c-': [110, 120, 145],
  'd+': [180, 130, 95],
  d: [155, 110, 80],
  z: [110, 110, 130],
};

export function rankColor(rank: string | undefined | null): RGB {
  return RANK_COLORS[(rank ?? 'z').toLowerCase()] ?? RANK_COLORS.z;
}

/** Two-character uppercase badge for a letter rank ("s+" -> "S+", "z" -> "??"). */
export function rankBadge(rank: string | undefined | null): string {
  if (!rank || rank.toLowerCase() === 'z') return '??';
  return rank.toUpperCase().padStart(2).slice(-2);
}

export const GAMETYPE_NAMES: Record<string, string> = {
  '40l': '40 LINES',
  blitz: 'BLITZ',
  zenith: 'QUICK PLAY',
  zenithex: 'EXPERT QP',
  league: 'TETRA LEAGUE',
  zen: 'ZEN',
};

/** Format a news/record result value according to its game mode. */
export function fmtResult(gametype: string | undefined, result: number | undefined): string {
  if (result === undefined || !Number.isFinite(result)) return '';
  switch (gametype) {
    case '40l':
      return fmtTimeMs(result);
    case 'blitz':
      return `${fmtInt(result)} pts`;
    case 'zenith':
    case 'zenithex':
      return `${fmtInt(result)}m`;
    default:
      return fmtInt(result);
  }
}

// ---------------------------------------------------------------------------
// LEADERBOARDS — scrollable, paginated ranked table
// ---------------------------------------------------------------------------

const LB_PAGE = 25;

const LB_TITLES: Record<UserLeaderboardKind, { title: string; color: RGB }> = {
  league: { title: 'TETRA LEAGUE LEADERBOARD', color: THEME.league },
  xp: { title: 'XP LEADERBOARD', color: THEME.accent2 },
  ar: { title: 'ACHIEVEMENT RATING LEADERBOARD', color: THEME.warn },
};

export class LeaderboardScreen implements Screen {
  readonly name = 'channel.leaderboard';
  private deps: ChannelDeps;
  private kind: UserLeaderboardKind;
  private entries: LeaderboardEntry[] = [];
  private cursor = 0;
  private scroll = 0;
  private loading = false;
  private error: string | null = null;
  private endReached = false;
  private started = false;
  private spinMs = 0;

  constructor(deps: ChannelDeps, kind: UserLeaderboardKind) {
    this.deps = deps;
    this.kind = kind;
  }

  onShow(): void {
    if (!this.started) {
      this.started = true;
      void this.loadMore();
    }
  }

  /** Fetch the next page (downwards via the last entry's prisecter). */
  async loadMore(): Promise<void> {
    if (this.loading || this.endReached) return;
    this.loading = true;
    this.error = null;
    try {
      const last = this.entries[this.entries.length - 1];
      const page = await this.deps.api.userLeaderboard(this.kind, {
        limit: LB_PAGE,
        after: last?.p,
      });
      if (page.entries.length === 0) this.endReached = true;
      else {
        // de-dupe on _id in case a prisecter boundary repeats an entry
        const seen = new Set(this.entries.map((e) => e._id));
        for (const e of page.entries) if (!seen.has(e._id)) this.entries.push(e);
        if (page.entries.length < LB_PAGE) this.endReached = true;
      }
    } catch (e) {
      this.error = errMsg(e);
    } finally {
      this.loading = false;
    }
  }

  /** Total selectable rows: entries + the "load more" sentinel when present. */
  private rowCount(): number {
    return this.entries.length + (this.endReached || this.entries.length === 0 ? 0 : 1);
  }

  onKey(ev: KeyEvent): void {
    if (ev.type !== 'down') return;
    const rows = this.rowCount();
    switch (ev.key) {
      case 'up':
        if (rows > 0) this.cursor = (this.cursor - 1 + rows) % rows;
        break;
      case 'down':
        if (rows > 0) this.cursor = (this.cursor + 1) % rows;
        break;
      case 'pageup':
        this.cursor = Math.max(0, this.cursor - 10);
        break;
      case 'pagedown':
        this.cursor = Math.min(Math.max(0, rows - 1), this.cursor + 10);
        break;
      case 'home':
        this.cursor = 0;
        break;
      case 'end':
        this.cursor = Math.max(0, rows - 1);
        break;
      case 'return':
        this.activate();
        break;
      case 'r':
        if (this.error) void this.loadMore();
        break;
      case 'escape':
      case 'backspace':
        this.deps.popScreen();
        return;
    }
    // approaching the bottom? prefetch the next page
    if (this.cursor >= this.entries.length - 4) void this.loadMore();
  }

  private activate(): void {
    if (this.error) {
      void this.loadMore();
      return;
    }
    if (this.cursor >= this.entries.length) {
      void this.loadMore(); // the "load more" sentinel row
      return;
    }
    const entry = this.entries[this.cursor];
    if (entry) this.deps.pushScreen(new ProfileScreen(this.deps, entry.username));
  }

  update(dtMs: number): void {
    this.spinMs += dtMs;
  }

  // --- rendering ---

  private headerCells(): { text: string; color?: RGB }[] {
    if (this.kind === 'league') {
      return [
        { text: '  #  ' },
        { text: 'RK ' },
        { text: 'PLAYER           ' },
        { text: '      TR', color: THEME.accent2 },
        { text: '  GLIXARE', color: THEME.accent2 },
        { text: '    APM', color: THEME.accent2 },
        { text: '   PPS', color: THEME.accent2 },
        { text: '     VS', color: THEME.accent2 },
      ];
    }
    const label = this.kind === 'xp' ? '           XP' : '           AR';
    return [
      { text: '  #  ' },
      { text: 'RK ' },
      { text: 'PLAYER           ' },
      { text: label, color: THEME.accent2 },
      { text: '  COUNTRY', color: THEME.accent2 },
    ];
  }

  private entryCells(e: LeaderboardEntry, rank: number, sel: boolean): { text: string; color?: RGB }[] {
    const base = sel ? THEME.text : THEME.dim;
    const name = (e.username.length > 17 ? e.username.slice(0, 16) + '…' : e.username).padEnd(17);
    const head = [
      { text: `#${String(rank).padStart(4)} `, color: sel ? THEME.warn : THEME.dim },
      { text: `${rankBadge(e.league?.rank)} `, color: rankColor(e.league?.rank) },
      { text: name, color: sel ? THEME.accent2 : THEME.text },
    ];
    if (this.kind === 'league') {
      const l = e.league;
      return [
        ...head,
        { text: String(l?.tr >= 0 ? fmtInt(l.tr) : '—').padStart(8), color: sel ? THEME.text : base },
        { text: (l?.gxe >= 0 ? `${l.gxe.toFixed(2)}%` : '—').padStart(9), color: base },
        { text: (l?.apm !== undefined ? l.apm.toFixed(1) : '—').padStart(7), color: base },
        { text: (l?.pps !== undefined ? l.pps.toFixed(2) : '—').padStart(6), color: base },
        { text: (l?.vs !== undefined ? l.vs.toFixed(1) : '—').padStart(7), color: base },
      ];
    }
    const value = this.kind === 'xp' ? e.xp : e.ar;
    return [
      ...head,
      { text: fmtInt(value).padStart(14), color: sel ? THEME.text : base },
      { text: `  ${(e.country ?? '—').padStart(7)}`, color: base },
    ];
  }

  render(buf: RenderBuffer): void {
    buf.fillRect(0, 0, buf.width, buf.height, ' ', { bg: THEME.bg });
    const meta = LB_TITLES[this.kind];
    buf.drawText(2, 1, `TETRA CHANNEL / LEADERBOARDS / ${this.kind.toUpperCase()}`, { fg: meta.color, bold: true });

    const w = Math.min(buf.width - 4, this.kind === 'league' ? 72 : 54);
    const x = Math.floor((buf.width - w) / 2);
    const top = 3;
    const bottom = buf.height - 3;
    const visible = Math.max(1, bottom - top - 3); // borders + header row
    drawBox(buf, x, top, w, bottom - top, { fg: THEME.border });

    // header
    let cx = x + 2;
    for (const cell of this.headerCells()) {
      buf.drawText(cx, top + 1, cell.text, { fg: cell.color ?? THEME.dim, bold: true });
      cx += cell.text.length;
    }

    this.scroll = clampScroll(this.cursor, this.scroll, visible);
    const rows = this.entries;
    for (let i = 0; i < visible; i++) {
      const idx = this.scroll + i;
      const y = top + 2 + i;
      if (idx >= rows.length) break;
      const sel = idx === this.cursor;
      if (sel) buf.fillRect(x + 1, y, w - 2, 1, ' ', { bg: THEME.panel });
      let rx = x + 2;
      for (const cell of this.entryCells(rows[idx], idx + 1, sel)) {
        buf.drawText(rx, y, cell.text, { fg: cell.color ?? THEME.text, bold: sel });
        rx += cell.text.length;
      }
    }

    // sentinel / status row
    const sy = top + 2 + Math.min(rows.length - this.scroll, visible);
    if (this.error) {
      buf.drawText(x + 2, Math.min(sy, bottom - 2), `! ${this.error} — enter retries`, { fg: THEME.bad });
    } else if (this.loading) {
      buf.drawText(x + 2, Math.min(sy, bottom - 2), `${spinnerFrame(this.spinMs)} loading…`, { fg: THEME.dim });
    } else if (!this.endReached && rows.length > 0 && this.cursor >= rows.length) {
      const y = top + 2 + (rows.length - this.scroll);
      buf.fillRect(x + 1, y, w - 2, 1, ' ', { bg: THEME.panel });
      center(buf, y, '▼ LOAD MORE ▼', { fg: THEME.good, bold: true });
    } else if (!this.endReached && rows.length > 0) {
      const y = top + 2 + (rows.length - this.scroll);
      if (y < bottom - 1) center(buf, y, '▽ more below', { fg: THEME.dim });
    } else if (this.endReached && rows.length > 0) {
      const y = top + 2 + (rows.length - this.scroll);
      if (y < bottom - 1) center(buf, y, '— end of leaderboard —', { fg: THEME.dim });
    }

    if (rows.length === 0 && !this.loading && !this.error) {
      center(buf, top + 3, 'no entries', { fg: THEME.dim });
    }
    if (rows.length === 0 && this.loading) {
      center(buf, top + 3, `${spinnerFrame(this.spinMs)} fetching leaderboard…`, { fg: THEME.dim });
    }

    const count = `${rows.length} players`;
    buf.drawText(x + w - count.length - 2, top, count, { fg: THEME.dim });
    center(buf, buf.height - 2, '↑↓ scroll · enter profile / load more · esc back', { fg: THEME.dim });
  }
}

// ---------------------------------------------------------------------------
// REPLAYS — the global news feed (records / PBs / rankups)
// ---------------------------------------------------------------------------

interface NewsRow {
  icon: string;
  color: RGB;
  text: string;
  username?: string;
}

export function formatNewsItem(item: NewsItem): NewsRow {
  const d = item.data ?? ({} as NewsItem['data']);
  const game = GAMETYPE_NAMES[d.gametype ?? ''] ?? (d.gametype ? String(d.gametype).toUpperCase() : '');
  switch (item.type) {
    case 'leaderboard':
      return {
        icon: '★', color: THEME.warn, username: d.username,
        text: `${d.username} took global #${d.rank} in ${game} — ${fmtResult(d.gametype, d.result)}`,
      };
    case 'personalbest':
      return {
        icon: '▲', color: THEME.good, username: d.username,
        text: `${d.username} set a ${game} personal best — ${fmtResult(d.gametype, d.result)}`,
      };
    case 'rankup': {
      const r = String(d.rank ?? 'z');
      return {
        icon: '⇑', color: rankColor(r), username: d.username,
        text: `${d.username} reached rank ${r.toUpperCase()}`,
      };
    }
    case 'badge':
      return {
        icon: '◆', color: THEME.accent2, username: d.username,
        text: `${d.username} earned the "${d.label ?? d.badge ?? '???'}" badge`,
      };
    case 'supporter':
      return { icon: '♥', color: THEME.accent, username: d.username, text: `${d.username} became a TETR.IO supporter` };
    case 'supporter_gift':
      return { icon: '♥', color: THEME.accent, username: d.username, text: `${d.username} was gifted TETR.IO supporter` };
    default:
      return { icon: '•', color: THEME.dim, username: d.username, text: `${d.username ?? '?'} — ${item.type}` };
  }
}

const NEWS_PAGE = 50;

export class NewsFeedScreen implements Screen {
  readonly name = 'channel.news';
  private deps: ChannelDeps;
  private items: NewsItem[] = [];
  private cursor = 0;
  private scroll = 0;
  private loading = false;
  private error: string | null = null;
  private started = false;
  private spinMs = 0;

  constructor(deps: ChannelDeps) {
    this.deps = deps;
  }

  onShow(): void {
    if (!this.started) {
      this.started = true;
      void this.refresh();
    }
  }

  async refresh(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.error = null;
    try {
      this.items = await this.deps.api.news('global', NEWS_PAGE);
      this.cursor = Math.min(this.cursor, Math.max(0, this.items.length - 1));
    } catch (e) {
      this.error = errMsg(e);
    } finally {
      this.loading = false;
    }
  }

  onKey(ev: KeyEvent): void {
    if (ev.type !== 'down') return;
    const rows = this.items.length;
    switch (ev.key) {
      case 'up':
        if (rows > 0) this.cursor = (this.cursor - 1 + rows) % rows;
        break;
      case 'down':
        if (rows > 0) this.cursor = (this.cursor + 1) % rows;
        break;
      case 'pageup':
        this.cursor = Math.max(0, this.cursor - 10);
        break;
      case 'pagedown':
        this.cursor = Math.min(Math.max(0, rows - 1), this.cursor + 10);
        break;
      case 'home':
        this.cursor = 0;
        break;
      case 'end':
        this.cursor = Math.max(0, rows - 1);
        break;
      case 'return': {
        const item = this.items[this.cursor];
        const username = item?.data?.username;
        if (username) this.deps.pushScreen(new ProfileScreen(this.deps, username));
        break;
      }
      case 'r':
        this.deps.api.clearCache();
        void this.refresh();
        break;
      case 'escape':
      case 'backspace':
        this.deps.popScreen();
        break;
    }
  }

  update(dtMs: number): void {
    this.spinMs += dtMs;
  }

  render(buf: RenderBuffer): void {
    buf.fillRect(0, 0, buf.width, buf.height, ' ', { bg: THEME.bg });
    buf.drawText(2, 1, 'TETRA CHANNEL / REPLAYS', { fg: THEME.accent2, bold: true });
    buf.drawText(buf.width - 14, 1, 'global feed', { fg: THEME.dim });

    const top = 3;
    const bottom = buf.height - 3;
    const visible = Math.max(1, bottom - top - 2);
    const w = Math.min(buf.width - 4, 86);
    const x = Math.floor((buf.width - w) / 2);
    drawBox(buf, x, top, w, bottom - top, { fg: THEME.border });

    this.scroll = clampScroll(this.cursor, this.scroll, visible);
    for (let i = 0; i < visible; i++) {
      const idx = this.scroll + i;
      if (idx >= this.items.length) break;
      const y = top + 1 + i;
      const sel = idx === this.cursor;
      if (sel) buf.fillRect(x + 1, y, w - 2, 1, ' ', { bg: THEME.panel });
      const row = formatNewsItem(this.items[idx]);
      const time = fmtRelTime(this.items[idx].ts);
      const maxText = w - 6 - time.length - 2;
      const text = row.text.length > maxText ? row.text.slice(0, Math.max(0, maxText - 1)) + '…' : row.text;
      buf.drawText(x + 2, y, row.icon, { fg: row.color, bold: true });
      buf.drawText(x + 4, y, text, { fg: sel ? THEME.text : THEME.dim, bold: sel });
      buf.drawText(x + w - time.length - 2, y, time, { fg: THEME.dim });
    }

    if (this.items.length === 0) {
      if (this.loading) center(buf, top + 3, `${spinnerFrame(this.spinMs)} fetching the latest news…`, { fg: THEME.dim });
      else if (this.error) center(buf, top + 3, `! ${this.error} — r retries`, { fg: THEME.bad });
      else center(buf, top + 3, 'no news', { fg: THEME.dim });
    } else if (this.loading) {
      buf.drawText(x + 2, bottom - 1, `${spinnerFrame(this.spinMs)} refreshing…`, { fg: THEME.dim });
    }

    center(buf, buf.height - 2, '↑↓ scroll · enter view player · r refresh · esc back', { fg: THEME.dim });
  }
}

// ---------------------------------------------------------------------------
// MY PROFILE — username lookup, then the profile card
// ---------------------------------------------------------------------------

export class ProfileLookupScreen implements Screen {
  readonly name = 'channel.lookup';
  private deps: ChannelDeps;
  private value = '';
  private busy = false;
  private error = '';
  private spinMs = 0;
  private seq = 0;

  constructor(deps: ChannelDeps) {
    this.deps = deps;
  }

  onShow(): void {
    this.busy = false;
    this.error = '';
  }

  onKey(ev: KeyEvent): void {
    if (ev.type !== 'down') return;
    switch (ev.key) {
      case 'return':
        void this.submit();
        break;
      case 'backspace':
        if (!this.busy) this.value = this.value.slice(0, -1);
        break;
      case 'escape':
        this.seq++; // cancel any in-flight navigation
        this.deps.popScreen();
        break;
      default:
        if (!this.busy && ev.key.length === 1 && !ev.ctrl && !ev.alt && /[a-zA-Z0-9_-]/.test(ev.key)) {
          if (this.value.length < 24) this.value += ev.key;
        }
    }
  }

  private async submit(): Promise<void> {
    const username = this.value.trim().toLowerCase();
    if (!username || this.busy) return;
    this.busy = true;
    this.error = '';
    const seq = ++this.seq;
    try {
      // validate the user exists; the response is cached, so the profile
      // screen's own fetch is served from the client-side cache
      await this.deps.api.user(username);
      if (seq !== this.seq) return;
      this.busy = false;
      this.deps.pushScreen(new ProfileScreen(this.deps, username));
    } catch (e) {
      if (seq !== this.seq) return;
      this.busy = false;
      this.error = errMsg(e);
    }
  }

  update(dtMs: number): void {
    this.spinMs += dtMs;
  }

  render(buf: RenderBuffer): void {
    buf.fillRect(0, 0, buf.width, buf.height, ' ', { bg: THEME.bg });
    buf.drawText(2, 1, 'TETRA CHANNEL / MY PROFILE', { fg: THEME.accent, bold: true });

    const bw = 46;
    const bx = Math.floor((buf.width - bw) / 2);
    const by = Math.max(4, Math.floor(buf.height / 2) - 6);
    drawBox(buf, bx, by, bw, 9, { fg: THEME.border });
    center(buf, by + 1, 'PLAYER LOOKUP', { fg: THEME.accent, bold: true });
    center(buf, by + 3, 'enter a username to inspect', { fg: THEME.dim });

    buf.drawText(bx + 3, by + 5, 'username', { fg: THEME.accent2 });
    buf.fillRect(bx + 13, by + 5, bw - 16, 1, ' ', { bg: THEME.panel });
    buf.drawText(bx + 14, by + 5, this.value + (this.busy ? '' : '█'), { fg: THEME.text });

    if (this.busy) center(buf, by + 7, `${spinnerFrame(this.spinMs)} fetching player…`, { fg: THEME.dim });
    else if (this.error) center(buf, by + 7, this.error, { fg: THEME.bad });
    else center(buf, by + 7, ' ', { fg: THEME.dim });

    center(buf, buf.height - 2, 'type a username · enter search · esc back', { fg: THEME.dim });
  }
}

// ---------------------------------------------------------------------------
// profile card
// ---------------------------------------------------------------------------

export class ProfileScreen implements Screen {
  readonly name = 'channel.profile';
  private deps: ChannelDeps;
  private username: string;
  private user: UserProfile | null = null;
  private summaries: UserSummaries | null = null;
  private loading = false;
  private error: string | null = null;
  private started = false;
  private spinMs = 0;

  constructor(deps: ChannelDeps, username: string) {
    this.deps = deps;
    this.username = username.toLowerCase();
  }

  onShow(): void {
    if (!this.started) {
      this.started = true;
      void this.load();
    }
  }

  async load(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.error = null;
    try {
      const [user, summaries] = await Promise.all([
        this.deps.api.user(this.username),
        this.deps.api.userSummaries(this.username),
      ]);
      this.user = user;
      this.summaries = summaries;
    } catch (e) {
      this.error = errMsg(e);
    } finally {
      this.loading = false;
    }
  }

  onKey(ev: KeyEvent): void {
    if (ev.type !== 'down') return;
    switch (ev.key) {
      case 'return':
      case 'r':
        if (this.error) void this.load();
        break;
      case 'escape':
      case 'backspace':
        this.deps.popScreen();
        break;
    }
  }

  update(dtMs: number): void {
    this.spinMs += dtMs;
  }

  render(buf: RenderBuffer): void {
    buf.fillRect(0, 0, buf.width, buf.height, ' ', { bg: THEME.bg });
    buf.drawText(2, 1, `TETRA CHANNEL / PROFILE / ${this.username}`, { fg: THEME.accent, bold: true });

    if (this.loading && !this.user) {
      center(buf, Math.floor(buf.height / 2), `${spinnerFrame(this.spinMs)} fetching ${this.username}…`, { fg: THEME.dim });
    } else if (this.error && !this.user) {
      center(buf, Math.floor(buf.height / 2) - 1, `! ${this.error}`, { fg: THEME.bad });
      center(buf, Math.floor(buf.height / 2) + 1, 'enter retries · esc back', { fg: THEME.dim });
    } else if (this.user) {
      this.renderProfile(buf, this.user, this.summaries);
    }
    center(buf, buf.height - 2, 'esc back', { fg: THEME.dim });
  }

  private renderProfile(buf: RenderBuffer, u: UserProfile, s: UserSummaries | null): void {
    // --- header ---
    const roleColor =
      u.role === 'sysop' || u.role === 'admin' ? THEME.bad
      : u.role === 'mod' || u.role === 'halfmod' ? THEME.warn
      : u.role === 'bot' ? THEME.accent2
      : THEME.text;
    const name = u.username.toUpperCase();
    center(buf, 2, name, { fg: roleColor, bold: true });
    const bits: string[] = [u.role.toUpperCase()];
    if (u.supporter) bits.push(`SUPPORTER ${'♥'.repeat(Math.max(1, u.supporter_tier))}`);
    if (u.country) bits.push(u.country);
    if (u.badstanding) bits.push('BAD STANDING');
    center(buf, 3, bits.join('  ·  '), { fg: u.supporter ? THEME.accent : THEME.dim });

    const colW = Math.min(40, Math.floor((buf.width - 8) / 2));
    const lx = Math.floor((buf.width - (colW * 2 + 2)) / 2);
    const rx = lx + colW + 2;
    const top = 5;

    // --- TETRA LEAGUE ---
    const league = s?.league;
    drawBox(buf, lx, top, colW, 10, { fg: THEME.league });
    buf.drawText(lx + 2, top, 'TETRA LEAGUE', { fg: THEME.league, bold: true });
    if (league && league.gamesplayed > 0) {
      const unranked = league.rank === 'z' || league.tr < 0;
      const badge = rankBadge(league.rank);
      const rc = rankColor(league.rank);
      buf.drawText(lx + 2, top + 2, unranked ? 'UNRANKED' : badge, { fg: rc, bold: true });
      buf.drawText(lx + 2 + (unranked ? 8 : 2) + 2, top + 2, unranked ? '' : `${fmtInt(league.tr)} TR`, { fg: THEME.text, bold: true });
      if (league.bestrank && league.bestrank !== league.rank) {
        buf.drawText(lx + colW - 12, top + 2, `best ${rankBadge(league.bestrank)}`, { fg: rankColor(league.bestrank) });
      }
      const gxe = league.gxe >= 0 ? `${league.gxe.toFixed(2)}%` : '—';
      buf.drawText(lx + 2, top + 3, `GLIXARE ${gxe}`, { fg: THEME.dim });
      if (league.standing !== undefined && league.standing > 0) {
        buf.drawText(lx + colW - 14, top + 3, `#${fmtInt(league.standing)} global`, { fg: THEME.dim });
      }
      buf.drawText(lx + 2, top + 5, 'APM', { fg: THEME.dim });
      buf.drawText(lx + 7, top + 5, league.apm !== undefined ? league.apm.toFixed(1) : '—', { fg: THEME.text });
      buf.drawText(lx + 15, top + 5, 'PPS', { fg: THEME.dim });
      buf.drawText(lx + 20, top + 5, league.pps !== undefined ? league.pps.toFixed(2) : '—', { fg: THEME.text });
      buf.drawText(lx + 27, top + 5, 'VS', { fg: THEME.dim });
      buf.drawText(lx + 31, top + 5, league.vs !== undefined ? league.vs.toFixed(1) : '—', { fg: THEME.text });
      const wr = league.gamesplayed > 0 ? ` (${((league.gameswon / league.gamesplayed) * 100).toFixed(0)}%)` : '';
      buf.drawText(lx + 2, top + 7, `${fmtInt(league.gamesplayed)} played · ${fmtInt(league.gameswon)} won${wr}`, { fg: THEME.text });
      if (league.decaying) buf.drawText(lx + 2, top + 8, 'rating decaying — inactive', { fg: THEME.warn });
    } else {
      buf.drawText(lx + 2, top + 2, 'no league games this season', { fg: THEME.dim });
    }

    // --- RECORDS ---
    drawBox(buf, rx, top, colW, 10, { fg: THEME.solo });
    buf.drawText(rx + 2, top, 'RECORDS', { fg: THEME.solo, bold: true });
    let ry = top + 2;
    const recLine = (label: string, value: string, rank: number, color: RGB): void => {
      buf.drawText(rx + 2, ry, label.padEnd(11), { fg: color });
      buf.drawText(rx + 13, ry, value, { fg: THEME.text, bold: true });
      if (rank > 0) buf.drawText(rx + colW - 12, ry, `#${fmtInt(rank)}`, { fg: THEME.dim });
      ry += 2;
    };
    const s40 = s?.['40l'];
    recLine('40 LINES', s40?.record ? fmtTimeMs(s40.record.results.stats?.finaltime ?? NaN) : '—', s40?.rank ?? -1, THEME.solo);
    const sb = s?.blitz;
    recLine('BLITZ', sb?.record ? fmtInt(sb.record.results.stats?.score ?? NaN) : '—', sb?.rank ?? -1, THEME.warn);
    const sz = s?.zenith;
    const zAlt = sz?.record?.results.stats?.zenith?.altitude ?? sz?.best?.record?.results.stats?.zenith?.altitude;
    recLine('QUICK PLAY', zAlt !== undefined ? `${fmtInt(zAlt)}` : '—', sz?.rank ?? -1, THEME.accent2);
    const zen = s?.zen;
    buf.drawText(rx + 2, ry, 'ZEN'.padEnd(11), { fg: THEME.good });
    buf.drawText(rx + 13, ry, zen ? `level ${fmtInt(zen.level)}` : '—', { fg: THEME.text, bold: true });

    // --- ACCOUNT ---
    const ay = top + 11;
    drawBox(buf, lx, ay, colW, 9, { fg: THEME.border });
    buf.drawText(lx + 2, ay, 'ACCOUNT', { fg: THEME.accent2, bold: true });
    const stat = (y: number, label: string, value: string, color: RGB = THEME.text): void => {
      buf.drawText(lx + 2, ay + 2 + y, label, { fg: THEME.dim });
      buf.drawText(lx + 12, ay + 2 + y, value, { fg: color });
    };
    stat(0, 'xp', fmtInt(u.xp));
    stat(1, 'ar', fmtInt(u.ar));
    stat(2, 'friends', fmtInt(u.friend_count));
    stat(3, 'online', u.gamesplayed < 0 ? 'hidden' : `${fmtInt(u.gamesplayed)} played · ${fmtInt(u.gameswon)} won`);
    stat(4, 'playtime', u.gametime < 0 ? 'hidden' : `${fmtInt(u.gametime / 3600)}h`);
    stat(5, 'joined', u.ts ? u.ts.slice(0, 10) : 'long ago');

    // --- BADGES / BIO ---
    drawBox(buf, rx, ay, colW, 9, { fg: THEME.border });
    buf.drawText(rx + 2, ay, 'BADGES', { fg: THEME.warn, bold: true });
    const badges = (u.badges ?? []).slice(0, 6);
    if (badges.length === 0) buf.drawText(rx + 2, ay + 2, 'none', { fg: THEME.dim });
    badges.forEach((b, i) => {
      if (ay + 2 + i >= ay + 8) return;
      const label = b.label.length > colW - 6 ? b.label.slice(0, colW - 7) + '…' : b.label;
      buf.drawText(rx + 2, ay + 2 + i, `◆ ${label}`, { fg: THEME.dim });
    });
  }
}

// ---------------------------------------------------------------------------
// wiring — MenuNode / MenuScreen factories
// ---------------------------------------------------------------------------

/**
 * The TETRA CHANNEL menu tree as a MenuNode. LEADERBOARDS pushes a MenuScreen
 * submenu (Tetra League / XP / Achievement Rating); REPLAYS pushes the global
 * news feed; MY PROFILE pushes the username lookup.
 */
export function createChannelMenuNode(deps: ChannelDeps): MenuNode {
  const leaderboards: MenuNode = {
    title: 'LEADERBOARDS',
    subtitle: 'the best of the best',
    color: THEME.channel,
    items: [
      {
        id: 'league', label: 'TETRA LEAGUE', sub: 'ranked by Tetra Rating', color: THEME.league,
        action: () => deps.pushScreen(new LeaderboardScreen(deps, 'league')),
      },
      {
        id: 'xp', label: 'XP', sub: 'the most experienced players', color: THEME.accent2,
        action: () => deps.pushScreen(new LeaderboardScreen(deps, 'xp')),
      },
      {
        id: 'ar', label: 'ACHIEVEMENT RATING', sub: 'master achievement hunters', color: THEME.warn,
        action: () => deps.pushScreen(new LeaderboardScreen(deps, 'ar')),
      },
    ],
  };

  return {
    title: 'TETRA CHANNEL',
    subtitle: 'leaderboards, replays and player profiles',
    color: THEME.channel,
    items: [
      {
        id: 'leaderboards', label: 'LEADERBOARDS', sub: 'the best of the best', color: THEME.channel,
        action: () =>
          deps.pushScreen(
            new MenuScreen(leaderboards, {
              breadcrumb: ['TETRA CHANNEL', 'LEADERBOARDS'],
              onBack: deps.popScreen,
              pushScreen: deps.pushScreen,
            }),
          ),
      },
      {
        id: 'replays', label: 'REPLAYS', sub: 'the latest records, PBs and rankups', color: THEME.accent2,
        action: () => deps.pushScreen(new NewsFeedScreen(deps)),
      },
      {
        id: 'me', label: 'MY PROFILE', sub: 'look up any player\u2019s stats', color: THEME.accent,
        action: () => deps.pushScreen(new ProfileLookupScreen(deps)),
      },
    ],
  };
}

/** A ready-to-push TETRA CHANNEL root screen. */
export function createChannelScreen(deps: ChannelDeps): MenuScreen {
  return new MenuScreen(createChannelMenuNode(deps), {
    breadcrumb: ['TETRA CHANNEL'],
    onBack: deps.popScreen,
    pushScreen: deps.pushScreen,
  });
}
