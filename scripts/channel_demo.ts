#!/usr/bin/env node
/**
 * channel_demo.ts — render the TETRA CHANNEL screens standalone in a pty.
 *
 *   npx tsx scripts/channel_demo.ts [--mock] [--open league|xp|ar|news|profile] [--user <name>]
 *
 * Without --mock it talks to the live public TETRA CHANNEL API (no auth).
 * --mock uses a deterministic in-memory dataset (no network) — used for the
 * pty snapshot verification and offline development.
 *
 * Keys: arrows navigate, enter confirms/opens, esc goes back (quits at root).
 */
import { App, type Screen } from '../src/tui/app.js';
import { TerminalDriver } from '../src/tui/driver.js';
import { MenuScreen } from '../src/tui/screens/menu.js';
import {
  createChannelMenuNode,
  LeaderboardScreen,
  NewsFeedScreen,
  ProfileScreen,
  type ChannelDeps,
} from '../src/tui/screens/channel.js';
import { ChannelApi } from '../src/net/channel.js';

// ---------------------------------------------------------------------------
// deterministic mock dataset (--mock)
// ---------------------------------------------------------------------------

const NAMES = [
  'vincehd', 'turtle', 'caboozled_pie', 'westl', 'kafe11', 'miinhuyvcl', 'lumina',
  'diao', 'bluely', 'qmk', 'aerospace', 'firestorm', 'icely', 'solar', 'nova',
];
const COUNTRIES = ['PH', 'KR', 'US', 'JP', 'GB', 'DE', 'FR', 'CA', 'AU', 'BR', null, 'NL'];

function rankForTr(tr: number): string {
  const bands: [number, string][] = [
    [24000, 'x+'], [22500, 'x'], [20000, 'u'], [18000, 'ss'], [16500, 's+'], [15000, 's'],
    [13800, 's-'], [12000, 'a+'], [10500, 'a'], [8900, 'a-'], [7400, 'b+'], [5700, 'b'],
    [4200, 'b-'], [3000, 'c+'], [2000, 'c'], [1300, 'c-'], [700, 'd+'], [0, 'd'],
  ];
  for (const [min, r] of bands) if (tr >= min) return r;
  return 'd';
}

function mockEntries(kind: 'league' | 'xp' | 'ar', count: number) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const username = i < NAMES.length ? NAMES[i] : `player${String(i + 1).padStart(3, '0')}`;
    const tr = 24800 - i * 160.5;
    const xp = 120_000_000 - i * 1_513_279.7;
    const ar = 5123 - i * 61;
    const pri = kind === 'league' ? tr : kind === 'xp' ? xp : ar;
    out.push({
      _id: `mock-${kind}-${i}`,
      username,
      role: 'user',
      xp,
      country: COUNTRIES[i % COUNTRIES.length],
      supporter: i % 3 === 0,
      ts: '2020-09-13T06:31:32.291Z',
      league: {
        gamesplayed: 600 - i, gameswon: 400 - i, glicko: 4200 - i * 30, rd: 65 + i,
        tr, gxe: Math.max(1, 99.99 - i * 0.42), rank: rankForTr(tr), bestrank: rankForTr(tr + 500),
        apm: Math.max(8, 220 - i * 2.17), pps: Math.max(0.5, 3.9 - i * 0.037), vs: Math.max(15, 435 - i * 4.31),
        decaying: i % 7 === 0,
      },
      gamesplayed: 30000 - i * 100, gameswon: 11000 - i * 40, gametime: 9_690_051 - i * 1000,
      ar,
      ar_counts: { 5: 30, 100: 2 },
      p: { pri, sec: 0, ter: 0 },
    });
  }
  return out;
}

const MOCK_LB: Record<string, ReturnType<typeof mockEntries>> = {
  league: mockEntries('league', 60),
  xp: mockEntries('xp', 60),
  ar: mockEntries('ar', 60),
};

function mockNews(count: number) {
  const gametypes = ['40l', 'blitz', 'zenith', 'zenithex'];
  const news = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const username = NAMES[i % NAMES.length];
    const gametype = gametypes[i % gametypes.length];
    const result = gametype === '40l' ? 13430 + i * 137
      : gametype === 'blitz' ? 1_700_000 - i * 13_731
      : 6300 - i * 42.5;
    const type = i % 9 === 4 ? 'rankup' : i % 9 === 7 ? 'badge' : 'leaderboard';
    news.push({
      _id: `news-${i}`,
      stream: 'global',
      type,
      data:
        type === 'rankup'
          ? { username, rank: rankForTr(24000 - i * 900) }
          : type === 'badge'
            ? { username, badge: 'secretgrade', label: 'Achieved the full Secret Grade' }
            : { username, gametype, rank: 1 + (i % 12), result, replayid: `r${i}eplay` },
      ts: new Date(now - (i * 37 + 5) * 60_000).toISOString(),
    });
  }
  return news;
}

function mockUser(username: string) {
  return {
    _id: `mock-user-${username}`,
    username,
    role: 'user',
    ts: '2020-02-15T03:45:49.913Z',
    badges: [
      { id: 'secretgrade', label: 'Achieved the full Secret Grade', ts: '2020-05-05T23:43:30.514Z' },
      { id: 'leaderboard1', label: 'Achieved a World Record on a TETRA CHANNEL leaderboard', ts: '2021-02-19T00:06:01.567Z' },
      { id: 'kod_founder', label: "KO'd the founder of TETR.IO", ts: '2020-06-26T01:27:52.593Z' },
    ],
    xp: 44_868_401.98,
    gamesplayed: 29997,
    gameswon: 11093,
    gametime: 9_690_051.5,
    country: 'US',
    supporter: true,
    supporter_tier: 2,
    friend_count: 128,
    ar: 609,
    ar_counts: { 5: 30, 100: 2 },
  };
}

function mockRecord(gamemode: string, username: string, finaltime: number, score: number, altitude?: number) {
  return {
    _id: `rec-${gamemode}-${username}`,
    replayid: 'ca3b971ef579',
    stub: false,
    gamemode,
    pb: true,
    oncepb: true,
    ts: '2024-10-25T05:57:38.549Z',
    revolution: null,
    user: { id: `mock-user-${username}`, username, country: 'US', supporter: true },
    otherusers: [],
    leaderboards: [`${gamemode}_global`],
    results: {
      aggregatestats: { apm: 0, pps: 6.56, vsscore: 0 },
      stats: { finaltime, score, zenith: altitude === undefined ? undefined : { altitude, floor: 10 } },
    },
  };
}

function mockSummaries(username: string) {
  return {
    '40l': { record: mockRecord('40l', username, 15403.33, 14054), rank: 1821, rank_local: 640 },
    blitz: { record: mockRecord('blitz', username, 120000, 1388599), rank: 28, rank_local: 12 },
    zenith: {
      record: null, rank: -1, rank_local: -1,
      best: { record: mockRecord('zenith', username, 0, 753464, 7731.05), rank: 11 },
    },
    zenithex: { record: null, rank: -1, rank_local: -1, best: { record: null, rank: -1 } },
    league: {
      gamesplayed: 464, gameswon: 403, glicko: 4279.99, rd: 126.1, tr: 24727.19,
      gxe: 99.9967, rank: 'x+', bestrank: 'x+', apm: 222.83, pps: 3.95, vs: 432.85,
      decaying: false, standing: 3, standing_local: 2, percentile: 0.0000575, percentile_rank: 'x+',
      prev_rank: null, prev_at: -1, next_rank: null, next_at: -1,
    },
    zen: { level: 284, score: 20_959_030 },
    achievements: [],
  };
}

function envelope(data: unknown): unknown {
  const now = Date.now();
  return { success: true, data, cache: { status: 'miss', cached_at: now, cached_until: now + 60_000 } };
}

/** Deterministic in-memory fetch for --mock. Emulates envelope + prisecter pagination. */
function createMockFetch(): typeof fetch {
  const impl = async (input: any): Promise<any> => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api/, '');
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '25', 10) || 25));
    const after = url.searchParams.get('after');
    // small latency so loading states are visible
    await new Promise((r) => setTimeout(r, 40));

    const lbMatch = /^\/users\/by\/(league|xp|ar)$/.exec(path);
    if (lbMatch) {
      let entries = MOCK_LB[lbMatch[1]];
      if (after) {
        const afterPri = parseFloat(after.split(':')[0]);
        entries = entries.filter((e) => e.p.pri < afterPri);
      }
      return { ok: true, status: 200, json: async () => envelope({ entries: entries.slice(0, limit) }) };
    }
    if (path === '/news/global' || path === '/news/') {
      return { ok: true, status: 200, json: async () => envelope({ news: mockNews(limit) }) };
    }
    const summariesMatch = /^\/users\/([a-z0-9_-]+)\/summaries$/.exec(path);
    if (summariesMatch) {
      return { ok: true, status: 200, json: async () => envelope(mockSummaries(summariesMatch[1])) };
    }
    const userMatch = /^\/users\/([a-z0-9_-]+)$/.exec(path);
    if (userMatch) {
      if (userMatch[1] === 'nobody') {
        return { ok: false, status: 404, json: async () => ({ success: false, error: { msg: 'no such user' } }) };
      }
      return { ok: true, status: 200, json: async () => envelope(mockUser(userMatch[1])) };
    }
    if (path === '/general/stats') {
      return {
        ok: true, status: 200,
        json: async () => envelope({ usercount: 9_581_751, usercount_delta: 0.1, anoncount: 6_207_279, totalaccounts: 26_454_587, rankedcount: 34776, recordcount: 197_048_776, gamesplayed: 1_057_817_867, gamesplayed_delta: 5.19, gamesfinished: 842_607_887, gametime: 181_737_973_966, inputs: 684_519_050_738, piecesplaced: 159_974_861_399 }),
      };
    }
    return { ok: false, status: 404, json: async () => ({ success: false, error: { msg: `mock: unknown endpoint ${path}` } }) };
  };
  return impl as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// app wiring
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { mock: boolean; open: string | null; user: string } {
  let mock = false;
  let open: string | null = null;
  let user = 'caboozled_pie';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mock') mock = true;
    else if (argv[i] === '--open') open = argv[++i] ?? null;
    else if (argv[i] === '--user') user = argv[++i] ?? user;
  }
  return { mock, open, user };
}

const { mock, open, user } = parseArgs(process.argv.slice(2));

const driver = new TerminalDriver();
const app = new App(driver);
const api = new ChannelApi(mock ? { fetchImpl: createMockFetch() } : {});

let stopped = false;
const shutdown = (code = 0): void => {
  if (stopped) return;
  stopped = true;
  app.stop();
  process.exit(code);
};
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const deps: ChannelDeps = {
  api,
  pushScreen: (s: Screen) => app.push(s),
  popScreen: () => app.pop(),
};

// root channel menu; esc at the root quits the demo
const root = new MenuScreen(createChannelMenuNode(deps), {
  breadcrumb: ['TETRA CHANNEL'],
  onBack: () => shutdown(0),
  pushScreen: deps.pushScreen,
});

driver.start();
app.start();
app.push(root);

// optionally jump straight into a screen
switch (open) {
  case 'league': case 'xp': case 'ar':
    app.push(new LeaderboardScreen(deps, open));
    break;
  case 'news':
    app.push(new NewsFeedScreen(deps));
    break;
  case 'profile':
    app.push(new ProfileScreen(deps, user));
    break;
  case null:
    break;
  default:
    console.error(`unknown --open target: ${open}`);
    shutdown(2);
}
