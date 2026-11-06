import { describe, it, expect, vi } from "vitest";
import { DataHub, resetDataHub } from "../src/core/live/dataHub";
import { LiveExecutor } from "../src/core/live/liveExecutor";
import type { HubUpdate } from "../src/core/live/dataHub";

interface Harness {
  hub: DataHub;
  captured: number[];
  timers: Array<() => void>;
  cleared: number[];
  updates: Array<{ key: string; update: HubUpdate }>;
  calls: () => number;
}

function harness(
  fetchImpl: (req: { url: string }, timeoutMs: number) => Promise<unknown>,
  opts: { isHidden?: () => boolean } = {}
): Harness {
  const captured: number[] = [];
  const timers: Array<() => void> = [];
  const cleared: number[] = [];
  let calls = 0;
  const updates: Array<{ key: string; update: HubUpdate }> = [];
  const hub = new DataHub({
    fetchImpl: (req, timeoutMs) => {
      calls += 1;
      return fetchImpl(req, timeoutMs);
    },
    setIntervalImpl: (fn, ms) => {
      captured.push(ms);
      timers.push(fn);
      return timers.length - 1;
    },
    clearIntervalImpl: (h) => {
      cleared.push(h as number);
    },
    now: () => 1000,
    isHidden: opts.isHidden,
  });
  return { hub, captured, timers, cleared, updates, calls: () => calls };
}

function sub(h: Harness, key: string, extra: Partial<{ url: string; intervalSec: number; dataPath: string }> = {}) {
  h.hub.subscribe({
    key,
    url: extra.url ?? "http://api/test",
    intervalSec: extra.intervalSec ?? 10,
    dataPath: extra.dataPath,
    onUpdate: (u) => h.updates.push({ key, update: u }),
  });
}

describe("live/dataHub 请求合并", () => {
  it("同一 URL 的多个订阅者一轮只发一次请求，各自按 dataPath 取值", async () => {
    const h = harness(async () => ({ a: { list: [1, 2] }, b: { list: [3] } }));
    sub(h, "k1", { dataPath: "a.list" });
    sub(h, "k2", { dataPath: "b.list" });
    sub(h, "k3", { dataPath: "a.list" });

    await h.hub.tickAll();

    expect(h.calls()).toBe(1);
    expect(h.updates.map((u) => [u.key, u.update.data])).toEqual([
      ["k1", [1, 2]],
      ["k2", [3]],
      ["k3", [1, 2]],
    ]);
  });

  it("不同 URL 各发一次", async () => {
    const h = harness(async () => ({}));
    sub(h, "k1", { url: "http://api/1" });
    sub(h, "k2", { url: "http://api/2" });
    await h.hub.tickAll();
    expect(h.calls()).toBe(2);
  });

  it("间隔协商：组内取最快的那一个", () => {
    const h = harness(async () => ({}));
    sub(h, "slow", { intervalSec: 30 });
    expect(h.captured).toEqual([30000]);
    sub(h, "fast", { intervalSec: 5 });
    expect(Math.min(...h.captured)).toBe(5000);
    expect(h.captured[h.captured.length - 1]).toBe(5000);
  });

  it("单飞：同一轮并发 tick 只发一次请求", async () => {
    const pending: { resolve?: (v: unknown) => void } = {};
    const h = harness(
      () =>
        new Promise<unknown>((resolve) => {
          pending.resolve = resolve;
        })
    );
    sub(h, "k1");
    const p1 = h.hub.tickAll();
    const p2 = h.hub.tickAll();
    pending.resolve?.({});
    await Promise.all([p1, p2]);
    expect(h.calls()).toBe(1);
  });

  it("最后一个订阅者退订后停止轮询", async () => {
    const h = harness(async () => ({}));
    sub(h, "k1");
    sub(h, "k2");
    h.hub.unsubscribe("k1");
    await h.hub.tickAll();
    expect(h.calls()).toBe(1);
    h.hub.unsubscribe("k2");
    expect(h.cleared.length).toBeGreaterThan(0);
    await h.hub.tickAll();
    expect(h.calls()).toBe(1);
  });

  it("所有订阅者共享同一份失败结果，但保留各自上次成功的数据", async () => {
    let fail = false;
    const h = harness(async () => {
      if (fail) throw new Error("HTTP 500");
      return { x: 1 };
    });
    sub(h, "k1", { dataPath: "x" });
    await h.hub.tickAll();
    fail = true;
    await h.hub.tickAll();
    const last = h.updates.filter((u) => u.key === "k1").pop();
    expect(last?.update.stale).toBe(true);
    expect(last?.update.error).toBe("HTTP 500");
    expect(last?.update.data).toBe(1);

    const stats = h.hub.stats();
    expect(stats.requests).toBe(2);
    expect(stats.failures).toBe(1);
  });

  it("dataPath 取不到值算失败并给出人话提示", async () => {
    const h = harness(async () => ({ rows: [] }));
    sub(h, "k1", { dataPath: "rows[*].value" });
    await h.hub.tickAll();
    const u = h.updates.pop()?.update;
    expect(u?.stale).toBe(true);
    expect(u?.error).toContain("取不到值");
  });

  it("失败后退避翻倍，成功后复位", async () => {
    let fail = true;
    const h = harness(async () => {
      if (fail) throw new Error("down");
      return {};
    });
    sub(h, "k1", { intervalSec: 5 });
    expect(h.captured).toEqual([5000]);

    await h.hub.tickAll();
    expect(h.captured[h.captured.length - 1]).toBe(10000);
    await h.hub.tickAll();
    expect(h.captured[h.captured.length - 1]).toBe(20000);

    fail = false;
    await h.hub.tickAll();
    expect(h.captured[h.captured.length - 1]).toBe(5000);
  });

describe("live/dataHub 生产路径（应用级单例）", () => {
  it("两个执行器订阅同一 URL，共用一份请求", async () => {
    resetDataHub();
    // 真实 fetch 返回 Response；这里给个够用的替代品
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ list: [1] }) }));
    vi.stubGlobal("fetch", spy);

    const a = new LiveExecutor();
    const b = new LiveExecutor();
    const seen: string[] = [];
    a.register("chart-1", { url: "https://api.shared/x", intervalSec: 30, dataPath: "list" }, (u) =>
      seen.push(`a:${JSON.stringify(u.data)}`)
    );
    b.register("chart-2", { url: "https://api.shared/x", intervalSec: 30, dataPath: "list" }, (u) =>
      seen.push(`b:${JSON.stringify(u.data)}`)
    );

    await a.tick();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(seen.sort()).toEqual(["a:[1]", "b:[1]"]);

    a.dispose();
    b.dispose();
    resetDataHub();
    vi.unstubAllGlobals();
  });
});

  it("页面隐藏时到点不请求", async () => {
    let hidden = true;
    const h = harness(async () => ({}), { isHidden: () => hidden });
    sub(h, "k1");
    h.timers[h.timers.length - 1]();
    expect(h.calls()).toBe(0);
    hidden = false;
    h.timers[h.timers.length - 1]();
    expect(h.calls()).toBe(1);
  });
});
