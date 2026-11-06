import { DataHub, dataHub } from "./dataHub";
import type { DataHubOptions } from "./dataHub";
import { LIVE_MIN_INTERVAL_SEC } from "./liveSource";
import { buildRequest, clampTimeout } from "./apiSettings";
import type { ApiSettings, LiveSource } from "@/core/model/types";

export interface LiveUpdate {
  id: string;
  data: unknown;
  stale: boolean;
  error?: string;
  updatedAt: number;
}

export interface LiveExecutorOptions extends DataHubOptions {
  /** 全局接口设置（baseUrl / 公共头 / 公共 query / 超时） */
  resolveApi?: () => ApiSettings | undefined;
}

/** 轮询间隔下限（唯一定义在 liveSource，这里只为兼容旧引用保留别名） */
export const MIN_INTERVAL_SEC = LIVE_MIN_INTERVAL_SEC;

let instanceSeq = 0;

function hasInjectedRuntime(options?: LiveExecutorOptions): boolean {
  if (!options) return false;
  return Boolean(
    options.fetchImpl || options.setIntervalImpl || options.clearIntervalImpl || options.now
  );
}

/**
 * 图表级别的实时数据门面，真正的调度在 `DataHub`：
 * - 不传「运行时注入」→ 用应用级单例（工作台 / 演示 / 轮播重建共享同一份请求）
 * - 传了 fetchImpl 等（测试）→ 自己持有一个独立的 Hub
 * `resolveApi` 提供全局设置，用来把相对路径拼成绝对地址、合并公共请求头。
 */
export class LiveExecutor {
  private readonly hub: DataHub;
  private readonly ownHub: boolean;
  private readonly prefix: string;
  private readonly resolveApi?: () => ApiSettings | undefined;
  private readonly keys = new Map<string, string>();

  constructor(options?: LiveExecutorOptions) {
    this.ownHub = hasInjectedRuntime(options);
    this.resolveApi = options?.resolveApi;
    this.hub = this.ownHub ? new DataHub(options) : dataHub;
    this.prefix = `live${++instanceSeq}`;
  }

  register(id: string, source: LiveSource, onData: (update: LiveUpdate) => void): void {
    this.unregister(id);
    const key = `${this.prefix}::${id}`;
    const api = this.resolveApi?.();
    const request = buildRequest(source, api);
    this.keys.set(id, key);
    this.hub.subscribe({
      key,
      request,
      intervalSec: source.intervalSec,
      dataPath: source.dataPath,
      timeoutMs: clampTimeout(api?.timeoutMs),
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
