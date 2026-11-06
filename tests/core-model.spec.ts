import { describe, it, expect } from "vitest";
import {
  createWorkspace,
  createScreen,
  createItem,
  createChartSpec,
  createChartAsset,
  normalizeWorkspace,
} from "../src/core/model/schema";
import type { ChartItem } from "../src/core/model/types";

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
});
