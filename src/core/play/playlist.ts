export const MIN_INTERVAL_SEC = 3;
export const MAX_INTERVAL_SEC = 600;
export const DEFAULT_INTERVAL_SEC = 15;

/** 轮播间隔：非法值回落默认，四舍五入并限制在 3–600 秒 */
export function clampInterval(sec: number): number {
  if (typeof sec !== "number" || !Number.isFinite(sec)) return DEFAULT_INTERVAL_SEC;
  return Math.min(MAX_INTERVAL_SEC, Math.max(MIN_INTERVAL_SEC, Math.round(sec)));
}

/** "a, b ,,a,c" → ["a","b","c"]：去空、去重、保留顺序 */
export function parseIdList(raw: string | string[] | null | undefined): string[] {
  const parts = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const out: string[] = [];
  for (const part of parts) {
    const id = String(part).trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export interface PlaylistScreen {
  id: string;
}

export interface PlaylistOptions {
  screens: PlaylistScreen[];
  intervalSec?: number;
  /** 切换到大屏时回调（首屏由调用方自己设置，不触发回调） */
  onChange: (id: string, index: number) => void;
}

/**
 * 演示轮播控制器：只管「什么时候该切到哪一屏」，不碰 DOM。
 * 计时器用全局 setTimeout，测试里配合 vi.useFakeTimers() 即可。
 */
export class Playlist {
  private readonly frames: PlaylistScreen[];
  private readonly ms: number;
  private readonly intervalSecValue: number;
  private readonly notify: (id: string, index: number) => void;

  private _index = 0;
  private _paused = false;
  private _started = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: PlaylistOptions) {
    this.frames = opts.screens.slice();
    this.intervalSecValue = clampInterval(opts.intervalSec ?? DEFAULT_INTERVAL_SEC);
    this.ms = this.intervalSecValue * 1000;
    this.notify = opts.onChange;
  }

  get index(): number {
    return this._index;
  }

  get count(): number {
    return this.frames.length;
  }

  get paused(): boolean {
    return this._paused;
  }

  get intervalSec(): number {
    return this.intervalSecValue;
  }

  get currentId(): string {
    return this.frames[this._index]?.id ?? "";
  }

  start(): void {
    this._started = true;
    this.restart();
  }

  /** 下一屏（手动，会重置计时） */
  next(): void {
    this.advance(1);
  }

  /** 上一屏（手动，会重置计时） */
  prev(): void {
    this.advance(-1);
  }

  goto(index: number): void {
    if (!this.frames.length) return;
    const len = this.frames.length;
    const target = ((Math.trunc(index) % len) + len) % len;
    if (target === this._index) return;
    this._index = target;
    this.notify(this.currentId, this._index);
    this.restart();
  }

  pause(): void {
    this._paused = true;
    this.clear();
  }

  resume(): void {
    this._paused = false;
    this.restart();
  }

  /** 返回切换后的暂停状态 */
  toggle(): boolean {
    if (this._paused) this.resume();
    else this.pause();
    return this._paused;
  }

  dispose(): void {
    this._started = false;
    this.clear();
  }

  private advance(step: number): void {
    if (!this.frames.length) return;
    const len = this.frames.length;
    this._index = ((this._index + step) % len + len) % len;
    this.notify(this.currentId, this._index);
    this.restart();
  }

  private restart(): void {
    this.clear();
    if (!this._started || this._paused || this.frames.length < 2) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.advance(1);
    }, this.ms);
  }

  private clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
