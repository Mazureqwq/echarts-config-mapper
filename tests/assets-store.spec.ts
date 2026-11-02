import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { ChartAsset } from "../src/core/types";
import type { EChartsOptionLike } from "../src/types/chart";
import { useAssetsStore } from "../src/stores/assets";

function makeAsset(overrides: Partial<ChartAsset> = {}): ChartAsset {
  return {
    id: "asset",
    name: "未命名",
    category: "默认",
    tags: [],
    chartType: "line",
    option: {} as EChartsOptionLike,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("assets store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saveAsset 调用 /api/save 并把资产插到列表头部", async () => {
    const store = useAssetsStore();
    const asset = await store.saveAsset({
      name: "测试 折线",
      category: "折线图",
      chartType: "line",
      option: {},
    });
    expect(asset.id.indexOf("测试-折线-")).toBe(0);
    expect(store.assets[0].id).toBe(asset.id);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/save");
  });

  it("deleteAsset 调用 /api/delete 并从列表移除", async () => {
    const store = useAssetsStore();
    const asset = await store.saveAsset({ name: "待删除", category: "饼图", chartType: "pie", option: {} });
    expect(store.assets.some((item) => item.id === asset.id)).toBe(true);
    await store.deleteAsset(asset.id);
    expect(store.assets.some((item) => item.id === asset.id)).toBe(false);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/delete");
  });

  it("saveAsset 失败时不插入列表", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ ok: false }) })));
    const store = useAssetsStore();
    const before = store.assets.length;
    await expect(
      store.saveAsset({ name: "失败的", category: "折线图", chartType: "line", option: {} }),
    ).rejects.toThrow();
    expect(store.assets).toHaveLength(before);
  });

  it("filtered 按 name 或 tags 不区分大小写匹配", () => {
    const store = useAssetsStore();
    store.assets = [
      makeAsset({ id: "a1", name: "折线图", tags: ["趋势"] }),
      makeAsset({ id: "a2", name: "柱状图", tags: ["Trend"] }),
      makeAsset({ id: "a3", name: "饼图", tags: ["占比"], category: "饼图" }),
    ];
    expect(store.filtered("折线", "")).toHaveLength(1);
    expect(store.filtered("trend", "")).toHaveLength(1);
    expect(store.filtered("trend", "")[0].id).toBe("a2");
    expect(store.filtered("", "")).toHaveLength(3);
    expect(store.filtered("", "饼图")[0].id).toBe("a3");
  });

  it("categories 去重保序", () => {
    const store = useAssetsStore();
    store.assets = [
      makeAsset({ id: "a1", category: "折线图" }),
      makeAsset({ id: "a2", category: "饼图" }),
      makeAsset({ id: "a3", category: "折线图" }),
    ];
    expect(store.categories).toEqual(["折线图", "饼图"]);
  });
});
