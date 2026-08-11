/**
 * theorypack: TETR.IO's wire encoding.
 *
 * theorypack == msgpackr with DEFAULT options (records/structures ON, string bundling OFF).
 * Verified byte-identical against the official client (see docs/PROTOCOL.md).
 *
 * Note: the official client constructs Packr({ bundleStrings: true }) for HTTP, but the observed
 * wire format equals msgpackr DEFAULTS (bundleStrings off) for the payloads we care about. We
 * therefore use defaults; do not enable bundleStrings.
 */
import { Packr, Unpackr, addExtension } from 'msgpackr';
import { ExtensionBase } from './netcodec.js';
import { initStructures } from './structures.js';

// Result wrapper extension types used by the server (from client source):
// type 1 => success, type 2 => error.
addExtension({
  type: 1,
  read: (e: any) => (e === null ? { success: true } : { success: true, ...e }),
});
addExtension({
  type: 2,
  read: (e: any) => (e === null ? { success: false } : { success: false, error: e }),
});

const packr = new Packr();
const unpackr = new Unpackr();
// NetCodec extension encode/decode runs REENTRANTLY while packr is mid-pack (e.g. packing a
// Replay ext triggers Encoder.pack(frames)). A dedicated Packr for extension-internal packing
// keeps that off the main packr's state — sharing one corrupts the output buffer (observed:
// ext payloads prefixed with bytes of earlier packs).
const extPackr = new Packr();

export function pack(value: unknown): Uint8Array {
  return packr.pack(value);
}

export function unpack<T = unknown>(buf: Uint8Array): T {
  return unpackr.unpack(buf) as T;
}

/** Unpack every value in a buffer that holds several concatenated msgpack values. */
export function unpackMultiple<T = unknown>(buf: Uint8Array): T[] {
  const out: T[] = [];
  unpackr.unpackMultiple(buf, (v: T) => {
    out.push(v);
    return true;
  });
  return out;
}

export { Packr, Unpackr };


// --- Game-data (NetCodec) extensions ---
// Registering these lets theorypack.unpack transparently decode game.replay / game.replay.state /
// game.spectate payloads (the msgpackr ext types >= 10).
function initGameExtensions(): void {
  initStructures();
  ExtensionBase.LoadExtensions({
    addExtension: (e: unknown) => addExtension(e as never),
    pack: (v: unknown) => extPackr.pack(v),
    useBuffer: (b: unknown) => extPackr.useBuffer(b as never),
    unpack: (b: unknown) => unpackr.unpack(b as never),
  } as never);
}
initGameExtensions();
