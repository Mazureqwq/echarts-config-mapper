import { describe, it, expect, beforeEach, vi } from "vitest";
import { THUMBNAIL_VERSION } from "../src/core/storage/thumbnail";
import { createPinia, setActivePinia } from "pinia";
import { useWorkspaceStore } from "../src/stores/workspaceStore";
import { useDocumentStore } from "../src/stores/documentStore";
import { useUiStore } from "../src/stores/uiStore";
import { createScreen, createItem, createChartSpec } from "../src/core/model/schema";
import { PLACEHOLDER_PREFIX } from "../src/core/model/templates";
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

  it("数据集 CRUD 会保存名称、源与加工配置", () => {
    const ws = useWorkspaceStore();
    ws.load();
    const id = ws.createDataset("销售数据", { kind: "static", data: [{ city: "Berlin", sales: 8 }] });
    expect(ws.workspace.datasets).toHaveLength(1);
    expect(ws.workspace.datasets[0]).toMatchObject({ id, name: "销售数据", source: { kind: "static", data: [{ city: "Berlin", sales: 8 }] } });

    ws.updateDataset(id, { name: "修订数据", pipeline: { select: ["city", "sales"], limit: 10 } });
    expect(ws.workspace.datasets[0]).toMatchObject({ name: "修订数据", pipeline: { select: ["city", "sales"], limit: 10 } });
    const stored = JSON.parse(store._map.get("chartforge.workspace.v1")!);
    expect(stored.datasets[0].name).toBe("修订数据");

    ws.removeDataset(id);
    expect(ws.workspace.datasets).toEqual([]);
    expect(JSON.parse(store._map.get("chartforge.workspace.v1")!).datasets).toEqual([]);
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

  it("load 前会先落盘挂起的修改：防抖未到期时重新 load 不会丢失刚新建的大屏", () => {
    vi.useFakeTimers();
    const ws = useWorkspaceStore();
    ws.load();
    ws.workspace.screens.push(createScreen("新建大屏"));
    ws.scheduleSave();
    // 模拟新建大屏后立即跳转工作台（防抖未到期），工作台挂载时会调用 load()
    ws.load();
    expect(ws.workspace.screens.map((s) => s.name)).toEqual(["新建大屏"]);
    expect(JSON.parse(store._map.get("chartforge.workspace.v1")!).screens).toHaveLength(1);
    vi.useRealTimers();
  });

  it("createAsset 在图表库中新建图表资产（含类型与默认尺寸）", () => {
    const ws = useWorkspaceStore();
    ws.load();
    const id = ws.createAsset("bar", "销量图", { w: 800, h: 500 });
    const asset = ws.assetById(id)!;

    expect(ws.workspace.assets).toHaveLength(1);
    expect(asset.name).toBe("销量图");
    expect(asset.spec.type).toBe("bar");
    expect(asset.defaultSize).toEqual({ w: 800, h: 500 });
  });

  it("图表资产的配置/数据/类型/尺寸编辑都会落库且只影响自己", () => {
    const ws = useWorkspaceStore();
    ws.load();
    const a = ws.createAsset("line", "A", { w: 600, h: 400 });
    const b = ws.createAsset("line", "B", { w: 600, h: 400 });
    const assetA = ws.assetById(a)!;
    const assetB = ws.assetById(b)!;

    ws.applyAssetConfig(a, "title.text", "销售趋势");
    expect((assetA.spec.option as Record<string, unknown>).title).toEqual({ text: "销售趋势" });
    expect(assetB.spec.option).toEqual({});

    ws.updateAssetData(a, {
      kind: "category",
      categories: ["一月", "二月"],
      series: [{ name: "销量", values: [1, 2] }],
    });
    expect(assetA.spec.data).toMatchObject({ kind: "category", categories: ["一月", "二月"] });
    expect(assetB.spec.data).toMatchObject({ kind: "category" });
    expect((assetB.spec.data as { categories: string[] }).categories.length).toBeGreaterThan(0);

    ws.updateAssetType(b, "pie");
    expect(assetB.spec.type).toBe("pie");
    expect(assetB.spec.option).toEqual({});
    expect(assetA.spec.type).toBe("line");

    ws.updateAssetSize(a, { w: 900, h: 480 });
    expect(assetA.defaultSize).toEqual({ w: 900, h: 480 });
    expect(assetB.defaultSize).toEqual({ w: 600, h: 400 });
  });

  it("setAssetThumbnail 写入缩略图；replaceAssetSpec 整体回写（撤销用）", () => {
    const ws = useWorkspaceStore();
    ws.load();
    const id = ws.createAsset("line", "C", { w: 600, h: 400 });
    const asset = ws.assetById(id)!;

    const beforeThumb = asset.updatedAt;
    ws.setAssetThumbnail(id, "data:image/jpeg;base64,abc");
    expect(asset.thumbnail).toBe("data:image/jpeg;base64,abc");
    // 缩略图是派生产物：记录算法版本，但不改 updatedAt（否则会自触发重算）
    expect(asset.thumbnailVersion).toBe(THUMBNAIL_VERSION);
    expect(asset.updatedAt).toBe(beforeThumb);

    const before = JSON.parse(JSON.stringify(asset.spec));
    ws.applyAssetConfig(id, "title.text", "改过的标题");
    expect((asset.spec.option as Record<string, unknown>).title).toEqual({ text: "改过的标题" });

    ws.replaceAssetSpec(id, before);
    expect(asset.spec).toEqual(before);
  });

  it("资产编辑后的图表拖入大屏得到最新副本", () => {
    const { doc, ws, screen } = seedScreen();
    const assetId = ws.createAsset("line", "趋势", { w: 500, h: 300 });
    ws.applyAssetConfig(assetId, "title.text", "标题A");
    ws.updateAssetData(assetId, {
      kind: "category",
      categories: ["Q1"],
      series: [{ name: "值", values: [7] }],
    });

    const itemId = doc.placeAsset(assetId);
    const item = screen.items.find((i) => i.id === itemId) as ChartItem;

    expect(item.frame.w).toBe(500);
    expect(item.frame.h).toBe(300);
    expect((item.spec.option as Record<string, unknown>).title).toEqual({ text: "标题A" });
    expect(item.spec.data).toMatchObject({ categories: ["Q1"] });
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

  it("可添加注册的数据表格/KPI、编辑受控属性并绑定共享数据集", () => {
    const { doc, screen } = seedScreen();
    const tableId = doc.addComponent("chartforge.data-table", 1);
    const kpiId = doc.addComponent("chartforge.kpi", 1);
    expect(screen.items.map((item) => item.kind)).toEqual(["component", "component"]);
    const table = screen.items.find((item) => item.id === tableId)!;
    expect(table).toMatchObject({ kind: "component", componentId: "chartforge.data-table", componentVersion: 1, props: { striped: true } });
    doc.updateComponentProps(tableId, { ...(table.kind === "component" ? table.props : {}), striped: false, unregisteredProp: "ignored" });
    expect(table.kind === "component" && table.props.striped).toBe(false);
    expect(table.kind === "component" && table.props).not.toHaveProperty("unregisteredProp");
    doc.updateItemDataBinding(tableId, { datasetId: "sales", filterBy: { field: "city", globalVariable: "selectedCity" } });
    doc.updateItemDataBinding(kpiId, { datasetId: "sales" });
    expect(screen.items.find((item) => item.id === tableId)).toMatchObject({ dataBinding: { datasetId: "sales", filterBy: { field: "city", globalVariable: "selectedCity" } } });
    doc.updateItemDataBinding(tableId, undefined);
    expect(screen.items.find((item) => item.id === tableId)).not.toHaveProperty("dataBinding");
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

  it("saveChartAsAsset 保存图表为资产且之后互不影响", () => {
    const { doc, screen } = seedScreen();
    const chartId = doc.addChart("line");
    const assetId = doc.saveChartAsAsset(chartId, {
      name: "销售趋势",
      category: "折线图",
      tags: ["销售"],
    });

    expect(assetId).toBeTruthy();
    const asset = useWorkspaceStore().workspace.assets.find((a) => a.id === assetId)!;
    expect(asset.name).toBe("销售趋势");
    expect(asset.category).toBe("折线图");
    expect(asset.tags).toEqual(["销售"]);
    expect(asset.defaultSize).toEqual({ w: 400, h: 300 });

    const chart = screen.items.find((i) => i.id === chartId) as ChartItem;
    expect(asset.spec).not.toBe(chart.spec);
    chart.spec.type = "bar";
    expect(asset.spec.type).toBe("line");
  });

  it("placeAsset 生成副本、重名追加副本序号并落在画布内", () => {
    const { doc, screen } = seedScreen();
    const chartId = doc.addChart("line");
    const assetId = doc.saveChartAsAsset(chartId, { name: "销量" })!;

    const a = doc.placeAsset(assetId);
    const b = doc.placeAsset(assetId, { x: 1800, y: 1000 });
    const placed = screen.items.filter((i) => i.id === a || i.id === b);

    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
    expect(placed).toHaveLength(2);
    expect(placed.map((i) => i.name)).toEqual(["销量", "销量 副本2"]);
    for (const item of placed) {
      expect(item.kind).toBe("chart");
      expect(item.frame.x).toBeGreaterThanOrEqual(0);
      expect(item.frame.y).toBeGreaterThanOrEqual(0);
      expect(item.frame.x + item.frame.w).toBeLessThanOrEqual(screen.canvas.width);
      expect(item.frame.y + item.frame.h).toBeLessThanOrEqual(screen.canvas.height);
    }

    const source = useWorkspaceStore().workspace.assets.find((x) => x.id === assetId)!;
    (placed[0] as ChartItem).spec.type = "pie";
    expect(source.spec.type).toBe("line");
  });

  it("applyTemplate 铺占位框；图表落进去后占位框自动清掉", () => {
    const { doc, screen } = seedScreen();
    doc.applyTemplate([
      { x: 24, y: 24, w: 400, h: 300 },
      { x: 500, y: 24, w: 400, h: 300 },
    ]);
    const holders = () => screen.items.filter((i) => i.name.startsWith(PLACEHOLDER_PREFIX));
    expect(holders()).toHaveLength(2);

    const assetId = useWorkspaceStore().createAsset("line", "趋势");
    doc.placeAsset(assetId, { x: 30, y: 30, w: 380, h: 280 });

    // 只有被压住的那一块占位消失
    expect(holders()).toHaveLength(1);
    expect(holders()[0].frame.x).toBe(500);
  });

  it("placeAsset 记录来源图表 id（大屏里可回溯、可跳回源图表）", () => {
    const { doc, screen } = seedScreen();
    const assetId = useWorkspaceStore().createAsset("bar", "渠道分布");
    const itemId = doc.placeAsset(assetId);
    const item = screen.items.find((i) => i.id === itemId) as ChartItem;
    expect(item.sourceAssetId).toBe(assetId);
  });

  it("批量删除 / 批量改分类：只影响选中的图表", () => {
    const ws = useWorkspaceStore();
    ws.load();
    const a = ws.createAsset("line", "A");
    const b = ws.createAsset("bar", "B");
    const c = ws.createAsset("pie", "C");

    ws.setAssetsCategory([a, c], "经营看板");
    expect(ws.assetById(a)!.category).toBe("经营看板");
    expect(ws.assetById(b)!.category).toBeUndefined();
    expect(ws.assetById(c)!.category).toBe("经营看板");

    ws.removeAssets([a, c, "不存在的 id"]);
    expect(ws.assets.map((x) => x.id)).toEqual([b]);
  });

  it("alignDistribute 左对齐以最左元素为准、右对齐以最右元素为准", () => {
    const { doc, screen } = seedScreen();
    const a = createItem("shape", { x: 100, y: 100, w: 200, h: 100 });
    const b = createItem("shape", { x: 500, y: 300, w: 100, h: 100 });
    screen.items.push(a, b);
    doc.selectedIds = [a.id, b.id];

    doc.alignDistribute("left");
    expect(a.frame.x).toBe(100);
    expect(b.frame.x).toBe(100);

    // 左对齐后：a 右边缘 300、b 右边缘 200 → 右对齐以 300 为准
    doc.alignDistribute("right");
    expect(a.frame.x).toBe(100);
    expect(b.frame.x).toBe(200);
  });

  it("alignDistribute 水平等间距保持两端不动", () => {
    const { doc, screen } = seedScreen();
    const a = createItem("shape", { x: 0, y: 0, w: 100, h: 100 });
    const b = createItem("shape", { x: 300, y: 0, w: 100, h: 100 });
    const c = createItem("shape", { x: 900, y: 0, w: 100, h: 100 });
    screen.items.push(a, b, c);
    doc.selectedIds = [a.id, b.id, c.id];

    // 区间 0–1000、元素宽度合计 300 → 间隙 (1000-300)/2 = 350
    doc.alignDistribute("distributeH");
    expect(a.frame.x).toBe(0);
    expect(b.frame.x).toBe(450);
    expect(c.frame.x).toBe(900);
  });

  it("alignDistribute 忽略锁定元素", () => {
    const { doc, screen } = seedScreen();
    const a = createItem("shape", { x: 100, y: 100, w: 100, h: 100 });
    const b = createItem("shape", { x: 500, y: 100, w: 100, h: 100 });
    b.locked = true;
    screen.items.push(a, b);
    doc.selectedIds = [a.id, b.id];

    doc.alignDistribute("left");
    expect(a.frame.x).toBe(100);
    expect(b.frame.x).toBe(500);
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

  it("提供独立的参考线、网格显示和网格吸附开关，并限制网格步长", () => {
    const ui = useUiStore();
    expect(ui.snapEnabled).toBe(true);
    expect(ui.gridEnabled).toBe(false);
    expect(ui.gridSnapEnabled).toBe(false);
    expect(ui.gridSize).toBe(24);

    ui.setGridEnabled(true);
    ui.setGridSnapEnabled(true);
    ui.setGridSize(32);
    expect(ui.gridEnabled).toBe(true);
    expect(ui.gridSnapEnabled).toBe(true);
    expect(ui.gridSize).toBe(32);

    ui.setGridSize(13);
    expect(ui.gridSize).toBe(32);
  });
});
