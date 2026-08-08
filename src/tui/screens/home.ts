/** Home / main menu screen. */
import type { RenderBuffer, Screen, KeyEvent, MouseEvent } from '../app.js';
import { THEME, center, drawMenuItem } from '../draw.js';

export interface HomeAction {
  type: 'league' | 'custom' | 'spectate' | 'config' | 'solo' | 'quit';
  payload?: unknown;
}

interface MenuEntry {
  id: HomeAction['type'];
  label: string;
  sub: string;
  color: [number, number, number];
  disabled?: boolean;
}

export class HomeScreen implements Screen {
  readonly name = 'home';
  private idx = 0;
  private onAction: (a: HomeAction) => void;
  private username: string;
  private online: number;

  constructor(opts: { username: string; online?: number; canLeague: boolean }, onAction: (a: HomeAction) => void) {
    this.onAction = onAction;
    this.username = opts.username;
    this.online = opts.online ?? 0;
    if (!opts.canLeague) {
      this.entries[0].disabled = true;
      this.entries[0].sub = 'requires a registered account';
    }
  }

  private entries: MenuEntry[] = [
    { id: 'league', label: 'TETRA LEAGUE', sub: 'fight players of your skill in ranked duels', color: THEME.league },
    { id: 'custom', label: 'CUSTOM GAME', sub: 'create and join public/private rooms', color: THEME.accent },
    { id: 'spectate', label: 'ROOM LISTING', sub: 'join public games and spectate', color: THEME.channel },
    { id: 'config', label: 'CONFIG', sub: 'keys, handling, display', color: THEME.config },
    { id: 'quit', label: 'QUIT', sub: 'disconnect and exit', color: THEME.dim },
  ];

  onKey(ev: KeyEvent): void {
    if (ev.type !== 'down') return;
    switch (ev.key) {
      case 'up': this.move(-1); break;
      case 'down': this.move(1); break;
      case 'return': this.select(); break;
      case 'q': case 'escape': this.onAction({ type: 'quit' }); break;
    }
  }

  private move(d: number): void {
    for (let i = 0; i < this.entries.length; i++) {
      this.idx = (this.idx + d + this.entries.length) % this.entries.length;
      if (!this.entries[this.idx].disabled) break;
    }
  }

  private select(): void {
    const e = this.entries[this.idx];
    if (e.disabled) return;
    this.onAction({ type: e.id });
  }

  /** Row/extent of each entry from the last render, for mouse hit-testing. */
  private itemRects: { x: number; y: number; w: number; h: number }[] = [];

  onMouse(ev: MouseEvent): void {
    if (ev.action === 'scroll-up') { this.move(-1); return; }
    if (ev.action === 'scroll-down') { this.move(1); return; }
    if (ev.action === 'down' && ev.button !== 'left') return;
    if (ev.action !== 'down' && ev.action !== 'move') return;
    for (let i = 0; i < this.itemRects.length; i++) {
      const r = this.itemRects[i];
      if (ev.x < r.x || ev.x >= r.x + r.w || ev.y < r.y || ev.y >= r.y + r.h) continue;
      if (this.entries[i].disabled) return;
      this.idx = i;
      if (ev.action === 'down') this.select();
      return;
    }
  }

  render(buf: RenderBuffer): void {
    buf.fillRect(0, 0, buf.width, buf.height, ' ', { bg: THEME.bg });
    center(buf, 2, 'TETR.IO', { fg: THEME.text, bold: true });
    center(buf, 3, '▄︻┻═┳ terminal client', { fg: THEME.dim });
    buf.drawText(2, 1, this.username, { fg: THEME.accent2 });
    buf.drawText(buf.width - 12, 1, `${this.online} online`, { fg: THEME.good });

    const w = Math.min(64, buf.width - 8);
    const x = Math.floor((buf.width - w) / 2);
    let y = 6;
    this.itemRects = [];
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const sel = i === this.idx;
      drawMenuItem(buf, x, y, w, e.label, e.sub, sel, e.disabled ? THEME.panel : e.color);
      if (e.disabled) buf.drawText(x + w - 24, y + 1, e.sub, { fg: THEME.dim });
      this.itemRects.push({ x, y, w, h: 3 });
      y += 4;
    }
    center(buf, buf.height - 3, '↑↓ select · enter confirm · esc quit', { fg: THEME.dim });
  }
}
