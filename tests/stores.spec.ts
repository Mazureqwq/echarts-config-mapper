import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWorkspaceStore } from "../src/stores/workspaceStore";
import { useDocumentStore } from "../src/stores/documentStore";
import { useUiStore } from "../src/stores/uiStore";
import { createScreen, createItem, createChartSpec } from "../src/core/model/schema";
import type { ChartItem, ScreenItem } from "../src/core/model/types";

function memStorage() {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
    _map: map,
  };
}

let store: ReturnType<typeof memStorage>;

beforeEach(() => {
  vi.useRealTimers();
  store = memStorage();
  vi.stubGlobal("localStorage", store);
  setActivePinia(createPinia());
});

function seedScreen() {
  const ws = useWorkspaceStore();
  const doc = useDocumentStore();
  const screen = createScreen("测试屏");
  ws.workspace.screens.push(screen);
  doc.currentScreenId = screen.id;
  return { ws, doc, screen };
}

describe("stores/workspaceStore", () => {
  it("load/save 往返", () => {
    const ws = useWorkspaceStore();
    ws.load();
    ws.workspace.screens.push(createScreen("S"));
    ws.save();
    const ws2 = useWorkspaceStore();
    ws2.load();
    expect(ws2.workspace.screens).toHaveLength(1);
  });

  it("scheduleSave 500ms 防抖只落盘一次", () => {
    vi.useFakeTimers();
    const ws = useWorkspaceStore();
    ws.load();
    ws.workspace.screens.push(createScreen("S"));
    ws.scheduleSave();
    ws.scheduleSave();
    ws.scheduleSave();
    expect(store._map.size).toBe(0);
    vi.advanceTimersByTime(499);
    expect(store._map.size).toBe(0);
    vi.advanceTimersByTime(1);
    expect(store._map.size).toBe(1);
    vi.useRealTimers();
  });
});

describe("stores/documentStore", () => {
  it("addScreen 增屏并选中", () => {
    const { doc } = seedScreen();
    const before = useWorkspaceStore().workspace.screens.length;
    const s = doc.addScreen("新屏");
    expect(useWorkspaceStore().workspace.screens).toHaveLength(before + 1);
    expect(doc.currentScreenId).toBe(s.id);
  });

  it("updateItemFrame 变更后 history.push，undo 恢复", () => {
    const { doc, screen } = seedScreen();
    const item = createItem("chart", { x: 10, y: 10, w: 100, h: 100 }) as ChartItem;
    screen.items.push(item);
    doc.initHistory();
    doc.updateItemFrame(item.id, { x: 50 });
    expect(screen.items[0].frame.x).toBe(50);
    doc.undo();
    expect(screen.items[0].frame.x).toBe(10);
    doc.redo();
    expect(screen.items[0].frame.x).toBe(50);
  });

  it("copy/paste 生成新 id 并偏移", () => {
    const { doc, screen } = seedScreen();
    const item = createItem("text", { x: 0, y: 0 }) as ScreenItem;
    screen.items.push(item);
    doc.selectedIds = [item.id];
    doc.copy();
    doc.paste();
    expect(screen.items).toHaveLength(2);
    expect(screen.items[1].id).not.toBe(item.id);
    expect(screen.items[1].frame.x).toBe(10);
  });

  it("distributeH 等间距与 align left 对齐", () => {
    const { doc, screen } = seedScreen();
    const a = createItem("shape", { x: 0, y: 0, w: 50, h: 50 });
    const b = createItem("shape", { x: 60, y: 30, w: 50, h: 50 });
    const c = createItem("shape", { x: 250, y: 60, w: 50, h: 50 });
    screen.items.push(a, b, c);
    doc.selectedIds = [a.id, b.id, c.id];
    doc.alignDistribute("distributeH");
    expect(screen.items.map((i) => i.frame.x)).toEqual([0, 125, 250]);
    doc.alignDistribute("left");
    expect(screen.items.map((i) => i.frame.x)).toEqual([0, 0, 0]);
  });

  it("applyOptionPatch 深合并，applyChartConfig 按路径写入", () => {
    const { doc, screen } = seedScreen();
    const item = createItem("chart") as ChartItem;
    screen.items.push(item);
    doc.applyOptionPatch(item.id, { title: { text: "A" } });
    expect((item.spec.option as any).title.text).toBe("A");
    doc.applyChartConfig(item.id, "title.show", true);
    expect((item.spec.option as any).title.show).toBe(true);
    expect((item.spec.option as any).title.text).toBe("A");
  });

  it("setLiveSource 夹紧 intervalSec≥5", () => {
    const { doc, screen } = seedScreen();
    const item = createItem("chart") as ChartItem;
    screen.items.push(item);
    doc.setLiveSource(item.id, { url: "http://api.test", intervalSec: 2, dataPath: "data" });
    expect(item.spec.source!.intervalSec).toBe(5);
    doc.setLiveSource(item.id, null);
    expect(item.spec.source).toBeUndefined();
  });

  it("applyLiveUpdate 成功转换数据，失败保留旧数据标 stale", () => {
    const { doc, screen } = seedScreen();
    const item = createItem("chart", {}, createChartSpec("line")) as ChartItem;
    screen.items.push(item);
    const ok = doc.applyLiveUpdate(item.id, [["月份", "v"], ["一月", "5"]], {
      stale: false,
      updatedAt: 1,
    });
    expect(ok).toBe(true);
    const data = item.spec.data as any;
    expect(data.categories).toEqual(["一月"]);
    const before = JSON.stringify(item.spec.data);
    const ok2 = doc.applyLiveUpdate(item.id, { weird: true }, {
      stale: false,
      updatedAt: 2,
    });
    expect(ok2).toBe(false);
    expect(JSON.stringify(item.spec.data)).toBe(before);
    expect(doc.liveStatus[item.id].stale).toBe(true);
  });

  it("同一大屏可以添加多个独立图表", () => {
    const { doc, screen } = seedScreen();
    const firstId = doc.addChart("line");
    const secondId = doc.addChart("bar");

    expect(firstId).not.toBe(secondId);
    expect(screen.items).toHaveLength(2);
    expect(screen.items.map((item) => item.kind === "chart" ? item.spec.type : item.kind)).toEqual(["line", "bar"]);
  });

  it("图表可复制和粘贴到同一大屏", () => {
    const { doc, screen } = seedScreen();
    const chart = createItem("chart", { x: 40, y: 50 }, createChartSpec("line")) as ChartItem;
    screen.items.push(chart);
    doc.selectedIds = [chart.id];

    doc.duplicate();
    expect(screen.items).toHaveLength(2);
    expect(screen.items[1].kind).toBe("chart");

    doc.copy();
    doc.paste();
    expect(screen.items).toHaveLength(3);
    expect(screen.items[2].kind).toBe("chart");
  });

  it("新元素、移动和尺寸编辑都限制在固定画布范围内", () => {
    const { doc, screen } = seedScreen();
    const item = createItem("shape", { x: 1900, y: 1000, w: 400, h: 300 });
    doc.addItem(item);

    expect(item.frame.x + item.frame.w).toBeLessThanOrEqual(screen.canvas.width);
    expect(item.frame.y + item.frame.h).toBeLessThanOrEqual(screen.canvas.height);

    doc.moveBy([item.id], 10000, 10000);
    expect(item.frame.x + item.frame.w).toBeLessThanOrEqual(screen.canvas.width);
    expect(item.frame.y + item.frame.h).toBeLessThanOrEqual(screen.canvas.height);

    doc.updateItemFrame(item.id, { x: -100, y: -100, w: 5000, h: 5000 });
    expect(item.frame.x).toBe(0);
    expect(item.frame.y).toBe(0);
    expect(item.frame.w).toBeLessThanOrEqual(screen.canvas.width);
    expect(item.frame.h).toBeLessThanOrEqual(screen.canvas.height);
  });

  it("缩小画布时可以将全部元素等比适配进去", () => {
    const { doc, screen } = seedScreen();
    const first = createItem("shape", { x: 100, y: 100, w: 400, h: 300 });
    const second = createItem("text", { x: 1500, y: 800, w: 400, h: 250 });
    screen.items.push(first, second);

    doc.fitItemsToCanvas(800, 600);

    expect(screen.canvas.width).toBe(800);
    expect(screen.canvas.height).toBe(600);
    expect(first.frame.w / 400).toBeCloseTo(first.frame.h / 300);
    expect(second.frame.w / 400).toBeCloseTo(second.frame.h / 250);
    for (const item of screen.items) {
      expect(item.frame.x).toBeGreaterThanOrEqual(0);
      expect(item.frame.y).toBeGreaterThanOrEqual(0);
      expect(item.frame.x + item.frame.w).toBeLessThanOrEqual(800);
      expect(item.frame.y + item.frame.h).toBeLessThanOrEqual(600);
    }
  });

  it("addGroup/ungroup 与 bringForward/sendBackward", () => {
    const { doc, screen } = seedScreen();
    const a = createItem("shape", {});
    const b = createItem("shape", {});
    screen.items.push(a, b);
    doc.selectedIds = [a.id, b.id];
    doc.addGroup();
    expect(a.groupId).toBeTruthy();
    expect(a.groupId).toBe(b.groupId);
    doc.ungroup();
    expect(a.groupId).toBeUndefined();
    doc.bringForward(a.id);
    expect(screen.items.map((i) => i.id)).toEqual([b.id, a.id]);
    doc.sendBackward(a.id);
    expect(screen.items.map((i) => i.id)).toEqual([a.id, b.id]);
  });

  it("duplicate 原位复制生成新 id 不偏移", () => {
    const { doc, screen } = seedScreen();
    const item = createItem("shape", { x: 30, y: 40 }) as ScreenItem;
    screen.items.push(item);
    doc.selectedIds = [item.id];
    doc.duplicate();
    expect(screen.items).toHaveLength(2);
    expect(screen.items[1].id).not.toBe(item.id);
    expect(screen.items[1].frame.x).toBe(30);
    expect(screen.items[1].frame.y).toBe(40);
  });

  it("removeItems 不删除锁定元素", () => {
    const { doc, screen } = seedScreen();
    const a = createItem("shape", {});
    const b = createItem("shape", {});
    screen.items.push(a, b);
    doc.updateItemProps(b.id, { locked: true });
    doc.removeItems([a.id, b.id]);
    expect(screen.items.map((i) => i.id)).toEqual([b.id]);
  });

  it("saveAsAsset 保存图表为资产", () => {
    const { doc, screen } = seedScreen();
    const item = createItem("chart") as ChartItem;
    screen.items.push(item);
    doc.saveAsAsset(item.id);
    const assets = useWorkspaceStore().workspace.assets;
    expect(assets).toHaveLength(1);
    expect(assets[0].spec).toEqual(item.spec);
  });

  it("addScreen 自定义画布尺寸并默认命名大屏N", () => {
    const { doc } = seedScreen();
    const before = useWorkspaceStore().workspace.screens.length;
    const s = doc.addScreen(undefined, { width: 800, height: 600 });
    expect(useWorkspaceStore().workspace.screens).toHaveLength(before + 1);
    expect(s.name).toBe(`大屏${before + 1}`);
    expect(s.items).toHaveLength(0);
    expect(s.canvas.width).toBe(800);
    expect(s.canvas.height).toBe(600);
  });

  it("updateScreenMeta 更新名称/分类/标签", () => {
    const { doc, screen } = seedScreen();
    doc.updateScreenMeta(screen.id, { name: "销量柱状图", category: "柱状图", tags: ["销售"] });
    expect(screen.name).toBe("销量柱状图");
    expect(screen.category).toBe("柱状图");
    expect(screen.tags).toEqual(["销售"]);
  });

  it("addChart 将新图表居中放入指定尺寸画布", () => {
    const { doc, screen } = seedScreen();
    screen.canvas.width = 1000;
    screen.canvas.height = 500;
    const id = doc.addChart("pie");
    const chart = screen.items.find((item) => item.id === id);

    expect(chart?.kind).toBe("chart");
    expect(chart?.frame).toMatchObject({ x: 300, y: 100, w: 400, h: 300 });
  });

  it("连续 addChart 的叠放偏移不会把图表推出画布", () => {
    const { doc, screen } = seedScreen();
    screen.canvas.width = 1000;
    screen.canvas.height = 500;
    const ids = Array.from({ length: 8 }, () => doc.addChart("bar"));

    expect(new Set(ids).size).toBe(8);
    expect(screen.items).toHaveLength(8);
    for (const item of screen.items) {
      expect(item.frame.x).toBeGreaterThanOrEqual(0);
      expect(item.frame.y).toBeGreaterThanOrEqual(0);
      expect(item.frame.x + item.frame.w).toBeLessThanOrEqual(screen.canvas.width);
      expect(item.frame.y + item.frame.h).toBeLessThanOrEqual(screen.canvas.height);
    }
  });

  it("setCanvas 保留原位时只改画布尺寸、不搬动元素", () => {
    const { doc, screen } = seedScreen();
    const item = createItem("shape", { x: 1500, y: 900, w: 300, h: 150 });
    screen.items.push(item);

    doc.setCanvas({ width: 800, height: 600 });

    expect(screen.canvas.width).toBe(800);
    expect(screen.canvas.height).toBe(600);
    expect(item.frame).toMatchObject({ x: 1500, y: 900, w: 300, h: 150 });
  });

});

describe("stores/uiStore", () => {
  it("zoom 夹紧 25–400", () => {
    const ui = useUiStore();
    ui.setZoom(10);
    expect(ui.zoom).toBe(25);
    ui.setZoom(500);
    expect(ui.zoom).toBe(400);
    ui.setZoom(77.4);
    expect(ui.zoom).toBe(77);
    expect(ui.previewing).toBe(false);
  });
});
