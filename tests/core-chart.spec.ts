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

  it("deepMerge 数组整体替换、对象递归合并", () => {
    expect(deepMerge({ a: [1, 2], b: { c: 1, d: 2 } }, { a: [3], b: { c: 9 } })).toEqual({
      a: [3],
      b: { c: 9, d: 2 },
    });
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
