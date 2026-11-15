import { describe, expect, it } from "vitest";
import {
  STYLE_CLIPBOARD_EXCLUDED_KEYS,
  applyStyleToItem,
  buildStyleClipboard,
  canPasteStyle,
  describeStyleClipboardTarget,
} from "../src/core/components/styleClipboard";
import type { ChartItem, ComponentItem, ShapeItem, TextItem } from "../src/core/model/types";

/**
 * T14（P0-1）：复制 / 粘贴样式。
 *
 * 设计要点（来自 DataV 设计库调研的根本结论）：一致性不能只靠「规范展示板」，
 * 必须有让样式**跨组件复制**的执行路径。本模块只复制外观，绝不碰
 * 位置 / 尺寸 / id / 名称 / 数据绑定。
 */

const binding = { datasetId: "ds-1", fields: { category: "province", value: "score" } };

function kpi(overrides: Partial<ComponentItem> = {}): ComponentItem {
  return {
    id: "kpi-a",
    name: "指标 A",
    kind: "component",
    componentId: "chartforge.kpi",
    componentVersion: 1,
    frame: { x: 10, y: 20, w: 300, h: 180, rotate: 0 },
    props: {
      valueField: "amount",
      label: "本月营收",
      format: "currency",
      aggregation: "sum",
      color: "#32d6ff",
      accentColor: "#ffcc66",
    },
    dataBinding: binding,
    ...overrides,
  };
}

function progress(overrides: Partial<ComponentItem> = {}): ComponentItem {
  return {
    id: "progress-a",
    name: "进度 A",
    kind: "component",
    componentId: "chartforge.progress-list",
    componentVersion: 1,
    frame: { x: 0, y: 0, w: 400, h: 200, rotate: 0 },
    props: {
      labelField: "name",
      valueField: "value",
      maxValue: 100,
      showValue: true,
      trackColor: "#123456",
      fillColor: "#abcdef",
    },
    ...overrides,
  };
}

function text(overrides: Partial<TextItem> = {}): TextItem {
  return {
    id: "text-a",
    name: "文本",
    kind: "text",
    frame: { x: 0, y: 0, w: 200, h: 60, rotate: 0 },
    text: "原始文案",
    fontSize: 24,
    color: "#ffffff",
    align: "left",
    weight: "normal",
    ...overrides,
  };
}

function shape(overrides: Partial<ShapeItem> = {}): ShapeItem {
  return {
    id: "shape-a",
    name: "形状",
    kind: "shape",
    frame: { x: 0, y: 0, w: 200, h: 120, rotate: 0 },
    shape: "rect",
    fill: "#112233",
    stroke: "#445566",
    strokeWidth: 2,
    radius: 8,
    ...overrides,
  };
}

describe("buildStyleClipboard：只取外观，不取数据语义", () => {
  it("组件：复制外观 props，剔除数据集字段引用与聚合口径", () => {
    const result = buildStyleClipboard(kpi());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.style).toEqual({
      label: "本月营收",
      format: "currency",
      color: "#32d6ff",
      accentColor: "#ffcc66",
    });
    // 数据语义字段一个都不能带
    for (const key of ["valueField", "aggregation"]) {
      expect(result.payload.style).not.toHaveProperty(key);
    }
  });

  it("进度条：labelField / valueField / maxValue 都不进载荷", () => {
    const result = buildStyleClipboard(progress());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.style).toEqual({
      showValue: true,
      trackColor: "#123456",
      fillColor: "#abcdef",
    });
    expect(result.payload.style).not.toHaveProperty("labelField");
    expect(result.payload.style).not.toHaveProperty("valueField");
    expect(result.payload.style).not.toHaveProperty("maxValue");
  });

  it("排除键清单包含所有数据语义字段（供文档与回归使用）", () => {
    for (const key of ["valueField", "labelField", "columns", "rowKey", "aggregation", "maxValue", "layers"]) {
      expect(STYLE_CLIPBOARD_EXCLUDED_KEYS).toContain(key);
    }
  });

  it("载荷是深拷贝：复制后改原对象不影响载荷", () => {
    const item = kpi();
    const result = buildStyleClipboard(item);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    item.props.color = "#000000";
    expect(result.payload.style.color).toBe("#32d6ff");
  });

  it("文本：复制排版样式，但不复制文案内容", () => {
    const result = buildStyleClipboard(text({ fontSize: 32, color: "#00ffcc", weight: "bold" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.style).toMatchObject({ fontSize: 32, color: "#00ffcc", weight: "bold" });
    expect(result.payload.style).not.toHaveProperty("text");
  });

  it("形状：复制填充与描边，但不复制几何类型", () => {
    const result = buildStyleClipboard(shape());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.style).toEqual({
      fill: "#112233",
      stroke: "#445566",
      strokeWidth: 2,
      radius: 8,
    });
    expect(result.payload.style).not.toHaveProperty("shape");
  });

  it("地图：复制快速样式与相机，但不复制图层（图层含数据绑定）", () => {
    const map: ComponentItem = {
      id: "map-a",
      name: "地图",
      kind: "component",
      componentId: "chartforge.map-scene-flat",
      componentVersion: 1,
      frame: { x: 0, y: 0, w: 600, h: 400, rotate: 0 },
      props: {
        modelVersion: 2,
        presentation: "flat",
        pitch: 0,
        view: { center: [104, 35], zoom: 2 },
        layers: [{ id: "flow", type: "geoFlow", dataBinding: binding }],
        quickStyle: { id: "jade", tokens: { background: "#0b2b1e" } },
      },
    };
    const result = buildStyleClipboard(map);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.style).toHaveProperty("quickStyle");
    expect(result.payload.style).toHaveProperty("presentation");
    expect(result.payload.style).not.toHaveProperty("layers");
    expect(result.payload.style).not.toHaveProperty("modelVersion");
  });

  it("图表：复制 option，但不复制 series 里的数据点", () => {
    const chart: ChartItem = {
      id: "chart-a",
      name: "折线",
      kind: "chart",
      frame: { x: 0, y: 0, w: 400, h: 300, rotate: 0 },
      spec: {
        type: "line",
        option: {
          color: ["#32d6ff"],
          smooth: true,
          series: [{ type: "line", data: [1, 2, 3], itemStyle: { borderWidth: 2 } }],
        },
        data: { categories: ["a"], series: [] } as never,
      },
    };
    const result = buildStyleClipboard(chart);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.style.smooth).toBe(true);
    expect(result.payload.style.color).toEqual(["#32d6ff"]);
    const series = result.payload.style.series as Array<Record<string, unknown>>;
    expect(series[0]).not.toHaveProperty("data");
    expect(series[0]).toHaveProperty("itemStyle");
  });
});

describe("applyStyleToItem：兼容性校验与不可变更新", () => {
  it("同组件同版本可以粘贴", () => {
    const source = buildStyleClipboard(kpi());
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    const target = kpi({ id: "kpi-b", props: { valueField: "other", label: "旧名称" } });
    const applied = applyStyleToItem(target, source.payload);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.item).toMatchObject({ id: "kpi-b", props: { label: "本月营收", color: "#32d6ff" } });
  });

  it("跨组件粘贴被拒绝，并给出可读原因", () => {
    const source = buildStyleClipboard(progress());
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    const applied = applyStyleToItem(kpi(), source.payload);
    expect(applied.ok).toBe(false);
    if (applied.ok) return;
    expect(applied.reason).toContain("组件类型");
  });

  it("同组件不同版本被拒绝", () => {
    const source = buildStyleClipboard(kpi());
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    const applied = applyStyleToItem(kpi({ componentVersion: 2 }), source.payload);
    expect(applied.ok).toBe(false);
  });

  it("粘贴不改动位置 / 尺寸 / id / 名称 / 数据绑定", () => {
    const source = buildStyleClipboard(kpi());
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    const target = kpi({
      id: "kpi-target",
      name: "目标指标",
      frame: { x: 500, y: 400, w: 120, h: 90, rotate: 15 },
      dataBinding: { datasetId: "ds-2", fields: { category: "city", value: "count" } },
    });
    const applied = applyStyleToItem(target, source.payload);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.item.id).toBe("kpi-target");
    expect(applied.item.name).toBe("目标指标");
    expect(applied.item.frame).toEqual({ x: 500, y: 400, w: 120, h: 90, rotate: 15 });
    expect((applied.item as ComponentItem).dataBinding).toEqual({
      datasetId: "ds-2",
      fields: { category: "city", value: "count" },
    });
  });

  it("目标自身的数据语义 props 保留（不被载荷里的同名缺省抹掉）", () => {
    const source = buildStyleClipboard(progress({ props: { labelField: "name", valueField: "value", maxValue: 100, fillColor: "#abcdef" } }));
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    const target = progress({ id: "p2", props: { labelField: "city", valueField: "count", maxValue: 500 } });
    const applied = applyStyleToItem(target, source.payload);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect((applied.item as ComponentItem).props).toMatchObject({
      labelField: "city",
      valueField: "count",
      maxValue: 500,
      fillColor: "#abcdef",
    });
  });

  it("不修改传入的目标对象（返回新对象）", () => {
    const source = buildStyleClipboard(kpi());
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    const target = kpi({ id: "kpi-immutable", props: { valueField: "v", label: "原值" } });
    const before = JSON.stringify(target);
    applyStyleToItem(target, source.payload);
    expect(JSON.stringify(target)).toBe(before);
  });

  it("文本可跨元素粘贴排版样式，文案保持不变", () => {
    const source = buildStyleClipboard(text({ fontSize: 40, color: "#ff0000" }));
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    const applied = applyStyleToItem(text({ id: "t2", text: "另一段文案" }), source.payload);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.item).toMatchObject({ id: "t2", text: "另一段文案", fontSize: 40, color: "#ff0000" });
  });

  it("文本样式不能贴到组件上", () => {
    const source = buildStyleClipboard(text());
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    const applied = applyStyleToItem(kpi(), source.payload);
    expect(applied.ok).toBe(false);
  });

  it("形状样式可在矩形与椭圆之间传递（同 kind 不同几何）", () => {
    const source = buildStyleClipboard(shape());
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    const applied = applyStyleToItem(shape({ id: "s2", shape: "ellipse", fill: "#000000" }), source.payload);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect((applied.item as ShapeItem).shape).toBe("ellipse");
    expect((applied.item as ShapeItem).fill).toBe("#112233");
  });
});

describe("describeStyleClipboardTarget：UI 提示文案", () => {
  it("为组件给出组件名，为文本/形状给出类别名", () => {
    expect(describeStyleClipboardTarget(kpi())).toBe("指标卡");
    expect(describeStyleClipboardTarget(text())).toBe("文本");
    expect(describeStyleClipboardTarget(shape())).toBe("形状");
  });
});

describe("P0-2：地图样式跨组件传递", () => {
  function mapItem(componentId: string, quickStyleId: string, id = "map"): ComponentItem {
    return {
      id,
      name: "地图",
      kind: "component",
      componentId,
      componentVersion: 1,
      frame: { x: 0, y: 0, w: 600, h: 400, rotate: 0 },
      props: {
        modelVersion: 2,
        presentation: componentId.endsWith("tilted") ? "tilted" : "flat",
        pitch: componentId.endsWith("tilted") ? 28 : 0,
        view: { center: [104, 35], zoom: 2, backgroundColor: "#081622" },
        layers: [{ id: "flow", type: "geoFlow" }],
        quickStyle: { id: quickStyleId, tokens: { background: "#0b2b1e", accent: "#5dffb0" } },
      },
    };
  }

  it("平面地图的快速样式可以贴到 2.5D 地图上（跨变体同族）", () => {
    const source = buildStyleClipboard(mapItem("chartforge.map-scene-flat", "jade"));
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    const target = mapItem("chartforge.map-scene-tilted", "deep-sea", "map-2");
    const applied = applyStyleToItem(target, source.payload);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const quickStyle = (applied.item as ComponentItem).props.quickStyle as { id: string };
    expect(quickStyle.id).toBe("jade");
    // 目标自身的 presentation / pitch 不被来源覆盖（平面/2.5D 是元素身份）
    expect((applied.item as ComponentItem).props.presentation).toBe("tilted");
    expect((applied.item as ComponentItem).props.pitch).toBe(28);
  });

  it("地图样式贴到普通组件上被拒绝", () => {
    const source = buildStyleClipboard(mapItem("chartforge.map-scene-flat", "jade"));
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    const applied = applyStyleToItem(kpi(), source.payload);
    expect(applied.ok).toBe(false);
    if (applied.ok) return;
    expect(applied.reason).toContain("组件类型");
  });

  it("普通组件的样式不能贴到地图上", () => {
    const source = buildStyleClipboard(kpi());
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    const applied = applyStyleToItem(mapItem("chartforge.map-scene-flat", "jade"), source.payload);
    expect(applied.ok).toBe(false);
  });
});

describe("canPasteStyle：UI 按钮可用态", () => {
  it("无载荷时不可粘贴", () => {
    expect(canPasteStyle(kpi(), null)).toBe(false);
  });

  it("同类型可粘贴、跨类型不可粘贴", () => {
    const source = buildStyleClipboard(kpi());
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    expect(canPasteStyle(kpi(), source.payload)).toBe(true);
    expect(canPasteStyle(progress(), source.payload)).toBe(false);
  });

  it("地图跨变体可粘贴", () => {
    const flat: ComponentItem = {
      id: "m1", name: "m", kind: "component",
      componentId: "chartforge.map-scene-flat", componentVersion: 1,
      frame: { x: 0, y: 0, w: 600, h: 400, rotate: 0 },
      props: { presentation: "flat", quickStyle: { id: "jade" } },
    };
    const titled = { ...flat, id: "m2", componentId: "chartforge.map-scene-tilted", props: { ...flat.props, presentation: "tilted" } } as ComponentItem;
    const source = buildStyleClipboard(flat);
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    expect(canPasteStyle(titled, source.payload)).toBe(true);
  });
});
