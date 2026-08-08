/** Generic navigable menu screen (data-driven). Used across the whole app for parity. */
import type { RenderBuffer, Screen, KeyEvent, Style } from '../app.js';
import { THEME, drawMenuItem, center, drawBox } from '../draw.js';

export interface MenuItem {
  id: string;
  label: string;
  sub?: string;
  color?: [number, number, number];
  disabled?: boolean;
  badge?: string;         // right-side badge text (e.g. player count)
  action?: () => void;
  submenu?: MenuNode;
  custom?: Screen;        // push a custom screen instead
}

export interface MenuNode {
  title: string;
  subtitle?: string;
  color?: [number, number, number];
  items: MenuItem[];
}

export class MenuScreen implements Screen {
  readonly name: string;
  protected node: MenuNode;
  protected idx = 0;
  private onBack: (() => void) | null;
  private pushScreen: (s: Screen) => void;
  private popScreen: () => void;
  private breadcrumb: string[];

  constructor(node: MenuNode, opts: { breadcrumb?: string[]; onBack?: () => void; pushScreen: (s: Screen) => void; popScreen?: () => void }) {
    this.node = node;
    this.name = node.title;
    this.breadcrumb = opts.breadcrumb ?? [node.title];
    this.onBack = opts.onBack ?? null;
    this.pushScreen = opts.pushScreen;
    this.popScreen = opts.popScreen ?? (() => {});
    this.skipDisabled(1);
  }

  private skipDisabled(dir: number): void {
    for (let i = 0; i < this.node.items.length; i++) {
      if (!this.node.items[this.idx].disabled) return;
      this.idx = (this.idx + dir + this.node.items.length) % this.node.items.length;
    }
  }

  onKey(ev: KeyEvent): void {
    if (ev.type !== 'down') return;
    switch (ev.key) {
      case 'up': this.idx = (this.idx - 1 + this.node.items.length) % this.node.items.length; this.skipDisabled(-1); break;
      case 'down': this.idx = (this.idx + 1) % this.node.items.length; this.skipDisabled(1); break;
      case 'return': this.activate(); break;
      case 'escape': case 'backspace': this.onBack?.(); break;
    }
  }

  protected activate(): void {
    const item = this.node.items[this.idx];
    if (item.disabled) return;
    if (item.custom) this.pushScreen(item.custom);
    else if (item.submenu) {
      this.pushScreen(new MenuScreen(item.submenu, {
        breadcrumb: [...this.breadcrumb, item.submenu.title],
        onBack: () => this.popScreen(), // escape in a submenu pops back to the parent
        pushScreen: this.pushScreen,
        popScreen: this.popScreen,
      }));
    } else item.action?.();
  }

  render(buf: RenderBuffer): void {
    buf.fillRect(0, 0, buf.width, buf.height, ' ', { bg: THEME.bg });
    // title banner on the root menu
    if (this.breadcrumb.length === 1 && this.node.title === 'HOME') {
      const logo = 'TETR.IO';
      const logoSub = 'terminal client';
      const lx = Math.floor((buf.width - logo.length) / 2);
      buf.drawText(lx, 2, logo, { fg: THEME.text, bold: true });
      buf.drawText(Math.floor((buf.width - logoSub.length) / 2), 3, logoSub, { fg: THEME.faint });
      buf.fillRect(Math.floor(buf.width / 2) - 14, 4, 28, 1, '─', { fg: THEME.faint });
    }
    // breadcrumb
    buf.drawText(2, 1, this.breadcrumb.join(' / '), { fg: THEME.dim });
    if (this.node.color) {
      buf.fillRect(0, 0, this.breadcrumb.join(' / ').length + 4, 1, ' ', { bg: THEME.bg });
      buf.drawText(2, 1, this.breadcrumb.join(' / '), { fg: this.node.color, bold: true });
    }
    if (this.node.subtitle) center(buf, 3, this.node.subtitle, { fg: THEME.dim });

    const w = Math.min(66, buf.width - 8);
    const x = Math.floor((buf.width - w) / 2);
    let y = this.node.title === 'HOME' ? 6 : 5;
    for (let i = 0; i < this.node.items.length; i++) {
      const item = this.node.items[i];
      const sel = i === this.idx;
      const color = item.disabled ? THEME.panel : (item.color ?? this.node.color ?? THEME.accent);
      drawMenuItem(buf, x, y, w, item.label, item.sub ?? '', sel, color);
      if (item.badge) buf.drawText(x + w - item.badge.length - 2, y + 1, item.badge, { fg: sel ? [10, 10, 18] : THEME.good, bold: true });
      if (item.disabled && item.sub) buf.drawText(x + w - item.sub.length - 2, y + 1, item.sub, { fg: THEME.dim });
      y += 4;
    }
    center(buf, buf.height - 3, '↑↓ select · enter confirm · esc back', { fg: THEME.dim });
  }
}
