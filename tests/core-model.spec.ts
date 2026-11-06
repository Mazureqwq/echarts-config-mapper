import { describe, it, expect } from "vitest";
import {
  createWorkspace,
  createScreen,
  createItem,
  createChartSpec,
  createChartAsset,
  normalizeWorkspace,
} from "../src/core/model/schema";
import type { ChartItem, ChartType } from "../src/core/model/types";
import { validateChartData } from "../src/core/chart/chartData";

const ALL_TYPES: ChartType[] = ["line", "bar", "pie", "map", "scatter", "radar"];

describe("model/schema 工厂与规范化", () => {
  it("createWorkspace 返回 version:1 空库且默认开启自动保存", () => {
    const ws = createWorkspace();
    expect(ws.version).toBe(1);
    expect(ws.assets).toEqual([]);
    expect(ws.screens).toEqual([]);
    expect(ws.settings.autosave).toBe(true);
  });

  it("createItem('chart') 默认 frame 与 line 类型", () => {
    const item = createItem("chart") as ChartItem;
    expect(item.frame).toEqual({ x: 100, y: 100, w: 400, h: 300, rotate: 0 });
    expect(item.spec.type).toBe("line");
  });

  it("createScreen('测试') 默认 1920×1080 画布", () => {
    const s = createScreen("测试");
    expect(s.name).toBe("测试");
    expect(s.canvas.width).toBe(1920);
    expect(s.canvas.height).toBe(1080);
    expect(s.items).toEqual([]);
    expect(typeof s.updatedAt).toBe("number");
  });

  it("normalizeWorkspace 补齐缺失字段并剔除未知 kind 的 item", () => {
    const ws = normalizeWorkspace({
      version: 1,
      screens: [{ id: "a", items: [{ id: "x", kind: "nope" }, { id: "y", kind: "text" }] }],
    });
    expect(ws.screens).toHaveLength(1);
    const screen = ws.screens[0];
    expect(screen.name).toBe("未命名大屏");
    expect(screen.canvas).toEqual({
      width: 1920,
      height: 1080,
      background: { kind: "color", color: "#FFFFFF" },
    });
    expect(screen.items).toHaveLength(1);
    expect(screen.items[0].kind).toBe("text");
  });

  it("createChartSpec/createChartAsset 生成可用资产", () => {
    const spec = createChartSpec("bar");
    expect(spec.type).toBe("bar");
    expect(spec.data.kind).toBe("category");
    const asset = createChartAsset("我的图表", spec);
    expect(asset.name).toBe("我的图表");
    expect(asset.spec).toEqual(spec);
    expect(typeof asset.createdAt).toBe("number");
  });

  it("createScreen 支持自定义画布尺寸", () => {
    const s = createScreen("A", { width: 1280, height: 720 });
    expect(s.canvas.width).toBe(1280);
    expect(s.canvas.height).toBe(720);
  });

  it("normalizeScreen 非法画布尺寸回退 1920×1080", () => {
    const ws = normalizeWorkspace({ version: 1, screens: [{ id: "a", canvas: { width: -5, height: 0 } }] });
    expect(ws.screens[0].canvas).toEqual({ width: 1920, height: 1080, background: { kind: "color", color: "#FFFFFF" } });
  });

  it("normalizeWorkspace 解析 category/tags，缺失时为空", () => {
    const ws = normalizeWorkspace({
      version: 1,
      screens: [
        { id: "a", category: "柱状图", tags: ["销售", "2024", 1] },
        { id: "b" },
      ],
    });
    expect(ws.screens[0].category).toBe("柱状图");
    expect(ws.screens[0].tags).toEqual(["销售", "2024"]);
    expect(ws.screens[1].category).toBeUndefined();
    expect(ws.screens[1].tags).toBeUndefined();
  });

  it("createChartSpec 对六种类型都给出非空初始示例数据", () => {
    for (const type of ALL_TYPES) {
      const spec = createChartSpec(type);
      expect(spec.type).toBe(type);
      expect(spec.option).toEqual({});
      expect(validateChartData(spec.data)).toBe(true);
      const size =
        spec.data.kind === "category"
          ? spec.data.categories.length
          : spec.data.kind === "radar"
            ? spec.data.series.length
            : spec.data.rows.length;
      expect(size).toBeGreaterThan(0);
    }
  });

  it("地图初始数据的省份名与 china.json 的省级全称一致", () => {
    const spec = createChartSpec("map");
    expect(spec.data.kind).toBe("nameValue");
    const names = spec.data.kind === "nameValue" ? spec.data.rows.map((r) => r.name) : [];
    expect(names).toContain("广东省");
    expect(names).toContain("北京市");
    expect(names.every((n) => /(省|市|自治区)$/.test(n))).toBe(true);
  });

  it("既有 spec 缺失数据时规范化后补上初始示例数据", () => {
    const ws = normalizeWorkspace({
      version: 1,
      screens: [],
      assets: [{ id: "x", name: "旧的空图", spec: { type: "bar", option: {} } }],
    });
    const data = ws.assets[0].spec.data;
    expect(validateChartData(data)).toBe(true);
    expect(data.kind === "category" && data.categories.length > 0).toBe(true);
  });

  it("normalizeWorkspace 解析资产元信息，缺失或非法时丢弃", () => {
    const ws = normalizeWorkspace({
      version: 1,
      screens: [],
      assets: [
        {
          id: "a",
          name: "销售趋势",
          spec: { type: "line" },
          category: "折线图",
          tags: ["销售", 1],
          defaultSize: { w: 800, h: 400 },
        },
        { id: "b", name: "无元信息", spec: { type: "bar" } },
        { id: "c", name: "非法尺寸", spec: { type: "pie" }, defaultSize: { w: 0, h: -3 } },
      ],
    });
    expect(ws.assets[0].category).toBe("折线图");
    expect(ws.assets[0].tags).toEqual(["销售"]);
    expect(ws.assets[0].defaultSize).toEqual({ w: 800, h: 400 });
    expect(ws.assets[1].category).toBeUndefined();
    expect(ws.assets[1].tags).toBeUndefined();
    expect(ws.assets[1].defaultSize).toBeUndefined();
    expect(ws.assets[2].defaultSize).toBeUndefined();
  });
});
