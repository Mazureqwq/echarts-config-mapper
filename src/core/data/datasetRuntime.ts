import type {
  DatasetDefinition,
  DatasetPipeline,
  DatasetSnapshot,
  LiveFilterOp,
  LiveSource,
} from "@/core/model/types";
import { buildRequest } from "@/core/live/apiSettings";
import { isAllowedUrl } from "@/core/live/liveSource";
import { LiveExecutor } from "@/core/live/liveExecutor";
import type { LiveExecutorOptions, LiveUpdate } from "@/core/live/liveExecutor";
import { runPipeline } from "@/core/live/pipeline";

export interface DatasetRuntimeOptions extends LiveExecutorOptions {}

type Listener = (snapshot: DatasetSnapshot) => void;

interface DatasetEntry {
  definition: DatasetDefinition;
  listeners: Map<string, Listener>;
  snapshot: DatasetSnapshot;
  rawData?: unknown;
  hasRawData: boolean;
  hasSuccessfulSnapshot: boolean;
  parameters: Record<string, string>;
  pipeline: DatasetPipeline;
  executor: LiveExecutor | null;
}

const EMPTY_SNAPSHOT: DatasetSnapshot = { status: "idle", rows: [] };

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 工作区级数据集运行时：静态源在订阅时立即加工；HTTP 源由 LiveExecutor 轮询。
 * 每个 dataset 只注册一个底层请求订阅，表格/KPI 等消费者共享同一份加工快照。
 */
export class DatasetRuntime {
  private readonly entries = new Map<string, DatasetEntry>();
  private readonly options: DatasetRuntimeOptions;
  private readonly now: () => number;
  private disposed = false;

  constructor(datasets: readonly DatasetDefinition[], options: DatasetRuntimeOptions = {}) {
    this.options = options;
    this.now = options.now ?? (() => Date.now());
    for (const definition of datasets) {
      if (this.entries.has(definition.id)) throw new Error(`数据集 ID 重复：${definition.id}`);
      this.entries.set(definition.id, this.createEntry(definition));
    }
  }

  subscribe(datasetId: string, consumerId: string, listener: Listener): () => void {
    this.assertActive();
    const entry = this.getEntry(datasetId);
    if (entry.listeners.has(consumerId)) {
      throw new Error(`数据集消费者 ID 重复：${consumerId}`);
    }
    const shouldStart = entry.listeners.size === 0;
    entry.listeners.set(consumerId, listener);
    listener(entry.snapshot);
    if (shouldStart) this.start(entry);

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      entry.listeners.delete(consumerId);
      if (!entry.listeners.size) this.stopExecutor(entry);
    };
  }

  setParameters(datasetId: string, parameters: Record<string, string>): void {
    this.assertActive();
    const entry = this.getEntry(datasetId);
    entry.parameters = { ...entry.parameters, ...copy(parameters) };
    if (entry.definition.source.kind === "http" && entry.listeners.size) this.restart(entry);
  }

  setFilter(datasetId: string, filter: LiveSource["filter"]): void {
    this.assertActive();
    const entry = this.getEntry(datasetId);
    const pipeline = { ...entry.pipeline };
    if (filter?.length) pipeline.filter = copy(filter);
    else delete pipeline.filter;
    entry.pipeline = pipeline;
    if (entry.hasRawData) this.applyPipeline(entry, this.now());
  }

  /** 新增或替换工作区中的一份数据集定义；活跃订阅会无缝重挂载。 */
  upsertDataset(definition: DatasetDefinition): void {
    this.assertActive();
    const previous = this.entries.get(definition.id);
    const listeners = previous?.listeners ?? new Map<string, Listener>();
    if (previous) this.stopExecutor(previous);
    const entry = this.createEntry(definition);
    entry.listeners = listeners;
    this.entries.set(definition.id, entry);
    if (entry.listeners.size) this.start(entry);
  }

  removeDataset(datasetId: string): void {
    const entry = this.entries.get(datasetId);
    if (!entry) return;
    this.stopExecutor(entry);
    this.entries.delete(datasetId);
  }

  async refresh(datasetId: string): Promise<void> {
    this.assertActive();
    const entry = this.getEntry(datasetId);
    if (entry.definition.source.kind === "static") {
      entry.rawData = entry.definition.source.data;
      entry.hasRawData = true;
      this.applyPipeline(entry, this.now());
      return;
    }
    if (!entry.executor) {
      if (!entry.listeners.size) {
        this.publish(entry, {
          status: "error",
          rows: entry.snapshot.rows,
          error: "HTTP 数据集需要至少一个有效订阅者",
          updatedAt: this.now(),
        });
        return;
      }
      this.start(entry);
    }
    if (entry.executor) {
      this.publish(entry, { ...entry.snapshot, status: "loading", error: undefined });
      await entry.executor.tick();
    }
  }

  getSnapshot(datasetId: string): DatasetSnapshot {
    return this.getEntry(datasetId).snapshot;
  }

  datasetIds(): string[] {
    return [...this.entries.keys()];
  }

  dispose(): void {
    if (this.disposed) return;
    for (const entry of this.entries.values()) {
      this.stopExecutor(entry);
      entry.listeners.clear();
    }
    this.entries.clear();
    this.disposed = true;
  }

  private createEntry(definition: DatasetDefinition): DatasetEntry {
    return {
      definition: copy(definition),
      listeners: new Map(),
      snapshot: { ...EMPTY_SNAPSHOT, rows: [] },
      hasRawData: false,
      hasSuccessfulSnapshot: false,
      parameters: { ...(definition.parameters ?? {}) },
      pipeline: copy(definition.pipeline ?? {}),
      executor: null,
    };
  }

  private start(entry: DatasetEntry): void {
    if (entry.definition.source.kind === "static") {
      entry.rawData = entry.definition.source.data;
      entry.hasRawData = true;
      this.applyPipeline(entry, this.now());
      return;
    }
    const live = this.toLiveSource(entry);
    const request = buildRequest(live, this.options.resolveApi?.());
    if (!request.url.trim() || !isAllowedUrl(request.url)) {
      this.publish(entry, {
        status: "error",
        rows: entry.snapshot.rows,
        error: "请填写有效的 HTTP 数据集接口地址",
        updatedAt: this.now(),
      });
      return;
    }
    this.publish(entry, { ...entry.snapshot, status: "loading", error: undefined });
    const executor = new LiveExecutor(this.options);
    entry.executor = executor;
    executor.register(entry.definition.id, live, (update) => this.onUpdate(entry, update));
    void executor.tick();
  }

  private restart(entry: DatasetEntry): void {
    this.stopExecutor(entry);
    if (entry.definition.source.kind === "http") this.start(entry);
  }

  private stopExecutor(entry: DatasetEntry): void {
    entry.executor?.dispose();
    entry.executor = null;
  }

  private toLiveSource(entry: DatasetEntry): LiveSource {
    const definition = entry.definition;
    if (definition.source.kind !== "http") throw new Error("静态数据集没有 HTTP 源");
    const source = definition.source.live;
    return {
      ...source,
      url: source.url ?? "",
      intervalSec: source.intervalSec,
      query: {
        ...(source.query ?? {}),
        ...(definition.parameters ?? {}),
        ...entry.parameters,
      },
      ...(entry.pipeline.filter?.length ? { filter: entry.pipeline.filter } : {}),
      ...(entry.pipeline.select?.length ? { select: entry.pipeline.select } : {}),
      ...(entry.pipeline.sort ? { sort: entry.pipeline.sort } : {}),
      ...(entry.pipeline.limit ? { limit: entry.pipeline.limit } : {}),
    };
  }

  private onUpdate(entry: DatasetEntry, update: LiveUpdate): void {
    if (update.stale || update.error) {
      const hasGoodRows = entry.hasSuccessfulSnapshot;
      this.publish(entry, {
        status: hasGoodRows ? "stale" : "error",
        rows: entry.snapshot.rows,
        ...(update.error ? { error: update.error } : { error: "数据源返回了过期数据" }),
        updatedAt: update.updatedAt,
      });
      return;
    }
    entry.rawData = update.data;
    entry.hasRawData = true;
    this.applyPipeline(entry, update.updatedAt);
  }

  private applyPipeline(entry: DatasetEntry, updatedAt: number): void {
    try {
      const result = runPipeline(entry.rawData, entry.pipeline);
      if (!result.ok) {
        const hasGoodRows = entry.hasSuccessfulSnapshot;
        this.publish(entry, {
          status: hasGoodRows ? "stale" : "error",
          rows: entry.snapshot.rows,
          error: result.message,
          updatedAt,
        });
        return;
      }
      entry.hasSuccessfulSnapshot = true;
      this.publish(entry, { status: "success", rows: result.rows, updatedAt });
    } catch (error) {
      const hasGoodRows = entry.hasSuccessfulSnapshot;
      this.publish(entry, {
        status: hasGoodRows ? "stale" : "error",
        rows: entry.snapshot.rows,
        error: error instanceof Error ? error.message : String(error),
        updatedAt,
      });
    }
  }

  private publish(entry: DatasetEntry, snapshot: DatasetSnapshot): void {
    entry.snapshot = snapshot;
    for (const listener of [...entry.listeners.values()]) listener(snapshot);
  }

  private getEntry(datasetId: string): DatasetEntry {
    const entry = this.entries.get(datasetId);
    if (!entry) throw new Error(`找不到数据集：${datasetId}`);
    return entry;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("数据集运行时已销毁");
  }
}

export type DatasetFilterOp = LiveFilterOp;
