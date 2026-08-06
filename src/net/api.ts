/**
 * TETR.IO main game HTTP API client (https://tetr.io/api).
 * theorypack-encoded requests; Bearer JWT auth; X-Session-ID + X-Connection-ID headers.
 * See docs/PROTOCOL.md.
 */
import { webcrypto } from 'node:crypto';
import * as theorypack from './theorypack.js';

const API_BASE = 'https://tetr.io';

export interface Environment {
  vx: string;               // base64 AES-128 key for X-Connection-ID
  version: string;
  mode: string;
  serverCycle: string;
  domain: string;
  ch_domain: string;
  domain_hash: string;
  commit: { id: string; time: number };
  build: { id: string; time: number };
  branch?: string;
  client?: string;
  [key: string]: unknown;
}

export interface AuthResult {
  token: string;   // JWT
  userid: string;
  newname?: boolean;
}

export class ApiError extends Error {
  constructor(public status: number, public body: any) {
    super(`API error ${status}: ${JSON.stringify(body)}`);
  }
}

function sessionId(): string {
  return `SESS-${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`;
}

/** AES-128-CBC encrypt `plaintext` with the env.vx key; returns the X-Connection-ID header value. */
export async function makeConnectionId(vxB64: string, connectionId: string): Promise<string> {
  const keyBytes = Buffer.from(vxB64, 'base64');
  const key = await webcrypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(16));
  const ct = await webcrypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    key,
    new TextEncoder().encode(connectionId),
  );
  return Buffer.from(
    JSON.stringify({
      x: Buffer.from(ct).toString('base64'),
      z: Buffer.from(iv).toString('base64'),
    }),
  ).toString('base64');
}

export class TetrioApi {
  token: string | null = null;
  userid: string | null = null;
  session: string = sessionId();
  environment: Environment | null = null;

  private async request<T = any>(
    method: string,
    path: string,
    opts: { body?: unknown; connectionId?: string; session?: string } = {},
  ): Promise<T> {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.osk.theorypack',
      'X-Session-ID': opts.session ?? this.session,
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    if (opts.connectionId) headers['X-Connection-ID'] = opts.connectionId;
    let bodyBuf: Uint8Array | undefined;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/vnd.osk.theorypack';
      bodyBuf = theorypack.pack(opts.body);
    }
    const res = await fetch(url, { method, headers, body: bodyBuf });
    const ab = await res.arrayBuffer();
    let parsed: any = null;
    if (ab.byteLength) {
      try { parsed = theorypack.unpack(new Uint8Array(ab)); } catch { parsed = null; }
    }
    if (!res.ok) throw new ApiError(res.status, parsed ?? ab);
    return parsed as T;
  }

  get<T = any>(path: string, opts?: { connectionId?: string }) {
    return this.request<T>('GET', path, opts);
  }
  post<T = any>(path: string, body?: unknown, opts?: { connectionId?: string }) {
    return this.request<T>('POST', path, { ...opts, body });
  }

  /** GET /api/server/environment — call first; caches vx key + signature material. */
  async getEnvironment(): Promise<Environment> {
    this.environment = await this.get<Environment>('/api/server/environment');
    return this.environment;
  }

  /** POST /api/users/authenticate — log in with a real account. */
  async authenticate(username: string, password: string, totp = ''): Promise<AuthResult> {
    const r = await this.post<AuthResult>('/api/users/authenticate', {
      username: username.toLowerCase(),
      password,
      totp,
    });
    this.token = r.token;
    this.userid = r.userid;
    return r;
  }

  /** POST /api/users/anonymousJoin — join as a guest. */
  async anonymousJoin(username: string, captcha = ''): Promise<AuthResult> {
    const r = await this.post<AuthResult>('/api/users/anonymousJoin', { username, captcha });
    this.token = r.token;
    this.userid = r.userid;
    return r;
  }

  /** GET /api/users/me — the full user object. Requires X-Connection-ID. */
  async getMe(connectionId: string): Promise<any> {
    if (!this.environment) await this.getEnvironment();
    const xcid = await makeConnectionId(this.environment!.vx, connectionId);
    return this.get('/api/users/me', { connectionId: xcid });
  }

  /** GET /api/rooms/ — the public room listing. */
  async getRooms(): Promise<{ rooms: any[] }> {
    return this.get('/api/rooms/');
  }

  /** GET /api/rooms/menu — menu counts (quickplay/royale/roomcount). */
  async getRoomsMenu(): Promise<any> {
    return this.get('/api/rooms/menu');
  }

  /** GET /api/server/ribbon — recommended ribbon endpoint(s). */
  async getRibbon(): Promise<{ endpoint: string; spools?: { name: string; flag: string; endpoint: string }[] }> {
    return this.get('/api/server/ribbon');
  }

  /** The signature object sent in the ribbon authorize message (from environment.signature). */
  buildSignature(): Record<string, unknown> {
    const e = this.environment;
    if (!e) throw new Error('call getEnvironment() first');
    return (e as any).signature ?? e;
  }
}

/** Ping all spool servers and return the lowest-latency endpoint base. */
export async function pickBestSpool(
  spools: { name: string; endpoint: string }[],
  timeoutMs = 3000,
): Promise<{ name: string; endpoint: string; ms: number } | null> {
  const probe = async (spool: { name: string; endpoint: string }) => {
    const start = Date.now();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      // The client hits https://<spool>/spool?<ts>-<i>-<rand>
      await fetch(`${spool.endpoint}/spool?${Date.now()}-0-${Math.floor(Math.random() * 1e6)}`, { signal: ctrl.signal });
      clearTimeout(t);
      return { name: spool.name, endpoint: spool.endpoint, ms: Date.now() - start };
    } catch {
      return { name: spool.name, endpoint: spool.endpoint, ms: Infinity };
    }
  };
  const results = await Promise.all(spools.map(probe));
  results.sort((a, b) => a.ms - b.ms);
  return results[0]?.ms === Infinity ? null : results[0];
}
