/**
 * gamepack.ts — msgpackr integration: registers the game struct classes as
 * msgpackr extension types (10+) via ExtensionBase.LoadExtensions, exactly
 * like the client's ze.LoadExtensions.
 */

import { Packr, Unpackr, addExtension } from 'msgpackr';
import { Encoder, Decoder, ExtensionBase } from '../../src/net/netcodec.js';
import { initStructures } from '../../src/net/structures.js';

export interface GamePack {
  packr: Packr;
  unpackr: Unpackr;
}

let done = false;

export function createGamePack(): GamePack {
  initStructures();
  const packr = new Packr({ bundleStrings: false });
  const unpackr = new Unpackr({ bundleStrings: false });
  if (!done) {
    done = true;
    ExtensionBase.LoadExtensions({
      addExtension: (ext) => addExtension(ext as never),
      pack: (v) => packr.pack(v),
      useBuffer: (b) => packr.useBuffer(b),
      unpack: (b) => unpackr.unpack(b),
    });
  }
  return { packr, unpackr };
}
