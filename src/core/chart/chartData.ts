import type { ChartData, ChartType } from "../model/types";

export type Matrix = string[][];

function num(cell: string | undefined): number {
  const v = Number(cell ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export function matrixToChartData(matrix: Matrix, type: ChartType): ChartData {
  switch (type) {
    case "pie":
    case "map":
      return {
        kind: "nameValue",
        rows: matrix.map((r) => ({ name: r[0] ?? "", value: num(r[1]) })),
      };
    case "scatter":
      return {
        kind: "xy",
        rows: matrix.map((r) => ({
          x: num(r[0]),
          y: num(r[1]),
          ...(r[2] !== undefined && r[2] !== "" ? { name: r[2] } : {}),
          ...(r[3] !== undefined && r[3] !== "" ? { group: r[3] } : {}),
        })),
      };
    case "radar": {
      const [header = [], ...rows] = matrix;
      const series = rows.map((r) => ({ name: r[0] ?? "", values: r.slice(1).map(num) }));
      const indicators = header.slice(1).map((name, i) => {
        const max = Math.max(...series.map((s) => s.values[i] ?? 0));
        return { name, max: max > 0 ? Math.ceil(max * 1.2) : 100 };
      });
      return { kind: "radar", indicators, series };
    }
    default: {
      const [header = [], ...rows] = matrix;
      return {
        kind: "category",
        categories: rows.map((r) => r[0] ?? ""),
        series: header.slice(1).map((name, i) => ({
          name,
          values: rows.map((r) => num(r[i + 1])),
        })),
      };
    }
  }
}

export function dataToMatrix(data: ChartData): Matrix {
  switch (data.kind) {
    case "category":
      return [
        ["", ...data.series.map((s) => s.name)],
        ...data.categories.map((c, i) => [
          c,
          ...data.series.map((s) => String(s.values[i] ?? 0)),
        ]),
      ];
    case "nameValue":
      return data.rows.map((r) => [r.name, String(r.value)]);
    case "xy": {
      const withExtra = data.rows.some((r) => r.name !== undefined || r.group !== undefined);
      return data.rows.map((r) =>
        withExtra
          ? [String(r.x), String(r.y), r.name ?? "", r.group ?? ""]
          : [String(r.x), String(r.y)]
      );
    }
    case "radar":
      return [
        ["", ...data.indicators.map((i) => i.name)],
        ...data.series.map((s) => [s.name, ...s.values.map(String)]),
      ];
  }
}

/**
 * 每种图表类型的初始示例数据（新建图表、切换类型、数据缺失兜底都用它）。
 * 地图的 name 必须与 assets/geo/china.json 的省级全称一致，否则不会着色。
 */
export function initialChartData(type: ChartType): ChartData {
  switch (type) {
    case "map":
      return {
        kind: "nameValue",
        rows: [
          { name: "广东省", value: 320 },
          { name: "江苏省", value: 280 },
          { name: "浙江省", value: 240 },
          { name: "山东省", value: 210 },
          { name: "四川省", value: 180 },
          { name: "河南省", value: 160 },
          { name: "北京市", value: 150 },
          { name: "上海市", value: 140 },
        ],
      };
    case "pie":
      return {
        kind: "nameValue",
        rows: [
          { name: "直接访问", value: 335 },
          { name: "自然搜索", value: 310 },
          { name: "社交媒体", value: 234 },
          { name: "电子邮件", value: 135 },
          { name: "联盟广告", value: 148 },
        ],
      };
    case "scatter":
      return {
        kind: "xy",
        rows: [
          { x: 10, y: 20, name: "样本1", group: "组A" },
          { x: 15, y: 28, name: "样本2", group: "组A" },
          { x: 22, y: 18, name: "样本3", group: "组A" },
          { x: 30, y: 42, name: "样本4", group: "组B" },
          { x: 38, y: 35, name: "样本5", group: "组B" },
          { x: 45, y: 50, name: "样本6", group: "组B" },
        ],
      };
    case "radar":
      return {
        kind: "radar",
        indicators: [
          { name: "攻击", max: 120 },
          { name: "防御", max: 120 },
          { name: "速度", max: 120 },
          { name: "耐力", max: 120 },
        ],
        series: [
          { name: "战士", values: [80, 90, 50, 70] },
          { name: "法师", values: [95, 40, 75, 55] },
        ],
      };
    default:
      return {
        kind: "category",
        categories: ["一月", "二月", "三月", "四月", "五月", "六月"],
        series: [
          { name: "销售额", values: [120, 200, 150, 80, 170, 210] },
          { name: "利润", values: [40, 60, 50, 30, 55, 70] },
        ],
      };
  }
}

/** @deprecated 语义已明确为「初始示例数据」，新代码请用 initialChartData */
export const emptyChartData = initialChartData;

export function validateChartData(data: ChartData): boolean {
  switch (data.kind) {
    case "category":
      return data.series.every((s) => s.values.length === data.categories.length);
    case "nameValue":
      return data.rows.every((r) => Number.isFinite(r.value));
    case "xy":
      return data.rows.every((r) => Number.isFinite(r.x) && Number.isFinite(r.y));
    case "radar":
      return data.series.every((s) => s.values.length === data.indicators.length);
    default:
      return false;
  }
}

export function dataToOption(data: ChartData, type: ChartType): Record<string, unknown> {
  const common: Record<string, unknown> = {
    title: { show: false, text: "" },
    legend: { show: true },
    tooltip: { trigger: type === "line" || type === "bar" ? "axis" : "item" },
    backgroundColor: "transparent",
  };
  switch (data.kind) {
    case "category":
      return {
        ...common,
        xAxis: { type: "category", data: data.categories },
        yAxis: { type: "value" },
        series: data.series.map((s) => ({
          type: type === "bar" ? "bar" : "line",
          name: s.name,
          data: s.values,
          ...(type === "line" ? { smooth: true } : {}),
        })),
      };
    case "nameValue": {
      const points = data.rows.map((r) => ({ name: r.name, value: r.value }));
      if (type === "map") {
        return {
          ...common,
          series: [{ type: "map", map: "china", data: points }],
        };
      }
      return {
        ...common,
        series: [{ type: "pie", name: "", data: points }],
      };
    }
    case "xy": {
      const groups = new Map<string, unknown[]>();
      for (const row of data.rows) {
        const g = row.group ?? "";
        const entry = row.name !== undefined ? { name: row.name, value: [row.x, row.y] } : [row.x, row.y];
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(entry);
      }
      return {
        ...common,
        xAxis: { type: "value" },
        yAxis: { type: "value" },
        series: [...groups.entries()].map(([g, entries]) => ({
          type: "scatter",
          name: g === "" ? "数据" : g,
          data: entries,
        })),
      };
    }
    case "radar":
      return {
        ...common,
        radar: {
          indicators: data.indicators.map((i) => ({ name: i.name, max: i.max })),
        },
        series: [
          {
            type: "radar",
            data: data.series.map((s) => ({ name: s.name, value: s.values })),
          },
        ],
      };
    default:
      return common;
  }
}
