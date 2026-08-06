/**
 * capture.test.ts — decode the real WS capture docs/captures/game_spectate_log.json.
 *
 * Live game.replay (62) messages are: Ribbon frame (code 43) -> u8 command ->
 * msgpackr payload whose top-level value is a custom ext type (10 = Replay/Te).
 * The ext bytes are a NetCodec bitstream: u13 gameid, DInt provisioned, then
 * (8-bit realigned) a msgpackr array of Frames (ext 13), each frame its own
 * NetCodec bitstream.
 *
 * NOTE: this capture's game.replay streams contain only keydown/keyup/ige
 * frames (the joining spectator gets full state via game.replay.state (65) as
 * plaintext theorypack instead). The full-frame path is proven by encoding the
 * captured plaintext state into a FullState and decoding it back below.
 */

import { describe, expect, it } from 'vitest';
import { Unpackr } from 'msgpackr';
import { Decoder, DInt, Encoder } from '../src/net/netcodec.js';
import {
  BoardGrid,
  FullState,
  FullStateData,
  IGE,
  PlayerList,
  REPLAY_KEYS,
  Replay,
  ReplayFrame,
  Scoreboard,
  initStructures,
} from '../src/net/structures.js';
import {
  RawExt,
  iterPackCommands,
  loadCapture,
  registerRawExtensions,
  unwrapExt,
} from './helpers/capture.js';

initStructures();
registerRawExtensions(); // types 1..120 (except msgpackr's own 0x72/0x74) -> RawExt

const unpackr = new Unpackr({ bundleStrings: false });

interface ParsedReplay {
  gameid: number;
  provisioned: number;
  frames: RawExt[];
}

function parseReplay(extData: Buffer): ParsedReplay {
  const dec = new Decoder(extData);
  const gameid = dec.readUInt(13);
  const provisioned = dec.readDInt((Replay as unknown as { $prov: DInt }).$prov);
  dec.realign();
  const frames = unpackr.unpack(extData.subarray(dec.byteOffset)) as RawExt[];
  return { gameid, provisioned, frames };
}

describe('capture: game_spectate_log.json', () => {
  const entries = loadCapture();
  const gameMsgs = [...iterPackCommands(entries)].filter((m) => [53, 62, 65, 67].includes(m.command));
  const replayMsgs = gameMsgs.filter((m) => m.command === 62);
  const stateMsgs = gameMsgs.filter((m) => m.command === 65);

  it('contains the expected message mix', () => {
    expect(replayMsgs.length).toBe(55);
    expect(stateMsgs.length).toBe(5);
    expect(gameMsgs.filter((m) => m.command === 53).length).toBe(1);
  });

  it('decodes every game.replay (Te) wrapper: 5 players, sane ids', () => {
    const seen = new Set<number>();
    for (const m of replayMsgs) {
      const { extType, data } = unwrapExt(m.data);
      expect(extType).toBe(10); // Replay ext type
      const r = parseReplay(data);
      seen.add(r.gameid);
      expect(r.gameid).toBeGreaterThan(7858);
      expect(r.gameid).toBeLessThan(7870);
      expect(r.provisioned).toBeGreaterThan(0);
      expect(r.provisioned).toBeLessThan(2 ** 26);
    }
    expect([...seen].sort()).toEqual([7860, 7862, 7863, 7865]); // no 7864 stream in this capture
  });

  it('decodes all frames bit-exactly (except one known setoptions custom IGE)', () => {
    let keyFrames = 0;
    let igeFrames = 0;
    const failures: string[] = [];
    const keyHist = new Map<string, number>();
    for (const m of replayMsgs) {
      const { data } = unwrapExt(m.data);
      const r = parseReplay(data);
      let prevFrame = -1;
      for (const raw of r.frames) {
        expect(raw).toBeInstanceOf(RawExt);
        expect(raw.extType).toBe(13); // ReplayFrame ext type
        const fd = new Decoder(raw.data, (off) => unpackr.unpack(raw.data.subarray(off)));
        try {
          const frame = ReplayFrame.decode(fd);
          const leftover = raw.data.length * 8 - fd.offset;
          expect(leftover).toBeGreaterThanOrEqual(0);
          expect(leftover).toBeLessThan(8); // only final-byte padding remains
          if (frame.type === 'keydown' || frame.type === 'keyup') {
            keyFrames++;
            keyHist.set(frame.data.key, (keyHist.get(frame.data.key) ?? 0) + 1);
            expect(REPLAY_KEYS).toContain(frame.data.key);
            expect(frame.data.subframe).toBeGreaterThanOrEqual(0);
            expect(frame.data.subframe).toBeLessThanOrEqual(1);
            expect(frame.frame).toBeGreaterThanOrEqual(prevFrame);
            prevFrame = frame.frame;
          } else if (frame.type === 'ige') {
            igeFrames++;
          }
        } catch (err) {
          failures.push((err as Error).message);
        }
      }
    }
    expect(keyFrames).toBeGreaterThan(250);
    expect(igeFrames).toBe(58);
    // The single failure is a custom 'setoptions' IGE whose PlayerOptions payload
    // needs the client's full OptsBook (not present in the deobfuscated capture).
    expect(failures.length).toBe(1);
    expect(failures[0]).toMatch(/Unknown type for key/);
    // key histogram is game-plausible: rotations/moves/drops dominate
    expect(keyHist.size).toBeGreaterThanOrEqual(6);
    expect(keyHist.get('exit')).toBeUndefined();
  });

  it('decodes garbage IGE events with sane, ack-consistent values', () => {
    const iges: { id: number; frame: number; type: string; data: Record<string, unknown> }[] = [];
    for (const m of replayMsgs) {
      const r = parseReplay(unwrapExt(m.data).data);
      for (const raw of r.frames) {
        const fd = new Decoder(raw.data, (off) => unpackr.unpack(raw.data.subarray(off)));
        try {
          const frame = ReplayFrame.decode(fd);
          if (frame.type === 'ige') iges.push(frame.data);
        } catch {
          /* the known setoptions failure */
        }
      }
    }
    expect(iges.length).toBe(58);
    const interactions = iges.filter((g) => g.type === 'interaction' || g.type === 'interaction_confirm');
    expect(interactions.length).toBeGreaterThan(0);
    for (const g of interactions) {
      const d = g.data;
      expect(d.type).toBe('garbage');
      expect(d.gameid).toBeGreaterThan(7858);
      expect(d.gameid).toBeLessThan(7870);
      expect(d.amt).toBeGreaterThan(0);
      expect(d.size).toBe(1);
      expect(d.y).toBeGreaterThanOrEqual(20);
      expect(d.y).toBeLessThanOrEqual(46);
      expect(d.x).toBeGreaterThanOrEqual(-1);
      expect(d.x).toBeLessThanOrEqual(9);
      expect(d.iid).toBeGreaterThan(0);
      expect(d.cid).toBeGreaterThan(0);
      expect(d.ackiid).toBeGreaterThanOrEqual(0);
    }
    // note: iid is a per (sender -> victim) pair counter, so interleaved streams
    // are not monotonic here; the range checks above are the sanity proof.
  });

  it('decodes the scoreboard (ext 12) bit-exactly', () => {
    const spectate = gameMsgs.find((m) => m.command === 53)!;
    const v = unpackr.unpack(spectate.data) as { match: { rrb: { scoreboard: RawExt } } };
    const sb = v.match.rrb.scoreboard;
    expect(sb).toBeInstanceOf(RawExt);
    expect(sb.extType).toBe(12);
    const dec = new Decoder(sb.data);
    const scoreboard = Scoreboard.decode(dec);
    expect(sb.data.length * 8 - dec.offset).toBeLessThan(8);
    expect(scoreboard.sb.length).toBe(9);
    for (const entry of scoreboard.sb) {
      expect(entry.stats.rank).toBeGreaterThanOrEqual(0);
      expect(entry.allies).toEqual([]);
      expect(entry.stats.altitude).toBeGreaterThanOrEqual(0);
    }
  });

  it('decodes the player list (ext 14) prefix against the leaderboard', () => {
    const spectate = gameMsgs.find((m) => m.command === 53)!;
    const v = unpackr.unpack(spectate.data) as {
      players: RawExt;
      match: { rb: { leaderboard: { id: string }[] } };
    };
    const players = v.players;
    expect(players.extType).toBe(14);
    const dec = new Decoder(players.data);
    const count = dec.readUInt(13);
    expect(count).toBeGreaterThanOrEqual(1); // alive players (leaderboard includes eliminated)
    const firstUserid = dec.readHex(12);
    const firstGameid = dec.readUInt(13);
    const firstAlive = dec.readBoolean();
    const firstNaturalorder = dec.readUInt(13);
    expect(firstUserid).toBe(v.match.rb.leaderboard[0].id);
    expect(firstGameid).toBe(7860);
    expect(firstAlive).toBe(true);
    expect(firstNaturalorder).toBe(0);
    // NOTE: per-player `options` (PlayerOptions/Je) needs the client's OptsBook,
    // which is not part of the deobfuscated capture — decode stops there.
    void PlayerList;
  });

  it('game.replay.state (65) is plaintext theorypack with full game state', () => {
    const v = unpackr.unpack(stateMsgs[0].data) as { gameid: number; data: { game: Record<string, unknown> } };
    expect(v.gameid).toBe(7860);
    expect(v.data.game.bag).toBeInstanceOf(Array);
    expect(v.data.game.board).toBeInstanceOf(Array);
  });

  it('FullState path: captured plaintext state encodes->decodes to the same board', () => {
    const v = unpackr.unpack(stateMsgs[0].data) as { gameid: number; data: { game: any } };
    const g = v.data.game;
    const fs: FullStateData = {
      diyusi: g.diyusi,
      stats: {
        ...g.stats,
        zenith: g.stats.zenith,
      },
      game: {
        bag: g.bag.slice(0, 12),
        board: g.board,
        hold: { locked: g.holdlocked, piece: g.hold },
        g: g.g,
        controlling: {
          inputSoftdrop: g.inputSoftdrop,
          lastshift: g.lastshift,
          lShift: g.lShift,
          rShift: g.rShift,
        },
        falling: g.falling,
        handling: g.handling,
        playing: g.playing,
      },
    };
    const encoder = new Encoder();
    FullState.encode(encoder, fs);
    const buf = encoder.finalize();
    const dec = new Decoder(buf);
    const back = FullState.decode(dec);
    expect(buf.length * 8 - dec.offset).toBeLessThan(8);
    // board identical, cell for cell
    expect(back.game.board).toEqual(fs.game.board);
    expect(back.game.bag).toEqual(fs.game.bag.slice(0, 12));
    expect(back.game.falling).toEqual(fs.game.falling);
    expect(back.game.hold).toEqual(fs.game.hold);
    expect(back.stats.lines).toBe(fs.stats.lines);
    expect(back.stats.garbage).toEqual(fs.stats.garbage);
    // board sanity: 4-wide x 46 tall, cells are piece letters / 'gb' / null
    const board = back.game.board;
    expect(board.length).toBe(46);
    expect(board[0].length).toBe(4);
    const cellset = new Set(board.flat());
    for (const c of cellset) expect(['i', 'j', 'l', 'o', 's', 't', 'z', 'gb', null]).toContain(c);
    // render for the log
    const art = board
      .filter((row) => row.some((c) => c !== null))
      .map((row) => '|' + row.map((c) => (c === null ? '.' : c === 'gb' ? '#' : c)).join('') + '|')
      .join('\n');
    console.log(`\ncaptured board for gameid ${v.gameid} (falling: ${back.game.falling.type}):\n${art}\n`);
    void BoardGrid;
  });
});
