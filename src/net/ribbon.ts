/**
 * Ribbon: TETR.IO's WebSocket networking layer (client v1.7.8).
 * See docs/PROTOCOL.md + docs/command_table.json + docs/captures/codec_deobfuscated.js.
 */
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import * as theorypack from './theorypack.js';
import {
  F_ID, CODE_MASK,
  CODE_NEW, CODE_DIE, CODE_PING, CODE_SESSION, CODE_PACKETS,
  CODE_KICK, CODE_NOPE, CODE_PNI, CODE_NOTIFY, CODE_GENERIC,
  GENERIC_CODES, GENERIC_NAMES, KICK_REASONS, NOPE_REASONS, PNI_TYPES, NOTIFY_TYPES,
} from './commands.js';

export interface RibbonMessage {
  command: string;
  data?: any;
  id?: number;
}

const CACHE_MAXSIZE = 4096;

/** Decode one Ribbon packet. Returns {command, data, id} or throws. */
export function decodePacket(buf: Uint8Array): RibbonMessage {
  const b0 = buf[0];
  const code = b0 & CODE_MASK;
  let offset = 1;
  let id: number | undefined;
  if (b0 & F_ID) {
    id = (buf[1] << 16) | (buf[2] << 8) | buf[3];
    offset = 4;
  }
  const payload = buf.subarray(offset);
  switch (code) {
    case CODE_NEW: return { command: 'new', id };
    case CODE_DIE: return { command: 'die', id };
    case CODE_PING: return { command: 'ping', id, data: { recvid: new DataView(payload.buffer, payload.byteOffset).getUint32(0) } };
    case CODE_SESSION:
      return { command: 'session', id, data: {
        ribbonid: Buffer.from(payload.subarray(0, 8)).toString('hex'),
        tokenid: Buffer.from(payload.subarray(8, 16)).toString('hex'),
      } };
    case CODE_PACKETS: {
      const packets: Uint8Array[] = [];
      for (let s = 0; s < payload.length;) {
        const n = new DataView(payload.buffer, payload.byteOffset + s).getUint32(0); s += 4;
        packets.push(payload.subarray(s, s + n)); s += n;
      }
      return { command: 'packets', id, data: { packets } };
    }
    case CODE_KICK: {
      const r = payload[0];
      return { command: 'kick', id, data: { reason: KICK_REASONS[r] ?? Buffer.from(payload.subarray(1)).toString('utf8') } };
    }
    case CODE_NOPE:
      return { command: 'nope', id, data: { reason: NOPE_REASONS[payload[0]] ?? 'unknown' } };
    case CODE_PNI:
      return { command: 'pni', id, data: { type: PNI_TYPES[payload[0]] ?? payload[0], timeout: new DataView(payload.buffer, payload.byteOffset).getUint16(1) } };
    case CODE_NOTIFY: {
      const t = payload[0];
      const type = NOTIFY_TYPES[t] ?? t;
      if (t === 1) {
        return { command: 'notify', id, data: { type, timeout: new DataView(payload.buffer, payload.byteOffset).getUint16(1), msg: Buffer.from(payload.subarray(3)).toString('utf8') } };
      }
      return { command: 'notify', id, data: { type, msg: Buffer.from(payload.subarray(1)).toString('utf8') } };
    }
    case CODE_GENERIC: {
      const cmdCode = payload[0];
      const command = GENERIC_NAMES[cmdCode] ?? `unknown(${cmdCode})`;
      let data: any;
      try { data = theorypack.unpack(payload.subarray(1)); } catch (e) { data = { _unpackError: String(e), _raw: Buffer.from(payload.subarray(1)).toString('hex') }; }
      return { command, id, data };
    }
    default:
      throw new Error(`unknown ribbon code 0x${code.toString(16)}`);
  }
}

/** Encode a generic-channel command into a Ribbon packet (without id; id is stamped by the sender). */
function encodeGeneric(command: string, data: unknown): { flags: number; code: number; payload: Uint8Array } {
  const cmdCode = GENERIC_CODES[command];
  if (cmdCode === undefined) throw new Error(`unknown generic command: ${command}`);
  const body = theorypack.pack(data === undefined ? null : data);
  const payload = new Uint8Array(1 + body.length);
  payload[0] = cmdCode;
  payload.set(body, 1);
  return { flags: F_ID, code: CODE_GENERIC, payload };
}

function encodePacket(command: string, data?: unknown): { flags: number; code: number; payload: Uint8Array } {
  switch (command) {
    case 'new': return { flags: 0, code: CODE_NEW, payload: new Uint8Array(0) };
    case 'die': return { flags: 0, code: CODE_DIE, payload: new Uint8Array(0) };
    case 'ping': {
      const payload = new Uint8Array(4);
      new DataView(payload.buffer).setUint32(0, (data as any)?.recvid ?? 0);
      return { flags: 0, code: CODE_PING, payload };
    }
    case 'session': {
      const { ribbonid, tokenid } = data as any;
      const payload = new Uint8Array(16);
      Buffer.from(ribbonid, 'hex').copy(Buffer.from(payload.buffer), 0);
      Buffer.from(tokenid, 'hex').copy(Buffer.from(payload.buffer), 8);
      return { flags: 0, code: CODE_SESSION, payload };
    }
    case 'packets': {
      const packets = (data as any).packets as Uint8Array[];
      const total = packets.reduce((a, p) => a + p.length, 0);
      const payload = new Uint8Array(total + 4 * packets.length);
      let s = 0;
      for (const p of packets) {
        new DataView(payload.buffer).setUint32(s, p.length);
        payload.set(p, s + 4);
        s += p.length + 4;
      }
      return { flags: 0, code: CODE_PACKETS, payload };
    }
    default:
      return encodeGeneric(command, data);
  }
}

export interface RibbonEvents {
  message: (msg: RibbonMessage) => void;
  open: () => void;
  close: (reason: string) => void;
  kick: (reason: string) => void;
  error: (err: Error) => void;
  authorized: (data: any) => void;
  migrate: (data: { endpoint: string; name: string; flag: string }) => void;
}

/** A Ribbon connection. */
export class Ribbon extends EventEmitter {
  ws: WebSocket | null = null;
  id: string | null = null;      // ribbon id (from server session)
  tokenid: string | null = null; // resume token
  endpoint: string;
  spoolid: string | null = null;
  private sentid = 0;
  private recvid = 0;
  private recvQueue: RibbonMessage[] = [];
  private sentQueue: { id: number; packet: Uint8Array }[] = [];
  private heartbeat = 0;
  private pingTimer: NodeJS.Timeout | null = null;
  private lastPing = 0;
  private alive = false;
  private corkQueue: RibbonMessage[] | null = null;

  constructor(endpoint: string, spoolid?: string) {
    super();
    this.endpoint = endpoint;
    this.spoolid = spoolid ?? null;
  }

  connect(): void {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }
    this.ws = this.spoolid ? new WebSocket(this.endpoint, this.spoolid) : new WebSocket(this.endpoint);
    this.ws.binaryType = 'nodebuffer';
    this.ws.on('open', () => this.onOpen());
    this.ws.on('message', (data: Buffer) => this.onMessage(new Uint8Array(data)));
    this.ws.on('close', () => this.handleClose());
    this.ws.on('error', (err) => this.emit('error', err));
    this.pingTimer = setInterval(() => this.pingInterval(), 2500);
  }

  private onOpen(): void {
    this.alive = true;
    if (this.tokenid) {
      this.send('session', { ribbonid: this.id, tokenid: this.tokenid });
    } else {
      this.send('new');
    }
  }

  private onMessage(buf: Uint8Array): void {
    this.alive = true;
    let msg: RibbonMessage;
    try {
      msg = decodePacket(buf);
    } catch (e) {
      this.emit('error', e as Error);
      return;
    }
    this.processMessage(msg);
    this.processQueue();
  }

  private processMessage(msg: RibbonMessage): void {
    if (msg.id !== undefined) {
      if (msg.id <= this.recvid) return;
      if (msg.id !== this.recvid + 1) {
        this.recvQueue.push(msg);
        return;
      }
      this.runMessage(msg);
    } else {
      this.runMessage(msg);
    }
  }

  private processQueue(): void {
    if (!this.recvQueue.length) return;
    if (this.recvQueue.length > CACHE_MAXSIZE) {
      this.close('too many lost packets');
      return;
    }
    this.recvQueue.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    while (this.recvQueue.length) {
      const m = this.recvQueue[0];
      if (m.id === undefined || m.id <= this.recvid) { this.recvQueue.shift(); continue; }
      if (m.id !== this.recvid + 1) break;
      this.recvQueue.shift();
      this.runMessage(m);
    }
  }

  private runMessage(msg: RibbonMessage): void {
    if (msg.id !== undefined) this.recvid = msg.id;
    switch (msg.command) {
      case 'session': {
        this.id = msg.data.ribbonid;
        const hadToken = !!this.tokenid;
        this.tokenid = msg.data.tokenid;
        if (hadToken) {
          this.send('packets', { packets: this.sentQueue.map((q) => q.packet) });
        }
        this.emit('open');
        break;
      }
      case 'ping': {
        const recvid = msg.data.recvid;
        this.emit('pong', Date.now() - this.lastPing);
        while (this.sentQueue.length && this.sentQueue[0].id <= recvid) this.sentQueue.shift();
        break;
      }
      case 'kick': this.emit('kick', msg.data.reason); this.close(); break;
      case 'nope': this.close(msg.data.reason); break;
      case 'packets': {
        for (const sub of msg.data.packets as Uint8Array[]) {
          try {
            this.processMessage(decodePacket(sub));
          } catch (e) { this.emit('error', e as Error); }
        }
        break;
      }
      case 'server.authorize': this.emit('authorized', msg.data); this.emitMessage(msg); break;
      case 'server.migrate': this.emit('migrate', msg.data); this.emitMessage(msg); break;
      default: this.emitMessage(msg); break;
    }
  }

  private emitMessage(msg: RibbonMessage): void {
    if (this.corkQueue) { this.corkQueue.push(msg); return; }
    this.emit('message', msg);
    this.emit(msg.command, msg.data, msg.id);
  }

  cork(): void { if (this.corkQueue == null) this.corkQueue = []; }
  uncork(): void {
    if (!this.corkQueue) return;
    for (const m of this.corkQueue) { this.emit('message', m); this.emit(m.command, m.data, m.id); }
    this.corkQueue = null;
  }

  /** Send a command. Stamps the message id for F_ID commands. */
  send(command: string, data?: unknown): void {
    const { flags, code, payload } = encodePacket(command, data);
    let headerSize = 1;
    if (!(flags & F_ID)) {
      const pkt = new Uint8Array(1 + payload.length);
      pkt[0] = code | flags;
      pkt.set(payload, 1);
      this.sendInternal(pkt);
      return;
    }
    headerSize = 4;
    const id = ++this.sentid;
    const pkt = new Uint8Array(headerSize + payload.length);
    pkt[0] = code | flags;
    pkt[1] = (id >> 16) & 0xff;
    pkt[2] = (id >> 8) & 0xff;
    pkt[3] = id & 0xff;
    pkt.set(payload, headerSize);
    this.sentQueue.push({ id, packet: pkt });
    if (this.sentQueue.length > CACHE_MAXSIZE) this.sentQueue.shift();
    this.sendInternal(pkt);
  }

  private sendInternal(pkt: Uint8Array): void {
    try {
      this.ws?.send(pkt);
    } catch (e) {
      // swallow
    }
  }

  private pingInterval(): void {
    this.heartbeat++;
    // Match the official client: ping every OTHER 2.5s heartbeat (i.e. every 5s),
    // and only declare a timeout when the alive flag has been false for a full ping window.
    if (this.heartbeat % 2 !== 0) return;
    if (!this.alive) {
      this.close('ping timeout');
      return;
    }
    this.alive = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.lastPing = Date.now();
      this.send('ping', { recvid: this.recvid });
    }
  }

  isConnected(): boolean { return !!this.ws && this.ws.readyState === WebSocket.OPEN; }

  private handleClose(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    this.emit('close', this.lastCloseReason);
  }

  private lastCloseReason = 'ribbon lost';

  close(reason = 'ribbon lost'): void {
    this.lastCloseReason = reason;
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    try {
      if (this.isConnected()) this.send('die');
      this.ws?.close();
    } catch (e) { /* ignore */ }
    this.emit('close', reason);
  }
}
