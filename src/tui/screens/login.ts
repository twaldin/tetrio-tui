/** Login screen: account login, anonymous guest, or saved token. */
import type { RenderBuffer, Screen, KeyEvent } from '../app.js';
import { THEME, center, drawBox } from '../draw.js';

export type LoginMethod = 'account' | 'anonymous' | 'token';
export interface LoginResult {
  method: LoginMethod;
  username?: string;
  password?: string;
  totp?: string;
  token?: string;
}

type FieldId = 'username' | 'password' | 'totp';

export class LoginScreen implements Screen {
  readonly name = 'login';
  private method: LoginMethod = 'account';
  private fields: Record<FieldId, string> = { username: '', password: '', totp: '' };
  private focusIdx = 0;
  private busy = false;
  private error = '';
  private onSubmit: (r: LoginResult) => void;

  constructor(onSubmit: (r: LoginResult) => void) {
    this.onSubmit = onSubmit;
  }

  private fieldList(): FieldId[] {
    return this.method === 'account' ? ['username', 'password', 'totp'] : ['username'];
  }

  onKey(ev: KeyEvent): void {
    if (this.busy) return;
    const fields = this.fieldList();
    if (ev.type !== 'down') return;
    switch (ev.key) {
      case 'tab':
      case 'down':
        this.focusIdx = (this.focusIdx + 1) % (fields.length + 1);
        break;
      case 'up':
        this.focusIdx = (this.focusIdx - 1 + fields.length + 1) % (fields.length + 1);
        break;
      case 'left':
      case 'right': {
        // cycle method
        const methods: LoginMethod[] = ['account', 'anonymous', 'token'];
        const i = methods.indexOf(this.method);
        this.method = methods[(i + (ev.key === 'right' ? 1 : methods.length - 1)) % methods.length];
        this.focusIdx = 0;
        break;
      }
      case 'return':
        if (this.focusIdx === fields.length) this.submit();
        else this.focusIdx++;
        break;
      case 'backspace': {
        const f = fields[this.focusIdx];
        if (f) this.fields[f] = this.fields[f].slice(0, -1);
        break;
      }
      default:
        if (ev.key.length === 1 && !ev.ctrl && !ev.alt) {
          const f = fields[this.focusIdx];
          if (f) this.fields[f] += ev.key;
        }
    }
  }

  private submit(): void {
    this.busy = true;
    this.error = '';
    const f = this.fields;
    if (this.method === 'token') {
      this.onSubmit({ method: 'token', token: f.username.trim() });
    } else if (this.method === 'anonymous') {
      this.onSubmit({ method: 'anonymous', username: f.username.trim() || undefined });
    } else {
      this.onSubmit({ method: 'account', username: f.username.trim(), password: f.password, totp: f.totp.trim() });
    }
  }

  setError(msg: string): void {
    this.busy = false;
    this.error = msg;
  }

  render(buf: RenderBuffer): void {
    const w = buf.width, h = buf.height;
    buf.fillRect(0, 0, w, h, ' ', { bg: THEME.bg });
    center(buf, 2, '▄︻┻═┳ 🐴 TETR.IO', { fg: THEME.text, bold: true });
    center(buf, 3, 'terminal client', { fg: THEME.dim });

    const bw = 46, bx = Math.floor((w - bw) / 2), by = 6;
    drawBox(buf, bx, by, bw, 12, { fg: THEME.border });
    center(buf, by + 1, 'LOGIN', { fg: THEME.accent2, bold: true });

    // method tabs
    const methods: [LoginMethod, string][] = [['account', 'ACCOUNT'], ['anonymous', 'GUEST'], ['token', 'TOKEN']];
    let mx = bx + 3;
    for (const [m, label] of methods) {
      const sel = this.method === m;
      buf.drawText(mx, by + 3, label, { fg: sel ? THEME.bg : THEME.dim, bg: sel ? THEME.accent : THEME.panel, bold: sel });
      mx += label.length + 3;
    }
    if (this.method === 'account' || this.method === 'anonymous') {
      center(buf, by + 4, this.method === 'account' ? 'log in with your account' : 'play as a guest', { fg: THEME.dim });
    } else {
      center(buf, by + 4, 'paste a session token', { fg: THEME.dim });
    }

    const fields = this.fieldList();
    let fy = by + 6;
    fields.forEach((f, i) => {
      const focused = this.focusIdx === i;
      const label = f === 'totp' ? '2FA (opt)' : f;
      buf.drawText(bx + 3, fy, label, { fg: focused ? THEME.accent2 : THEME.dim });
      const val = f === 'password' ? '*'.repeat(this.fields[f].length) : this.fields[f];
      buf.fillRect(bx + 14, fy, bw - 17, 1, ' ', { bg: THEME.panel });
      buf.drawText(bx + 15, fy, val + (focused ? '█' : ''), { fg: THEME.text });
      fy += 2;
    });

    const submitSel = this.focusIdx === fields.length;
    const label = this.busy ? 'CONNECTING…' : 'CONNECT';
    buf.drawText(bx + bw - label.length - 4, fy, label, {
      fg: submitSel ? THEME.bg : THEME.good, bg: submitSel ? THEME.good : THEME.panel, bold: true,
    });

    if (this.error) center(buf, fy + 2, this.error, { fg: THEME.bad });
    center(buf, h - 3, '↑↓/tab move · ←→ method · enter connect · esc quit', { fg: THEME.dim });
  }
}
