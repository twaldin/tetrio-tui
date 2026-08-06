/**
 * High-level TETR.IO session: auth -> environment -> users/me -> ribbon -> authorize -> presence.
 * Handles migration (server.migrate) and reconnection/resume.
 */
import { EventEmitter } from 'node:events';
import { TetrioApi, type AuthResult, type Environment } from './api.js';
import { Ribbon, type RibbonMessage } from './ribbon.js';

export interface SessionOptions {
  host?: string;           // WS host (default wss://tetr.io)
  handling?: Record<string, unknown>;
}

const DEFAULT_HANDLING = {
  arr: 2, das: 10, dcd: 2, sdf: 6,
  safelock: true, cancel: false, may20g: true, irs: 'tap', ihs: 'tap',
};

export class TetrioSession extends EventEmitter {
  api: TetrioApi;
  ribbon: Ribbon | null = null;
  environment: Environment | null = null;
  user: any = null;
  auth: AuthResult | null = null;
  worker: { name: string; flag: string } | null = null;
  host: string;
  handling: Record<string, unknown>;

  constructor(opts: SessionOptions = {}) {
    super();
    this.api = new TetrioApi();
    this.host = opts.host ?? 'wss://tetr.io';
    this.handling = opts.handling ?? DEFAULT_HANDLING;
  }

  get userid(): string | null { return this.api.userid; }

  /** Log in with a real account (username/password[/totp]). */
  async loginAccount(username: string, password: string, totp = ''): Promise<AuthResult> {
    await this.api.getEnvironment();
    this.auth = await this.api.authenticate(username, password, totp);
    return this.auth;
  }

  /** Join anonymously as a guest. */
  async loginAnonymous(username?: string): Promise<AuthResult> {
    await this.api.getEnvironment();
    const name = username ?? `guest-${Math.random().toString(36).slice(2, 8)}__`;
    this.auth = await this.api.anonymousJoin(name);
    return this.auth;
  }

  /** Resume with an existing token (skip re-auth). */
  async loginToken(token: string, userid: string): Promise<void> {
    await this.api.getEnvironment();
    this.api.token = token;
    this.api.userid = userid;
  }

  /** Connect the ribbon and authorize. Resolves on server.authorize success. */
  async connect(): Promise<any> {
    this.environment = this.api.environment ?? (await this.api.getEnvironment());
    // users/me needs X-Connection-ID tied to the ribbon id; but ribbon id only exists after
    // connecting. The official client calls users/me with the *current* connection id which may
    // be a pre-connection value. We call it with our userid as the connection identifier.
    try {
      this.user = await this.api.getMe(this.userid!);
    } catch (e) {
      // non-fatal
      this.emit('debug', `users/me failed: ${e}`);
    }
    const ribbonInfo = await this.api.getRibbon();
    const endpoint = this.resolveEndpoint(ribbonInfo.endpoint);
    return this.connectRibbon(endpoint);
  }

  private resolveEndpoint(path: string): string {
    if (path.startsWith('wss://') || path.startsWith('ws://')) return path;
    return `${this.host}${path}`;
  }

  private connectRibbon(endpoint: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const ribbon = new Ribbon(endpoint);
      this.ribbon = ribbon;
      ribbon.on('open', () => {
        ribbon.send('server.authorize', {
          token: this.api.token,
          handling: this.handling,
          signature: this.api.buildSignature(),
          i: (this.api.buildSignature() as any)?.client?.commit?.id ?? 'x',
        });
      });
      ribbon.on('authorized', (data) => {
        this.worker = data?.worker ?? null;
        // announce presence
        ribbon.send('social.presence', { status: 'online', detail: 'menus' });
        resolve(data);
      });
      ribbon.on('message', (m) => this.onRibbonMessage(m));
      ribbon.on('migrate', (m) => this.onMigrate(m));
      ribbon.on('kick', (r) => this.emit('kick', r));
      ribbon.on('error', (e) => this.emit('error', e));
      ribbon.on('close', (r) => this.emit('close', r));
      ribbon.connect();
      setTimeout(() => reject(new Error('authorize timeout')), 15000);
    });
  }

  private onRibbonMessage(m: RibbonMessage): void {
    if (process.env.TUI_DEBUG) {
      this.msgLog.push(`${m.command}#${m.id ?? '-'}${m.command === 'notify' ? '=' + JSON.stringify(m.data) : ''}`);
      if (this.msgLog.length > 30) this.msgLog.shift();
    }
    this.emit('message', m);
    this.emit(m.command, m.data, m.id);
  }

  msgLog: string[] = [];

  private onMigrate(m: { endpoint: string; name: string; flag: string }): void {
    this.emit('debug', `migrating to ${m.endpoint}`);
    // Reconnect to the new endpoint, resuming the session.
    const ribbon = this.ribbon;
    if (!ribbon) return;
    const newEndpoint = this.resolveEndpoint(m.endpoint);
    // The Ribbon class resumes via its stored session tokenid on reconnect.
    ribbon.endpoint = newEndpoint;
    ribbon.connect();
    this.emit('migrating', m);
  }

  // --- convenience senders ---
  send(command: string, data?: unknown): void {
    this.ribbon?.send(command, data);
  }
  presence(status: string, detail: string): void {
    this.send('social.presence', { status, detail });
  }
  joinRoom(id: string): void {
    this.send('room.join', id.toUpperCase());
  }
  leaveRoom(): void {
    this.send('room.leave', false);
  }
  createRoom(config?: Record<string, unknown>): void {
    this.send('room.create', config ?? {});
  }
  setBracket(bracket: 'player' | 'spectator'): void {
    this.send('room.bracket.switch', bracket);
  }
  spectate(): void { this.send('game.spectate'); }
  scopeStart(gameid: number): void { this.send('game.scope.start', gameid); }
  scopeEnd(gameid: number): void { this.send('game.scope.end', gameid); }
  gameReady(ready = true): void { this.send('game.ready', ready); }
  leagueEnter(): void { this.send('league.enter'); }
  leagueLeave(): void { this.send('league.leave'); }
  leagueReady(): void { this.send('league.ready'); }

  close(): void {
    this.ribbon?.close();
  }
}
