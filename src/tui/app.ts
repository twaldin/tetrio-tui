/**
 * App framework: screen stack + main loop. Renderer-agnostic — consumes a RenderBuffer.
 * The concrete renderer is provided by src/tui/renderer.ts (tui agent); we only rely on
 * the small Buffer contract declared here (see RenderBuffer).
 */

export type RGB = [number, number, number];

export interface Style {
  fg?: RGB | null;
  bg?: RGB | null;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
  inverse?: boolean;
}

/** The minimal render-buffer contract a screen draws into each frame. */
export interface RenderBuffer {
  readonly width: number;
  readonly height: number;
  set(x: number, y: number, ch: string, style?: Style): void;
  fillRect(x: number, y: number, w: number, h: number, ch: string, style?: Style): void;
  drawText(x: number, y: number, text: string, style?: Style): void;
  drawBox?(x: number, y: number, w: number, h: number, style?: Style): void;
}

export interface KeyEvent {
  key: string;             // logical key name, e.g. 'left', 'a', 'return', 'escape'
  sequence?: string;       // raw sequence
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  type: 'down' | 'up';
}

export interface Screen {
  readonly name: string;
  onShow?(): void;
  onHide?(): void;
  onKey?(ev: KeyEvent): void;
  update?(dtMs: number): void;
  render(buf: RenderBuffer): void;
}

export interface AppDriver {
  buffer(): RenderBuffer;
  present(): void;
  onKey(cb: (ev: KeyEvent) => void): void;
  onResize(cb: (w: number, h: number) => void): void;
  size(): { width: number; height: number };
  stop(): void;
}

export class App {
  private stack: Screen[] = [];
  private driver: AppDriver;
  private running = false;
  private lastTime = 0;
  private frameHandle: NodeJS.Timeout | null = null;
  private needsRender = true;
  targetFps = 30;

  constructor(driver: AppDriver) {
    this.driver = driver;
    driver.onKey((ev) => this.handleKey(ev));
    driver.onResize(() => { this.needsRender = true; });
  }

  push(screen: Screen): void {
    this.top()?.onHide?.();
    this.stack.push(screen);
    screen.onShow?.();
    this.needsRender = true;
  }
  pop(): Screen | undefined {
    const s = this.stack.pop();
    s?.onHide?.();
    this.top()?.onShow?.();
    this.needsRender = true;
    return s;
  }
  replace(screen: Screen): void {
    this.pop();
    this.push(screen);
  }
  top(): Screen | undefined { return this.stack[this.stack.length - 1]; }

  private handleKey(ev: KeyEvent): void {
    this.top()?.onKey?.(ev);
    this.needsRender = true;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = Date.now();
    const loop = () => {
      if (!this.running) return;
      const now = Date.now();
      const dt = now - this.lastTime;
      this.lastTime = now;
      const top = this.top();
      top?.update?.(dt);
      if (this.needsRender || (top?.update !== undefined)) {
        top?.render(this.driver.buffer());
        this.driver.present();
        this.needsRender = false;
      }
      this.frameHandle = setTimeout(loop, 1000 / this.targetFps);
    };
    loop();
  }

  stop(): void {
    this.running = false;
    if (this.frameHandle) clearTimeout(this.frameHandle);
    this.driver.stop();
  }

  requestRender(): void { this.needsRender = true; }
}
