/**
 * TETRA CHANNEL public REST API client (https://ch.tetr.io/api/).
 *
 * No auth required. JSON in/out. Rules of the API we honor here:
 *  - descriptive User-Agent on every request
 *  - X-Session-ID header so related requests (e.g. pagination) hit the same
 *    worker cache and stay consistent
 *  - responses carry a `cache` object; we do not re-request a resource before
 *    `cache.cached_until` (client-side in-memory cache)
 *  - requests are serialized and spaced (~1 req/sec) to avoid flooding
 *
 * All endpoints return an envelope: { success, data | error, cache }.
 */

export const CHANNEL_API_BASE = 'https://ch.tetr.io/api';

// ---------------------------------------------------------------------------
// envelope / errors
// ---------------------------------------------------------------------------

export interface CacheInfo {
  status: 'hit' | 'miss' | 'awaited';
  cached_at: number;     // epoch ms
  cached_until: number;  // epoch ms
}

export interface ChannelEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { msg?: string; [k: string]: unknown };
  cache?: CacheInfo;
}

export class ChannelApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly apiError?: unknown,
  ) {
    super(message);
    this.name = 'ChannelApiError';
  }
}

// ---------------------------------------------------------------------------
// response data types (subset of the full payloads, see docs/tetra_channel_api.txt)
// ---------------------------------------------------------------------------

/** GET /general/stats */
export interface ServerStats {
  usercount: number;
  usercount_delta: number;
  anoncount: number;
  totalaccounts: number;
  rankedcount: number;
  recordcount: number;
  gamesplayed: number;
  gamesplayed_delta: number;
  gamesfinished: number;
  gametime: number;
  inputs: number;
  piecesplaced: number;
}

/** A prisecter — the pagination cursor embedded in leaderboard entries as `p`. */
export interface Prisecter {
  pri: number;
  sec: number;
  ter: number;
}

/** TETRA LEAGUE standing, as embedded in leaderboard entries and summaries. */
export interface LeagueStanding {
  gamesplayed: number;
  gameswon: number;
  glicko: number;
  rd?: number;
  tr: number;
  gxe: number;
  rank: string;          // letter rank; "z" = unranked
  bestrank?: string;
  apm?: number;
  pps?: number;
  vs?: number;
  decaying: boolean;
  standing?: number;
  standing_local?: number;
  percentile?: number;
  percentile_rank?: string;
  next_rank?: string | null;
  prev_rank?: string | null;
  next_at?: number;
  prev_at?: number;
}

/** One row of /users/by/:leaderboard. */
export interface LeaderboardEntry {
  _id: string;
  username: string;
  role: string;
  xp: number;
  country: string | null;
  supporter: boolean;
  ts?: string;
  league: LeagueStanding;
  gamesplayed: number;   // -1 when hidden
  gameswon: number;      // -1 when hidden
  gametime: number;      // -1 when hidden
  ar: number;
  ar_counts?: Record<string, number>;
  p: Prisecter;
}

export interface UserLeaderboardPage {
  entries: LeaderboardEntry[];
}

export type UserLeaderboardKind = 'league' | 'xp' | 'ar';

/** GET /users/:user — the full user object. */
export interface UserProfile {
  _id: string;
  username: string;
  role: 'anon' | 'user' | 'bot' | 'halfmod' | 'mod' | 'admin' | 'sysop' | 'hidden' | 'banned' | string;
  ts?: string | null;
  botmaster?: string;
  badges?: { id: string; label: string; group?: string | null; desc?: string; ts?: string | null }[];
  xp: number;
  gamesplayed: number;   // -1 when hidden
  gameswon: number;      // -1 when hidden
  gametime: number;      // -1 when hidden
  country: string | null;
  badstanding?: boolean;
  supporter: boolean;
  supporter_tier: number;
  bio?: string;
  friend_count: number;
  distinguishment?: { type: string; [k: string]: unknown };
  ar: number;
  ar_counts?: Record<string, number>;
}

/** A stored game record (40l/blitz/zenith PBs, league matches, …). */
export interface RecordEntry {
  _id: string;
  replayid: string;
  stub: boolean;
  gamemode: string;
  pb: boolean;
  oncepb: boolean;
  ts: string;
  revolution?: string | null;
  user: { id: string; username: string; country?: string | null; supporter?: boolean };
  otherusers: unknown[];
  leaderboards?: string[];
  disputed?: boolean;
  results: {
    stats?: {
      finaltime?: number;   // ms (40l / sprint modes)
      score?: number;       // blitz score
      zenith?: { altitude?: number; floor?: number; [k: string]: unknown };
      [k: string]: unknown;
    };
    aggregatestats?: { apm?: number; pps?: number; vsscore?: number; [k: string]: unknown };
    [k: string]: unknown;
  };
  extras?: { zenith?: { mods?: string[]; [k: string]: unknown }; [k: string]: unknown };
  p?: Prisecter;
}

/** /users/:user/summaries/40l|blitz|zenith|zenithex */
export interface RecordSummary {
  record: RecordEntry | null;
  rank: number;         // -1 when unranked
  rank_local: number;   // -1 when unranked
  best?: { record: RecordEntry | null; rank: number };  // zenith modes: career best
}

/** /users/:user/summaries/zen */
export interface ZenSummary {
  level: number;
  score: number;
}

/** GET /users/:user/summaries */
export interface UserSummaries {
  '40l': RecordSummary;
  blitz: RecordSummary;
  zenith: RecordSummary;
  zenithex: RecordSummary;
  league: LeagueStanding;
  zen: ZenSummary;
  achievements?: unknown[];
}

/** GET /news/:stream item. `data` shape depends on `type` (see NewsData* below). */
export interface NewsItem {
  _id: string;
  stream: string;
  type: string; // 'leaderboard' | 'personalbest' | 'rankup' | 'badge' | 'supporter' | 'supporter_gift' | …
  data: {
    username: string;
    gametype?: string;   // leaderboard / personalbest
    rank?: number | string; // number for leaderboard, letter for rankup
    result?: number;     // score / time / altitude
    replayid?: string;
    badge?: string;
    label?: string;      // badge label
    [k: string]: unknown;
  };
  ts: string;
}

/** GET /records/:leaderboard */
export interface RecordsPage {
  entries: RecordEntry[];
}

/** One rank's metadata from GET /labs/league_ranks. */
export interface LeagueRankInfo {
  pos: number;
  percentile: number;
  tr: number;
  targettr: number;
  apm?: number | null;
  pps?: number | null;
  vs?: number | null;
  count: number;
}

/** The unwrapped data point of GET /labs/league_ranks. */
export type LeagueRanks = { total: number } & Record<string, LeagueRankInfo | number>;

// ---------------------------------------------------------------------------
// pagination
// ---------------------------------------------------------------------------

/** Format a prisecter object for the after=/before= query parameters. */
export function prisecterToString(p: Prisecter): string {
  return `${p.pri}:${p.sec}:${p.ter}`;
}

export interface PageOpts {
  limit?: number;                 // 1..100, server default 25
  after?: Prisecter | string;     // paginate downwards from this prisecter
  before?: Prisecter | string;    // paginate upwards (reversed order)
  country?: string;               // ISO 3166-1 filter (user leaderboards only)
}

// ---------------------------------------------------------------------------
// the client
// ---------------------------------------------------------------------------

export interface ChannelApiOptions {
  baseUrl?: string;
  userAgent?: string;
  sessionId?: string;
  /** Minimum spacing between network requests, ms. Default 1000 (~1 req/sec). */
  minIntervalMs?: number;
  /** Honor cache.cached_until client-side. Default true. */
  honorCache?: boolean;
  /** fetch implementation (defaults to globalThis.fetch) — injectable for tests/demo. */
  fetchImpl?: typeof fetch;
  /** clock (defaults to Date.now) — injectable for tests. */
  now?: () => number;
}

const DEFAULT_UA = 'tetrio-tui/0.1.0 (terminal TETR.IO client; TETRA CHANNEL reader)';

export class ChannelApi {
  readonly baseUrl: string;
  readonly userAgent: string;
  readonly minIntervalMs: number;
  readonly honorCache: boolean;
  private sessionId: string;
  private fetchImpl: typeof fetch;
  private now: () => number;
  private cache = new Map<string, { until: number; data: unknown }>();
  private lastRequestAt = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(opts: ChannelApiOptions = {}) {
    this.baseUrl = opts.baseUrl ?? CHANNEL_API_BASE;
    this.userAgent = opts.userAgent ?? DEFAULT_UA;
    this.sessionId = opts.sessionId ?? ChannelApi.newSessionId();
    this.minIntervalMs = opts.minIntervalMs ?? 1000;
    this.honorCache = opts.honorCache ?? true;
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.now = opts.now ?? (() => Date.now());
  }

  static newSessionId(): string {
    return `SESS-${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`;
  }

  /** The X-Session-ID currently in use. */
  get session(): string { return this.sessionId; }

  /** Rotate the X-Session-ID. Use when starting an unrelated request flow. */
  rotateSession(): string {
    this.sessionId = ChannelApi.newSessionId();
    return this.sessionId;
  }

  /** Drop all client-side cached responses. */
  clearCache(): void { this.cache.clear(); }

  // --- low level -----------------------------------------------------------

  /** Serialize requests and space them out (~1/sec) so we never flood the API. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async throttle(): Promise<void> {
    const wait = this.lastRequestAt + this.minIntervalMs - this.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = this.now();
  }

  /**
   * GET `path` (relative to the API base). Returns unwrapped `data`.
   * Serves from the client-side cache while `cached_until` has not passed.
   */
  async get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    const qs = query
      ? Object.entries(query)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;

    const hit = this.cache.get(url);
    if (this.honorCache && hit && hit.until > this.now()) return hit.data as T;

    const data = await this.enqueue(async () => {
      // re-check inside the queue: a previous queued request may have populated it
      const hit2 = this.cache.get(url);
      if (this.honorCache && hit2 && hit2.until > this.now()) return hit2.data as T;
      await this.throttle();
      const res = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': this.userAgent,
          'X-Session-ID': this.sessionId,
        },
      });
      let body: ChannelEnvelope<T> | null = null;
      try {
        body = (await res.json()) as ChannelEnvelope<T>;
      } catch {
        body = null;
      }
      if (!res.ok) {
        const msg = body?.error?.msg ?? `HTTP ${res.status}`;
        throw new ChannelApiError(String(msg), res.status, body?.error);
      }
      if (!body || body.success !== true || body.data === undefined) {
        const msg = body?.error?.msg ?? 'malformed response';
        throw new ChannelApiError(String(msg), res.status, body?.error);
      }
      if (body.cache && Number.isFinite(body.cache.cached_until)) {
        this.cache.set(url, { until: body.cache.cached_until, data: body.data });
      }
      return body.data;
    });
    return data;
  }

  private static pageQuery(opts: PageOpts = {}): Record<string, string | number | undefined> {
    return {
      limit: opts.limit,
      after: opts.after === undefined ? undefined : typeof opts.after === 'string' ? opts.after : prisecterToString(opts.after),
      before: opts.before === undefined ? undefined : typeof opts.before === 'string' ? opts.before : prisecterToString(opts.before),
      country: opts.country,
    };
  }

  // --- general -------------------------------------------------------------

  /** GET /general/stats — service-wide statistics. */
  serverStats(): Promise<ServerStats> {
    return this.get<ServerStats>('/general/stats');
  }

  // --- users ---------------------------------------------------------------

  /** GET /users/by/:leaderboard — one page of a user leaderboard. */
  userLeaderboard(kind: UserLeaderboardKind, opts: PageOpts = {}): Promise<UserLeaderboardPage> {
    return this.get<UserLeaderboardPage>(`/users/by/${kind}`, ChannelApi.pageQuery(opts));
  }

  /** TETRA LEAGUE leaderboard (sorted by TR). */
  leagueLeaderboard(opts: PageOpts = {}): Promise<UserLeaderboardPage> {
    return this.userLeaderboard('league', opts);
  }

  /** XP leaderboard. */
  xpLeaderboard(opts: PageOpts = {}): Promise<UserLeaderboardPage> {
    return this.userLeaderboard('xp', opts);
  }

  /** Achievement Rating leaderboard. */
  arLeaderboard(opts: PageOpts = {}): Promise<UserLeaderboardPage> {
    return this.userLeaderboard('ar', opts);
  }

  /** GET /users/:user — a user's full profile. */
  user(username: string): Promise<UserProfile> {
    return this.get<UserProfile>(`/users/${encodeURIComponent(username.toLowerCase())}`);
  }

  /** GET /users/:user/summaries — all game-mode summaries (40l, blitz, league, zen, zenith…). */
  userSummaries(username: string): Promise<UserSummaries> {
    return this.get<UserSummaries>(`/users/${encodeURIComponent(username.toLowerCase())}/summaries`);
  }

  // --- records -------------------------------------------------------------

  /** GET /records/:leaderboard — e.g. "40l_global", "blitz_global", "zenith_global". */
  records(leaderboard: string, opts: PageOpts = {}): Promise<RecordsPage> {
    const { country, ...rest } = ChannelApi.pageQuery(opts);
    return this.get<RecordsPage>(`/records/${encodeURIComponent(leaderboard)}`, rest);
  }

  // --- news ----------------------------------------------------------------

  /**
   * GET /news/:stream — latest news (records, PBs, rankups…).
   * Use stream "global" (default) for the global feed; omit for all streams.
   */
  async news(stream: string | null = 'global', limit = 25): Promise<NewsItem[]> {
    const path = stream ? `/news/${encodeURIComponent(stream)}` : '/news/';
    const data = await this.get<{ news: NewsItem[] }>(path, { limit });
    return data.news;
  }

  // --- labs ----------------------------------------------------------------

  /** GET /labs/league_ranks — rank metadata (unwrapped from the labs envelope). */
  async leagueRanks(): Promise<LeagueRanks> {
    const data = await this.get<{ data: LeagueRanks }>('/labs/league_ranks');
    return data.data;
  }
}
