import { describe, it, expect } from "vitest";
import { chartRegistry } from "../src/core/chart/registry";
import { registerCharts } from "../src/core/chart/registerCharts";
import { validateChartData } from "../src/core/chart/chartData";
import { getMap, getInstanceByDom } from "echarts/core";

const TYPES = ["line", "bar", "pie", "map", "scatter", "radar"] as const;

describe("chart/registry", () => {
  it("注册六种图表类型，defaultSpec 为有效 ChartSpec", () => {
    for (const type of TYPES) {
      const d = chartRegistry[type];
      expect(d.type).toBe(type);
      const spec = d.defaultSpec();
      expect(spec.type).toBe(type);
      expect(validateChartData(spec.data)).toBe(true);
    }
  });

  it("configGroups 字段 path 合法且 control 受支持", () => {
    for (const type of TYPES) {
      for (const g of chartRegistry[type].configGroups) {
        for (const f of g.fields) {
          expect(f.path).toMatch(/^[A-Za-z0-9_.\[\]]+$/);
          expect(["text", "number", "color", "select", "switch"]).toContain(f.control);
        }
      }
    }
  });

  it("columns 声明各类型数据表列", () => {
    for (const type of TYPES) {
      expect(chartRegistry[type].columns.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("chart/registerCharts", () => {
  it("注册 china 地图且 echarts 核心 API 可用", () => {
    registerCharts();
    expect(getMap("china")).toBeTruthy();
    expect(typeof getInstanceByDom).toBe("function");
  });
});
