import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { EChartsOptionLike } from "../src/types/chart";
import { applyApiData, createPoller, pickByPath } from "../src/core/data-source";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pickByPath", () => {
  const obj = { a: [{ b: { c: 42 } }], name: "cf" };

  test("命中顶层与嵌套值", () => {
    expect(pickByPath(obj, "name")).toBe("cf");
    expect(pickByPath(obj, "a.0.b")).toEqual({ c: 42 });
  });

  test("数组下标 a.0.b.c", () => {
    expect(pickByPath(obj, "a.0.b.c")).toBe(42);
  });

  test("任一段缺失返回 undefined", () => {
    expect(pickByPath(obj, "a.1.b")).toBeUndefined();
    expect(pickByPath(obj, "a.0.b.x.y")).toBeUndefined();
    expect(pickByPath(null, "a")).toBeUndefined();
  });
});

describe("createPoller", () => {
  test("start 立即执行一次并回调 onOk", async () => {
    const fetcher = vi.fn(async () => ({ v: 1 }));
    const onOk = vi.fn();
    const poller = createPoller(fetcher, onOk, 2);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onOk).toHaveBeenCalledWith({ v: 1 });
    poller.stop();
  });

  test("intervalSec=2 时 4 秒内共执行 3 次（立即 1 次 + 周期 2 次）", async () => {
    const fetcher = vi.fn(async () => ({}));
    const poller = createPoller(fetcher, () => {}, 2);
    poller.start();
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  test("fetcher 拒绝被吞掉，不打断后续轮询也不调 onOk", async () => {
    let n = 0;
    const fetcher = vi.fn(async () => {
      n += 1;
      if (n === 1) throw new Error("boom");
      return n;
    });
    const onOk = vi.fn();
    const poller = createPoller(fetcher, onOk, 2);
    poller.start();
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(onOk).toHaveBeenCalledTimes(2);
    expect(onOk).toHaveBeenLastCalledWith(3);
    poller.stop();
  });

  test("fetcher 同步抛错同样被吞掉", async () => {
    const fetcher = vi.fn(() => {
      throw new Error("sync boom");
    }) as unknown as () => Promise<unknown>;
    const onOk = vi.fn();
    const poller = createPoller(fetcher, onOk, 2);
    poller.start();
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(onOk).not.toHaveBeenCalled();
    poller.stop();
  });

  test("stop 后不再轮询", async () => {
    const fetcher = vi.fn(async () => ({}));
    const poller = createPoller(fetcher, () => {}, 2);
    poller.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    poller.stop();
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("重复 start 自动先 stop，不会叠加周期", async () => {
    const fetcher = vi.fn(async () => ({}));
    const poller = createPoller(fetcher, () => {}, 2);
    poller.start();
    poller.start();
    await vi.advanceTimersByTimeAsync(4000);
    // 立即 2 次 + 周期 2 次；若无去重会是 6 次
    expect(fetcher).toHaveBeenCalledTimes(4);
    poller.stop();
  });
});

describe("applyApiData", () => {
  test("写入 series.0.data 且不修改原 option", () => {
    const option = { series: [{ type: "line", data: [1, 2] }] } as unknown as EChartsOptionLike;
    const next = applyApiData(option, [7, 8, 9], "series.0.data");
    expect((next.series as any[])[0].data).toEqual([7, 8, 9]);
    expect((option.series as any[])[0].data).toEqual([1, 2]);
  });

  test("optionPath 为空时默认 series.0.data", () => {
    const option = { series: [{ type: "bar", data: [] }] } as unknown as EChartsOptionLike;
    const next = applyApiData(option, "hello", "");
    expect((next.series as any[])[0].data).toBe("hello");
  });
});
