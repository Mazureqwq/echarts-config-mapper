import { describe, expect, it, vi } from "vitest";
import { computed, createSSRApp, reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { renderToString } from "vue/server-renderer";
import { componentRegistry } from "../src/core/components/builtins";
import { validateBlueprint } from "../src/core/blueprint/validate";
import { runBlueprint } from "../src/core/blueprint/runner";
import { aggregateKpi, filterRowsByBinding } from "../src/core/components/dataWidgets";
import { buildChartDataFromRows } from "../src/core/live/payload";
import BlueprintEditor from "../src/workbench/BlueprintEditor.vue";
import { useDocumentStore } from "../src/stores/documentStore";
import type { BlueprintContext, BlueprintGraph, BlueprintNode } from "../src/core/blueprint/types";

const variable = (name: string, type: "string" | "number" | "boolean" | "object", initialValue: unknown) => ({ name, type, initialValue });
const edge = (from: string, to: string, port = "next") => ({ id: `${from}-${port}-${to}`, from: { nodeId: from, port }, to: { nodeId: to, port: "in" } });
const eventNode = (id = "event"): Extract<BlueprintNode, { kind: "componentEvent" }> => ({ id, kind: "componentEvent", componentId: "chartforge.data-table", componentVersion: 1, event: "rowSelect" });
const context = (overrides: Partial<BlueprintContext> = {}) => ({
  getVariable: vi.fn(() => undefined),
  setVariable: vi.fn(),
  setDatasetFilter: vi.fn(),
  setDatasetParameters: vi.fn(),
  refreshDataset: vi.fn(async () => undefined),
  setComponentVisibility: vi.fn(),
  setComponentProps: vi.fn(),
  navigateScreen: vi.fn(),
  ...overrides,
}) as BlueprintContext;
const trigger = { componentId: "chartforge.data-table", componentVersion: 1, event: "rowSelect", payload: { row: { city: "Berlin" }, index: 0 } };

describe("safe declarative blueprints", () => {
  it("runs table rowSelect through setVariable into a dataset filter", async () => {
    const variables = { pickedCity: "" };
    const ctx = context({
      getVariable: vi.fn((name) => variables[name as keyof typeof variables]),
      setVariable: vi.fn((name, value) => { variables[name as keyof typeof variables] = value as string; }),
    });
    const graph: BlueprintGraph = {
      variables: [variable("pickedCity", "string", "")],
      nodes: [
        eventNode(),
        { id: "select-city", kind: "setVariable", name: "pickedCity", value: { source: "event", path: "row.city" } },
        { id: "filter", kind: "datasetAction", action: "filter", datasetId: "sales", field: "city", globalVariable: "pickedCity" },
      ],
      edges: [edge("event", "select-city"), edge("select-city", "filter")],
    };
    const result = await runBlueprint(graph, trigger, ctx, componentRegistry);
    expect(result.ok).toBe(true);
    expect(variables.pickedCity).toBe("Berlin");
    expect(ctx.setDatasetFilter).toHaveBeenCalledWith("sales", "city", "Berlin");
    expect(result.executedNodeIds).toEqual(["event", "select-city", "filter"]);
  });

  it("propagates rowSelect through a screen variable to bound chart and KPI rows", async () => {
    const rows = [
      { city: "杭州", month: "一月", amount: 120, region: "华东" },
      { city: "深圳", month: "二月", amount: 200, region: "华南" },
    ];
    const variables = reactive<Record<string, unknown>>({ pickedCity: "杭州" });
    const binding = { datasetId: "sales", fields: { category: "month", value: "amount", seriesField: "region" }, filterBy: { field: "city", globalVariable: "pickedCity" } };
    const visibleRows = computed(() => filterRowsByBinding(rows, binding, variables));
    const chart = computed(() => buildChartDataFromRows(visibleRows.value, binding.fields, "bar"));
    const kpi = computed(() => aggregateKpi(visibleRows.value, "amount", "sum"));
    const ctx = context({
      getVariable: vi.fn((name) => variables[name]),
      setVariable: vi.fn((name, value) => { variables[name] = value; }),
    });
    const graph: BlueprintGraph = {
      variables: [variable("pickedCity", "string", "杭州")],
      nodes: [eventNode(), { id: "pick-city", kind: "setVariable", name: "pickedCity", value: { source: "event", path: "row.city" } }],
      edges: [edge("event", "pick-city")],
    };

    expect(kpi.value).toBe(120);
    expect(chart.value.ok && chart.value.data).toMatchObject({ categories: ["一月"] });
    const result = await runBlueprint(graph, { ...trigger, payload: { row: rows[1], index: 1 } }, ctx, componentRegistry);
    expect(result.ok).toBe(true);
    expect(variables.pickedCity).toBe("深圳");
    expect(kpi.value).toBe(200);
    expect(chart.value.ok && chart.value.data).toMatchObject({ kind: "category", categories: ["二月"], series: [{ name: "华南", values: [200] }] });
  });

  it("routes true and false condition ports deterministically", async () => {
    const ctx = context();
    const graph: BlueprintGraph = {
      variables: [variable("matched", "boolean", false)],
      nodes: [
        eventNode(),
        { id: "condition", kind: "condition", left: { source: "event", path: "row.city" }, op: "eq", right: { source: "literal", value: "Berlin" } },
        { id: "yes", kind: "setVariable", name: "matched", value: { source: "literal", value: true } },
        { id: "no", kind: "setVariable", name: "matched", value: { source: "literal", value: false } },
      ],
      edges: [edge("event", "condition"), edge("condition", "yes", "true"), edge("condition", "no", "false")],
    };
    const result = await runBlueprint(graph, trigger, ctx, componentRegistry);
    expect(result.ok).toBe(true);
    expect(ctx.setVariable).toHaveBeenCalledWith("matched", true);
    expect(ctx.setVariable).not.toHaveBeenCalledWith("matched", false);
    expect(result.executedNodeIds).toEqual(["event", "condition", "yes"]);

    const falseContext = context();
    const falseResult = await runBlueprint(graph, { ...trigger, payload: { row: { city: "Paris" }, index: 2 } }, falseContext, componentRegistry);
    expect(falseResult.ok).toBe(true);
    expect(falseContext.setVariable).toHaveBeenCalledWith("matched", false);
    expect(falseContext.setVariable).not.toHaveBeenCalledWith("matched", true);
    expect(falseResult.executedNodeIds).toEqual(["event", "condition", "no"]);
  });

  it("rejects an invalid declared event payload before running the graph", async () => {
    const ctx = context();
    const graph: BlueprintGraph = {
      variables: [variable("city", "string", "")],
      nodes: [eventNode(), { id: "assign", kind: "setVariable", name: "city", value: { source: "event", path: "row.city" } }],
      edges: [edge("event", "assign")],
    };
    const result = await runBlueprint(graph, { ...trigger, payload: { row: {}, index: "zero" } }, ctx, componentRegistry);
    expect(result).toMatchObject({ ok: false, executedNodeIds: [] });
    expect(ctx.setVariable).not.toHaveBeenCalled();
  });

  it("supports fixed field transforms and chained dataset parameter/refresh actions", async () => {
    const ctx = context({ getVariable: vi.fn((name) => name === "city" ? "berlin" : undefined) });
    const graph: BlueprintGraph = {
      variables: [variable("city", "string", ""), variable("upperCity", "string", "")],
      nodes: [
        eventNode(),
        { id: "upper", kind: "fieldTransform", input: { source: "event", path: "row.city" }, op: "uppercase", outputVariable: "upperCity" },
        { id: "params", kind: "datasetAction", action: "setParams", datasetId: "sales", params: { city: { source: "variable", name: "city" } } },
        { id: "refresh", kind: "datasetAction", action: "refresh", datasetId: "sales" },
      ],
      edges: [edge("event", "upper"), edge("upper", "params"), edge("params", "refresh")],
    };
    const result = await runBlueprint(graph, trigger, ctx, componentRegistry);
    expect(result.ok).toBe(true);
    expect(ctx.setVariable).toHaveBeenCalledWith("upperCity", "BERLIN");
    expect(ctx.setDatasetParameters).toHaveBeenCalledWith("sales", { city: "berlin" });
    expect(ctx.refreshDataset).toHaveBeenCalledWith("sales");
  });

  it("runs declared component visibility and property actions only", async () => {
    const ctx = context();
    const graph: BlueprintGraph = {
      variables: [],
      nodes: [
        eventNode(),
        { id: "hide-kpis", kind: "componentAction", action: "setVisibility", componentId: "chartforge.kpi", componentVersion: 1, visible: false },
        { id: "rename-kpis", kind: "componentAction", action: "setProps", componentId: "chartforge.kpi", componentVersion: 1, props: { label: "营收" } },
      ],
      edges: [edge("event", "hide-kpis"), edge("hide-kpis", "rename-kpis")],
    };
    const result = await runBlueprint(graph, trigger, ctx, componentRegistry);
    expect(result.ok).toBe(true);
    expect(ctx.setComponentVisibility).toHaveBeenCalledWith("chartforge.kpi", 1, false);
    expect(ctx.setComponentProps).toHaveBeenCalledWith("chartforge.kpi", 1, { label: "营收" });
  });

  it("rejects unknown node kinds/events/actions, dangling edges and cycles before effects", async () => {
    const invalidGraphs: BlueprintGraph[] = [
      { variables: [], nodes: [{ id: "bad", kind: "mystery" } as unknown as BlueprintNode], edges: [] },
      { variables: [], nodes: [{ ...eventNode(), event: "notDeclared" }], edges: [] },
      { variables: [], nodes: [eventNode(), { id: "bad-action", kind: "componentAction", action: "runCode", componentId: "chartforge.kpi", componentVersion: 1 } as unknown as BlueprintNode], edges: [edge("event", "bad-action")] },
      { variables: [], nodes: [eventNode()], edges: [edge("event", "missing")] },
      { variables: [variable("x", "number", 0)], nodes: [eventNode(), { id: "a", kind: "setVariable", name: "x", value: { source: "literal", value: 1 } }, { id: "b", kind: "setVariable", name: "x", value: { source: "literal", value: 2 } }], edges: [edge("event", "a"), edge("a", "b"), edge("b", "a")] },
    ];
    for (const graph of invalidGraphs) {
      const ctx = context();
      expect(validateBlueprint(graph, componentRegistry).ok).toBe(false);
      const result = await runBlueprint(graph, trigger, ctx, componentRegistry);
      expect(result.ok).toBe(false);
      expect(result.executedNodeIds).toEqual([]);
      expect(ctx.setVariable).not.toHaveBeenCalled();
      expect(ctx.setDatasetFilter).not.toHaveBeenCalled();
    }
  });

  it("validates component action properties against the exact registered schema", () => {
    const graph: BlueprintGraph = {
      variables: [],
      nodes: [eventNode(), { id: "action", kind: "componentAction", action: "setProps", componentId: "chartforge.kpi", componentVersion: 1, props: { unknown: "ignored?" } }],
      edges: [edge("event", "action")],
    };
    expect(validateBlueprint(graph, componentRegistry)).toMatchObject({ ok: false });
  });

  it("persists screen blueprint edits and applies registered component actions to its instances", () => {
    setActivePinia(createPinia());
    const doc = useDocumentStore();
    const screen = doc.addScreen("蓝图 screen");
    const graph: BlueprintGraph = { variables: [variable("pickedCity", "string", "")], nodes: [eventNode()], edges: [] };
    doc.updateScreenBlueprint(screen.id, graph);
    const kpiId = doc.addComponent("chartforge.kpi", 1);
    doc.applyBlueprintVisibility("chartforge.kpi", 1, false);
    doc.applyBlueprintProps("chartforge.kpi", 1, { label: "销售额", aggregation: "average" });
    expect(screen.blueprint).toEqual(graph);
    expect(doc.items.find((item) => item.id === kpiId)).toMatchObject({ kind: "component", hidden: true, props: { label: "销售额", aggregation: "average" } });
  });

  it("renders the visual node palette and safe graph validation controls", async () => {
    const html = await renderToString(createSSRApp(BlueprintEditor, { modelValue: { nodes: [], edges: [], variables: [] }, datasets: [] }));
    expect(html).toContain("蓝图交互");
    expect(html).toContain("组件事件");
    expect(html).toContain("条件分支");
    expect(html).toContain("保存蓝图");
    expect(html).toContain("蓝图结构有效");
  });
  it("keeps screens with no blueprint compatible and normalizes new screens to an empty graph", async () => {
    const { createScreen, normalizeWorkspace } = await import("../src/core/model/schema");
    const screen = createScreen("blueprint");
    expect(screen.blueprint).toEqual({ nodes: [], edges: [], variables: [] });
    const migrated = normalizeWorkspace({ version: 2, screens: [{ id: "legacy", name: "legacy", canvas: {}, items: [] }] });
    expect(migrated.screens[0]?.blueprint).toEqual({ nodes: [], edges: [], variables: [] });
  });
});
