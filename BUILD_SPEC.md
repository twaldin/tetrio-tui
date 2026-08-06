# tetrio-tui — Build Spec

A terminal (TUI) client for TETR.IO: log in with a real account, play Tetra League
(and custom rooms), fully rendered in the terminal. Node.js + TypeScript.

> LEGAL/ToS: TETR.IO's main game API says "not allowed without explicit, written consent".
> Bots are forbidden from League/Quick Play and need a dedicated bot account. This project is
> an INTERACTIVE client for a human's own account. The user accepts the account risk; ideally
> get osk's consent. Never ship an AFK bot on a human account.

## Authoritative references (in this repo)
- `docs/PROTOCOL.md` — connection/auth/ribbon protocol.
- `docs/command_table.json` — full Ribbon command registry (v1.7.8).
- `docs/tetra_channel_api.txt` — public REST API (ch.tetr.io) docs.
- `docs/captures/codec_deobfuscated.js` — deobfuscated Ribbon codec class (command framing).
- `docs/captures/netcodec_deobfuscated.js`, `netcodec2_deobfuscated.js` — deobfuscated NetCodec
  game-state serialization (bit-level) + all game structs (board, piece, full state, IGE, frames, stats).
- `docs/captures/ws_handshake.json`, `game_spectate_log.json`, `decoded_handshake.txt` — live captures.

## Stack
- Node 22+, TypeScript, ESM.
- `msgpackr` (theorypack), `ws` (WebSocket). Minimal deps otherwise.
- Terminal: raw ANSI rendering + stdin raw-mode key handling (own framework, no blessed/ink —
  we need 60fps diff rendering + sub-frame input). Tests: `tuistory` (pty snapshot testing) + vitest.

## Module map
```
src/
  net/theorypack.ts   — Packr/Unpackr wrappers (msgpackr default opts = theorypack)
  net/netcodec.ts     — bit-level codec: Encoder/Decoder, structs, tables, DInt, floats, hex
  net/structures.ts   — game structs: Piece enum, Board grid, FallingPiece, FullState, IGE, Frame, Stats
  net/ribbon.ts       — Ribbon WS client: framing, command registry, ping, session/resume, id ordering
  net/api.ts          — HTTP: environment, authenticate(login), anonymousJoin, users/me, server/ribbon, X-Connection-ID
  game/engine.ts      — local stacker: SRS+ kicks, 7-bag, gravity, DAS/ARR/DCD/SDF, lock delay,
                        garbage queue, attack table, B2B, combo, all-clear, spins (all-mini+)
  game/state.ts       — apply replay frames/IGE to reconstruct opponent boards
  game/ige.ts         — IGE event model + application
  tui/renderer.ts     — terminal diff renderer (cells, colors, blit)
  tui/input.ts        — key parsing (raw), keybindings, DAS/ARR repeat
  tui/screens/*.ts    — login, home, lobby/room, league queue, game, config
  tui/app.ts          — screen stack, event loop, wiring
  index.ts            — entry, arg/config handling
```

## Protocol essentials (validated)
- theorypack == msgpackr DEFAULT (records on, bundleStrings off). Byte-identical to client.
- Ribbon frame: `byte0 = [flags:2][code:6]`; F_ID=0x80; if F_ID then `u24be id`; then payload.
  - dedicated codes: 25 new, 63 die, 9 ping{recvid:u32be}, 44 session{ribbonid:8B,tokenid:8B},
    7 packets{len-prefixed nested}, 4 kick, 42 nope, 51 pni, 49 notify, 43 __pack__ (generic).
  - code 43 payload = `u8 command_code + msgpackr(data)`; command codes in command_table.json.
- Handshake: C>S `new` -> S>C `packets[session]` -> C>S `authorize{token,handling,signature,i}`
  -> S>C `authorize{success,...}` -> C>S `social.presence{status,detail}`. Ping every ~2.5-5s.
- Auth (HTTP): GET /api/server/environment -> POST /api/users/authenticate {username,password,totp}
  (or /api/users/anonymousJoin) -> {token(JWT),userid} -> GET /api/users/me (Bearer + X-Connection-ID)
  -> GET /api/server/ribbon -> ping spools -> connect best.
- X-Connection-ID = base64(JSON({x:b64(AES-128-CBC(env.vx key, connId)), z:b64(iv)})).

## NetCodec (game data) essentials
Bit-level (MSB-first) serializer. Types: Table=0,Array=1,Struct=2,String=3,Buffer=4,Boolean=5,
Int=6,UInt=7,DInt=8,Float=9,UFloat=10,Double=11,Number=12,Any=13. Buffer realignment to 8 bits.
- writeUInt/readUInt(v,bits), DInt (1-bit size selector + min/max bits), Float(bits,scale),
  Double(64), Table (enum index, fixed bits), Struct (fixed+optional+const fields w/ prop table),
  Hex(bytes*8 bits), String (NUL-terminated), Array (strict/flexible/default w/ ref dedup).
- game.replay = array of Frame {type: $$type enum, frame: DInt, data}:
  types keydown/keyup{key:$$key, subframe:Float(4,10), hoisted?}, start{}, full: FullState,
  end: EndStats, ige: IGE, strategy:u3, manual_target:u13.
- FullState (Re): bag:Piece[12], board:Board(Ne), hold{locked,piece}, g:double,
  controlling{inputSoftdrop,lastshift,lShift/rShift{held,arr,das},diyusi:u4}, falling:FallingPiece($e),
  handling{arr:Float(6,10),sdf:u6,safelock,cancel,may20g,das:Float(8,10),dcd:Float(8,10),irs,ihs:$$ixs},
  playing:bool, stats:Stats(Ge).
- FallingPiece($e): type:$$piece,x:int,r:u2,hy,irs:u2,kick:u5,keys:u16,flags,safelock:u3,
  lockresets:u5,rotresets:u6,skip:u7[],y:double,locking:double.
- Board(Ne): width:u9,height:u9, then per-row: if any cell non-null -> per-cell blk table index else empty marker.
- See netcodec_deobfuscated.js for exact field order (READ IT CAREFULLY — field order is the wire format).

## Game rules to match (from room options v19 + Tetris SRS+)
7-bag RNG, SRS+ kicks (with 180 spins), all-mini+ spins, lock delay 30 + move resets (15),
gravity g (cells/frame, 60fps), DAS/ARR/DCD/SDF handling, garbage: holes, messiness, multiplier,
cancel, blocking, B2B (chain off / charge on), combo table (multiplier), all-clear (+5, +1 b2b).
Attack table is TETR.IO-specific — extract from client or derive from captures; VALIDATE vs live.

## Testing
- vitest unit tests: netcodec round-trip, engine determinism (fixed seed), ribbon framing.
- Integration (anonymous account): connect -> authorize -> join custom room -> spectate -> decode boards.
- tuistory: snapshot menus + in-game render. Drive a real key sequence, assert frames.
- League smoke (user account, manual): login -> league.enter -> match -> play.
