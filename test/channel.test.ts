/**
 * channel.test.ts — unit tests for the TETRA CHANNEL REST API client
 * (src/net/channel.ts). fetch is fully mocked — these never hit the network.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ChannelApi,
  ChannelApiError,
  prisecterToString,
  CHANNEL_API_BASE,
} from '../src/net/channel.js';

// --- mock fetch plumbing -----------------------------------------------------

interface MockCall { url: string; init: RequestInit }

function stubFetch(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  const calls: MockCall[] = [];
  const fn = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init: (init ?? {}) as RequestInit });
    const r = handler(String(url), (init ?? {}) as RequestInit);
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => r.body,
    } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

function ok(data: unknown, cachedUntil = 0) {
  return { body: { success: true, data, cache: { status: 'miss', cached_at: cachedUntil - 60_000, cached_until: cachedUntil } } };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const fast = { minIntervalMs: 0 };

// --- tests -------------------------------------------------------------------

describe('ChannelApi request plumbing', () => {
  it('unwraps the envelope and hits the right URL', async () => {
    const { calls } = stubFetch(() => ok({ usercount: 42 }));
    const api = new ChannelApi(fast);
    const stats = await api.serverStats();
    expect(stats.usercount).toBe(42);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${CHANNEL_API_BASE}/general/stats`);
  });

  it('sends User-Agent and X-Session-ID headers', async () => {
    const { calls } = stubFetch(() => ok({ usercount: 1 }));
    const api = new ChannelApi({ ...fast, sessionId: 'SESS-TEST', userAgent: 'test-agent/1.0' });
    await api.serverStats();
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('test-agent/1.0');
    expect(headers['X-Session-ID']).toBe('SESS-TEST');
  });

  it('generates a session id and rotates it on demand', async () => {
    const { calls } = stubFetch(() => ok({}));
    const api = new ChannelApi(fast);
    expect(api.session).toMatch(/^SESS-/);
    const first = api.session;
    api.rotateSession();
    expect(api.session).not.toBe(first);
    await api.serverStats();
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['X-Session-ID']).toBe(api.session);
  });

  it('throws ChannelApiError on success:false payloads', async () => {
    stubFetch(() => ({ status: 404, body: { success: false, error: { msg: 'no such user' } } }));
    const api = new ChannelApi(fast);
    await expect(api.user('nobody')).rejects.toThrow(ChannelApiError);
    await expect(api.user('nobody')).rejects.toThrow(/no such user/);
  });

  it('throws ChannelApiError on non-OK HTTP without a body', async () => {
    stubFetch(() => ({ status: 500, body: null }));
    const api = new ChannelApi(fast);
    await expect(api.serverStats()).rejects.toThrow(/HTTP 500/);
  });

  it('throws ChannelApiError when data is missing from a success envelope', async () => {
    stubFetch(() => ({ body: { success: true } }));
    const api = new ChannelApi(fast);
    await expect(api.serverStats()).rejects.toThrow(ChannelApiError);
  });
});

describe('ChannelApi caching', () => {
  it('serves repeat requests from cache until cached_until', async () => {
    const { fn } = stubFetch(() => ok({ usercount: 7 }, 10_000));
    let now = 5_000;
    const api = new ChannelApi({ ...fast, now: () => now });
    const a = await api.serverStats();
    const b = await api.serverStats();
    expect(a).toBe(b);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-requests once cached_until has passed', async () => {
    const { fn } = stubFetch(() => ok({ usercount: 7 }, 10_000));
    let now = 5_000;
    const api = new ChannelApi({ ...fast, now: () => now });
    await api.serverStats();
    now = 10_001; // past cached_until
    await api.serverStats();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('can bypass the cache entirely (honorCache: false)', async () => {
    const { fn } = stubFetch(() => ok({ usercount: 7 }, 60_000));
    const api = new ChannelApi({ ...fast, honorCache: false });
    await api.serverStats();
    await api.serverStats();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('clearCache() forces a refetch', async () => {
    const { fn } = stubFetch(() => ok({ usercount: 7 }, 60_000));
    const api = new ChannelApi(fast);
    await api.serverStats();
    api.clearCache();
    await api.serverStats();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('ChannelApi rate limiting', () => {
  it('spaces out network requests by minIntervalMs', async () => {
    // distinct URLs so nothing is served from cache
    stubFetch(() => ok({}, 0));
    const api = new ChannelApi({ minIntervalMs: 50 });
    const t0 = Date.now();
    await api.get('/general/stats', { n: 1 });
    await api.get('/general/stats', { n: 2 });
    await api.get('/general/stats', { n: 3 });
    const elapsed = Date.now() - t0;
    // 3 serialized requests at >=50ms spacing => >=100ms total (timers only overshoot)
    expect(elapsed).toBeGreaterThanOrEqual(95);
  });
});

describe('ChannelApi endpoints', () => {
  it('league/xp/ar leaderboards build correct URLs with pagination', async () => {
    const { calls } = stubFetch(() => ok({ entries: [] }));
    const api = new ChannelApi(fast);
    await api.leagueLeaderboard({ limit: 25 });
    await api.xpLeaderboard({ limit: 10, country: 'US' });
    await api.arLeaderboard({ limit: 5, after: { pri: 123.5, sec: 0, ter: 2 } });
    expect(calls[0].url).toBe(`${CHANNEL_API_BASE}/users/by/league?limit=25`);
    expect(calls[1].url).toBe(`${CHANNEL_API_BASE}/users/by/xp?limit=10&country=US`);
    expect(calls[2].url).toBe(`${CHANNEL_API_BASE}/users/by/ar?limit=5&after=${encodeURIComponent('123.5:0:2')}`);
  });

  it('user() lowercases and encodes the username', async () => {
    const { calls } = stubFetch(() => ok({ username: 'osk' }));
    const api = new ChannelApi(fast);
    const u = await api.user('OSK');
    expect(u.username).toBe('osk');
    expect(calls[0].url).toBe(`${CHANNEL_API_BASE}/users/osk`);
  });

  it('userSummaries() hits /users/:user/summaries', async () => {
    const { calls } = stubFetch(() => ok({ league: { gamesplayed: 1 } }));
    const api = new ChannelApi(fast);
    const s = await api.userSummaries('caboozled_pie');
    expect(s.league.gamesplayed).toBe(1);
    expect(calls[0].url).toBe(`${CHANNEL_API_BASE}/users/caboozled_pie/summaries`);
  });

  it('records() hits /records/:leaderboard with pagination and no country param', async () => {
    const { calls } = stubFetch(() => ok({ entries: [] }));
    const api = new ChannelApi(fast);
    await api.records('40l_global', { limit: 3, after: '1:2:3', country: 'US' });
    expect(calls[0].url).toBe(`${CHANNEL_API_BASE}/records/40l_global?limit=3&after=${encodeURIComponent('1:2:3')}`);
    await api.records('zenith_global@2024w31');
    expect(calls[1].url).toBe(`${CHANNEL_API_BASE}/records/${encodeURIComponent('zenith_global@2024w31')}`);
  });

  it('news() unwraps the news array; global is the default stream', async () => {
    const { calls } = stubFetch(() =>
      ok({ news: [{ _id: 'a', stream: 'global', type: 'rankup', data: { username: 'x', rank: 's' }, ts: '2024-01-01' }] }),
    );
    const api = new ChannelApi(fast);
    const items = await api.news();
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('rankup');
    expect(calls[0].url).toBe(`${CHANNEL_API_BASE}/news/global?limit=25`);
    await api.news(null, 100);
    expect(calls[1].url).toBe(`${CHANNEL_API_BASE}/news/?limit=100`);
  });

  it('leagueRanks() unwraps the labs envelope', async () => {
    stubFetch(() => ok({ _id: 'x', s: 'league_ranks', t: 'now', data: { total: 1234, x: { pos: 1, percentile: 0.01, tr: 22000, targettr: 22500, count: 300 } } }));
    const api = new ChannelApi(fast);
    const ranks = await api.leagueRanks();
    expect(ranks.total).toBe(1234);
    expect((ranks.x as any).tr).toBe(22000);
  });
});

describe('prisecterToString', () => {
  it('formats pri:sec:ter', () => {
    expect(prisecterToString({ pri: 24733.5, sec: 0, ter: 0.875 })).toBe('24733.5:0:0.875');
  });
});

describe('ChannelApi parsing of realistic payloads', () => {
  it('parses a league leaderboard page including prisecters', async () => {
    const entry = {
      _id: 'abc', username: 'vincehd', role: 'user', xp: 44868401.98, country: 'PH', supporter: true,
      league: { gamesplayed: 601, gameswon: 403, glicko: 4253.1, rd: 99.9, tr: 24733.3, gxe: 99.99, rank: 'x+', bestrank: 'x+', apm: 216.04, pps: 3.86, vs: 432.6, decaying: false },
      gamesplayed: 29997, gameswon: 11093, gametime: 9690051.5, ar: 609,
      p: { pri: 24733.3, sec: 0, ter: 0 },
    };
    stubFetch(() => ok({ entries: [entry] }));
    const api = new ChannelApi(fast);
    const page = await api.leagueLeaderboard();
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].username).toBe('vincehd');
    expect(page.entries[0].league.tr).toBeCloseTo(24733.3);
    expect(prisecterToString(page.entries[0].p)).toBe('24733.3:0:0');
  });
});
