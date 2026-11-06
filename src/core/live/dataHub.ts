import { resolveDataPath } from "./dataPath";
import { LIVE_MIN_INTERVAL_SEC } from "./liveSource";
import { feedKey, DEFAULT_TIMEOUT_MS } from "./apiSettings";
import type { HttpRequest } from "./apiSettings";

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
  /** 完整请求（方法/头/body 已合成） */
  request?: HttpRequest;
  /** 兼容旧调用：只给 URL 时按 GET 处理 */
  url?: string;
  intervalSec: number;
  dataPath?: string;
  timeoutMs?: number;
  onUpdate: (update: HubUpdate) => void;
}

export interface DataHubOptions {
  fetchImpl?: (req: HttpRequest, timeoutMs: number) => Promise<unknown>;
  setIntervalImpl?: (fn: () => void, ms: number) => unknown;
  clearIntervalImpl?: (handle: unknown) => void;
  now?: () => number;
  isHidden?: () => boolean;
  maxBackoffMs?: number;
}

interface Subscriber {
  key: string;
  intervalSec: number;
  dataPath?: string;
  timeoutMs: number;
  onUpdate: (update: HubUpdate) => void;
  hasData: boolean;
  lastData?: unknown;
}

interface Feed {
  id: string;
  request: HttpRequest;
  subs: Map<string, Subscriber>;
  timer: unknown;
  timerActive: boolean;
  inflight: Promise<void> | null;
  failCount: number;
}

function normalizeRequest(opts: HubSubscribeOptions): HttpRequest {
  if (opts.request) return opts.request;
  return { url: opts.url ?? "", method: "GET", headers: {} };
}

function defaultFetch(req: HttpRequest, timeoutMs: number): Promise<unknown> {
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (controller) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }
  return fetch(req.url, {
    method: req.method,
    headers: req.headers,
    ...(req.body === undefined ? {} : { body: req.body }),
    ...(controller ? { signal: controller.signal } : {}),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<unknown>;
    })
    .catch((e: unknown) => {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(`请求超时（${timeoutMs}ms）`);
      }
      throw e;
    })
    .finally(() => {
      if (timer !== null) clearTimeout(timer);
    });
}

/**
 * 数据源中心：按「方法 + 完整 URL + 请求头 + body」合并订阅者，一轮只发一次请求。
 * 支持间隔协商（组内最快）、单飞、失败退避、页面隐藏暂停、请求超时。
 */
export class DataHub {
  private readonly feeds = new Map<string, Feed>();
  private readonly fetchImpl: (req: HttpRequest, timeoutMs: number) => Promise<unknown>;
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
    const request = normalizeRequest(opts);
    if (!request.url.trim()) return;
    const id = feedKey(request);

    let feed = this.feeds.get(id);
    if (!feed) {
      feed = {
        id,
        request,
        subs: new Map(),
        timer: undefined,
        timerActive: false,
        inflight: null,
        failCount: 0,
      };
      this.feeds.set(id, feed);
    }
    const existing = feed.subs.get(opts.key);
    feed.subs.set(opts.key, {
      key: opts.key,
      intervalSec: opts.intervalSec,
      dataPath: opts.dataPath,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
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
        this.feeds.delete(feed.id);
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

  private feedTimeoutMs(feed: Feed): number {
    let t = Number.POSITIVE_INFINITY;
    for (const sub of feed.subs.values()) t = Math.min(t, sub.timeoutMs);
    return Number.isFinite(t) ? t : DEFAULT_TIMEOUT_MS;
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
        const payload = await this.fetchImpl(feed.request, this.feedTimeoutMs(feed));
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
