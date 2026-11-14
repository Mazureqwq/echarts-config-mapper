import { describe, it, expect } from "vitest";
import { buildPackagePayload, isSafeImageSrc, toPackageScreen } from "../src/core/export/snapshot";
import { createWorkspace, createScreen, createChartAsset, createChartSpec } from "../src/core/model/schema";
import type { ChartItem, ComponentItem, ImageItem, ShapeItem, TextItem } from "../src/core/model/types";
import { createLayoutAssetItems, createLayoutBackgroundItems } from "../src/core/design/layoutBackgrounds";
import { attachGeo, runtimeSource } from "../src/core/export/assets";

function item<T>(kind: string, extra: Record<string, unknown>): T {
  return {
    id: `id-${kind}`,
    name: kind,
    kind,
    frame: { x: 0, y: 0, w: 100, h: 100, rotate: 0 },
    ...extra,
  } as T;
}

function seed() {
  const ws = createWorkspace();
  const screen = createScreen("销售大屏");
  const asset = createChartAsset("趋势", createChartSpec("bar"));
  ws.assets.push(asset);

  screen.items.push(
    {
      ...item<ChartItem>("chart", {}),
      spec: createChartSpec("bar"),
      sourceAssetId: asset.id,
    } as ChartItem,
    item<TextItem>("text", { text: "标题", fontSize: 24, color: "#fff", align: "left", weight: "bold" }),
    item<ImageItem>("image", { src: "data:image/png;base64,AAAA", fit: "cover" }),
    item<ImageItem>("image", { src: "javascript:alert(1)", fit: "cover", name: "坏图" }),
    { ...item<ShapeItem>("shape", { shape: "rect" }), hidden: true } as ShapeItem,
    item<ShapeItem>("shape", { shape: "rect", name: "图表位 1" }),
  );
  ws.screens.push(screen);
  return { ws, screen, asset };
}

describe("export/snapshot 快照与白名单", () => {
  it("为 map 与三种地理图表注入本地 GeoJSON，普通图表不注入", () => {
    for (const type of ["map", "geoScatter", "geoHeatmap", "geoFlow"] as const) {
      const { ws, screen } = seed();
      const chart = screen.items.find((entry) => entry.kind === "chart") as ChartItem;
      chart.spec = createChartSpec(type);
      const withMap = attachGeo(buildPackagePayload(ws, [screen.id]));
      expect(withMap.geo?.china).toBeDefined();
      expect(JSON.stringify(withMap.geo?.china).length).toBeGreaterThan(1000);
    }
    const { ws: sceneWorkspace, screen: sceneScreen } = seed();
    sceneScreen.items.push(item<ComponentItem>("component", { componentId: "chartforge.map-scene-flat", componentVersion: 1, props: { layers: [] } }));
    expect(attachGeo(buildPackagePayload(sceneWorkspace, [sceneScreen.id])).geo?.china).toBeDefined();
    const { ws, screen } = seed();
    const chart = screen.items.find((entry) => entry.kind === "chart") as ChartItem;
    chart.spec = createChartSpec("line");
    const withoutMaps = buildPackagePayload(ws, [screen.id]);
    expect(attachGeo(withoutMaps)).toBe(withoutMaps);
    expect(withoutMaps).not.toHaveProperty("geo");
  });

  it("只导出选中的大屏，并带上格式与版本", () => {
    const { ws, screen } = seed();
    ws.screens.push(createScreen("另一块"));
    const payload = buildPackagePayload(ws, [screen.id]);
    expect(payload.screens).toHaveLength(1);
    expect(payload.screens[0].name).toBe("销售大屏");
    expect(payload.format).toBe("chartforge/screen-package");
    expect(payload.schemaVersion).toBe(1);
  });

  it("隐藏项与模板占位被剔除，导出器里不留编辑期辅助物", () => {
    const { screen } = seed();
    const pack = toPackageScreen(screen, []);
    const kinds = pack.items.map((i) => i.kind);
    expect(kinds).toEqual(["chart", "text", "image"]);
  });

  it("非法图片地址被剔除并记入 warnings", () => {
    const { ws, screen } = seed();
    const payload = buildPackagePayload(ws, [screen.id]);
    expect(payload.screens[0].items.some((i) => i.kind === "image" && i.src.startsWith("javascript"))).toBe(false);
    expect(payload.warnings.join()).toMatch(/离线|白名单/);
  });

  it("图表 option 在导出时就已算好（运行时不重复建图逻辑）", () => {
    const { ws, screen } = seed();
    const payload = buildPackagePayload(ws, [screen.id]);
    const chart = payload.screens[0].items.find((i) => i.kind === "chart");
    expect(chart && chart.kind === "chart" && Array.isArray(chart.option.series)).toBe(true);
    expect(chart && chart.kind === "chart" && chart.alt).toContain("柱状图");
  });

  it("缩略图与图表库信息不会进产物", () => {
    const { ws, screen } = seed();
    ws.assets[0].thumbnail = "data:image/jpeg;base64,THUMB";
    const payload = buildPackagePayload(ws, [screen.id]);
    expect(JSON.stringify(payload)).not.toContain("THUMB");
  });

  it("离线图片白名单只放行内嵌 data:image", () => {
    expect(isSafeImageSrc("https://a.test/x.png")).toBe(false);
    expect(isSafeImageSrc("data:image/png;base64,AAA")).toBe(true);
    expect(isSafeImageSrc("data:text/html;base64,AAA")).toBe(false);
    expect(isSafeImageSrc("javascript:alert(1)")).toBe(false);
    expect(isSafeImageSrc("")).toBe(false);
  });

  it("只允许受控数据/装饰组件与地图场景预设的精确离线版本", () => {
    const { screen } = seed();
    const supported: ComponentItem[] = [
      { id: "progress", name: "进度", kind: "component", componentId: "chartforge.progress-list", componentVersion: 1, frame: { x: 0, y: 0, w: 300, h: 180, rotate: 0 }, props: { labelField: "region", valueField: "amount" }, dataBinding: { datasetId: "sales" } },
      { id: "title", name: "标题", kind: "component", componentId: "chartforge.section-title", componentVersion: 1, frame: { x: 0, y: 0, w: 300, h: 72, rotate: 0 }, props: { title: "<script>literal</script>" } },
      { id: "frame", name: "边框", kind: "component", componentId: "chartforge.corner-frame", componentVersion: 1, frame: { x: 0, y: 0, w: 300, h: 180, rotate: 0 }, props: { variant: "double" } },
      { id: "map-scene", name: "地图场景", kind: "component", componentId: "chartforge.map-scene-tilted", componentVersion: 1, frame: { x: 0, y: 0, w: 640, h: 400, rotate: 0 }, props: { presentation: "tilted", pitch: 99, extra: "remove", layers: [{ id: "flow", type: "geoFlow", name: "OD", visible: true, style: { color: "#32d6ff", opacity: 2, size: 8 }, script: "evil()" }, { id: "bad", type: "plugin" }] }, dataBinding: { datasetId: "routes" } },
    ];
    screen.items.push(...supported);

    const components = toPackageScreen(screen, []).items.filter((entry) => entry.kind === "component");
    expect(components.map((entry) => entry.kind === "component" ? [entry.componentId, entry.componentVersion] : null)).toEqual([
      ["chartforge.progress-list", 1],
      ["chartforge.section-title", 1],
      ["chartforge.corner-frame", 1],
      ["chartforge.map-scene-tilted", 1],
    ]);
    expect(components[0]).toMatchObject({ props: { labelField: "region", valueField: "amount" }, dataBinding: { datasetId: "sales" } });
    expect(components[3]).toMatchObject({ props: { presentation: "tilted", pitch: 60, layers: [{ id: "flow", type: "geoFlow", style: { opacity: 1 } }] }, dataBinding: { datasetId: "routes" } });
    expect(JSON.stringify(components[3])).not.toContain("evil()");

    screen.items.push({ ...supported[0]!, id: "unsupported-version", name: "component", componentVersion: 2 });
    expect(() => toPackageScreen(screen, [])).toThrow("chartforge.progress-list");
  });

  it("组件尚无导出渲染器时拒绝生成离线产物", () => {
    const { ws, screen } = seed();
    screen.items.push(
      item<ComponentItem>("component", {
        componentId: "chartforge.future-widget",
        componentVersion: 1,
        props: {},
      })
    );
    expect(() => buildPackagePayload(ws, [screen.id])).toThrow("chartforge.future-widget");
    expect(() => buildPackagePayload(ws, [screen.id])).toThrow("无法生成离线产物");
  });

  it("仅打包选中屏幕引用的数据集行快照，不携带源配置或其它屏幕的数据集", () => {
    const { ws, screen } = seed();
    ws.datasets.push(
      { id: "sales", name: "销售", source: { kind: "http", live: { url: "https://private.example/api", method: "POST", headers: { Authorization: "Bearer header-secret" }, body: "body-secret", query: { token: "query-secret" }, intervalSec: 30 } } } as never,
      { id: "other", name: "未选数据", source: { kind: "http", live: { url: "https://unused.example/api", intervalSec: 30 } } } as never,
    );
    (screen.items.find((entry) => entry.kind === "chart") as ChartItem).dataBinding = { datasetId: "sales", fields: { category: "region", value: "amount" }, filterBy: { field: "region", globalVariable: "selectedRegion" } };
    screen.items.push(item<ComponentItem>("component", { componentId: "chartforge.data-table", componentVersion: 1, props: { columns: [{ field: "region", label: "区域", format: "text" }] }, dataBinding: { datasetId: "sales" } }));
    screen.blueprint = {
      variables: [{ name: "selectedRegion", type: "string", initialValue: "North" }],
      nodes: [{ id: "select", kind: "componentEvent", componentId: "chartforge.data-table", componentVersion: 1, event: "rowSelect" }, { id: "set", kind: "setVariable", name: "selectedRegion", value: { source: "event", path: "row.region" } }, { id: "live-params", kind: "datasetAction", action: "setParams", datasetId: "sales", params: { token: { source: "literal", value: "blueprint-secret" } } }],
      edges: [{ id: "edge", from: { nodeId: "select", port: "next" }, to: { nodeId: "set", port: "next" } }],
    };
    const unselected = createScreen("未选择");
    unselected.items.push(item<ComponentItem>("component", { componentId: "chartforge.data-table", componentVersion: 1, dataBinding: { datasetId: "other" }, props: {} }));
    ws.screens.push(unselected);
    const payload = buildPackagePayload(ws, [screen.id], { datasetSnapshots: new Map([["sales", { status: "success" as const, rows: [{ region: "North", amount: 7 }, { region: "South", amount: 11 }], updatedAt: 123 }]]) });
    expect(payload.datasets).toEqual([{ id: "sales", rows: [{ region: "North", amount: 7 }, { region: "South", amount: 11 }] }]);
    expect(payload.screens).toHaveLength(1);
    expect(payload.screens[0]?.items.find((entry) => entry.kind === "component")).toMatchObject({ componentId: "chartforge.data-table", componentVersion: 1 });
    expect(payload.screens[0]?.items.find((entry) => entry.kind === "chart")).toMatchObject({ dataBinding: { datasetId: "sales" }, dataTemplate: { kind: "category" } });
    expect(payload.screens[0]?.blueprint?.nodes.find((node) => node.id === "live-params")).toMatchObject({ kind: "datasetAction", action: "setParams", params: {} });
    expect(JSON.stringify(payload)).not.toContain("blueprint-secret");
    expect(payload.screens[0]?.blueprint?.nodes.find((node) => node.id === "set")).toMatchObject({ id: "set", kind: "setVariable" });
    const serialized = JSON.stringify(payload);
    for (const secret of ["private.example", "unused.example", "header-secret", "body-secret", "query-secret"]) expect(serialized).not.toContain(secret);
  });

  it("includes registered local sample rows for unbound data widgets only", () => {
    const { ws, screen } = seed();
    screen.items.push(
      item<ComponentItem>("component", { componentId: "chartforge.data-table", componentVersion: 1, props: { columns: [{ field: "name", label: "名称", format: "text" }, { field: "value", label: "数值", format: "number" }] } }),
      item<ComponentItem>("component", { componentId: "chartforge.kpi", componentVersion: 1, props: { valueField: "value" } }),
      item<ComponentItem>("component", { componentId: "chartforge.progress-list", componentVersion: 1, props: { labelField: "name", valueField: "value" } }),
      item<ComponentItem>("component", { componentId: "chartforge.data-table", componentVersion: 1, props: {}, dataBinding: { datasetId: "live-data" } }),
    );
    const items = buildPackagePayload(ws, [screen.id]).screens[0]!.items.filter((entry) => entry.kind === "component");
    expect(items.filter((entry) => entry.componentId === "chartforge.data-table" && !entry.dataBinding).map((entry) => entry.kind === "component" ? entry.sampleRows : undefined)).toEqual([
      [{ name: "华东区", value: 1280 }, { name: "华南区", value: 960 }, { name: "华北区", value: 742 }],
    ]);
    expect(items.find((entry) => entry.componentId === "chartforge.kpi" && entry.kind === "component")?.kind === "component" && items.find((entry) => entry.componentId === "chartforge.kpi" && entry.kind === "component")?.sampleRows).toEqual([{ name: "本月营收", value: 1280 }]);
    expect(items.find((entry) => entry.componentId === "chartforge.progress-list" && entry.kind === "component")?.kind === "component" && items.find((entry) => entry.componentId === "chartforge.progress-list" && entry.kind === "component")?.sampleRows).toHaveLength(4);
    expect(items.find((entry) => entry.componentId === "chartforge.data-table" && entry.dataBinding)).not.toHaveProperty("sampleRows");
  });

  it("includes independently bound map-layer datasets in the offline snapshot", () => {
    const { ws, screen } = seed();
    ws.datasets.push(
      { id: "container-data", name: "容器数据", source: { kind: "http", live: { url: "https://private.example/container", intervalSec: 30 } } } as never,
      { id: "layer-regions", name: "区域数据", source: { kind: "http", live: { url: "https://private.example/regions", intervalSec: 30 } } } as never,
    );
    screen.items.push(item<ComponentItem>("component", {
      componentId: "chartforge.map-scene-flat", componentVersion: 1,
      dataBinding: { datasetId: "container-data" },
      props: { layers: [{ id: "region", type: "regionFill", name: "区域", dataBinding: { datasetId: "layer-regions", fields: { category: "province", value: "score" } } }] },
    }));
    const payload = buildPackagePayload(ws, [screen.id], { datasetSnapshots: new Map([
      ["container-data", { status: "success" as const, rows: [{ name: "container" }] }],
      ["layer-regions", { status: "success" as const, rows: [{ province: "广东省", score: 8 }] }],
    ]) });
    expect(payload.datasets).toEqual([
      { id: "container-data", rows: [{ name: "container" }] },
      { id: "layer-regions", rows: [{ province: "广东省", score: 8 }] },
    ]);
    expect(payload.screens[0]?.items.find((entry) => entry.kind === "component" && entry.componentId === "chartforge.map-scene-flat"))
      .toMatchObject({ props: { layers: [{ dataBinding: { datasetId: "layer-regions", fields: { category: "province", value: "score" } } }] } });
    expect(runtimeSource()).toContain("datasetRows(vlay.dataBinding, screen)");
    expect(runtimeSource()).toContain("vlay.dataBinding ? (vlay.dataBinding.fields || {}) : containerFields");
    expect(runtimeSource()).toContain("fillRows.forEach(function (row)");
  });

  it("exports stale dataset rows and warns that the last successful snapshot is stale", () => {
    const { ws, screen } = seed();
    ws.datasets.push({ id: "sales", name: "销售", source: { kind: "http", live: { url: "https://private.example/api", intervalSec: 30 } } } as never);
    (screen.items.find((entry) => entry.kind === "chart") as ChartItem).dataBinding = { datasetId: "sales" };
    screen.items.push(item<ComponentItem>("component", {
      componentId: "chartforge.progress-list",
      componentVersion: 1,
      props: { labelField: "region", valueField: "amount" },
      dataBinding: { datasetId: "sales" },
    }));
    const payload = buildPackagePayload(ws, [screen.id], { datasetSnapshots: new Map([["sales", { status: "stale" as const, rows: [{ region: "North", amount: 7 }] }]]) });
    expect(payload.datasets).toEqual([{ id: "sales", rows: [{ region: "North", amount: 7 }] }]);
    expect(payload.screens[0]?.items.find((entry) => entry.kind === "component")).toMatchObject({ componentId: "chartforge.progress-list", componentVersion: 1, dataBinding: { datasetId: "sales" } });
    expect(payload.warnings.join(" ")).toMatch(/过期|过时|stale/i);
  });

  it("drops external HTTP image and background URLs from offline packages with warnings", () => {
    const { ws, screen } = seed();
    screen.canvas.background = { kind: "image", src: "https://private.example/background.png" };
    screen.items.push(item<ImageItem>("image", { src: "http://private.example/image.png", fit: "cover" }));
    const payload = buildPackagePayload(ws, [screen.id]);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("private.example");
    expect(payload.screens[0]?.canvas.background.kind).toBe("color");
    expect(payload.warnings.join(" ")).toMatch(/离线|外部|data:image/i);
  });

  it("保留令牌选项仅产生安全警告，不会输出请求配置", () => {
    const { ws, screen } = seed();
    const payload = buildPackagePayload(ws, [screen.id], { keepHeaders: true });
    expect(payload.warnings.join()).toContain("令牌");
  });

  it("layout and asset recipes remain supported local shapes and registered components in package snapshots", () => {
    const workspace = createWorkspace();
    const screen = createScreen("深色布局快照", { width: 1280, height: 720 });
    screen.canvas.background = { kind: "color", color: "#12161d" };
    const originalBackground = structuredClone(screen.canvas.background);
    const sourceItems = [
      ...createLayoutBackgroundItems("monitor-main-side", screen.canvas),
      ...createLayoutBackgroundItems("monitor-grid-2x2", screen.canvas),
      ...createLayoutAssetItems("monitor-panel-frame", screen.canvas),
      ...createLayoutAssetItems("monitor-title-band", screen.canvas),
      ...createLayoutAssetItems("monitor-corner-accent", screen.canvas),
    ];
    sourceItems.forEach((item, index) => {
      item.id = `layout-export-${index}`;
      item.groupId = "layout-export-group";
    });
    screen.items.push(...sourceItems);
    workspace.screens.push(screen);

    const payload = buildPackagePayload(workspace, [screen.id]);
    const exported = payload.screens[0]!.items;
    const expectedIds = sourceItems.map((entry) => entry.id).sort();
    const layoutItems = exported.filter((entry) => expectedIds.includes(entry.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(layoutItems.map((entry) => entry.id)).toEqual(expectedIds);
    for (const item of layoutItems) {
      const source = sourceItems.find((entry) => entry.id === item.id)!;
      expect(item.frame).toEqual(source.frame);
    }
    expect(layoutItems.some((entry) => entry.kind === "shape" && entry.fill === "#0d2234" && entry.stroke === "#214258")).toBe(true);
    expect(layoutItems.filter((entry) => entry.kind === "component").map((entry) => entry.kind === "component" ? entry.componentId : "")).toEqual(
      expect.arrayContaining(["chartforge.section-title", "chartforge.corner-frame"])
    );
    expect(payload.screens[0]?.canvas.background).toEqual(originalBackground);
    expect(JSON.stringify(payload)).not.toMatch(/https?:\/\//i);
  });
});
