import { describe, it, expect } from "vitest";
import { buildArtifact } from "../src/core/export/artifact";
import { buildPackagePayload } from "../src/core/export/snapshot";
import { attachGeo } from "../src/core/export/assets";
import { RUNTIME_CODE } from "../src/core/export/runtime";
import { regionRows as mapRegionRows } from "../src/core/components/mapScene";
import { DatasetRuntime } from "../src/core/data/datasetRuntime";
import { createZip, filesToEntries } from "../src/core/export/zip";
import { createWorkspace, createScreen, createChartSpec } from "../src/core/model/schema";
import { getBuiltInBackgroundPreset } from "../src/core/design/backgroundPresets";
import type { ChartItem, ComponentItem, DatasetDefinition, DatasetSnapshot, ImageItem, TextItem } from "../src/core/model/types";
import { createLayoutAssetItems, createLayoutBackgroundItems } from "../src/core/design/layoutBackgrounds";

const ECHARTS_STUB = "var echarts={registerMap:function(){},init:function(){return{setOption:function(){},resize:function(){},dispose:function(){}}}};";

class MemoryElement {
  children: MemoryElement[] = [];
  attributes: Record<string, string> = {};
  style: Record<string, string> = {};
  listeners: Record<string, Array<() => void>> = {};
  className = "";
  src = "";
  alt = "";
  private text = "";
  readonly tagName: string;
  constructor(tagName: string) { this.tagName = tagName; }
  appendChild<T extends MemoryElement>(child: T): T { this.children.push(child); return child; }
  removeChild(child: MemoryElement): MemoryElement { this.children = this.children.filter((entry) => entry !== child); return child; }
  get firstChild(): MemoryElement | null { return this.children[0] ?? null; }
  set textContent(value: string) { this.text = String(value); this.children = []; }
  get textContent(): string { return this.text + this.children.map((child) => child.textContent).join(""); }
  setAttribute(name: string, value: string): void { this.attributes[name] = String(value); }
  addEventListener(name: string, handler: () => void): void { (this.listeners[name] ??= []).push(handler); }
  click(): void { for (const handler of this.listeners.click ?? []) handler(); }
}

function findItem(root: MemoryElement, id: string): MemoryElement | undefined {
  if (root.attributes["data-item"] === id) return root;
  for (const child of root.children) { const found = findItem(child, id); if (found) return found; }
  return undefined;
}

function collectElements(root: MemoryElement): MemoryElement[] {
  return [root, ...root.children.flatMap(collectElements)];
}

function demoPayload() {
  const ws = createWorkspace();
  const screen = createScreen("门店大屏");
  screen.items.push(
    {
      id: "c1",
      kind: "chart",
      name: "销量",
      frame: { x: 10, y: 10, w: 400, h: 300, rotate: 0 },
      spec: createChartSpec("bar"),
    } as ChartItem,
    {
      id: "i1",
      kind: "image",
      name: "logo",
      frame: { x: 0, y: 0, w: 60, h: 60, rotate: 0 },
      src: "data:image/png;base64,AAAA",
      fit: "contain",
    } as ImageItem
  );
  ws.screens.push(screen);
  return buildPackagePayload(ws, [screen.id]);
}

describe("export 端到端：产物 → zip → 回读", () => {
  it("zip 里的文件与 manifest 清单一一对应，index.html 可直接打开", async () => {
    const out = await buildArtifact({
      payload: demoPayload(),
      echartsCode: ECHARTS_STUB,
      runtimeCode: RUNTIME_CODE,
      mode: "folder",
    });
    const zip = await createZip(filesToEntries(out.files));

    // 从 zip 里读目录：EOCD → 中央目录
    const view = new DataView(zip.buffer, zip.byteOffset, zip.length);
    let eocd = -1;
    for (let i = zip.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    expect(eocd).toBeGreaterThan(-1);
    const count = view.getUint16(eocd + 10, true);
    expect(count).toBe(out.files.length);

    let cursor = view.getUint32(eocd + 16, true);
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const nameLen = view.getUint16(cursor + 28, true);
      const extraLen = view.getUint16(cursor + 30, true);
      const commentLen = view.getUint16(cursor + 32, true);
      names.push(new TextDecoder().decode(zip.subarray(cursor + 46, cursor + 46 + nameLen)));
      cursor += 46 + nameLen + extraLen + commentLen;
    }

    expect(names.sort()).toEqual(out.files.map((f) => f.path).sort());
    // manifest 里的每一条都能在包里找到
    for (const f of out.manifest.files) expect(names).toContain(f.path);
    expect(names).toContain("index.html");
    expect(names).toContain("assets/echarts.min.js");
  });

  it("单文件产物只有一个 index.html，自包含且带 CSP 摘要", async () => {
    const out = await buildArtifact({
      payload: demoPayload(),
      echartsCode: ECHARTS_STUB,
      runtimeCode: RUNTIME_CODE,
      mode: "inline",
    });
    const html = out.files.find((f) => f.path === "index.html")!.content;
    expect(out.files.filter((f) => f.path === "index.html")).toHaveLength(1);
    expect(html).toContain("sha256-");
    expect(html).toContain("cf-payload");
    expect(html).toContain("门店大屏");
  });

  it("离线表格选择通过同一数据快照更新 KPI 与绑定图表", async () => {
    const ws = createWorkspace();
    const screen = createScreen("绑定验收");
    screen.themeId = "business-light";
    const maliciousCell = "<img src=x onerror=alert(1)>";
    const rows = [{ region: "North", amount: 7 }, { region: "South", amount: 11 }, { region: maliciousCell, amount: 3 }];
    ws.datasets.push({ id: "sales", name: "销售", source: { kind: "static", data: rows } } as never);
    screen.items.push(
      { id: "table", name: "销售表", kind: "component", componentId: "chartforge.data-table", componentVersion: 1, frame: { x: 0, y: 0, w: 400, h: 220, rotate: 0 }, props: { columns: [{ field: "region", label: "区域 <img src=x onerror=alert(1)>", format: "text" }, { field: "amount", label: "金额", format: "number" }] }, dataBinding: { datasetId: "sales" } } as ComponentItem,
      { id: "kpi", name: "销售额", kind: "component", componentId: "chartforge.kpi", componentVersion: 1, frame: { x: 420, y: 0, w: 240, h: 150, rotate: 0 }, props: { valueField: "amount", label: "<script>alert(1)</script>", format: "number", aggregation: "sum" }, dataBinding: { datasetId: "sales", filterBy: { field: "region", globalVariable: "selectedRegion" } } } as ComponentItem,
      { id: "progress", name: "区域进度", kind: "component", componentId: "chartforge.progress-list", componentVersion: 1, frame: { x: 680, y: 0, w: 240, h: 160, rotate: 0 }, props: { labelField: "region", valueField: "amount", maxValue: 100, showValue: true, trackColor: "url(javascript:alert(1))", fillColor: "red; background:url(javascript:alert(1))" }, dataBinding: { datasetId: "sales", filterBy: { field: "region", globalVariable: "selectedRegion" } } } as ComponentItem,
      { id: "title", name: "安全标题", kind: "component", componentId: "chartforge.section-title", componentVersion: 1, frame: { x: 680, y: 170, w: 240, h: 72, rotate: 0 }, props: { title: "<script>alert(1)</script>", subtitle: "<img src=x onerror=alert(1)>", variant: "bracket", accentColor: "red; background:url(javascript:alert(1))" } } as ComponentItem,
      { id: "frame", name: "装饰", kind: "component", componentId: "chartforge.corner-frame", componentVersion: 1, frame: { x: 680, y: 250, w: 240, h: 180, rotate: 0 }, props: { variant: "double", color: "url(javascript:alert(1))", thickness: 99, inset: -3 } } as ComponentItem,
      { id: "chart", name: "趋势", kind: "chart", frame: { x: 0, y: 240, w: 500, h: 300, rotate: 0 }, spec: createChartSpec("bar"), dataBinding: { datasetId: "sales", fields: { category: "region", value: "amount" }, filterBy: { field: "region", globalVariable: "selectedRegion" } } } as ChartItem,
    );
    screen.blueprint = {
      variables: [{ name: "selectedRegion", type: "string", initialValue: "North" }],
      nodes: [
        { id: "table-event", kind: "componentEvent", componentId: "chartforge.data-table", componentVersion: 1, event: "rowSelect" },
        { id: "set-region", kind: "setVariable", name: "selectedRegion", value: { source: "event", path: "row.region" } },
      ],
      edges: [{ id: "event-to-variable", from: { nodeId: "table-event", port: "next" }, to: { nodeId: "set-region", port: "next" } }],
    };
    ws.screens.push(screen);
    const payload = buildPackagePayload(ws, [screen.id], { datasetSnapshots: new Map([["sales", { status: "success" as const, rows }]]) });
    const [inlineArtifact, folderArtifact] = await Promise.all([
      buildArtifact({ payload, echartsCode: ECHARTS_STUB, runtimeCode: RUNTIME_CODE, mode: "inline" }),
      buildArtifact({ payload, echartsCode: ECHARTS_STUB, runtimeCode: RUNTIME_CODE, mode: "folder" }),
    ]);
    const inlineHtml = inlineArtifact.files.find((file) => file.path === "index.html")!.content;
    const folderHtml = folderArtifact.files.find((file) => file.path === "index.html")!.content;
    for (const html of [inlineHtml, folderHtml]) {
      expect(html).toContain("connect-src 'none'");
      expect(html).not.toMatch(/(?:src|href)=["']https?:\/\//i);
      expect(html).not.toContain("eval(");
      expect(html).not.toContain("new Function");
      expect(html).not.toContain("<script>alert(1)</script>");
      expect(html).not.toMatch(/(?:src|href)=["']https?:\/\//i);
    }
    const packageZip = await createZip(filesToEntries(folderArtifact.files));
    expect(packageZip.length).toBeGreaterThan(0);
    expect(folderArtifact.files.find((file) => file.path === "assets/app.js")?.content).toContain("chartforge.data-table");
    const root = new MemoryElement("div");
    const payloadNode = new MemoryElement("script");
    payloadNode.textContent = JSON.stringify(payload);
    const doc = {
      title: "",
      getElementById: (id: string) => id === "cf-root" ? root : id === "cf-payload" ? payloadNode : null,
      createElement: (tag: string) => new MemoryElement(tag),
      addEventListener: () => undefined,
    };
    const chartOptions: Array<Record<string, any>> = [];
    const windowStub: Record<string, any> = {
      innerWidth: 1920, innerHeight: 1080, location: { search: "" }, matchMedia: () => ({ matches: true }),
      addEventListener: () => undefined, setInterval: () => 1, clearInterval: () => undefined,
      echarts: { registerMap: () => undefined, init: () => ({ setOption: (option: Record<string, any>) => chartOptions.push(JSON.parse(JSON.stringify(option))), resize: () => undefined, dispose: () => undefined }) },
    };
    const { runInNewContext } = await import("node:vm");
    runInNewContext(RUNTIME_CODE, { document: doc, window: windowStub });
    const initialKpi = findItem(root, "kpi");
    const initialProgress = findItem(root, "progress");
    const titleItem = findItem(root, "title");
    const frameItem = findItem(root, "frame");
    expect(initialProgress?.textContent).toContain("North");
    expect(initialProgress?.textContent).not.toContain("South");
    const progressElements = collectElements(initialProgress!);
    const progressTrack = progressElements.find((element) => element.attributes.role === "progressbar");
    const progressFill = progressElements.find((element) => element.className.includes("cf-progress-fill"));
    expect(progressTrack?.attributes["aria-valuenow"]).toBe("7");
    expect(progressTrack?.style.backgroundColor).toBe("#d8e1ed");
    expect(progressFill?.style.backgroundColor).toBe("#3478f6");
    expect(progressFill?.style.width).toBe("7%");
    expect(progressElements.some((element) => element.tagName.toLowerCase() === "img")).toBe(false);
    expect(titleItem?.textContent).toContain("<script>alert(1)</script>");
    expect(titleItem?.textContent).toContain("<img src=x onerror=alert(1)>");
    const titleElements = collectElements(titleItem!);
    const titleAccent = titleElements.find((element) => element.className.includes("section-title__mark"));
    expect(titleAccent?.style.borderColor).toBe("#3478f6");
    expect(titleElements.some((element) => element.tagName.toLowerCase() === "script" || element.tagName.toLowerCase() === "img")).toBe(false);
    expect(frameItem?.className).toContain("cf-corner-frame");
    const frameOutlines = collectElements(frameItem!).filter((element) => element.className.includes("cf-corner-frame__outline"));
    expect(frameOutlines[0]?.style.borderColor).toBe("#3478f6");
    expect(frameOutlines[0]?.style.borderWidth).toBe("8px");
    expect(frameOutlines.every((element) => !String(element.style.borderColor || "").includes("url("))).toBe(true);
    expect(initialKpi?.style.backgroundColor).toBe("#ffffff");
    expect(initialKpi?.textContent).toContain("7");
    expect(initialKpi?.textContent).toContain("<script>alert(1)</script>");
    expect(collectElements(initialKpi!).some((element) => element.tagName.toLowerCase() === "script")).toBe(false);
    expect(chartOptions.at(-1)?.series[0]?.data).toEqual([7]);
    const safeTable = findItem(root, "table")!;
    expect(safeTable.textContent).toContain(maliciousCell);
    expect(collectElements(safeTable).some((element) => element.tagName.toLowerCase() === "img")).toBe(false);
    const table = findItem(root, "table")!;
    const tableBody = table.children[0]!.children[1]!;
    tableBody.children[1]!.click();
    expect(findItem(root, "kpi")?.textContent).toContain("11");
    expect(findItem(root, "progress")?.textContent).toContain("South");
    expect(findItem(root, "progress")?.textContent).not.toContain("North");
    expect(chartOptions.at(-1)?.series[0]?.data).toEqual([11]);
  });


  it("runs independent and inherited map-layer datasets offline and refreshes their variable filters", async () => {
    const workspace = createWorkspace();
    const screen = createScreen("离线地理绑定");
    const rows = [
      { region: "North", longitude: 121.47, latitude: 31.23, name: "Shanghai", value: 7, originLongitude: 120, originLatitude: 30, destinationLongitude: 121.47, destinationLatitude: 31.23 },
      { region: "North", longitude: 181, latitude: 91, name: "Invalid", value: 999, originLongitude: 500, originLatitude: 30, destinationLongitude: 121, destinationLatitude: 200 },
      { region: "South", longitude: 113.26, latitude: 23.13, name: "Guangzhou", value: 11, originLongitude: 114.17, originLatitude: 22.31, destinationLongitude: 113.26, destinationLatitude: 23.13 },
      { region: "East", longitude: 114.3, latitude: 30.6, name: "Wuhan", value: 13, originLongitude: 113.9, originLatitude: 30.5, destinationLongitude: 114.3, destinationLatitude: 30.6 },
    ];
    const geoFields = { longitude: "longitude", latitude: "latitude", name: "name", value: "value", originLongitude: "originLongitude", originLatitude: "originLatitude", destinationLongitude: "destinationLongitude", destinationLatitude: "destinationLatitude" };
    const regionRows = [{ region: "North", zone: "North zone", total: 70 }, { region: "South", zone: "South zone", total: 110 }];
    const pointRows = [{ region: "North", x: 10, y: 20, place: "North hub", size: 70 }, { region: "South", x: 30, y: 40, place: "South hub", size: 110 }];
    const routeRows = [{ region: "North", fromX: 1, fromY: 2, toX: 3, toY: 4, route: "North route", weight: 70 }, { region: "South", fromX: 5, fromY: 6, toX: 7, toY: 8, route: "South route", weight: 110 }];
    workspace.datasets.push(
      { id: "geo-sales", name: "地理销售", source: { kind: "static", data: rows } } as never,
      { id: "geo-regions", name: "区域图层", source: { kind: "static", data: regionRows } } as never,
      { id: "geo-points", name: "网点图层", source: { kind: "static", data: pointRows } } as never,
      { id: "geo-routes", name: "航线图层", source: { kind: "static", data: routeRows } } as never,
    );
    screen.items.push({
      id: "geo-table", name: "区域选择", kind: "component", componentId: "chartforge.data-table", componentVersion: 1,
      frame: { x: 0, y: 0, w: 300, h: 180, rotate: 0 },
      props: { columns: [{ field: "region", label: "区域", format: "text" }] }, dataBinding: { datasetId: "geo-sales" },
    } as ComponentItem);
    for (const type of ["geoScatter", "geoHeatmap", "geoFlow"] as const) {
      screen.items.push({
        id: `chart-${type}`, name: type, kind: "chart", frame: { x: 320, y: 0, w: 300, h: 180, rotate: 0 },
        spec: createChartSpec(type), dataBinding: { datasetId: "geo-sales", fields: { geo: geoFields }, filterBy: { field: "region", globalVariable: "selectedRegion" } },
      } as ChartItem);
    }
    screen.items.push({
      id: "chart-missing", name: "missing", kind: "chart", frame: { x: 640, y: 0, w: 300, h: 180, rotate: 0 },
      spec: createChartSpec("geoScatter"), dataBinding: { datasetId: "geo-sales", fields: {}, filterBy: { field: "region", globalVariable: "selectedRegion" } },
    } as ChartItem);
    screen.items.push({
      id: "map-scene", name: "地图场景", kind: "component", componentId: "chartforge.map-scene-tilted", componentVersion: 1,
      frame: { x: 960, y: 0, w: 360, h: 220, rotate: 0 },
      props: { presentation: "tilted", pitch: 0, layers: [
        { id: "region", type: "regionFill", name: "区域", visible: true, style: { color: "#336699", opacity: 0.8, size: 12 }, dataBinding: { datasetId: "geo-regions", fields: { category: "zone", value: "total" }, filterBy: { field: "region", globalVariable: "selectedRegion" } } },
        { id: "missing-region-column", type: "regionFill", name: "缺失区域列", visible: true, style: { color: "#ffffff", opacity: 1, size: 12 }, dataBinding: { datasetId: "geo-regions", fields: { category: "missingZone", value: "total" } } },
        { id: "scatter", type: "geoScatter", name: "网点", visible: true, style: { color: "#ffcc66", opacity: 0.9, size: 12 }, dataBinding: { datasetId: "geo-points", fields: { geo: { longitude: "x", latitude: "y", name: "place", value: "size" } }, filterBy: { field: "region", globalVariable: "selectedRegion" } } },
        { id: "heat", type: "geoHeatmap", name: "热力", visible: true, style: { color: "#ff6b6b", opacity: 0.8, size: 18 } },
        { id: "flow", type: "geoFlow", name: "流向", visible: true, style: { color: "#32d6ff", opacity: 0.7, size: 8 }, dataBinding: { datasetId: "geo-routes", fields: { geo: { originLongitude: "fromX", originLatitude: "fromY", destinationLongitude: "toX", destinationLatitude: "toY", name: "route", value: "weight" } }, filterBy: { field: "region", globalVariable: "selectedRegion" } } },
        { id: "missing-mapping", type: "geoScatter", name: "缺失映射", visible: true, style: { color: "#ffffff", opacity: 1, size: 12 }, dataBinding: { datasetId: "geo-points", fields: { geo: { longitude: "x" } } } },
        { id: "missing-column", type: "geoScatter", name: "缺失列", visible: true, style: { color: "#ffffff", opacity: 1, size: 12 }, dataBinding: { datasetId: "geo-points", fields: { geo: { longitude: "missingX", latitude: "y", name: "place" } } } },
      ] },
      dataBinding: { datasetId: "geo-sales", fields: { category: "region", value: "value", geo: geoFields }, filterBy: { field: "region", globalVariable: "selectedRegion" } },
    } as ComponentItem);
    screen.blueprint = {
      variables: [{ name: "selectedRegion", type: "string", initialValue: "North" }],
      nodes: [
        { id: "table-event", kind: "componentEvent", componentId: "chartforge.data-table", componentVersion: 1, event: "rowSelect" },
        { id: "set-region", kind: "setVariable", name: "selectedRegion", value: { source: "event", path: "row.region" } },
      ],
      edges: [{ id: "event-to-variable", from: { nodeId: "table-event", port: "next" }, to: { nodeId: "set-region", port: "next" } }],
    };
    workspace.screens.push(screen);
    const payload = attachGeo(buildPackagePayload(workspace, [screen.id], { datasetSnapshots: new Map([
      ["geo-sales", { status: "success" as const, rows }],
      ["geo-regions", { status: "success" as const, rows: regionRows }],
      ["geo-points", { status: "success" as const, rows: pointRows }],
      ["geo-routes", { status: "success" as const, rows: routeRows }],
    ]) }));
    expect(payload.datasets.map((dataset) => dataset.id)).toEqual(["geo-sales", "geo-regions", "geo-points", "geo-routes"]);
    const [inlineArtifact, folderArtifact] = await Promise.all([
      buildArtifact({ payload, echartsCode: ECHARTS_STUB, runtimeCode: RUNTIME_CODE, mode: "inline" }),
      buildArtifact({ payload, echartsCode: ECHARTS_STUB, runtimeCode: RUNTIME_CODE, mode: "folder" }),
    ]);
    const inlineHtml = inlineArtifact.files.find((file) => file.path === "index.html")!.content;
    const folderHtml = folderArtifact.files.find((file) => file.path === "index.html")!.content;
    const folderRuntime = folderArtifact.files.find((file) => file.path === "assets/app.js")!.content;
    expect(inlineHtml).toContain('"china":');
    expect(folderHtml).toContain('"china":');
    expect(inlineHtml).toContain("connect-src 'none'");
    expect(folderHtml).toContain("connect-src 'none'");
    for (const output of [inlineHtml, folderHtml, folderRuntime]) {
      expect(output).not.toMatch(/(?:src|href)=["']https?:\/\//i);
      expect(output).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket)\b/);
      expect(output).not.toContain("eval(");
      expect(output).not.toContain("new Function");
    }
    const root = new MemoryElement("div");
    const payloadNode = new MemoryElement("script"); payloadNode.textContent = JSON.stringify(payload);
    const doc = { title: "", getElementById: (id: string) => id === "cf-root" ? root : id === "cf-payload" ? payloadNode : null, createElement: (tag: string) => new MemoryElement(tag), addEventListener: () => undefined };
    const chartOptions = new Map<string, Array<Record<string, any>>>();
    const chartInstances = new Map<string, Record<string, any>>();
    const registeredMaps: unknown[] = [];
    const windowStub: Record<string, any> = {
      innerWidth: 1920, innerHeight: 1080, location: { search: "" }, matchMedia: () => ({ matches: true }),
      addEventListener: () => undefined, setInterval: () => 1, clearInterval: () => undefined,
      echarts: {
        registerMap: (_name: string, geo: unknown) => registeredMaps.push(geo),
        init: (element: MemoryElement) => {
          const id = element.attributes["data-item"] || "";
          let currentOption: Record<string, any> = {};
          const handlers: Record<string, (event?: Record<string, unknown>) => void> = {};
          const instance = {
            setOption: (option: Record<string, any>, opts?: Record<string, any>) => {
              if (opts?.notMerge === false && Array.isArray(option.geo) && Array.isArray(currentOption.geo)) currentOption = { ...currentOption, geo: option.geo.map((geo: Record<string, any>, index: number) => ({ ...currentOption.geo[index], ...geo })) };
              else currentOption = JSON.parse(JSON.stringify(option));
              const entries = chartOptions.get(id) || []; entries.push(JSON.parse(JSON.stringify(currentOption))); chartOptions.set(id, entries);
            },
            getOption: () => JSON.parse(JSON.stringify(currentOption)),
            on: (event: string, handler: (event?: Record<string, unknown>) => void) => { handlers[event] = handler; },
            simulateRoam: () => { currentOption.geo[3].center = [110, 30]; currentOption.geo[3].zoom = 1.4; handlers.georoam?.({ componentIndex: 3 }); },
            resize: () => undefined, dispose: () => undefined,
          };
          chartInstances.set(id, instance);
          return instance;
        },
      },
    };
    const { runInNewContext } = await import("node:vm");
    runInNewContext(RUNTIME_CODE, { document: doc, window: windowStub });
    expect(registeredMaps).toHaveLength(1);
    expect(chartOptions.get("chart-geoScatter")?.[0]?.series[0]?.data).toEqual([{ name: "Shanghai", value: [121.47, 31.23, 7] }]);
    expect(chartOptions.get("chart-geoHeatmap")?.[0]?.series[0]?.data).toEqual([[121.47, 31.23, 7]]);
    expect(chartOptions.get("chart-geoFlow")?.[0]?.series[0]?.data).toEqual([{ name: "Shanghai", coords: [[120, 30], [121.47, 31.23]], value: 7 }]);
    expect(chartOptions.get("chart-missing")?.[0]?.series[0]?.data).toEqual([]);
    // MapLibre 渲染器（T4 起）：node 环境无 Worker/blob-ESM → 优雅降级；map-scene DOM 与区域填色诊断仍可断言
    const mapSceneEl1 = findItem(root, "map-scene");
    expect(mapSceneEl1?.className).toContain("cf-map-scene");

    const table = findItem(root, "geo-table")!.children[0]!;
    table.children[1]!.children[2]!.click();
    expect(chartOptions.get("chart-geoScatter")?.at(-1)?.series[0]?.data).toEqual([{ name: "Guangzhou", value: [113.26, 23.13, 11] }]);
    expect(chartOptions.get("chart-geoFlow")?.at(-1)?.series[0]?.data).toEqual([{ name: "Guangzhou", coords: [[114.17, 22.31], [113.26, 23.13]], value: 11 }]);
    // map-scene 不再产出 ECharts 捕获（MapLibre 渲染器）；独立地理图表的变量过滤断言见上

    const mapScene = findItem(root, "map-scene")!;
    // 区域填色诊断由共享 mapRegionRows 助手与离线运行时共同产生（台账裁决：散点/热力/飞线的
    // 映射诊断移交 playwright 离线 e2e，此处只断言区域填色一路）。
    const missingRegion = mapRegionRows(regionRows, { category: "missingZone", value: "total" });
    expect(missingRegion.error).toBe("加工后数据缺少已映射的区域名称或数值列");
    const mapStatus = collectElements(mapScene).find((element) => element.attributes.role === "status")?.textContent;
    expect(mapStatus).toContain("缺失区域列：加工后数据缺少已映射的区域名称或数值列");

    table.children[1]!.children[3]!.click();
    // 变量切换后独立图层的离线行为由 playwright 离线 e2e 承载（T5 起）；此处仅确认 map-scene DOM 仍健在
    expect(findItem(root, "map-scene")?.className).toContain("cf-map-scene");
  });

  it("exports map layers consistently from static pipeline rows and processed HTTP snapshots", async () => {
    const pipeline: DatasetDefinition["pipeline"] = {
      filter: [{ field: "active", op: "eq", value: "yes" }],
      select: ["region", "lon", "lat", "place", "weight", "rank"],
      sort: { field: "rank", desc: true },
      limit: 1,
    };
    const staticRows = [
      { region: "North", active: "yes", lon: 121.47, lat: 31.23, place: "Static North", weight: 2, rank: 2, private: "drop" },
      { region: "South", active: "yes", lon: 114.3, lat: 22.3, place: "Static South", weight: 9, rank: 9, private: "drop" },
      { region: "West", active: "no", lon: 100, lat: 10, place: "Filtered Static", weight: 99, rank: 99, private: "drop" },
    ];
    const httpRows = [
      { region: "North", active: "yes", lon: 121, lat: 31, place: "HTTP North", weight: 1, rank: 1, private: "drop" },
      { region: "South", active: "yes", lon: 113.8, lat: 22.2, place: "HTTP South", weight: 5, rank: 5, private: "drop" },
      { region: "West", active: "no", lon: 100, lat: 10, place: "Filtered HTTP", weight: 99, rank: 99, private: "drop" },
    ];
    const staticDataset: DatasetDefinition = { id: "static-points", name: "静态点位", source: { kind: "static", data: staticRows }, pipeline };
    const httpDataset: DatasetDefinition = {
      id: "http-points", name: "HTTP 点位", source: { kind: "http", live: { url: "", path: "/points", intervalSec: 30, dataPath: "records" } }, pipeline,
    };
    const datasetRuntime = new DatasetRuntime([staticDataset, httpDataset], {
      resolveApi: () => ({ baseUrl: "https://api.example.test", query: {} }),
      fetchImpl: async () => ({ records: httpRows }),
      setIntervalImpl: () => 1,
      clearIntervalImpl: () => undefined,
      isHidden: () => false,
      now: () => 1234,
    });
    let staticSnapshot: DatasetSnapshot | undefined;
    let httpSnapshot: DatasetSnapshot | undefined;
    const stopStatic = datasetRuntime.subscribe("static-points", "map-static", (snapshot) => { staticSnapshot = snapshot; });
    const stopHttp = datasetRuntime.subscribe("http-points", "map-http", (snapshot) => { httpSnapshot = snapshot; });
    await datasetRuntime.refresh("http-points");
    expect(staticSnapshot).toMatchObject({ status: "success", rows: [{ region: "South", place: "Static South", weight: 9 }] });
    expect(httpSnapshot).toMatchObject({ status: "success", rows: [{ region: "South", place: "HTTP South", weight: 5 }] });

    const workspace = createWorkspace();
    workspace.datasets.push(staticDataset, httpDataset);
    const screen = createScreen("管线地图绑定");
    screen.items.push({
      id: "pipeline-map", name: "管线地图", kind: "component", componentId: "chartforge.map-scene-flat", componentVersion: 1,
      frame: { x: 0, y: 0, w: 500, h: 320, rotate: 0 },
      props: { presentation: "flat", pitch: 0, layers: [
        { id: "static-layer", type: "geoScatter", name: "静态管线", visible: true, style: {}, dataBinding: { datasetId: "static-points", fields: { geo: { longitude: "lon", latitude: "lat", name: "place", value: "weight" } }, filterBy: { field: "region", globalVariable: "selectedRegion" } } },
        { id: "http-layer", type: "geoScatter", name: "HTTP 快照", visible: true, style: {}, dataBinding: { datasetId: "http-points", fields: { geo: { longitude: "lon", latitude: "lat", name: "place", value: "weight" } }, filterBy: { field: "region", globalVariable: "selectedRegion" } } },
      ] },
    } as ComponentItem);
    screen.blueprint = { variables: [{ name: "selectedRegion", type: "string", initialValue: "South" }], nodes: [], edges: [] };
    workspace.screens.push(screen);
    const payload = attachGeo(buildPackagePayload(workspace, [screen.id], {
      datasetSnapshots: new Map([["http-points", httpSnapshot!]]),
    }));
    const packagedStatic = payload.datasets.find((dataset) => dataset.id === "static-points")!;
    const packagedHttp = payload.datasets.find((dataset) => dataset.id === "http-points")!;
    expect(packagedStatic.rows).toEqual(staticSnapshot!.rows);
    expect(packagedHttp.rows).toEqual(httpSnapshot!.rows);
    expect(packagedStatic.rows[0]).not.toHaveProperty("private");
    datasetRuntime.dispose();
    stopStatic();
    stopHttp();

    const artifact = await buildArtifact({ payload, echartsCode: ECHARTS_STUB, runtimeCode: RUNTIME_CODE, mode: "inline" });
    expect(artifact.files.some((file) => file.path === "index.html")).toBe(true);
    const root = new MemoryElement("div");
    const payloadNode = new MemoryElement("script"); payloadNode.textContent = JSON.stringify(payload);
    const doc = { title: "", getElementById: (id: string) => id === "cf-root" ? root : id === "cf-payload" ? payloadNode : null, createElement: (tag: string) => new MemoryElement(tag), addEventListener: () => undefined };
    const chartOptions: Array<Record<string, any>> = [];
    const windowStub: Record<string, any> = {
      innerWidth: 1280, innerHeight: 720, location: { search: "" }, matchMedia: () => ({ matches: true }),
      addEventListener: () => undefined, setInterval: () => 1, clearInterval: () => undefined,
      echarts: { registerMap: () => undefined, init: () => ({ setOption: (option: Record<string, any>) => chartOptions.push(JSON.parse(JSON.stringify(option))), resize: () => undefined, dispose: () => undefined }) },
    };
    const { runInNewContext } = await import("node:vm");
    runInNewContext(RUNTIME_CODE, { document: doc, window: windowStub });
    // MapLibre 渲染器下 map-scene 不再走 ECharts 捕获；数据快照语义由 playwright 离线 e2e 承载（T5）
    const mapDom = collectElements(root).find((element) => String(element.className ?? "").includes("cf-map-scene"));
    expect(Boolean(mapDom)).toBe(true);
  });

  it("renders layout backgrounds in self-contained ZIP and inline exports", async () => {
    const workspace = createWorkspace();
    const screen = createScreen("深色布局离线验收");
    const items = [
      ...createLayoutBackgroundItems("monitor-main-side", screen.canvas),
      ...createLayoutBackgroundItems("monitor-grid-2x2", screen.canvas),
      ...createLayoutAssetItems("monitor-panel-frame", screen.canvas),
      ...createLayoutAssetItems("monitor-title-band", screen.canvas),
      ...createLayoutAssetItems("monitor-corner-accent", screen.canvas),
    ];
    items.forEach((item, index) => {
      item.id = `offline-layout-${index}`;
      item.groupId = "offline-layout-group";
    });
    const panel = items.find((item) => item.kind === "shape")!;
    const title = items.find((item) => item.kind === "component" && item.componentId === "chartforge.section-title")!;
    const corner = items.find((item) => item.kind === "component" && item.componentId === "chartforge.corner-frame")!;
    panel.id = "offline-panel-background";
    title.id = "offline-section-title";
    corner.id = "offline-corner-frame";
    screen.items.push(...items);
    workspace.screens.push(screen);

    const payload = buildPackagePayload(workspace, [screen.id]);
    const packed = payload.screens[0]!.items;
    expect(packed.some((item) => item.kind === "shape" && item.id === panel.id && item.fill === "#0d2234")).toBe(true);
    expect(packed.some((item) => item.kind === "component" && item.id === title.id && item.componentId === "chartforge.section-title")).toBe(true);
    expect(packed.some((item) => item.kind === "component" && item.id === corner.id && item.componentId === "chartforge.corner-frame")).toBe(true);

    const [inline, folder] = await Promise.all([
      buildArtifact({ payload, echartsCode: ECHARTS_STUB, runtimeCode: RUNTIME_CODE, mode: "inline" }),
      buildArtifact({ payload, echartsCode: ECHARTS_STUB, runtimeCode: RUNTIME_CODE, mode: "folder" }),
    ]);
    const inlineHtml = inline.files.find((file) => file.path === "index.html")!.content;
    const folderHtml = folder.files.find((file) => file.path === "index.html")!.content;
    const folderRuntime = folder.files.find((file) => file.path === "assets/app.js")!.content;
    for (const content of [inlineHtml, folderHtml, folderRuntime]) {
      expect(content).not.toMatch(/(?:src|href)=["']https?:\/\//i);
      expect(content).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket)\b/);
      expect(content).not.toContain("eval(");
      expect(content).not.toContain("new Function");
    }
    expect(inlineHtml).toContain("offline-section-title");
    expect(folderHtml).toContain("assets/app.js");
    const packageZip = await createZip(filesToEntries(folder.files));
    expect(packageZip.length).toBeGreaterThan(0);

    const root = new MemoryElement("div");
    const payloadNode = new MemoryElement("script");
    payloadNode.textContent = JSON.stringify(payload);
    const doc = {
      title: "",
      getElementById: (id: string) => id === "cf-root" ? root : id === "cf-payload" ? payloadNode : null,
      createElement: (tag: string) => new MemoryElement(tag),
      addEventListener: () => undefined,
    };
    const windowStub: Record<string, any> = {
      innerWidth: 1920, innerHeight: 1080, location: { search: "" }, matchMedia: () => ({ matches: true }),
      addEventListener: () => undefined, setInterval: () => 1, clearInterval: () => undefined,
      echarts: { registerMap: () => undefined, init: () => ({ setOption: () => undefined, resize: () => undefined, dispose: () => undefined }) },
    };
    const { runInNewContext } = await import("node:vm");
    runInNewContext(RUNTIME_CODE, { document: doc, window: windowStub });
    expect(findItem(root, panel.id)?.className).toContain("cf-shape");
    expect(findItem(root, panel.id)?.style.background).toBe("#0d2234");
    expect(findItem(root, title.id)?.textContent).toContain("主视区");
    expect(findItem(root, title.id)?.attributes["data-component"]).toBe("chartforge.section-title");
    expect(findItem(root, corner.id)?.className).toContain("cf-component");
    expect(findItem(root, corner.id)?.attributes["data-component"]).toBe("chartforge.corner-frame");
  });

  it("renders extended text styling and a built-in SVG background in offline output", async () => {
    const workspace = createWorkspace();
    const screen = createScreen("离线文字与背景");
    screen.canvas.background = getBuiltInBackgroundPreset("blueprint-grid")!;
    screen.items.push({
      id: "styled-text",
      name: "标题",
      kind: "text",
      frame: { x: 40, y: 30, w: 420, h: 90, rotate: 0 },
      text: "运营总览",
      fontFamily: "Microsoft YaHei",
      fontSize: 32,
      color: "#e9f7ff",
      align: "center",
      weight: "600",
      fontStyle: "italic",
      verticalAlign: "middle",
      lineHeight: 1.5,
      letterSpacing: 2,
      overflow: "ellipsis",
      lineClamp: 2,
      backgroundColor: "#10263b",
      padding: 8,
      radius: 6,
      borderColor: "#29d3ff",
      borderWidth: 1,
      shadow: { color: "#29d3ff", blur: 8, offsetX: 0, offsetY: 2 },
    } as TextItem);
    workspace.screens.push(screen);
    const payload = buildPackagePayload(workspace, [screen.id]);
    const root = new MemoryElement("div");
    const payloadNode = new MemoryElement("script"); payloadNode.textContent = JSON.stringify(payload);
    const doc = {
      title: "",
      getElementById: (id: string) => id === "cf-root" ? root : id === "cf-payload" ? payloadNode : null,
      createElement: (tag: string) => new MemoryElement(tag),
      addEventListener: () => undefined,
    };
    const windowStub: Record<string, any> = {
      innerWidth: 1920, innerHeight: 1080, location: { search: "" }, matchMedia: () => ({ matches: true }),
      addEventListener: () => undefined, setInterval: () => 1, clearInterval: () => undefined,
      echarts: { registerMap: () => undefined, init: () => ({ setOption: () => undefined, resize: () => undefined, dispose: () => undefined }) },
    };
    const { runInNewContext } = await import("node:vm");
    runInNewContext(RUNTIME_CODE, { document: doc, window: windowStub });
    const text = findItem(root, "styled-text")!;
    const textSpan = collectElements(text).find((element) => element.tagName.toLowerCase() === "span")!;
    const stage = collectElements(root).find((element) => element.className.includes("cf-stage"));
    expect(text.textContent).toContain("运营总览");
    expect(textSpan.style.fontFamily).toBe("Microsoft YaHei");
    expect(textSpan.style.fontWeight).toBe("600");
    expect(textSpan.style.textShadow).toBe("0px 2px 8px #29d3ff");
    expect(textSpan.style.webkitLineClamp).toBe("2");
    expect(stage?.style.backgroundImage).toContain("data:image/svg+xml;base64,");
  });

  it("renders sample rows for unbound data widgets in offline output", async () => {
    const workspace = createWorkspace();
    const screen = createScreen("未绑定数据组件示例");
    screen.items.push(
      { id: "sample-table", name: "示例表格", kind: "component", componentId: "chartforge.data-table", componentVersion: 1, frame: { x: 0, y: 0, w: 300, h: 180, rotate: 0 }, props: { columns: [{ field: "name", label: "名称", format: "text" }, { field: "value", label: "数值", format: "number" }] } } as ComponentItem,
      { id: "sample-kpi", name: "示例指标", kind: "component", componentId: "chartforge.kpi", componentVersion: 1, frame: { x: 320, y: 0, w: 240, h: 150, rotate: 0 }, props: { valueField: "value", label: "本月营收", format: "number", aggregation: "sum" } } as ComponentItem,
      { id: "sample-progress", name: "示例进度", kind: "component", componentId: "chartforge.progress-list", componentVersion: 1, frame: { x: 580, y: 0, w: 300, h: 200, rotate: 0 }, props: { labelField: "name", valueField: "value", maxValue: 100, showValue: true } } as ComponentItem,
    );
    workspace.screens.push(screen);
    const payload = buildPackagePayload(workspace, [screen.id]);
    const root = new MemoryElement("div");
    const payloadNode = new MemoryElement("script"); payloadNode.textContent = JSON.stringify(payload);
    const doc = {
      title: "",
      getElementById: (id: string) => id === "cf-root" ? root : id === "cf-payload" ? payloadNode : null,
      createElement: (tag: string) => new MemoryElement(tag),
      addEventListener: () => undefined,
    };
    const windowStub: Record<string, any> = {
      innerWidth: 1920, innerHeight: 1080, location: { search: "" }, matchMedia: () => ({ matches: true }),
      addEventListener: () => undefined, setInterval: () => 1, clearInterval: () => undefined,
      echarts: { registerMap: () => undefined, init: () => ({ setOption: () => undefined, resize: () => undefined, dispose: () => undefined }) },
    };
    const { runInNewContext } = await import("node:vm");
    runInNewContext(RUNTIME_CODE, { document: doc, window: windowStub });
    expect(findItem(root, "sample-table")?.textContent).toContain("华东区");
    expect(findItem(root, "sample-table")?.textContent).toContain("1,280");
    expect(findItem(root, "sample-kpi")?.textContent).toContain("1,280");
    expect(findItem(root, "sample-progress")?.textContent).toContain("西南区");
    expect(findItem(root, "sample-progress")?.textContent).toContain("93");
    expect(findItem(root, "sample-kpi")?.textContent).toContain("示例数据");
  });
});
