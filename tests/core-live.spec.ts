import { describe, it, expect } from "vitest";
import { resolveDataPath } from "../src/core/live/dataPath";
import { LiveExecutor } from "../src/core/live/liveExecutor";
import type { LiveUpdate } from "../src/core/live/liveExecutor";

describe("live/dataPath", () => {
  const payload = {
    result: { rows: [{ value: 1 }, { value: 2 }] },
    meta: { code: 0 },
  };

  it("按点路径取值，支持数组下标", () => {
    expect(resolveDataPath(payload, "result.rows.0.value")).toBe(1);
    expect(resolveDataPath(payload, "meta.code")).toBe(0);
  });

  it("缺失路径返回 undefined", () => {
    expect(resolveDataPath(payload, "a.b")).toBeUndefined();
    expect(resolveDataPath(payload, "result.rows.9")).toBeUndefined();
  });

  it("空路径返回原始数据", () => {
    expect(resolveDataPath(payload, undefined)).toBe(payload);
    expect(resolveDataPath(payload, "")).toBe(payload);
  });
});

describe("live/liveExecutor", () => {
  function setup(fetchImpl: (url: string) => Promise<unknown>) {
    const captured: number[] = [];
    const timers: Array<() => void> = [];
    const executor = new LiveExecutor({
      fetchImpl,
      setIntervalImpl: (fn, ms) => {
        captured.push(ms);
        timers.push(fn);
        return timers.length - 1;
      },
      clearIntervalImpl: () => undefined,
      now: () => 1000,
    });
    return { executor, captured, timers };
  }

  it("注册后定时轮询并推送提取的数据", async () => {
    const { executor, captured } = setup(async () => ({ data: { values: [1, 2, 3] } }));
    const updates: LiveUpdate[] = [];
    executor.register(
      "e1",
      { url: "http://api.test/data", intervalSec: 30, dataPath: "data" },
      (u) => updates.push(u)
    );
    expect(captured).toEqual([30000]);
    await executor.tick();
    expect(updates).toHaveLength(1);
    expect(updates[0].data).toEqual({ values: [1, 2, 3] });
    expect(updates[0].stale).toBe(false);
    expect(updates[0].updatedAt).toBe(1000);
  });

  it("intervalSec 下限夹紧为 5 秒", () => {
    const { executor, captured } = setup(async () => ({}));
    executor.register("e1", { url: "u", intervalSec: 2 }, () => undefined);
    expect(captured).toEqual([5000]);
  });

  it("失败保留最后一次成功数据并标记 stale", async () => {
    let fail = false;
    const { executor } = setup(async () => {
      if (fail) throw new Error("network down");
      return { v: 1 };
    });
    const updates: LiveUpdate[] = [];
    executor.register("e1", { url: "u", intervalSec: 10 }, (u) => updates.push(u));
    await executor.tick();
    fail = true;
    await executor.tick();
    expect(updates).toHaveLength(2);
    expect(updates[1].data).toEqual({ v: 1 });
    expect(updates[1].stale).toBe(true);
    expect(updates[1].error).toBe("network down");
  });

  it("从未成功时失败推送 stale 且 data 为 undefined", async () => {
    const { executor } = setup(async () => {
      throw new Error("boom");
    });
    const updates: LiveUpdate[] = [];
    executor.register("e1", { url: "u", intervalSec: 10 }, (u) => updates.push(u));
    await executor.tick();
    expect(updates).toHaveLength(1);
    expect(updates[0].data).toBeUndefined();
    expect(updates[0].stale).toBe(true);
    expect(updates[0].error).toBe("boom");
  });

  it("unregister 后不再推送", async () => {
    let calls = 0;
    const { executor } = setup(async () => {
      calls += 1;
      return {};
    });
    executor.register("e1", { url: "u", intervalSec: 10 }, () => undefined);
    executor.unregister("e1");
    await executor.tick();
    expect(calls).toBe(0);
  });
});
