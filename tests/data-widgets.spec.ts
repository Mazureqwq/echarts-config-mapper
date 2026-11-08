import { computed, createSSRApp, reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it, vi } from "vitest";
import DataTableWidget from "../src/workbench/components/DataTableWidget.vue";
import KpiWidget from "../src/workbench/components/KpiWidget.vue";
import ItemView from "../src/workbench/ItemView.vue";
import { useWorkspaceStore } from "../src/stores/workspaceStore";
import { componentRegistry } from "../src/core/components/builtins";
import {
  aggregateKpi,
  emitDataTableRowSelect,
  filterRowsByBinding,
} from "../src/core/components/dataWidgets";
import { buildChartDataFromRows } from "../src/core/live/payload";
import type { ComponentItem, DatasetSnapshot } from "../src/core/model/types";

const frame = { x: 0, y: 0, w: 300, h: 180, rotate: 0 };
const item = (componentId: string, props: Record<string, unknown> = {}): ComponentItem => ({
  id: "widget-1",
  name: "测试组件",
  kind: "component",
  componentId,
  componentVersion: 1,
  frame,
  props,
});
const snapshot: DatasetSnapshot = {
  status: "success",
  rows: [
    { city: "杭州", month: "一月", region: "华东", amount: 120, ratio: 0.25 },
    { city: "苏州", month: "一月", region: "华东", amount: 80, ratio: 0.5 },
    { city: "深圳", month: "二月", region: "华南", amount: 200, ratio: 0.75 },
  ],
};

describe("DataV-lite registered data widgets", () => {
  it("renders table columns in declared order with number and percent formats", async () => {
    const html = await renderToString(createSSRApp(DataTableWidget, {
      item: item("chartforge.data-table", { striped: true }),
      snapshot,
      rows: snapshot.rows.slice(0, 1),
      variables: {},
      emitEvent: vi.fn(),
      columns: [
        { field: "city", label: "城市", format: "text", align: "left" },
        { field: "amount", label: "销售额", format: "number", align: "right" },
        { field: "ratio", label: "占比", format: "percent" },
      ],
      striped: true,
    }));

    expect(html.indexOf("城市")).toBeLessThan(html.indexOf("销售额"));
    expect(html.indexOf("销售额")).toBeLessThan(html.indexOf("占比"));
    expect(html).toContain("杭州");
    expect(html).toContain("120");
    expect(html).toContain("25%");
    expect(html).toContain("data-format=\"percent\"");
  });

  it("emits rowSelect with the selected row and its stable source index", () => {
    const emit = vi.fn();
    const row = snapshot.rows[2];
    emitDataTableRowSelect(emit, row, 2);
    expect(emit).toHaveBeenCalledWith("rowSelect", { row, index: 2 });
  });

  it("aggregates KPI values using first, sum and average and handles empty rows", () => {
    expect(aggregateKpi(snapshot.rows, "amount", "first")).toBe(120);
    expect(aggregateKpi(snapshot.rows, "amount", "sum")).toBe(400);
    expect(aggregateKpi(snapshot.rows, "amount", "average")).toBeCloseTo(400 / 3);
    expect(aggregateKpi([], "amount", "sum")).toBe(0);
  });

  it("renders the KPI label and value with format-aware output", async () => {
    const html = await renderToString(createSSRApp(KpiWidget, {
      item: item("chartforge.kpi", { label: "总销售额", valueField: "amount", aggregation: "sum", format: "currency" }),
      snapshot,
      rows: snapshot.rows,
      variables: {},
      emitEvent: vi.fn(),
      label: "总销售额",
      valueField: "amount",
      aggregation: "sum",
      format: "currency",
    }));
    expect(html).toContain("总销售额");
    expect(html).toContain("400");
    expect(html).toContain("¥");
  });

  it("maps rows to chart series and applies a binding filter against changing variables", () => {
    const binding = {
      datasetId: "sales",
      fields: { category: "month", value: "amount", seriesField: "region" },
      filterBy: { field: "city", globalVariable: "pickedCity" },
    };
    const allRows = filterRowsByBinding(snapshot.rows, binding, { pickedCity: "杭州" });
    const changedRows = filterRowsByBinding(snapshot.rows, binding, { pickedCity: "深圳" });

    expect(allRows.map((row) => row.city)).toEqual(["杭州"]);
    expect(changedRows.map((row) => row.city)).toEqual(["深圳"]);
    expect(buildChartDataFromRows(snapshot.rows, binding.fields, "bar")).toEqual({
      ok: true,
      data: {
        kind: "category",
        categories: ["一月", "二月"],
        series: [
          { name: "华东", values: [200, 0] },
          { name: "华南", values: [0, 200] },
        ],
      },
      counts: { raw: 3, filtered: 3, selected: 3, sorted: 3, limited: 3 },
    });
    const filteredChart = buildChartDataFromRows(changedRows, binding.fields, "bar");
    expect(aggregateKpi(changedRows, "amount", "sum")).toBe(200);
    expect(filteredChart.ok && filteredChart.data).toMatchObject({ kind: "category", categories: ["二月"], series: [{ name: "华南", values: [200] }] });
  });

  it("ItemView consumes the workspace-shared runtime and passes bound rows into widgets", async () => {
    setActivePinia(createPinia());
    const ws = useWorkspaceStore();
    ws.workspace.datasets.push({ id: "dataset-1", name: "城市销量", source: { kind: "static", data: [{ city: "Berlin", amount: 12 }] } });
    const boundItem: ComponentItem = {
      ...item("chartforge.data-table", { columns: [{ field: "city", label: "城市", format: "text" }, { field: "amount", label: "销售额", format: "number" }] }),
      dataBinding: { datasetId: "dataset-1" },
    };
    const html = await renderToString(createSSRApp(ItemView, { item: boundItem }));
    expect(html).toContain("Berlin");
    expect(html).toContain("12");
    expect(ws.getDatasetRuntime()).toBe(ws.getDatasetRuntime());
    ws.disposeDatasetRuntime();
  });

  it("updates a bound chart and KPI when a rowSelect event changes the shared variable", () => {
    const variables = reactive({ pickedCity: "杭州" });
    const binding = {
      datasetId: "sales",
      fields: { category: "month", value: "amount", seriesField: "region" },
      filterBy: { field: "city", globalVariable: "pickedCity" },
    };
    const boundRows = computed(() => filterRowsByBinding(snapshot.rows, binding, variables));
    const chartData = computed(() => buildChartDataFromRows(boundRows.value, binding.fields, "bar"));
    const kpiValue = computed(() => aggregateKpi(boundRows.value, "amount", "sum"));

    expect(boundRows.value.map((row) => row.city)).toEqual(["杭州"]);
    expect(kpiValue.value).toBe(120);
    expect(chartData.value.ok && chartData.value.data).toMatchObject({ categories: ["一月"] });

    emitDataTableRowSelect((event, payload) => {
      if (event === "rowSelect") {
        variables.pickedCity = (payload as { row: { city: string } }).row.city;
      }
    }, snapshot.rows[2], 2);

    expect(variables.pickedCity).toBe("深圳");
    expect(boundRows.value.map((row) => row.city)).toEqual(["深圳"]);
    expect(chartData.value.ok && chartData.value.data).toMatchObject({
      kind: "category", categories: ["二月"], series: [{ name: "华南", values: [200] }],
    });
    expect(kpiValue.value).toBe(200);
  });

  it("registers versioned table/KPI widgets and only declared rowSelect actions", () => {
    const table = componentRegistry.get("chartforge.data-table", 1);
    const kpi = componentRegistry.get("chartforge.kpi", 1);
    expect(table?.renderer.kind).toBe("vue");
    expect(table?.events.map((event) => event.name)).toContain("rowSelect");
    expect(table?.actions.map((action) => action.name)).toEqual(["setVisibility", "setProps"]);
    expect(kpi?.renderer.kind).toBe("vue");
    expect(kpi?.props.map((prop) => prop.key)).toContain("valueField");
    expect(componentRegistry.get("chartforge.data-table", 2)).toBeUndefined();
  });
});
