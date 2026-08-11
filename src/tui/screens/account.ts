/**
 * Account screen — shown at every launch (after the startup animation).
 * TETR.IO-login-page equivalent: continue with the saved session, switch
 * account, log out, guest, or offline. This is where saved auth is managed.
 */
import type { RenderBuffer, Screen, KeyEvent } from '../app.js';
import { theme } from '../themes.js';
import { center, drawBox } from '../draw.js';
import { renderBigTextCentered } from '../bigtext.js';

export interface AccountChoice {
  action: 'continue' | 'login' | 'logout' | 'guest' | 'offline';
}

export interface AccountScreenOpts {
  savedUser: string | null;   // username (or userid) of the saved session
  onChoice: (c: AccountChoice) => void;
}

export class AccountScreen implements Screen {
  readonly name = 'account';
  private opts: AccountScreenOpts;
  private sel = 0;

  constructor(opts: AccountScreenOpts) { this.opts = opts; }

  private items(): { id: AccountChoice['action']; label: string; sub: string }[] {
    const items: { id: AccountChoice['action']; label: string; sub: string }[] = [];
    if (this.opts.savedUser) {
      items.push({ id: 'continue', label: `CONTINUE AS ${this.opts.savedUser.toUpperCase()}`, sub: 'resume your saved session' });
      items.push({ id: 'login', label: 'SWITCH ACCOUNT', sub: 'log in with a different account' });
      items.push({ id: 'logout', label: 'LOG OUT', sub: 'remove the saved session from this device' });
    } else {
      items.push({ id: 'login', label: 'LOG IN', sub: 'your TETR.IO account' });
    }
    items.push({ id: 'guest', label: 'PLAY AS GUEST', sub: 'anonymous — no League, nothing saved' });
    items.push({ id: 'offline', label: 'PLAY OFFLINE', sub: 'solo modes only, no connection' });
    return items;
  }

  onKey(ev: KeyEvent): void {
    if (ev.type !== 'down') return;
    const items = this.items();
    if (ev.key === 'up') this.sel = (this.sel - 1 + items.length) % items.length;
    else if (ev.key === 'down') this.sel = (this.sel + 1) % items.length;
    else if (ev.key === 'return') this.opts.onChoice({ action: items[this.sel].id });
  }

  render(buf: RenderBuffer): void {
    const t = theme();
    buf.fillRect(0, 0, buf.width, buf.height, ' ', { bg: t.bg });
    const items = this.items();
    const w = Math.min(56, buf.width - 8);
    const h = items.length * 3 + 6;
    const x = Math.floor((buf.width - w) / 2);
    const y = Math.max(2, Math.floor((buf.height - h) / 2));
    renderBigTextCentered(buf, Math.floor(buf.width / 2), Math.max(0, y - 6), 'TETR.IO', { fg: t.accent, bold: true }, 'block');
    drawBox(buf, x, y, w, h, { fg: t.border });
    center(buf, y + 1, this.opts.savedUser ? `signed in as ${this.opts.savedUser}` : 'not signed in', { fg: t.dim });
    let iy = y + 3;
    items.forEach((it, i) => {
      const sel = i === this.sel;
      if (sel) buf.fillRect(x + 1, iy, w - 2, 2, ' ', { bg: t.panel });
      buf.drawText(x + 3, iy, (sel ? '▶ ' : '  ') + it.label, { fg: sel ? t.accent : t.text, bold: sel });
      buf.drawText(x + 5, iy + 1, it.sub, { fg: t.dim });
      iy += 3;
    });
    center(buf, y + h - 1, '↑↓ select · enter confirm', { fg: t.faint });
  }
}
