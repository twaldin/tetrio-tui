# TETR.IO Protocol Research (client v1.7.8, 2026)

Reverse-engineered from the live client (`https://tetr.io/js/tetrio.js`) + live traffic capture.
Old community docs (lemoncove/tetrio-bot-docs, 2022, v6.2.0) are OUTDATED but conceptually similar.

## Three surfaces

1. **TETRA CHANNEL REST API** — `https://ch.tetr.io/api/` — PUBLIC stats/leaderboards/replays/news.
   Documented at `https://tetr.io/about/api`. No auth needed. JSON. (see tetra_channel_api.md)
2. **Main Game API** — `https://tetr.io/api/` — auth, environment, ribbon endpoint. theorypack-encoded.
   (officially "not allowed without written consent" for bots; we use it for an interactive client.)
3. **Ribbon WebSocket** — `wss://<region>-<name>.spool.tetr.io/ribbon/<spoolname>` — real-time game. theorypack-encoded.

## theorypack (encoding)

`application/vnd.osk.theorypack` == **msgpackr with default options** (records/structures ON, bundleStrings OFF).
Node: `new (require('msgpackr').Packr())` / `new (require('msgpackr').Unpackr())`.
Verified byte-identical to client captures. Objects with a repeated shape are encoded as msgpack
records: `d4 72 <structId> <fixarray of keys> <values...>`; structIds count up from 0x40 per pack-stream.
NOTE: the client instantiates Packr({bundleStrings:true}) for HTTP, but the OBSERVED wire format equals
msgpackr DEFAULTS (bundleStrings off) — bundleStrings is a no-op for these payloads in the client's msgpackr version.

There is a flag `X_USE_JSON_API_USE_ON_BOT_ACCOUNT_ONLY` that makes the client use `application/json`
instead of theorypack — **only honored by the server for BOT accounts**. Human accounts must use theorypack.

## Auth flow (HTTP)

1. `GET /api/server/environment` (header X-Session-ID) → environment data. Contains:
   - `vx`: base64 AES-128 key used for X-Connection-ID
   - signature material: `version`, `mode`, `serverCycle`, `commit:{id,time}`, `build:{id,time}`, `domain_hash`, etc.
2. Login (human): `POST /api/users/authenticate` body `{username, password, totp}` (theorypack)
   → `{token, userid}`. Password is plaintext over TLS. totp only if 2FA enabled.
   Anonymous: `POST /api/users/anonymousJoin` body `{username, captcha}` → `{token, userid, newname?}`.
   Register: `POST /api/users/create` (needs captcha).
   Token is a JWT (HS256): payload `{sub: userid, iat: seconds}`. Sent as `Authorization: Bearer <token>`.
3. `GET /api/users/me` (Bearer token, X-Session-ID, X-Connection-ID) → full user object.
4. `GET /api/server/ribbon` (Bearer token) → recommended ribbon/spool endpoint(s).
5. Client pings every spool `https://<region>-<name>.spool.tetr.io/spool?<ts>-<i>-<rand>` and picks lowest latency.

### X-Connection-ID header

AES-128-CBC encryption of the current connection id, base64(JSON({x: base64(ct), z: base64(iv)})).
Key = `Uint8Array.from(atob(environment.vx))`. IV = random 16 bytes.
Data encrypted = the Ribbon connection id (`gs.get()` — a client-held connection identifier).
```js
async function esc(keyBytes, plaintext) {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const ct = await crypto.subtle.encrypt({name:'AES-CBC', iv}, key, new TextEncoder().encode(plaintext));
  return btoa(JSON.stringify({x: btoa(String.fromCharCode(...new Uint8Array(ct))), z: btoa(String.fromCharCode(...iv))}));
}
```

## Ribbon framing

WebSocket binary. Each packet:
```
byte 0:  [flags: top 2 bits][command code: low 6 bits]
if F_ID: bytes 1..3 = u24be message id (incrementing per sender; echo for rpc)
then:    command-specific payload
```
Flags: F_ID (bit for "has id"), F_HOOK, F_ALLOC (static buffer, no payload). Exact bit positions:
F_ID is set on generic channel packets (0xab = 0x80|0x2b -> code 43 + F_ID). Deduce: 0x80 = F_ID, 0x40 = F_HOOK.

Handshake:
1. client → `new` (code 25, 1 byte `0x19`)
2. server → `packets` (code 7) containing nested `session` (code 44) {ribbonid, tokenid}
3. client → `authorize` (code 43, F_ID) {token, handling, signature:{...environment}, i: commitHash}
4. server → `authorize` (code 43, F_ID, same id) {success, maintenance, worker:{name,flag}, social:{total_online, notifications, presences, relationships}}
5. client → `social.presence` {status:"online", detail:"menus"}
6. keepalive: client sends `ping {recvid}` every ~2.5-5s; server replies `ping {recvid}`.

Reconnect/resume: client sends `session {ribbonid, tokenid}` then `packets {packets: recentSent}`.
Server pushes (no F_ID, e.g. online-count) arrive interleaved.

## Generic channel (code 43) payload

`<u8 command_code><msgpackr data>`. See command_table.json for the full command<->code map.
Game flow uses `game.*`, rooms `room.*`, league `league.*`, social `social.*`, server `server.*`.

## Message id ordering

Both sides increment a per-direction message id on every F_ID message. Client buffers out-of-order
messages and processes in id order; disconnects if > 4096 (CACHE_MAXSIZE) lost. Recvid in ping acks
how many server messages we've processed; server trims its resend queue accordingly.

## Captures

- `captures/ws_handshake.json` — full authorize handshake (anonymous).
- `captures/auth_decoded.json` — decoded authorize message.
