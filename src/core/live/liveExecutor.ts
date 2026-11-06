import { DataHub, dataHub } from "./dataHub";
import type { DataHubOptions } from "./dataHub";
import { LIVE_MIN_INTERVAL_SEC } from "./liveSource";

export interface LiveUpdate {
  id: string;
  data: unknown;
  stale: boolean;
  error?: string;
  updatedAt: number;
}

export type LiveExecutorOptions = DataHubOptions;

/** 轮询间隔下限（唯一定义在 liveSource，这里只为兼容旧引用保留别名） */
export const MIN_INTERVAL_SEC = LIVE_MIN_INTERVAL_SEC;

let instanceSeq = 0;

/**
 * 图表级别的实时数据门面，真正的调度在 `DataHub`：
 * - 不传 options → 用应用级单例（工作台 / 演示 / 轮播重建共享同一份请求）
 * - 传 options（测试）→ 自己持有一个独立的 Hub
 * 订阅 key 带实例前缀，避免不同页面同 id 互相顶掉。
 */
export class LiveExecutor {
  private readonly hub: DataHub;
  private readonly ownHub: boolean;
  private readonly prefix: string;
  private readonly keys = new Map<string, string>();

  constructor(options?: LiveExecutorOptions) {
    this.ownHub = options !== undefined;
    this.hub = options !== undefined ? new DataHub(options) : dataHub;
    this.prefix = `live${++instanceSeq}`;
  }

  register(
    id: string,
    source: { url: string; intervalSec: number; dataPath?: string },
    onData: (update: LiveUpdate) => void
  ): void {
    this.unregister(id);
    const key = `${this.prefix}::${id}`;
    this.keys.set(id, key);
    this.hub.subscribe({
      key,
      url: source.url,
      intervalSec: source.intervalSec,
      dataPath: source.dataPath,
      onUpdate: (u) =>
        onData({
          id,
          data: u.data,
          stale: u.stale,
          ...(u.error === undefined ? {} : { error: u.error }),
          updatedAt: u.updatedAt,
        }),
    });
  }

  unregister(id: string): void {
    const key = this.keys.get(id);
    if (!key) return;
    this.hub.unsubscribe(key);
    this.keys.delete(id);
  }

  /** 立刻拉一轮（不等定时器） */
  tick(): Promise<void> {
    return this.hub.tickAll();
  }

  dispose(): void {
    for (const id of [...this.keys.keys()]) this.unregister(id);
    if (this.ownHub) this.hub.dispose();
  }
}
