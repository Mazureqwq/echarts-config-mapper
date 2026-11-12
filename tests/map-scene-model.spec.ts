import { describe, expect, it } from "vitest";
import { componentRegistry } from "../src/core/components/builtins";
import { getComponentCatalog } from "../src/core/components/catalog";
import { buildMapSceneOption, filterLayersForZoom, formatMapValue, normalizeMapSceneProps } from "../src/core/components/mapScene";
import { normalizeWorkspace } from "../src/core/model/schema";

describe("map scene model and catalog", () => {
  it("registers flat and tilted map scene presets, not independent geo chart cards", () => {
    const mapEntries = getComponentCatalog().filter((entry) => entry.group === "map");
    expect(mapEntries.map((entry) => entry.key)).toEqual([
      "chartforge.map-scene-flat@1",
      "chartforge.map-scene-tilted@1",
    ]);
    expect(mapEntries.every((entry) => entry.source === "component")).toBe(true);
    expect(getComponentCatalog().some((entry) => entry.source === "chart" && entry.chartType === "map")).toBe(false);
    expect(getComponentCatalog().some((entry) => entry.source === "chart" && entry.chartType === "geoFlow")).toBe(false);
    expect(componentRegistry.get("chartforge.map-scene-flat", 1)?.defaults).toMatchObject({ modelVersion: 2, presentation: "flat", pitch: 0, view: expect.any(Object), layers: [] });
    expect(componentRegistry.get("chartforge.map-scene-tilted", 1)?.defaults).toMatchObject({ presentation: "tilted" });
  });

  it("projects only allowed layer fields and clamps unsafe style/presentation values", () => {
    const normalized = normalizeMapSceneProps({
      presentation: "globe", pitch: 999, title: "drop",
      layers: [
        { id: "fill-1", type: "regionFill", name: "销量", visible: false, style: { color: "#12abEF", opacity: 2, size: -9, onload: "evil()" }, script: "evil()" },
        { id: "bad", type: "arbitrary", name: "bad", visible: true, style: {} },
        { type: "geoFlow", name: "  航线  ", style: { color: "url(http://evil)", opacity: -1, size: 999 } },
      ],
    }, "tilted");
    expect(normalized).toEqual({
      modelVersion: 2, presentation: "tilted", pitch: 60,
      view: { center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8, dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622" },
      layers: [
        { id: "fill-1", type: "regionFill", name: "销量", visible: false, style: { color: "#12abEF", opacity: 1, size: 1 } },
        { id: "layer-3", type: "geoFlow", name: "航线", visible: true, style: { color: "#32d6ff", opacity: 0, size: 100 } },
      ],
    });
  });

  it("applies the layer allowlist when persisting a component in a workspace", () => {
    const workspace = normalizeWorkspace({
      version: 2,
      screens: [{ id: "screen", items: [{
        id: "scene", kind: "component", componentId: "chartforge.map-scene-tilted", componentVersion: 1,
        props: { presentation: "globe", pitch: 99, extra: "drop", layers: [{ type: "geoFlow", name: "航线", script: "run()", style: { opacity: 1.5 } }, { type: "plugin" }] },
      }] }],
    });
    expect(workspace.screens[0].items[0]).toMatchObject({
      kind: "component", props: { presentation: "tilted", pitch: 60, layers: [{ type: "geoFlow", name: "航线", visible: true, style: { color: "#32d6ff", opacity: 1, size: 12 } }] },
    });
    expect(workspace.screens[0].items[0]).not.toHaveProperty("props.extra");
  });

  it("composes visible region, point, heat and flow layers on the shared offline geo map", () => {
    const result = buildMapSceneOption({ layers: [
      { id: "region", type: "regionFill", name: "区域", visible: true, style: { color: "#336699", opacity: 0.7, size: 12 } },
      { id: "scatter", type: "geoScatter", name: "网点", visible: true, style: { color: "#ffcc66", opacity: 0.9, size: 16 } },
      { id: "heat", type: "geoHeatmap", name: "热区", visible: true, style: { color: "#ff6b6b", opacity: 0.8, size: 20 } },
      { id: "flow", type: "geoFlow", name: "OD", visible: true, style: { color: "#32d6ff", opacity: 0.6, size: 8 } },
      { id: "off", type: "geoScatter", name: "隐藏层", visible: false, style: {} },
    ] }, [
      { province: "广东省", score: 9, lng: 113.26, lat: 23.13, amount: 4, fromLng: 113.26, fromLat: 23.13, toLng: 114.17, toLat: 22.31 },
    ], { category: "province", value: "score", geo: { longitude: "lng", latitude: "lat", value: "amount", originLongitude: "fromLng", originLatitude: "fromLat", destinationLongitude: "toLng", destinationLatitude: "toLat" } });
    expect(result.errors).toEqual([]);
    expect(result.option.geo).toMatchObject({ map: "china", roam: true, center: [104.114129, 35.550339], zoom: 1.05 });
    expect((result.option.series as Array<Record<string, unknown>>).map((entry) => entry.type)).toEqual(["map", "scatter", "heatmap", "lines"]);
    expect((result.option.series as Array<Record<string, unknown>>)[0]?.data).toEqual([{ name: "广东省", value: 9 }]);
    expect((result.option.series as Array<Record<string, unknown>>)[1]?.symbolSize).toBe(16);
  });

  it("normalizes independent layer bindings and drops unsupported binding fields", () => {
    const normalized = normalizeMapSceneProps({ layers: [{
      id: "fill", type: "regionFill", dataBinding: {
        datasetId: "  regions  ", fields: { category: " province ", value: "score", ignored: "drop", geo: { latitude: "lat", unexpected: "drop" } },
        filterBy: { field: " province ", globalVariable: " selected " }, extra: "drop",
      },
    }] });
    expect(normalized.layers[0]).toMatchObject({ dataBinding: {
      datasetId: "regions", fields: { category: "province", value: "score", geo: { latitude: "lat" } },
      filterBy: { field: "province", globalVariable: "selected" },
    } });
    expect(normalized.layers[0]?.dataBinding).not.toHaveProperty("extra");
  });

  it("uses each layer's own rows and field mapping, while unbound layers inherit the container", () => {
    const result = buildMapSceneOption({ layers: [
      { id: "independent", type: "regionFill", name: "独立区域", visible: true, style: {}, dataBinding: { datasetId: "regions", fields: { category: "province", value: "score" } } },
      { id: "inherited", type: "regionFill", name: "继承区域", visible: true, style: {} },
    ] }, [{ county: "默认", total: 99 }], { category: "county", value: "total" }, {
      independent: [{ province: "广东省", score: 8 }],
    });
    expect(result.errors).toEqual([]);
    expect((result.option.series as Array<Record<string, unknown>>).map((series) => series.data)).toEqual([
      [{ name: "广东省", value: 8 }], [{ name: "默认", value: 99 }],
    ]);
  });

  it("maps scatter, heat and OD layers from their own datasets and geo fields", () => {
    const result = buildMapSceneOption({ layers: [
      { id: "scatter", type: "geoScatter", name: "散点", visible: true, style: {}, dataBinding: { datasetId: "points", fields: { geo: { longitude: "pointLon", latitude: "pointLat", name: "label" } } } },
      { id: "heat", type: "geoHeatmap", name: "热力", visible: true, style: {}, dataBinding: { datasetId: "heat", fields: { geo: { longitude: "heatLon", latitude: "heatLat", value: "intensity" } } } },
      { id: "flow", type: "geoFlow", name: "航线", visible: true, style: {}, dataBinding: { datasetId: "routes", fields: { geo: { originLongitude: "fromX", originLatitude: "fromY", destinationLongitude: "toX", destinationLatitude: "toY", value: "weight" } } } },
    ] }, [], {}, {
      scatter: [{ pointLon: 10, pointLat: 20, label: "A" }],
      heat: [{ heatLon: 11, heatLat: 21, intensity: 5 }],
      flow: [{ fromX: 12, fromY: 22, toX: 13, toY: 23, weight: 7 }],
    });
    expect(result.errors).toEqual([]);
    const series = result.option.series as Array<Record<string, unknown>>;
    expect(series.map((entry) => entry.type)).toEqual(["scatter", "heatmap", "lines"]);
    expect(series[0]?.data).toEqual([{ name: "A", value: [10, 20] }]);
    expect(series[1]?.data).toEqual([[11, 21, 5]]);
    expect(series[2]?.data).toEqual([{ name: undefined, coords: [[12, 22], [13, 23]], value: 7 }]);
  });

  it("reports missing mapped columns with actionable diagnostics", () => {
    const result = buildMapSceneOption({ layers: [
      { id: "missing-region", type: "regionFill", name: "缺失区域列", visible: true, style: {}, dataBinding: { datasetId: "regions", fields: { category: "missingZone", value: "total" } } },
      { id: "missing-geo", type: "geoScatter", name: "缺失地理列", visible: true, style: {}, dataBinding: { datasetId: "points", fields: { geo: { longitude: "missingX", latitude: "y", name: "label" } } } },
    ] }, [], {}, {
      "missing-region": [{ zone: "North", total: 70 }],
      "missing-geo": [{ y: 20, label: "A" }],
    });
    expect(result.errors).toEqual([
      "缺失区域列：加工后数据缺少已映射的区域名称或数值列",
      "缺失地理列：加工后缺少已映射的地理字段列：missingX",
    ]);
  });

  it("reports invalid mapped coordinates without manufacturing the origin", () => {
    const result = buildMapSceneOption({ layers: [{ id: "s", type: "geoScatter", name: "网点", visible: true, style: { color: "#ffcc66", opacity: 1, size: 12 } }] }, [{ lng: 999, lat: 40 }], { geo: { longitude: "lng", latitude: "lat" } });
    expect((result.option.series as unknown[])).toEqual([]);
    expect(result.errors.join(" ")).toContain("没有可用的地理数据行");
    expect(JSON.stringify(result.option)).not.toContain("0,0");
  });

  it("normalizes a bounded offline map view and maps it to the shared ECharts geo camera", () => {
    expect(normalizeMapSceneProps(null).modelVersion).toBe(2);
    expect(normalizeMapSceneProps(null).view).toEqual({
      center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8,
      dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622",
    });
    const view = {
      center: [200, -100], zoom: 9, minZoom: 2, maxZoom: 4, dragEnabled: false, zoomEnabled: true,
      showLabels: false, backgroundColor: "url(https://example.invalid/map.png)", extra: "drop",
    };
    const scene = normalizeMapSceneProps({ view });
    expect(scene.view).toEqual({
      center: [180, -90], zoom: 4, minZoom: 2, maxZoom: 4, dragEnabled: false, zoomEnabled: true,
      showLabels: false, backgroundColor: "#081622",
    });
    const option = buildMapSceneOption({ view: { ...scene.view, backgroundColor: "#102030" } }, []).option;
    expect(option.backgroundColor).toBe("#102030");
    const extrudedOption = buildMapSceneOption({ presentation: "tilted", pitch: 42 }, []).option;
    expect(extrudedOption.backgroundColor).toBe("transparent");
    expect(Array.isArray(extrudedOption.geo)).toBe(true);
    const geoLayers = extrudedOption.geo as Array<Record<string, any>>;
    expect(geoLayers).toHaveLength(4);
    expect(geoLayers.slice(0, -1).every((geo) => geo.label.show === false)).toBe(true);
    expect(geoLayers.at(-1)?.label.show).toBe(true);
    expect(geoLayers.at(-1)?.itemStyle.areaColor).toMatchObject({ type: "linear", colorStops: [{ offset: 0, color: "rgba(3,27,78,0.88)" }, { offset: 1, color: "rgba(58,149,253,0.88)" }] });
    const overlaid = buildMapSceneOption({ presentation: "tilted", layers: [{ id: "cities", type: "geoScatter", name: "城市点", visible: true, style: { color: "#ffcc66", opacity: 1, size: 8 } }] }, [{ lon: 121.47, lat: 31.23 }], { geo: { longitude: "lon", latitude: "lat" } });
    expect(overlaid.option.series).toMatchObject([{ geoIndex: 3 }]);
    expect(option.geo).toMatchObject({
      map: "china", center: [180, -90], zoom: 4, scaleLimit: { min: 2, max: 4 }, roam: "scale",
      label: { show: false },
    });
  });

  it("uses safe deterministic defaults for malformed input", () => {
    expect(normalizeMapSceneProps(null, "flat")).toEqual({
      modelVersion: 2, presentation: "flat", pitch: 0,
      view: { center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8, dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622" },
      layers: [],
    });
    expect(normalizeMapSceneProps({ presentation: "tilted", pitch: -4, layers: Array(52).fill({ type: "geoScatter" }) }))
      .toMatchObject({ presentation: "tilted", pitch: 0, layers: expect.any(Array) });
    expect(normalizeMapSceneProps({ layers: Array(52).fill({ type: "geoScatter" }) }).layers).toHaveLength(50);
  });

  it("bumps to model version 2 and keeps v1 props key-identical", () => {
    const v1 = { presentation: "flat" as const, layers: [{ id: "a", type: "regionFill" as const, name: "n", visible: true, style: { color: "#336699", opacity: 0.7, size: 12 } }] };
    const out = normalizeMapSceneProps(v1);
    expect(out.modelVersion).toBe(2);
    expect(Object.keys(out).sort()).toEqual(["layers", "modelVersion", "pitch", "presentation", "view"]);
    expect(out.layers[0]).toEqual({ id: "a", type: "regionFill", name: "n", visible: true, style: { color: "#336699", opacity: 0.7, size: 12 } });
    expect("valueFormat" in out).toBe(false);
  });

  it("normalizes provided v2 groups with clamps", () => {
    const out = normalizeMapSceneProps({
      valueFormat: { decimals: 99, suffix: "次" },
      legend: { show: 1, position: "middle", mode: "pie" },
      tooltipStyle: { background: "#001122", color: "red" },
      emphasis: { areaColor: "#12abEF" },
      selected: { areaColor: "oops" },
      appliedSkin: "  jade  ",
      layers: [{ id: "a", type: "regionFill", name: "n", visible: true, style: { colorMode: "segments", segments: 99, colors: { min: "#000000", max: "url(x)", empty: "#111111" }, border: { color: "#fff", width: 99, type: "dotted" } }, minZoom: -3, maxZoom: 99 }],
    });
    expect(out.valueFormat).toEqual({ decimals: 4, suffix: "次" });
    expect(out.legend).toEqual({ show: false, position: "top-right", mode: "continuous" });
    expect(out.tooltipStyle).toEqual({ background: "#001122", borderColor: "#1f2a3a", color: "#e7fbff", fontSize: 12 });
    expect(out.emphasis).toEqual({ areaColor: "#12abEF", borderColor: "#ffffff", labelColor: "#ffffff" });
    expect(out.selected).toEqual({ areaColor: "#58d6ff", borderColor: "#ffffff" });
    expect(out.appliedSkin).toBe("jade");
    const layer = out.layers[0]!;
    expect(layer.style).toMatchObject({ colorMode: "segments", segments: 10, colors: { min: "#000000", max: "#32d6ff", empty: "#111111" }, border: { color: "#ffffff", width: 8, type: "solid" } });
    expect([layer.minZoom, layer.maxZoom]).toEqual([0.5, 20]);
  });

  it("formatMapValue clamps decimals and appends suffix", () => {
    expect(formatMapValue(null)).toBe("—");
    expect(formatMapValue(12.3456)).toBe("12");
    expect(formatMapValue(12.3456, { decimals: 2, suffix: " 万吨" })).toBe("12.35 万吨");
    expect(formatMapValue(-0.04, { decimals: 1 })).toBe("-0.0");
  });

  it("filters layers by zoom range", () => {
    const layers = [
      { id: "a", type: "regionFill" as const, name: "a", visible: true, style: { color: "#336699", opacity: 1, size: 12 } },
      { id: "b", type: "geoScatter" as const, name: "b", visible: true, style: { color: "#ffcc66", opacity: 1, size: 12 }, minZoom: 3, maxZoom: 6 },
    ];
    expect(filterLayersForZoom(layers, 1).map((l) => l.id)).toEqual(["a"]);
    expect(filterLayersForZoom(layers, 4).map((l) => l.id)).toEqual(["a", "b"]);
    expect(filterLayersForZoom(layers, 7).map((l) => l.id)).toEqual(["a"]);
  });

  it("normalizes the drill toggle with an enabled default", () => {
    expect(normalizeMapSceneProps({ drill: { enabled: false } }).drill).toEqual({ enabled: false });
    expect(normalizeMapSceneProps({ drill: { enabled: "yes" } }).drill).toEqual({ enabled: true });
    expect(normalizeMapSceneProps(null).drill).toBeUndefined();
  });
});
