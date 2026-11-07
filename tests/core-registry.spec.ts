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

const componentRegistryModules = import.meta.glob("../src/core/components/registry.ts");
const builtinModules = import.meta.glob("../src/core/components/builtins.ts");

type TestComponentDefinition = {
  id: string;
  version: number;
  name: string;
  category: string;
  defaultFrame: { x: number; y: number; w: number; h: number; rotate: number };
  defaults: Record<string, unknown>;
  props: readonly unknown[];
  events: readonly unknown[];
  actions: readonly unknown[];
  renderer: { kind: "legacy"; itemKind: "chart" | "text" | "image" | "shape" };
  exportRendererId: string;
};

type ComponentRegistryApi = {
  createComponentRegistry(definitions: readonly TestComponentDefinition[]): {
    get(id: string, version: number): TestComponentDefinition | undefined;
    list(): readonly TestComponentDefinition[];
  };
};

function testDefinition(version: number): TestComponentDefinition {
  return {
    id: "test.widget",
    version,
    name: `Widget ${version}`,
    category: "test",
    defaultFrame: { x: 1, y: 2, w: 300, h: 200, rotate: 0 },
    defaults: {},
    props: [],
    events: [],
    actions: [],
    renderer: { kind: "legacy", itemKind: "text" },
    exportRendererId: "test-widget",
  };
}

describe("component/registry", () => {
  it("keeps exact component versions and lists definitions in registration order", async () => {
    const load = componentRegistryModules["../src/core/components/registry.ts"];
    expect(load).toBeTypeOf("function");
    if (!load) return;
    const api = (await load()) as unknown as ComponentRegistryApi;
    const v1 = testDefinition(1);
    const v2 = testDefinition(2);
    const registry = api.createComponentRegistry([v1, v2]);

    expect(registry.get("test.widget", 1)).toEqual(v1);
    expect(registry.get("test.widget", 2)).toEqual(v2);
    expect(registry.get("test.widget", 3)).toBeUndefined();
    expect(registry.list()).toEqual([v1, v2]);
  });

  it("rejects duplicate id and version pairs", async () => {
    const load = componentRegistryModules["../src/core/components/registry.ts"];
    expect(load).toBeTypeOf("function");
    if (!load) return;
    const api = (await load()) as unknown as ComponentRegistryApi;
    const definition = testDefinition(1);

    expect(() => api.createComponentRegistry([definition, definition])).toThrow(/duplicate|重复/i);
  });

  it("registers adapters for all four existing screen item kinds", async () => {
    const load = builtinModules["../src/core/components/builtins.ts"];
    expect(load).toBeTypeOf("function");
    if (!load) return;
    const module = (await load()) as unknown as {
      componentRegistry: { list(): readonly { id: string; version: number; renderer: { kind: string; itemKind?: string } }[] };
    };

    const adapters = module.componentRegistry.list().filter((d) => d.renderer.kind === "legacy");
    expect(adapters.map((d) => d.id).sort()).toEqual([
      "legacy.chart",
      "legacy.image",
      "legacy.shape",
      "legacy.text",
    ]);
    expect(adapters.every((d) => d.version === 1 && d.renderer.itemKind)).toBe(true);
  });
});
