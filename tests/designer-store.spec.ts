import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createScreenItem } from "../src/core/item";
import type { ChartAsset, ScreenItem } from "../src/core/types";
import type { EChartsOptionLike } from "../src/types/chart";
import { useDesignerStore } from "../src/stores/designer";
import { useScreensStore } from "../src/stores/screens";

type DesignerStore = ReturnType<typeof useDesignerStore>;

function currentItems(store: DesignerStore): ScreenItem[] {
  return store.schema ? store.schema.items : [];
}

function makeAsset(overrides: Partial<ChartAsset> = {}): ChartAsset {
  return {
    id: "asset-1",
    name: "销售折线",
    category: "折线图",
    tags: [],
    chartType: "line",
    option: { series: [{ type: "line", data: [1, 2, 3] }] } as EChartsOptionLike,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("designer store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("newSchema 与 addItem 维护 zIndex 并可撤销重做", () => {
    const store = useDesignerStore();
    store.newSchema("测试大屏");
    expect(store.schema).not.toBeNull();
    expect(store.schema?.name).toBe("测试大屏");
    expect(store.schema?.id.indexOf("screen_")).toBe(0);
    store.addItem(createScreenItem("text"));
    expect(currentItems(store)).toHaveLength(1);
    expect(currentItems(store)[0].zIndex).toBe(1);
    expect(store.selectedId).toBe(currentItems(store)[0].id);
    store.addItem(createScreenItem("chart"));
    expect(currentItems(store)[1].zIndex).toBe(2);
    expect(store.canUndo).toBe(true);
    store.undo();
    expect(currentItems(store)).toHaveLength(1);
    store.redo();
    expect(currentItems(store)).toHaveLength(2);
  });

  it("addItemFromAsset 采用快照语义：option 深拷贝且与资产隔离", () => {
    const store = useDesignerStore();
    store.newSchema();
    const asset = makeAsset();
    store.addItemFromAsset(asset);
    const item = currentItems(store)[0];
    expect(item.name).toBe("销售折线");
    expect(item.chart?.sourceAssetId).toBe("asset-1");
    expect(item.chart?.option).toEqual(asset.option);
    expect(item.chart?.option).not.toBe(asset.option);
    asset.option = { series: [{ type: "line", data: [9] }] } as EChartsOptionLike;
    expect(item.chart?.option).toEqual({ series: [{ type: "line", data: [1, 2, 3] }] });
  });

  it("paste 生成新 id、偏移 24 且不改动剪贴板", () => {
    const store = useDesignerStore();
    store.newSchema();
    store.addItem(createScreenItem("text"));
    store.copySelected();
    expect(store.clipboard).not.toBeNull();
    store.paste();
    const items = currentItems(store);
    expect(items).toHaveLength(2);
    const first = items[0];
    const second = items[1];
    expect(second.id).not.toBe(first.id);
    expect(second.id).not.toBe(store.clipboard?.id);
    expect(second.rect.x).toBe(first.rect.x + 24);
    expect(second.rect.y).toBe(first.rect.y + 24);
    expect(store.clipboard?.id).toBe(first.id);
    expect(store.selectedId).toBe(second.id);
  });

  it("updateRect 按 record 决定是否产生历史", () => {
    const store = useDesignerStore();
    store.newSchema();
    store.addItem(createScreenItem("text"));
    const id = currentItems(store)[0].id;
    const baseSize = store.history.size;
    store.updateRect(id, { x: 100 }, false);
    expect(store.history.size).toBe(baseSize);
    expect(currentItems(store)[0].rect.x).toBe(100);
    store.updateRect(id, { x: 200 }, true);
    expect(store.history.size).toBe(baseSize + 1);
    store.undo();
    expect(currentItems(store)[0].rect.x).toBe(40);
    store.redo();
    expect(currentItems(store)[0].rect.x).toBe(200);
  });

  it("removeItem 清理选中态", () => {
    const store = useDesignerStore();
    store.newSchema();
    store.addItem(createScreenItem("text"));
    const id = currentItems(store)[0].id;
    expect(store.selectedId).toBe(id);
    store.removeItem(id);
    expect(currentItems(store)).toHaveLength(0);
    expect(store.selectedId).toBeNull();
  });

  it("load 载入 screens store 的副本并重置历史与脏标记", () => {
    const screens = useScreensStore();
    screens.screens.push({
      id: "screen-load",
      name: "载入",
      version: 1,
      canvas: { width: 1920, height: 1080, background: "#0a1a2e" },
      items: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const store = useDesignerStore();
    expect(store.load("missing-id")).toBe(false);
    expect(store.load("screen-load")).toBe(true);
    store.addItem(createScreenItem("text"));
    expect(store.dirty).toBe(true);
    expect(store.canUndo).toBe(true);
    store.load("screen-load");
    expect(store.dirty).toBe(false);
    expect(store.canUndo).toBe(false);
    expect(currentItems(store)).toHaveLength(0);
  });
});
