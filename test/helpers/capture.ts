/**
 * capture.ts — helpers to walk docs/captures/game_spectate_log.json:
 * Ribbon frame parsing (byte0 = [flags:2][code:6], F_ID=0x80 -> u24be id),
 * code-7 packets expansion, code-43 __pack__ extraction (u8 command + msgpackr),
 * and a msgpackr Unpackr that captures raw ext payloads (game ext types 10+).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Packr, Unpackr, addExtension } from 'msgpackr';

const here = dirname(fileURLToPath(import.meta.url));
export const CAPTURE_PATH = join(here, '..', '..', 'docs', 'captures', 'game_spectate_log.json');

export interface CaptureEntry {
  type: string;
  hex?: string;
  ts?: number;
  [k: string]: unknown;
}

export function loadCapture(): CaptureEntry[] {
  return JSON.parse(readFileSync(CAPTURE_PATH, 'utf8')) as CaptureEntry[];
}

export interface RibbonFrame {
  code: number;
  flags: number;
  id: number | null;
  payload: Buffer;
}

/** Decode one WS message into a Ribbon frame (payload = rest of message). */
export function decodeRibbonFrame(buf: Buffer): RibbonFrame {
  const b0 = buf[0];
  const code = b0 & 0x3f;
  const flags = b0 & 0xc0;
  let p = 1;
  let id: number | null = null;
  if (flags & 0x80) {
    id = buf.readUIntBE(p, 3);
    p += 3;
  }
  return { code, flags, id, payload: buf.subarray(p) };
}

/** Expand a code-7 `packets` payload into nested frames. */
export function decodePackets(payload: Buffer): RibbonFrame[] {
  const out: RibbonFrame[] = [];
  let p = 0;
  while (p < payload.length) {
    const len = payload.readUInt32BE(p);
    p += 4;
    out.push(decodeRibbonFrame(payload.subarray(p, p + len)));
    p += len;
  }
  return out;
}

/** Iterate all logical frames in the capture (expanding packets). */
export function* iterFrames(entries: CaptureEntry[], dir: 'ws-recv' | 'ws-send' = 'ws-recv'): Generator<RibbonFrame> {
  for (const e of entries) {
    if (e.type !== dir || !e.hex) continue;
    const f = decodeRibbonFrame(Buffer.from(e.hex, 'hex'));
    if (f.code === 7) yield* decodePackets(f.payload);
    else yield f;
  }
}

/** Iterate code-43 __pack__ messages: {command, data} (data = msgpackr bytes). */
export function* iterPackCommands(entries: CaptureEntry[], dir: 'ws-recv' | 'ws-send' = 'ws-recv'): Generator<{ command: number; data: Buffer }> {
  for (const f of iterFrames(entries, dir)) {
    if (f.code !== 43) continue;
    yield { command: f.payload[0], data: f.payload.subarray(1) };
  }
}

/** Raw captured extension payload. */
export class RawExt {
  constructor(
    public readonly extType: number,
    public readonly data: Buffer,
  ) {}
}

const rawExtensions = new Map<number, typeof RawExt>();

/**
 * Register raw-capture handlers for a range of ext types (so msgpackr never
 * throws on the game's custom ext types). Types 0x72/0x74 (msgpackr records)
 * are left alone.
 */
export function registerRawExtensions(from = 1, to = 120): void {
  for (let t = from; t <= to; t++) {
    if (t === 0x72 || t === 0x74) continue;
    if (rawExtensions.has(t)) continue;
    const Cls = class extends RawExt {};
    rawExtensions.set(t, Cls);
    addExtension({
      Class: Cls,
      type: t,
      pack(v: RawExt) {
        return v.data;
      },
      unpack(d: Buffer) {
        return new Cls(t, d);
      },
    });
  }
}

/** Unwrap a top-level msgpack ext container (c7/d4/c8/c9/d5/d6) to {extType, data}. */
export function unwrapExt(buf: Buffer): { extType: number; data: Buffer } {
  const b0 = buf[0];
  if (b0 === 0xc7) return { extType: buf[2], data: buf.subarray(3, 3 + buf[1]) }; // ext8
  if (b0 === 0xc8) return { extType: buf[3], data: buf.subarray(4, 4 + buf.readUInt16BE(1)) }; // ext16
  if (b0 === 0xc9) return { extType: buf[5], data: buf.subarray(6, 6 + buf.readUInt32BE(1)) }; // ext32
  if (b0 === 0xd4) return { extType: buf[1], data: buf.subarray(2, 3) }; // fixext1
  if (b0 === 0xd5) return { extType: buf[1], data: buf.subarray(2, 4) }; // fixext2
  if (b0 === 0xd6) return { extType: buf[1], data: buf.subarray(2, 6) }; // fixext4
  throw new Error(`not an ext container: 0x${b0.toString(16)}`);
}
