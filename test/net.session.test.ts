/**
 * Live-network integration test for the networking core.
 * Gated behind RUN_LIVE=1 (anonymous account; harmless).
 * Run: RUN_LIVE=1 npx vitest run test/net.session.test.ts
 */
import { describe, it, expect } from 'vitest';
import { TetrioApi } from '../src/net/api.js';
import { TetrioSession } from '../src/net/session.js';
import { decodePacket } from '../src/net/ribbon.js';
import * as theorypack from '../src/net/theorypack.js';

const LIVE = process.env.RUN_LIVE === '1';
const run = LIVE ? describe : describe.skip;

run('live networking', () => {
  it('theorypack matches msgpackr default encoding', () => {
    // presence message known-good hex from capture
    const packed = theorypack.pack({ status: 'online', detail: 'menus' });
    expect(Buffer.from(packed).toString('hex')).toBe(
      'd4724092a6737461747573a664657461696ca66f6e6c696e65a56d656e7573',
    );
  });

  it('environment -> anonymousJoin -> users/me -> ribbon -> authorize', async () => {
    const api = new TetrioApi();
    const env = await api.getEnvironment();
    expect(env.vx).toBeTruthy();
    expect((env as any).signature).toBeTruthy();

    const auth = await api.anonymousJoin(`tui-itest${Math.floor(Math.random() * 1e4)}__`);
    expect(auth.token).toBeTruthy();
    expect(auth.userid).toBeTruthy();

    const me = await api.getMe(auth.userid);
    expect(me.user._id).toBe(auth.userid);

    const ribbonInfo = await api.getRibbon();
    expect(ribbonInfo.endpoint).toBeTruthy();

    const session = new TetrioSession();
    await session.loginToken(auth.token, auth.userid);
    const authorized = await session.connect();
    expect(authorized.success).toBe(true);
    session.close();
  }, 30000);

  it('decodePacket: ping + generic', () => {
    // ping: code 9, recvid 1
    expect(decodePacket(Uint8Array.from([0x09, 0, 0, 0, 1]))).toEqual({ command: 'ping', id: undefined, data: { recvid: 1 } });
    // social.online push: code 0x07 is packets; use a crafted generic social.presence instead:
    // ab 00 00 02 | 10 | d4724092... (authorize style), just assert command decode for known code
  });
});
