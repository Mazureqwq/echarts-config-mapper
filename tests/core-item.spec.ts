import { describe, expect, test } from "vitest";
import { createDefaultDataSource, createScreenItem, createScreenSchema } from "../src/core/item";
import { DEFAULT_SIZES, SCREEN_H, SCREEN_W } from "../src/core/types";

describe("createScreenItem", () => {
  test("chart 元素默认值：含 option 与 dataSource，默认尺寸 480×320", () => {
    const item = createScreenItem("chart");
    expect(item.type).toBe("chart");
    expect(item.id).toMatch(/^item_/);
    expect(item.name).toBe("图表");
    expect(item.rect).toEqual({ x: 40, y: 40, w: 480, h: 320 });
    expect(item.visible).toBe(true);
    expect(item.locked).toBe(false);
    expect(item.zIndex).toBe(1);
    expect(item.chart).toBeTruthy();
    expect(item.chart!.sourceAssetId).toBeNull();
    expect(item.chart!.chartType).toBe("line");
    expect(item.chart!.option.series).toBeTruthy();
    expect(item.chart!.dataSource).toEqual(createDefaultDataSource());
    expect(item.props).toBeUndefined();
  });

  test("text 元素默认值：尺寸 320×80 与文本 props", () => {
    const item = createScreenItem("text");
    expect(item.name).toBe("文本");
    expect(item.rect).toEqual({ x: 40, y: 40, w: 320, h: 80 });
    expect(item.props).toEqual({ text: "双击编辑文本", fontSize: 24, color: "#E6EAF2" });
    expect(item.chart).toBeUndefined();
  });

  test("datetime 元素默认 format；iframe 元素默认空 src", () => {
    expect(createScreenItem("datetime").props).toEqual({ format: "YYYY-MM-DD HH:mm:ss" });
    expect(createScreenItem("iframe").props).toEqual({ src: "" });
  });

  test("rect 覆盖：传入部分 rect 与默认尺寸合并", () => {
    const item = createScreenItem("image", { x: 100, y: 60 });
    expect(item.rect).toEqual({ x: 100, y: 60, w: DEFAULT_SIZES.image.w, h: DEFAULT_SIZES.image.h });
  });
});

describe("createScreenSchema", () => {
  test("默认画布 1920×1080 深蓝背景，version 1，空 items，时间为 ISO", () => {
    const schema = createScreenSchema("screen_1", "测试大屏");
    expect(schema.id).toBe("screen_1");
    expect(schema.name).toBe("测试大屏");
    expect(schema.version).toBe(1);
    expect(schema.canvas).toEqual({ width: SCREEN_W, height: SCREEN_H, background: "#0a1a2e" });
    expect(schema.items).toEqual([]);
    expect(new Date(schema.createdAt).toISOString()).toBe(schema.createdAt);
    expect(new Date(schema.updatedAt).toISOString()).toBe(schema.updatedAt);
  });
});

describe("createDefaultDataSource", () => {
  test("static 模式，optionPath 默认 series.0.data", () => {
    expect(createDefaultDataSource()).toEqual({
      mode: "static",
      api: { url: "", method: "GET", headers: {}, interval: 0, dataPath: "", optionPath: "series.0.data" },
    });
  });
});
