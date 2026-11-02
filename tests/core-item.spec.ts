import { describe, expect, test } from "vitest";
import {
  createDefaultDataSource,
  createScreenItem,
  createScreenSchema,
  normalizeChartAsset,
  normalizeScreenSchema,
  toChartInstance,
} from "../src/core/item";
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

  test("rect 覆盖与自定义类型尺寸", () => {
    const item = createScreenItem("image", { x: 10, y: 20 });
    expect(item.rect).toEqual({ x: 10, y: 20, w: DEFAULT_SIZES.image.w, h: DEFAULT_SIZES.image.h });
  });
});

describe("createScreenSchema", () => {
  test("空 schema：1920×1080 深蓝画布", () => {
    const schema = createScreenSchema("screen_1", "测试屏");
    expect(schema.id).toBe("screen_1");
    expect(schema.name).toBe("测试屏");
    expect(schema.version).toBe(1);
    expect(schema.canvas).toEqual({ width: SCREEN_W, height: SCREEN_H, background: "#0a1a2e" });
    expect(schema.items).toEqual([]);
    expect(schema.createdAt).toBeTruthy();
    expect(schema.updatedAt).toBe(schema.createdAt);
  });
});

describe("toChartInstance", () => {
  test("chart 元素映射为 ChartInstance", () => {
    const item = createScreenItem("chart", { x: 15, y: 25, w: 300, h: 200 });
    item.name = "销量";
    const instance = toChartInstance(item);
    expect(instance).not.toBeNull();
    expect(instance!.id).toBe(item.id);
    expect(instance!.type).toBe("line");
    expect(instance!.title).toBe("销量");
    expect(instance!.x).toBe(15);
    expect(instance!.y).toBe(25);
    expect(instance!.w).toBe(300);
    expect(instance!.h).toBe(200);
    expect(instance!.option).toBe(item.chart!.option);
  });

  test("非 chart 元素返回 null", () => {
    expect(toChartInstance(createScreenItem("text"))).toBeNull();
  });
});

describe("normalizeScreenSchema", () => {
  test("补齐手写文件缺失的 item 字段与数据源", () => {
    const schema = normalizeScreenSchema({
      id: "screen_x",
      name: "手写屏",
      items: [
        {
          id: "item_1",
          type: "chart",
          chart: { chartType: "bar", option: { series: [{ type: "bar", data: [1] }] } },
        },
        { id: "item_2", type: "text", props: { text: "hi" } },
      ],
    });
    expect(schema).not.toBeNull();
    expect(schema!.canvas).toEqual({ width: SCREEN_W, height: SCREEN_H, background: "#0a1a2e" });
    const first = schema!.items[0];
    expect(first.rect.w).toBe(DEFAULT_SIZES.chart.w);
    expect(first.zIndex).toBe(1);
    expect(first.visible).toBe(true);
    expect(first.locked).toBe(false);
    expect(first.chart!.dataSource).toEqual(createDefaultDataSource());
    const second = schema!.items[1];
    expect(second.rect.h).toBe(DEFAULT_SIZES.text.h);
    expect(second.props).toEqual({ text: "hi" });
  });

  test("补齐缺 headers/interval 的 api 数据源与缺 props 的 widget", () => {
    const schema = normalizeScreenSchema({
      id: "screen_y",
      items: [
        {
          id: "item_1",
          type: "chart",
          chart: {
            chartType: "line",
            option: {},
            dataSource: { mode: "api", api: { url: "/d", method: "GET", dataPath: "a", optionPath: "series.0.data", interval: 5 } },
          },
        },
        { id: "item_2", type: "datetime" },
      ],
    });
    const api = schema!.items[0].chart!.dataSource.api;
    expect(api.headers).toEqual({});
    expect(api.interval).toBe(5);
    expect(api.url).toBe("/d");
    expect(schema!.items[1].props).toBeUndefined();
  });

  test("缺 items/canvas 与时间戳时兜底，非法输入返回 null", () => {
    const schema = normalizeScreenSchema({ id: "screen_z" });
    expect(schema).not.toBeNull();
    expect(schema!.items).toEqual([]);
    expect(schema!.canvas.width).toBe(SCREEN_W);
    expect(schema!.createdAt).toBeTruthy();
    expect(normalizeScreenSchema(null)).toBeNull();
    expect(normalizeScreenSchema("nope")).toBeNull();
    expect(normalizeScreenSchema({ name: "no-id" })).toBeNull();
  });

  test("剔除无 id 的坏 item", () => {
    const schema = normalizeScreenSchema({
      id: "screen_w",
      items: [{ type: "text" }, { id: "item_ok", type: "text" }],
    });
    expect(schema!.items.length).toBe(1);
    expect(schema!.items[0].id).toBe("item_ok");
  });
});

describe("normalizeChartAsset", () => {
  test("补齐缺失 tags/category 并保留有效字段", () => {
    const asset = normalizeChartAsset({
      id: "asset_1",
      name: "销量图",
      chartType: "line",
      option: { series: [] },
    });
    expect(asset).not.toBeNull();
    expect(asset!.tags).toEqual([]);
    expect(asset!.category).toBe("");
    expect(asset!.name).toBe("销量图");
    expect(asset!.createdAt).toBeTruthy();
  });

  test("非法输入返回 null", () => {
    expect(normalizeChartAsset(null)).toBeNull();
    expect(normalizeChartAsset(42)).toBeNull();
    expect(normalizeChartAsset({ name: "no-id" })).toBeNull();
  });
});
