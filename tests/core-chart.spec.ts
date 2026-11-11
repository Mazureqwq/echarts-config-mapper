import { describe, it, expect } from "vitest";
import {
  matrixToChartData,
  dataToMatrix,
  emptyChartData,
  validateChartData,
} from "../src/core/chart/chartData";
import { buildOption, deepMerge } from "../src/core/chart/optionBuilder";
import { parseTsv, serializeTsv } from "../src/core/chart/tsv";
import type { ChartSpec } from "../src/core/model/types";

describe("chart/chartData 矩阵转换", () => {
  it("category：首列为类目、其余列为系列、首行为系列名", () => {
    const data = matrixToChartData(
      [
        ["月份", "销售额", "利润"],
        ["一月", "10", "3"],
        ["二月", "20", "5"],
      ],
      "line"
    );
    expect(data.kind).toBe("category");
    if (data.kind !== "category") return;
    expect(data.categories).toEqual(["一月", "二月"]);
    expect(data.series.map((s) => s.name)).toEqual(["销售额", "利润"]);
    expect(data.series[0].values).toEqual([10, 20]);
  });

  it("nameValue：两列 [名称, 数值]", () => {
    const data = matrixToChartData(
      [
        ["苹果", "40"],
        ["香蕉", "60"],
      ],
      "pie"
    );
    expect(data.kind).toBe("nameValue");
    if (data.kind !== "nameValue") return;
    expect(data.rows).toEqual([
      { name: "苹果", value: 40 },
      { name: "香蕉", value: 60 },
    ]);
  });

  it("xy：前两列 [x, y]，可选三四列 [名称, 分组]", () => {
    const data = matrixToChartData(
      [
        ["1", "2", "点A", "组1"],
        ["3", "4", "点B", "组1"],
        ["5", "6", "点C", "组2"],
      ],
      "scatter"
    );
    expect(data.kind).toBe("xy");
    if (data.kind !== "xy") return;
    expect(data.rows).toEqual([
      { x: 1, y: 2, name: "点A", group: "组1" },
      { x: 3, y: 4, name: "点B", group: "组1" },
      { x: 5, y: 6, name: "点C", group: "组2" },
    ]);
  });

  it("radar：首行=指标名，其余行首格=系列名", () => {
    const data = matrixToChartData(
      [
        ["", "攻击", "防御", "速度"],
        ["战士", "80", "60", "40"],
        ["法师", "50", "30", "90"],
      ],
      "radar"
    );
    expect(data.kind).toBe("radar");
    if (data.kind !== "radar") return;
    expect(data.indicators.map((i) => i.name)).toEqual(["攻击", "防御", "速度"]);
    expect(data.indicators[0].max).toBe(96);
    expect(data.series.map((s) => s.name)).toEqual(["战士", "法师"]);
    expect(data.series[1].values).toEqual([50, 30, 90]);
  });

  it("dataToMatrix 输出规范矩阵（表头首格留空）且语义往返", () => {
    const matrix = [
      ["月份", "销售额"],
      ["一月", "10"],
      ["二月", "20"],
    ];
    const data = matrixToChartData(matrix, "line");
    const canonical = [
      ["", "销售额"],
      ["一月", "10"],
      ["二月", "20"],
    ];
    expect(dataToMatrix(data)).toEqual(canonical);
    expect(dataToMatrix(matrixToChartData(canonical, "line"))).toEqual(canonical);
  });

  it("emptyChartData 提供示例数据，validateChartData 校验形状", () => {
    expect(emptyChartData("line").kind).toBe("category");
    expect(validateChartData(emptyChartData("bar"))).toBe(true);
    expect(
      validateChartData({ kind: "category", categories: ["a"], series: [{ name: "s", values: [1, 2] }] })
    ).toBe(false);
  });
});

  it("地理图表矩阵、默认样例和 ECharts option 使用本地 China geo", () => {
    const pointMatrix = [["114.1", "22.2", "港岛", "5"]];
    const point = matrixToChartData(pointMatrix, "geoScatter");
    expect(point).toEqual({ kind: "geoScatter", rows: [{ longitude: 114.1, latitude: 22.2, name: "港岛", value: 5 }] });
    expect(dataToMatrix(point)).toEqual(pointMatrix);

    const heatMatrix = [["114", "22", "8"]];
    const heat = matrixToChartData(heatMatrix, "geoHeatmap");
    expect(heat).toEqual({ kind: "geoHeatmap", rows: [{ longitude: 114, latitude: 22, value: 8 }] });
    expect(dataToMatrix(heat)).toEqual(heatMatrix);

    const flowMatrix = [["113.9", "22.3", "114.2", "22.5", "A→B", "12"]];
    const flow = matrixToChartData(flowMatrix, "geoFlow");
    expect(flow).toEqual({ kind: "geoFlow", rows: [{ from: [113.9, 22.3], to: [114.2, 22.5], name: "A→B", value: 12 }] });
    expect(dataToMatrix(flow)).toEqual(flowMatrix);

    const expectedSeriesType = { geoScatter: "scatter", geoHeatmap: "heatmap", geoFlow: "lines" } as const;
    for (const type of Object.keys(expectedSeriesType) as Array<keyof typeof expectedSeriesType>) {
      const data = emptyChartData(type);
      expect(validateChartData(data)).toBe(true);
      expect(data.kind).toBe(type);
      const option = buildOption({ type, option: {}, data }) as Record<string, any>;
      expect(option.geo.map).toBe("china");
      expect(option.series[0].type).toBe(expectedSeriesType[type]);
      expect(option.series[0].coordinateSystem).toBe("geo");
    }
  });

describe("chart/optionBuilder", () => {
  it("buildOption 生成各类型真实 ECharts 结构", () => {
    const lineSpec: ChartSpec = { type: "line", option: {}, data: emptyChartData("line") };
    const line = buildOption(lineSpec) as Record<string, any>;
    expect(line.xAxis.type).toBe("category");
    expect(line.yAxis.type).toBe("value");
    expect(line.series[0].type).toBe("line");
    expect(line.series[0].data).toHaveLength(
      (emptyChartData("line") as any).categories.length
    );

    const mapSpec: ChartSpec = { type: "map", option: {}, data: emptyChartData("map") };
    const map = buildOption(mapSpec) as Record<string, any>;
    expect(map.series[0].type).toBe("map");
    expect(map.series[0].map).toBe("china");
  });

  it("option 覆盖层深合并且保留同级字段", () => {
    const spec: ChartSpec = {
      type: "line",
      option: { title: { text: "自定义" } },
      data: emptyChartData("line"),
    };
    const out = buildOption(spec) as Record<string, any>;
    expect(out.title.text).toBe("自定义");
    expect(out.title.show).toBe(false);
    expect(out.series).toBeTruthy();
  });

  it("deepMerge 标量数组整体替换、对象数组逐项合并、空数组清空", () => {
    expect(
      deepMerge(
        { a: [1, 2], b: { c: 1, d: 2 }, s: [{ x: 1, y: 2 }, { x: 3 }] },
        { a: [3], b: { c: 9 }, s: [{ y: 9 }] }
      )
    ).toEqual({
      a: [3],
      b: { c: 9, d: 2 },
      s: [{ x: 1, y: 9 }, { x: 3 }],
    });
    expect(deepMerge({ a: [1, 2] }, { a: [] })).toEqual({ a: [] });
  });

  it("buildOption 系列配置不冲掉生成的 type/data（雷达图回归）", () => {
    const spec: ChartSpec = {
      type: "radar",
      option: { series: [{ shape: "circle", areaStyle: { opacity: 0.3 } }] },
      data: emptyChartData("radar"),
    };
    const out = buildOption(spec) as Record<string, any>;
    expect(out.series[0].type).toBe("radar");
    expect(out.series[0].shape).toBe("circle");
    expect(out.series[0].areaStyle.opacity).toBe(0.3);
    expect(out.series[0].data).toHaveLength(2);
    expect(out.radar.indicator).toHaveLength(4);
    expect(out.radar.indicators).toBeUndefined();

    const line: ChartSpec = {
      type: "line",
      option: { series: [{ smooth: false }] },
      data: emptyChartData("line"),
    };
    const lo = buildOption(line) as Record<string, any>;
    expect(lo.series).toHaveLength(2);
    expect(lo.series[0].smooth).toBe(false);
    expect(lo.series[0].type).toBe("line");
    expect(lo.series[1].name).toBe("利润");
  });
});

describe("chart/tsv", () => {
  it("parseTsv/serializeTsv 往返并兼容 CRLF 与尾行", () => {
    const m = [
      ["a", "b"],
      ["c", "d"],
    ];
    expect(parseTsv(serializeTsv(m))).toEqual(m);
    expect(parseTsv("a\tb\nc\td\n")).toEqual(m);
    expect(parseTsv("a\tb\r\nc\td")).toEqual(m);
  });
});