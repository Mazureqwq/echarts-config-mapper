import { resolveDataPath } from "./dataPath";

export interface LiveUpdate {
  id: string;
  data: unknown;
  stale: boolean;
  error?: string;
  updatedAt: number;
}

export interface LiveExecutorOptions {
  fetchImpl?: (url: string) => Promise<unknown>;
  setIntervalImpl?: (fn: () => void, ms: number) => unknown;
  clearIntervalImpl?: (handle: unknown) => void;
  now?: () => number;
}

export const MIN_INTERVAL_SEC = 5;

interface Entry {
  id: string;
  url: string;
  dataPath?: string;
  onData: (update: LiveUpdate) => void;
  lastData?: unknown;
  hasData: boolean;
  timer: unknown;
}

export class LiveExecutor {
  private readonly fetchImpl: (url: string) => Promise<unknown>;
  private readonly setIntervalImpl: (fn: () => void, ms: number) => unknown;
  private readonly clearIntervalImpl: (handle: unknown) => void;
  private readonly now: () => number;
  private readonly entries = new Map<string, Entry>();

  constructor(options?: LiveExecutorOptions) {
    this.fetchImpl =
      options?.fetchImpl ??
      (async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
    this.setIntervalImpl =
      options?.setIntervalImpl ?? ((fn, ms) => setInterval(fn, ms));
    this.clearIntervalImpl =
      options?.clearIntervalImpl ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
    this.now = options?.now ?? (() => Date.now());
  }

  register(
    id: string,
    source: { url: string; intervalSec: number; dataPath?: string },
    onData: (update: LiveUpdate) => void
  ): void {
    this.unregister(id);
    const ms = Math.max(MIN_INTERVAL_SEC, source.intervalSec) * 1000;
    const entry: Entry = {
      id,
      url: source.url,
      dataPath: source.dataPath,
      onData,
      hasData: false,
      timer: undefined,
    };
    entry.timer = this.setIntervalImpl(() => {
      void this.fetchOne(entry);
    }, ms);
    this.entries.set(id, entry);
  }

  unregister(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (entry.timer !== undefined) {
      this.clearIntervalImpl(entry.timer);
    }
    this.entries.delete(id);
  }

  async tick(): Promise<void> {
    await Promise.all([...this.entries.values()].map((entry) => this.fetchOne(entry)));
  }

  dispose(): void {
    for (const id of [...this.entries.keys()]) {
      this.unregister(id);
    }
  }

  private async fetchOne(entry: Entry): Promise<void> {
    try {
      const raw = await this.fetchImpl(entry.url);
      const data = resolveDataPath(raw, entry.dataPath);
      entry.lastData = data;
      entry.hasData = true;
      entry.onData({
        id: entry.id,
        data,
        stale: false,
        updatedAt: this.now(),
      });
    } catch (e) {
      entry.onData({
        id: entry.id,
        data: entry.hasData ? entry.lastData : undefined,
        stale: true,
        error: e instanceof Error ? e.message : String(e),
        updatedAt: this.now(),
      });
    }
  }
}

