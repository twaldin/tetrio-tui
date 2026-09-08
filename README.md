# tetrio-tui

A terminal (TUI) client for **[TETR.IO](https://tetr.io)** — log in with your account and play
**Tetra League**, custom rooms, and solo modes, all rendered in your terminal.

Built from scratch against a reverse-engineered TETR.IO protocol (theorypack = msgpackr, the
Ribbon WebSocket, and the NetCodec game-data binary format), with a TETR.IO-exact local stacker
engine (SRS+ kicks, Park-Miller RNG, exact versus attack/garbage tables).

> ⚠️ **Fair-play & account-safety notice.** TETR.IO's main game API is documented as "not allowed
> without explicit, written consent." This is an *interactive* client for **your own account, played
> by a human** — not an AFK bot (those are banned, and bots can't play League/Quick Play anyway).
> Using any third-party client carries a (small) risk of account action. **Test on an alt account
> first**, and consider asking osk for consent — see [Safety](#safety--terms).

## Features

- **Play Tetra League** ranked duels in your terminal.
- **Custom rooms**: browse public rooms, join, chat, ready up, play & spectate (live opponent boards).
- **Solo modes**: 40 LINES, BLITZ (real TETR.IO scoring + 2:00 timer), ZEN, practice (offline, no server).
- **TETRA CHANNEL**: leaderboards (League / XP / AR), global news feed, player profiles.
- **Full menu tree** mirroring the webapp: MULTIPLAYER / SOLO / TETRA CHANNEL / CONFIG.
- **Config** (keybinds, handling, video, audio) persisted to disk, with **TETR.IO config import**.
- **11 piece styles** (bevel / flat / blocks / shiny / outline / gradient / halfblock /
  ascii / braille / nes / elektronika) × **7 border styles**
  (rounded / single / double / heavy / mixed / ascii / none) — mix freely.
- **User themes from disk** (`~/.config/tetrio-tui/themes/*.json`): override theme colors,
  border glyphs and action words — see [docs/THEMES.md](docs/THEMES.md).
- **Minimal mode**: no ASCII art, no shake/particles — a calm plain-text board.
- Truecolor diff-rendering at 60fps, line-clear / attack / all-clear effects, ghost piece, hold,
  next queue, per-mode stats (APM / PPS / VS).

## Demo

![tetrio-tui demo](docs/demo.gif)

Higher-quality MP4: [docs/demo.mp4](docs/demo.mp4)

## Install & run

Requires **Node.js 22+** and npm.

```bash
npm install
npm run build        # -> dist/
npm start            # dist/index.js
# or develop:
npx tsx src/index.ts
```

Normal startup shows an animation (unless disabled in CONFIG), then the ACCOUNT screen.
Choose LOGIN, continue a saved account session, switch accounts, log out, play as a guest,
or play offline. Account sessions are saved in
`$XDG_CONFIG_HOME/tetrio-tui/session.json` (default: `~/.config/tetrio-tui/session.json`);
guest sessions do not replace a saved account session.

To skip the account screen:

```bash
npx tsx src/index.ts --guest            # play as a guest (no League)
npx tsx src/index.ts --token <jwt>      # resume an existing session token
npx tsx src/index.ts --offline          # skip login and Ribbon; open the home menu for solo play
```

`--offline` skips the game-server connection; it is **not a network sandbox**.
40 LINES, BLITZ, ZEN and PRACTICE run locally, but opening TETRA CHANNEL can still
fetch public API data.

**Default controls** (rebindable in CONFIG): `←/→` move, `↓` soft drop, `space` hard drop,
`z`/`x` rotate CCW/CW, `a` rotate 180, `c` hold, `r` reset, `esc` forfeit/back.

## Architecture

```
src/
  net/     theorypack (msgpackr) · ribbon (WS framing/commands/ping/resume) · http api (auth/env/me/ribbon)
           netcodec (bit-level game codec) + structures (boards, pieces, full state, IGE, frames)
           session · gameconn (online versus/league orchestration)
  game/    engine (SRS+ kicks, 7-bag Park-Miller RNG, gravity, DAS/ARR, lock delay, garbage,
           attack/combo/b2b/all-clear, T-spins) · localgame (input->frames->server) · state (opponents)
  tui/     renderer (truecolor diff) · driver (ANSI+stdin) · app (screen stack) · screens
           (login, home, menu, game, lobby, league, channel, config)
  config/  persistent config store (keybinds/handling/video/audio + TETR.IO import)
  client.ts room and league state, commands and session event forwarding
docs/      protocol research: PROTOCOL.md, command_table.json, gamemechanics.md, kicktables.md,
           tetra_channel_api.txt, tetrio_constants.json, and deobfuscated client/capture references.
```

## Protocol notes

- **theorypack** == msgpackr with default options (records/structures on, string bundling off) —
  verified byte-identical to the official client.
- **Ribbon**: WS binary frames `[flags:2|code:6][u24be id?][payload]`; generic channel `code 43`
  carries `u8 command + msgpackr(data)`. Handshake: `new` → `session` → `server.authorize` → `social.presence`.
- **NetCodec**: the game stream (boards, pieces, full states, in-game events) is a bit-level
  (MSB-first) schema codec riding msgpackr extension types ≥ 10.
- **Login**: `POST /api/users/authenticate` (or `/api/users/anonymousJoin`) → JWT →
  `GET /api/users/me` (+ `X-Connection-ID` = AES-128-CBC of the connection id, key from
  `/api/server/environment`'s `vx`) → `GET /api/server/ribbon` → connect.

See [`docs/PROTOCOL.md`](docs/PROTOCOL.md) for the full write-up.

## Development

```bash
npm run typecheck    # TypeScript check without emitting files
npm test             # vitest (unit + capture + local TUI pty tests)
```

Live-network tests are disabled by default. `RUN_LIVE=1` enables
`test/net.session.test.ts`, which creates an anonymous account and authorizes a Ribbon
connection; it does not exercise room spectating or League gameplay. Do not enable it
for documentation checks; account/API restrictions in [Safety](#safety--terms) still apply.
PTY tests run locally and are skipped when `CI=true` unless `PTY_TESTS=1`.

TUI testing uses [`tuistory`](https://github.com/remorses/tuistory) (pty snapshot tests) and
[`ghostty-opentui`](https://github.com/remorses/ghostty-opentui) for rendering terminal frames to PNGs.

## Safety & Terms

- This is a **fan-made, unofficial** client. Not affiliated with TETR.IO or osk.
- Playing with a **custom client on your main account has a small risk of action** — test on an
  **alt** first. osk offers API/bot access for projects on Discord.
- The client does **not** forge anti-tamper fingerprints and plays fairly (human inputs).
- Anonymous/guest play can't create rooms or enter Tetra League (server-side rules); a registered
  account is required for those.

## License

MIT. TETR.IO and the TETR.IO logo are property of their respective owners.
