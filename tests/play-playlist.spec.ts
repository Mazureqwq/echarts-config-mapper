import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  Playlist,
  clampInterval,
  parseIdList,
  DEFAULT_INTERVAL_SEC,
  MIN_INTERVAL_SEC,
  MAX_INTERVAL_SEC,
} from "../src/core/play/playlist";

const ids = (...xs: string[]) => xs.map((id) => ({ id }));

function make(idsList: { id: string }[], intervalSec = 10) {
  const seen: Array<{ id: string; index: number }> = [];
  const pl = new Playlist({
    screens: idsList,
    intervalSec,
    onChange: (id, index) => seen.push({ id, index }),
  });
  return { pl, seen };
}

describe("core/play/playlist", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clampInterval 把间隔限制在 3–600 秒，非法值回落默认", () => {
    expect(clampInterval(1)).toBe(MIN_INTERVAL_SEC);
    expect(clampInterval(9999)).toBe(MAX_INTERVAL_SEC);
    expect(clampInterval(Number.NaN)).toBe(DEFAULT_INTERVAL_SEC);
    expect(clampInterval(undefined as unknown as number)).toBe(DEFAULT_INTERVAL_SEC);
    expect(clampInterval(12.6)).toBe(13);
  });

  it("parseIdList 去空、去重、保序", () => {
    expect(parseIdList(undefined)).toEqual([]);
    expect(parseIdList("")).toEqual([]);
    expect(parseIdList("a, b ,,a,c")).toEqual(["a", "b", "c"]);
    expect(parseIdList(["x", "x", "y"] as unknown as string)).toEqual(["x", "y"]);
  });

  it("只有一个大屏时不自动切换", () => {
    const { pl, seen } = make(ids("a"));
    pl.start();
    expect(pl.count).toBe(1);
    vi.advanceTimersByTime(30_000);
    expect(seen).toHaveLength(0);
    pl.dispose();
  });

  it("按间隔循环切换，并回调 id 与序号", () => {
    const { pl, seen } = make(ids("a", "b", "c"), 10);
    pl.start();
    expect(pl.index).toBe(0);
    vi.advanceTimersByTime(10_000);
    vi.advanceTimersByTime(10_000);
    vi.advanceTimersByTime(10_000);
    expect(seen).toEqual([
      { id: "b", index: 1 },
      { id: "c", index: 2 },
      { id: "a", index: 0 },
    ]);
    pl.dispose();
  });

  it("pause 停止自动切换，resume 从当前屏重新计时", () => {
    const { pl, seen } = make(ids("a", "b"), 10);
    pl.start();
    pl.pause();
    vi.advanceTimersByTime(30_000);
    expect(seen).toHaveLength(0);
    expect(pl.paused).toBe(true);

    pl.resume();
    vi.advanceTimersByTime(10_000);
    expect(seen).toEqual([{ id: "b", index: 1 }]);
    pl.dispose();
  });

  it("手动 next/prev 会重置计时，不会紧接着自动切换", () => {
    const { pl, seen } = make(ids("a", "b", "c"), 10);
    pl.start();
    vi.advanceTimersByTime(6_000);
    pl.next();
    vi.advanceTimersByTime(6_000);
    expect(seen).toEqual([{ id: "b", index: 1 }]);
    vi.advanceTimersByTime(4_000);
    expect(seen).toEqual([
      { id: "b", index: 1 },
      { id: "c", index: 2 },
    ]);
    pl.prev();
    expect(pl.index).toBe(1);
    pl.dispose();
  });

  it("dispose 后不再切换", () => {
    const { pl, seen } = make(ids("a", "b"), 5);
    pl.start();
    pl.dispose();
    vi.advanceTimersByTime(60_000);
    expect(seen).toHaveLength(0);
  });
});
