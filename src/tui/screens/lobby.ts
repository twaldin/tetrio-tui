/** Room browser (public room listing) + room lobby screens. */
import type { RenderBuffer, Screen, KeyEvent, MouseEvent } from '../app.js';
import { THEME, center, drawBox } from '../draw.js';
import type { TetrioClient } from '../../client.js';

export interface RoomListEntry {
  id: string;
  name: string;
  count: string;
  info: string;
  extra: string;
}

/** The room listing screen: browse + join/spectate public rooms. */
export class RoomListingScreen implements Screen {
  readonly name = 'rooms';
  private client: TetrioClient;
  private onJoin: (id: string) => void;
  private onSpectate: (id: string) => void;
  private onBack: () => void;
  rooms: RoomListEntry[] = [];
  private idx = 0;
  private loading = true;
  private joinIdMode = false;
  private joinIdText = '';

  constructor(client: TetrioClient, opts: { onJoin: (id: string) => void; onSpectate: (id: string) => void; onBack: () => void }) {
    this.client = client;
    this.onJoin = opts.onJoin;
    this.onSpectate = opts.onSpectate;
    this.onBack = opts.onBack;
    this.refresh();
  }

  refresh(): void {
    this.loading = true;
    this.client.session.api.getRooms()
      .then((d: any) => this.onRoomList(d))
      .catch(() => { this.loading = false; this.rooms = []; });
  }

  private onRoomList(d: any): void {
    this.loading = false;
    const rooms = d?.rooms ?? [];
    this.rooms = (Array.isArray(rooms) ? rooms : []).map((r: any) => ({
      id: r.id ?? '',
      name: r.name ?? 'room',
      count: `${r.players ?? 0}+${(r.count ?? 0) - (r.players ?? 0)}`,
      info: `${r.state ?? ''} · ${r.type ?? ''}`,
      extra: r.allowAnonymous === false ? 'no anons' : 'anons ok',
    }));
  }

  update(): void { /* re-render each frame so async data + live updates show */ }

  onKey(ev: KeyEvent): void {
    if (ev.type !== 'down') return;
    if (this.joinIdMode) {
      if (ev.key === 'return') { if (this.joinIdText.trim()) this.onJoin(this.joinIdText.trim().toUpperCase()); this.joinIdMode = false; this.joinIdText = ''; }
      else if (ev.key === 'escape') { this.joinIdMode = false; this.joinIdText = ''; }
      else if (ev.key === 'backspace') this.joinIdText = this.joinIdText.slice(0, -1);
      else if (ev.key.length === 1) this.joinIdText += ev.key;
      return;
    }
    switch (ev.key) {
      case 'up': this.idx = Math.max(0, this.idx - 1); break;
      case 'down': this.idx = Math.min(Math.max(0, this.rooms.length - 1), this.idx + 1); break;
      case 'return': if (this.rooms[this.idx]) this.onJoin(this.rooms[this.idx].id); break;
      case 's': if (this.rooms[this.idx]) this.onSpectate(this.rooms[this.idx].id); break;
      case 'r': this.refresh(); break;
      case 'j': this.joinIdMode = true; break;
      case 'escape': this.onBack(); break;
    }
  }

  /** Row/extent of each visible room from the last render, for mouse hit-testing. */
  private roomRects: { x: number; y: number; w: number; h: number }[] = [];

  onMouse(ev: MouseEvent): void {
    if (this.joinIdMode) return;
    if (ev.action === 'scroll-up') { this.idx = Math.max(0, this.idx - 1); return; }
    if (ev.action === 'scroll-down') { this.idx = Math.min(Math.max(0, this.rooms.length - 1), this.idx + 1); return; }
    if (ev.action === 'down' && ev.button !== 'left') return;
    if (ev.action !== 'down' && ev.action !== 'move') return;
    for (let i = 0; i < this.roomRects.length; i++) {
      const r = this.roomRects[i];
      if (ev.x < r.x || ev.x >= r.x + r.w || ev.y < r.y || ev.y >= r.y + r.h) continue;
      this.idx = i;
      if (ev.action === 'down' && this.rooms[i]) this.onJoin(this.rooms[i].id);
      return;
    }
  }

  render(buf: RenderBuffer): void {
    buf.fillRect(0, 0, buf.width, buf.height, ' ', { bg: THEME.bg });
    this.roomRects = [];
    buf.drawText(2, 1, 'MULTIPLAYER / ROOM LISTING', { fg: THEME.accent, bold: true });
    buf.drawText(buf.width - 12, 1, 'r: refresh', { fg: THEME.dim });
    if (this.loading) { center(buf, 8, 'loading…', { fg: THEME.dim }); return; }
    if (!this.rooms.length) { center(buf, 8, 'no public rooms', { fg: THEME.dim }); }
    const w = Math.min(80, buf.width - 8);
    const x = Math.floor((buf.width - w) / 2);
    let y = 3;
    for (let i = 0; i < Math.min(this.rooms.length, Math.floor((buf.height - 6) / 3)); i++) {
      const r = this.rooms[i];
      const sel = i === this.idx;
      const bg = sel ? THEME.channel : THEME.panel;
      const fg = sel ? [10, 10, 18] as [number, number, number] : THEME.text;
      buf.fillRect(x, y, w, 3, ' ', { bg });
      buf.drawText(x + 2, y, r.name, { fg, bold: true });
      buf.drawText(x + 2, y + 1, `${r.info} ${r.extra}`, { fg: sel ? fg : THEME.dim });
      buf.drawText(x + w - 8, y, r.count, { fg: sel ? fg : THEME.good, bold: true });
      this.roomRects.push({ x, y, w, h: 3 });
      y += 3;
    }
    if (this.joinIdMode) {
      center(buf, buf.height - 4, `join by id: ${this.joinIdText}█`, { fg: THEME.good });
    }
    center(buf, buf.height - 2, '↑↓ select · enter join · j join by id · s spectate · esc back', { fg: THEME.dim });
  }
}

/** The room lobby: players, chat, ready, bracket, host controls. */
export class RoomLobbyScreen implements Screen {
  readonly name = 'lobby';
  private client: TetrioClient;
  private onGameStart: () => void;
  private onLeave: () => void;
  private chatInput = '';
  private chatOpen = false;

  constructor(client: TetrioClient, opts: { onGameStart: () => void; onLeave: () => void }) {
    this.client = client;
    this.onGameStart = opts.onGameStart;
    this.onLeave = opts.onLeave;
    client.on('room.start', () => this.onGameStart());
    client.on('game.start', () => this.onGameStart());
  }

  update(): void { /* re-render each frame so live room updates + chat show */ }

  onKey(ev: KeyEvent): void {
    if (ev.type !== 'down') return;
    if (this.chatOpen) {
      if (ev.key === 'return') { this.client.sendChat(this.chatInput); this.chatInput = ''; this.chatOpen = false; }
      else if (ev.key === 'escape') { this.chatOpen = false; this.chatInput = ''; }
      else if (ev.key === 'backspace') this.chatInput = this.chatInput.slice(0, -1);
      else if (ev.key.length === 1) this.chatInput += ev.key;
      return;
    }
    switch (ev.key) {
      case 'r': this.client.gameReady(true); break;
      case 's': this.client.session.send('room.start'); break;
      case 'p': this.client.switchBracket(this.client.selfBracket === 'player' ? 'spectator' : 'player'); break;
      case 't': this.chatOpen = true; break;
      case 'escape': this.client.leaveRoom(); this.onLeave(); break;
    }
  }

  render(buf: RenderBuffer): void {
    buf.fillRect(0, 0, buf.width, buf.height, ' ', { bg: THEME.bg });
    const room = this.client.room;
    if (!room) {
      center(buf, 8, 'joining room…', { fg: THEME.dim });
      center(buf, 10, '(if this persists, the room may not allow anonymous users)', { fg: THEME.bad });
      center(buf, buf.height - 3, 'esc back', { fg: THEME.dim });
      return;
    }
    center(buf, 1, room.name, { fg: THEME.accent, bold: true });
    center(buf, 2, `#${room.id} · ${room.state}`, { fg: THEME.dim });

    // players
    buf.drawText(4, 4, `PLAYERS (${room.players.length})`, { fg: THEME.dim });
    let y = 6;
    for (const p of room.players.slice(0, 14)) {
      const isMe = p._id === this.client.userid;
      const color = p.bracket === 'player' ? THEME.text : THEME.dim;
      const ready = p.ready ? '✓' : ' ';
      const me = isMe ? ' (you)' : '';
      buf.drawText(4, y, `${ready} ${p.username}${me}`, { fg: isMe ? THEME.accent2 : color, bold: isMe });
      buf.drawText(28, y, p.bracket, { fg: THEME.dim });
      buf.drawText(40, y, `${p.record.wins}W`, { fg: THEME.good });
      y += 1;
    }

    // chat (right side)
    const cx = Math.max(46, buf.width - 44);
    drawBox(buf, cx, 4, buf.width - cx - 2, buf.height - 8, { fg: THEME.border });
    buf.drawText(cx + 1, 4, 'CHAT', { fg: THEME.dim });
    const chat = this.client.chat.slice(-(buf.height - 12));
    let cy = 6;
    for (const m of chat) {
      const who = m.system ? '' : `${m.user?.username ?? '?'}: `;
      buf.drawText(cx + 1, cy, (who + m.content).slice(0, buf.width - cx - 5), { fg: m.system ? THEME.dim : THEME.text });
      cy += 1;
    }
    if (this.chatOpen) {
      buf.drawText(cx + 1, buf.height - 5, '> ' + this.chatInput + '█', { fg: THEME.good });
    }

    center(buf, buf.height - 2, 'r ready · s start (host) · p player/spectate · t chat · esc leave', { fg: THEME.dim });
  }
}
