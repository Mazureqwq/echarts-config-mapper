import { resolveDataPath } from "./dataPath";
import { LIVE_MIN_INTERVAL_SEC } from "./liveSource";

/** 失败退避上限：5 分钟 */
export const MAX_BACKOFF_MS = 5 * 60 * 1000;

export interface HubUpdate {
  key: string;
  data: unknown;
  stale: boolean;
  error?: string;
  updatedAt: number;
}

export interface HubSubscribeOptions {
  key: string;
  url: string;
  intervalSec: number;
  dataPath?: string;
  onUpdate: (update: HubUpdate) => void;
}

export interface DataHubOptions {
  fetchImpl?: (url: string) => Promise<unknown>;
  setIntervalImpl?: (fn: () => void, ms: number) => unknown;
  clearIntervalImpl?: (handle: unknown) => void;
  now?: () => number;
  /** 页面是否隐藏（隐藏时跳过请求，但计时器继续跑） */
  isHidden?: () => boolean;
  maxBackoffMs?: number;
}

interface Subscriber {
  key: string;
  intervalSec: number;
  dataPath?: string;
  onUpdate: (update: HubUpdate) => void;
  hasData: boolean;
  lastData?: unknown;
}

interface Feed {
  url: string;
  subs: Map<string, Subscriber>;
  timer: unknown;
  timerActive: boolean;
  inflight: Promise<void> | null;
  failCount: number;
}

function defaultFetch(url: string): Promise<unknown> {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
}

/**
 * 数据源中心：按 URL 归并订阅者，一轮只发一次请求。
 * 提供间隔协商（组内取最快）、单飞、失败退避、页面隐藏暂停。
 */
export class DataHub {
  private readonly feeds = new Map<string, Feed>();
  private readonly fetchImpl: (url: string) => Promise<unknown>;
  private readonly setIntervalImpl: (fn: () => void, ms: number) => unknown;
  private readonly clearIntervalImpl: (handle: unknown) => void;
  private readonly now: () => number;
  private readonly isHidden: () => boolean;
  private readonly maxBackoffMs: number;

  private requests = 0;
  private failures = 0;
  private disposed = false;

  constructor(options: DataHubOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? defaultFetch;
    this.setIntervalImpl = options.setIntervalImpl ?? ((fn, ms) => setInterval(fn, ms));
    this.clearIntervalImpl =
      options.clearIntervalImpl ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
    this.now = options.now ?? (() => Date.now());
    this.isHidden =
      options.isHidden ??
      (() => typeof document !== "undefined" && document.visibilityState === "hidden");
    this.maxBackoffMs = options.maxBackoffMs ?? MAX_BACKOFF_MS;
  }

  subscribe(opts: HubSubscribeOptions): void {
    const url = opts.url;
    if (!url) return;
    let feed = this.feeds.get(url);
    if (!feed) {
      feed = {
        url,
        subs: new Map(),
        timer: undefined,
        timerActive: false,
        inflight: null,
        failCount: 0,
      };
      this.feeds.set(url, feed);
    }
    const existing = feed.subs.get(opts.key);
    feed.subs.set(opts.key, {
      key: opts.key,
      intervalSec: opts.intervalSec,
      dataPath: opts.dataPath,
      onUpdate: opts.onUpdate,
      hasData: existing?.hasData ?? false,
      lastData: existing?.lastData,
    });
    this.reschedule(feed);
  }

  unsubscribe(key: string): void {
    for (const feed of this.feeds.values()) {
      if (!feed.subs.has(key)) continue;
      feed.subs.delete(key);
      if (!feed.subs.size) {
        this.stopTimer(feed);
        this.feeds.delete(feed.url);
      } else {
        this.reschedule(feed);
      }
      return;
    }
  }

  /** 拉一轮全部数据源（单飞：上一轮没回来就复用同一个 Promise） */
  async tickAll(): Promise<void> {
    await Promise.all([...this.feeds.values()].map((feed) => this.fetchFeed(feed)));
  }

  stats(): { requests: number; failures: number; feeds: number; subscribers: number } {
    let subscribers = 0;
    for (const feed of this.feeds.values()) subscribers += feed.subs.size;
    return {
      requests: this.requests,
      failures: this.failures,
      feeds: this.feeds.size,
      subscribers,
    };
  }

  dispose(): void {
    for (const feed of this.feeds.values()) this.stopTimer(feed);
    this.feeds.clear();
    this.disposed = true;
  }

  // ---- 内部 ----

  /** 组内取最快间隔 */
  private baseDelayMs(feed: Feed): number {
    let fastest = Number.POSITIVE_INFINITY;
    for (const sub of feed.subs.values()) {
      if (sub.intervalSec < fastest) fastest = sub.intervalSec;
    }
    const sec = Number.isFinite(fastest) ? Math.max(LIVE_MIN_INTERVAL_SEC, fastest) : 30;
    return sec * 1000;
  }

  private currentDelayMs(feed: Feed): number {
    const base = this.baseDelayMs(feed);
    if (!feed.failCount) return base;
    return Math.min(base * Math.pow(2, feed.failCount), this.maxBackoffMs);
  }

  private reschedule(feed: Feed): void {
    if (this.disposed) return;
    const delay = this.currentDelayMs(feed);
    this.stopTimer(feed);
    feed.timer = this.setIntervalImpl(() => {
      if (this.isHidden()) return;
      void this.fetchFeed(feed);
    }, delay);
    feed.timerActive = true;
  }

  private stopTimer(feed: Feed): void {
    if (!feed.timerActive) return;
    this.clearIntervalImpl(feed.timer);
    feed.timer = undefined;
    feed.timerActive = false;
  }

  private fetchFeed(feed: Feed): Promise<void> {
    if (feed.inflight) return feed.inflight;
    const task = (async () => {
      try {
        this.requests += 1;
        const payload = await this.fetchImpl(feed.url);
        feed.failCount = 0;
        this.dispatchPayload(feed, payload);
        this.reschedule(feed);
      } catch (e) {
        this.failures += 1;
        feed.failCount += 1;
        this.dispatchError(feed, e instanceof Error ? e.message : String(e));
        this.reschedule(feed);
      } finally {
        feed.inflight = null;
      }
    })();
    feed.inflight = task;
    return task;
  }

  private dispatchPayload(feed: Feed, payload: unknown): void {
    for (const sub of feed.subs.values()) {
      const value = resolveDataPath(payload, sub.dataPath);
      // 路径取不到值、或通配投影得到空数组，都算这一路失败（否则会静默把图表刷空）
      const empty = Array.isArray(value) && value.length === 0;
      if (sub.dataPath && (value === undefined || empty)) {
        sub.onUpdate({
          key: sub.key,
          data: sub.hasData ? sub.lastData : undefined,
          stale: true,
          error: `路径「${sub.dataPath}」在返回数据里取不到值`,
          updatedAt: this.now(),
        });
        continue;
      }
      sub.hasData = true;
      sub.lastData = value;
      sub.onUpdate({ key: sub.key, data: value, stale: false, updatedAt: this.now() });
    }
  }

  private dispatchError(feed: Feed, message: string): void {
    for (const sub of feed.subs.values()) {
      sub.onUpdate({
        key: sub.key,
        data: sub.hasData ? sub.lastData : undefined,
        stale: true,
        error: message,
        updatedAt: this.now(),
      });
    }
  }
}

/** 应用级单例：工作台、演示、轮播重建共用同一份数据源 */
export const dataHub = new DataHub();

/** 测试用：清掉单例里的订阅与计时器 */
export function resetDataHub(): void {
  dataHub.dispose();
}
