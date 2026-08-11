/**
 * Ribbon command registry (client v1.7.8). See docs/command_table.json + docs/PROTOCOL.md.
 *
 * Ribbon frame: byte0 = [flags:2][code:6]; F_ID=0x80, F_HOOK=0x40; if F_ID then u24be id; then payload.
 * Most commands ride the generic channel (code 43): payload = u8 command code + theorypack(data).
 * A handful of hot-path commands have dedicated compact codes + custom binary codecs.
 */

export const F_ID = 0x80;
export const F_HOOK = 0x40;
export const CODE_MASK = 0x3f;

// Dedicated (non-generic) command codes.
export const CODE_NEW = 25;
export const CODE_DIE = 63;
export const CODE_PING = 9;
export const CODE_SESSION = 44;
export const CODE_PACKETS = 7;
export const CODE_KICK = 4;
export const CODE_NOPE = 42;
export const CODE_PNI = 51;
export const CODE_NOTIFY = 49;
export const CODE_GENERIC = 43; // __pack__
export const CODE_REJECTED = 19; // server rejected a message we sent (informational; real client flags net 'BAD')
export const CODE_RELOAD = 33;   // server requests a client reload

// Generic-channel command codes (command name <-> code).
export const GENERIC_CODES: Record<string, number> = {
  'config.handling': 1,
  'channel.subscribe': 2,
  'channel.unsubscribe': 3,
  'social.presence': 16,
  'social.invite': 17,
  'social.link': 18,
  'social.online': 19,
  'social.notification': 20,
  'social.notification.ack': 21,
  'social.dm': 22,
  'social.dm.fail': 23,
  'social.relation.ack': 24,
  'social.relation.add': 25,
  'social.relation.remove': 26,
  'social.relation.update': 27,
  'social.relation.clear': 28,
  'social.party.invite': 29,
  'social.party.invite.accept': 30,
  'game.enter': 48,
  'game.replace': 49,
  'game.forfeit': 50,
  'game.ready': 51,
  'game.start': 52,
  'game.spectate': 53,
  'game.submit': 54,
  'game.advance': 55,
  'game.abort': 56,
  'game.end': 57,
  'game.score': 58,
  'game.waitstate': 59,
  'game.match': 60,
  'game.match.score': 61,
  'game.replay': 62,
  'game.replay.enter': 63,
  'game.replay.ige': 64,
  'game.replay.state': 65,
  'game.replay.board': 66,
  'game.replay.end': 67,
  'game.scope.start': 68,
  'game.scope.end': 69,
  'game.setspec': 70,
  'game.records.resolved': 71,
  'party.ready': 80,
  'party.leave': 81,
  'party.sync': 82,
  'party.members': 83,
  'staff.chat': 96,
  'staff.spam': 97,
  'staff.warn': 98,
  'staff.silence': 99,
  'staff.lift': 100,
  'staff.kickfail': 101,
  'staff.shout': 102,
  'staff.waterfall': 103,
  'staff.game.event': 104,
  'staff.xrc': 105,
  'room.create': 128,
  'room.join': 129,
  'room.leave': 130,
  'room.abort': 131,
  'room.start': 132,
  'room.kick': 133,
  'room.unban': 134,
  'room.banlist': 135,
  'room.setid': 136,
  'room.setconfig': 137,
  'room.update': 138,
  'room.update.bracket': 139,
  'room.update.host': 140,
  'room.update.auto': 141,
  'room.update.supporter': 142,
  'room.update.player.add': 143,
  'room.update.player.remove': 144,
  'room.bracket.switch': 145,
  'room.bracket.move': 146,
  'room.owner.transfer': 147,
  'room.owner.revoke': 148,
  'room.chat': 149,
  'room.chat.send': 150,
  'room.chat.clear': 151,
  'room.chat.delete': 152,
  'room.chat.gift': 153,
  'room.chat.game': 154,
  'room.call': 155,
  'league.enter': 177,
  'league.leave': 178,
  'league.match': 179,
  'league.countdown': 180,
  'league.ready': 181,
  'server.maintenance': 208,
  'server.announcement': 209,
  'server.authorize': 210,
  'server.migrate': 211,
  'server.migrated': 212,
  'xrc.relog': 255,
};

export const GENERIC_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(GENERIC_CODES).map(([k, v]) => [v, k]),
);

// Kick reasons (dedicated code 4).
export const KICK_REASONS: Record<number, string> = {
  1: 'outdated', 2: 'kick', 3: 'restrict', 4: 'block', 5: 'anticheat', 6: 'manual', 7: 'rename',
};
// Nope reasons (dedicated code 42).
export const NOPE_REASONS: Record<number, string> = { 0: 'protocol violation', 1: 'ribbon expired' };
// Pni types (dedicated code 51).
export const PNI_TYPES: Record<number, string> = { 0: 'background', 1: 'split', 2: 'load' };
// Notify types (dedicated code 49).
export const NOTIFY_TYPES: Record<number, string> = { 1: 'deny', 2: 'warm', 3: 'ok', 4: 'error', 5: 'announce' };
