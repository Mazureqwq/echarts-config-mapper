import { describe, expect, it } from "vitest";
import { chartRegistry } from "../src/core/chart/registry";
import { componentRegistry } from "../src/core/components/builtins";
import { componentCatalogEntries, filterComponentCatalog, getComponentCatalog } from "../src/core/components/catalog";

describe("component catalog projection", () => {
  it("projects each registered chart type once and each Vue component by exact version", () => {
    const entries = getComponentCatalog();
    const charts = entries.filter((entry) => entry.source === "chart");
    const components = entries.filter((entry) => entry.source === "component");

    const placeableChartTypes = Object.keys(chartRegistry).filter((type) => !["map", "geoScatter", "geoHeatmap", "geoFlow"].includes(type));
    expect(charts.map((entry) => entry.chartType).sort()).toEqual(placeableChartTypes.sort());
    expect(new Set(charts.map((entry) => entry.key)).size).toBe(placeableChartTypes.length);
    expect(components.map((entry) => `${entry.componentId}@${entry.componentVersion}`)).toEqual(
      componentRegistry.list().filter((definition) => definition.renderer.kind === "vue").map((definition) => `${definition.id}@${definition.version}`)
    );
    expect(components.map((entry) => `${entry.componentId}@${entry.componentVersion}`)).toContain("chartforge.data-table@1");
    expect(components.map((entry) => `${entry.componentId}@${entry.componentVersion}`)).toContain("chartforge.kpi@1");
    expect(components.map((entry) => `${entry.componentId}@${entry.componentVersion}`)).toContain("chartforge.progress-list@1");
    expect(components.every((entry) => entry.key === `${entry.componentId}@${entry.componentVersion}`)).toBe(true);
  });

  it("keeps basic item creation paths in the catalog exactly once", () => {
    const basics = getComponentCatalog().filter((entry) => entry.source === "basic");
    expect(basics.map((entry) => entry.itemKind).sort()).toEqual(["image", "shape", "text"]);
    expect(new Set(basics.map((entry) => entry.key)).size).toBe(3);
  });

  it("includes metadata-free Vue definitions with a generic fallback but excludes legacy adapters", () => {
    const registered = componentRegistry.get("chartforge.kpi", 1)!;
    const { catalog: _catalog, ...withoutCatalog } = registered;
    const unannotated = { ...withoutCatalog, id: "test.unannotated", name: "未标注组件" };
    const legacy = componentRegistry.get("legacy.text", 1)!;

    const entries = componentCatalogEntries([registered, unannotated, legacy]);
    expect(entries.filter((entry) => entry.source === "component").map((entry) => entry.componentId)).toEqual(["chartforge.kpi", "test.unannotated"]);
    expect(entries[1]).toMatchObject({ group: "data", previewKey: "generic" });
    expect(componentRegistry.get("chartforge.kpi", 1)).toBe(registered);
    expect(componentRegistry.get("test.unannotated", 1)).toBeUndefined();
  });

  it("presents geographic capabilities as map-scene presets while keeping ordinary scatter in chart", () => {
    const charts = getComponentCatalog().filter((entry) => entry.source === "chart");
    const mapEntries = getComponentCatalog().filter((entry) => entry.group === "map");
    expect(mapEntries.map((entry) => entry.key)).toEqual(["chartforge.map-scene-flat@1", "chartforge.map-scene-tilted@1"]);
    expect(mapEntries.every((entry) => entry.source === "component")).toBe(true);
    expect(charts.some((entry) => entry.source === "chart" && ["map", "geoScatter", "geoHeatmap", "geoFlow"].includes(entry.chartType))).toBe(false);
    for (const type of ["line", "bar", "pie", "scatter", "radar"] as const) expect(charts.some((entry) => entry.source === "chart" && entry.chartType === type)).toBe(true);
    expect(filterComponentCatalog(charts, "热力", "map")).toEqual([]);
    expect(filterComponentCatalog(charts, "散点", "chart").map((entry) => entry.source === "chart" ? entry.chartType : "")).toEqual(["scatter"]);
  });

  it("searches trimmed text across names, descriptions, and tags without case sensitivity", () => {
    const base = componentRegistry.get("chartforge.kpi", 1)!;
    const searchable = {
      ...base,
      id: "test.searchable",
      name: "库存监控",
      catalog: {
        group: "data" as const,
        description: "用于高频边界巡检展示",
        tags: ["Cold-Chain", "Realtime"],
        previewKey: "metric",
      },
    };
    const entries = componentCatalogEntries([searchable]);

    expect(filterComponentCatalog(entries, "  Cold-chain ", "all")).toHaveLength(1);
    expect(filterComponentCatalog(entries, "边界巡检", "all")).toHaveLength(1);
    expect(filterComponentCatalog(entries, "  库存监控 ", "data")).toHaveLength(1);
    expect(filterComponentCatalog(entries, "监控", "chart")).toEqual([]);
  });

  it("preserves source order for empty queries and filters by catalog group", () => {
    const entries = getComponentCatalog();
    expect(filterComponentCatalog(entries, "  ", "all")).toEqual(entries);
    expect(filterComponentCatalog(entries, "", "chart")).toEqual(entries.filter((entry) => entry.group === "chart"));
    expect(filterComponentCatalog(entries, "KPI", "data").map((entry) => entry.key)).toEqual(["chartforge.kpi@1"]);
    expect(filterComponentCatalog(entries, "KPI", "basic")).toEqual([]);
  });
});
