import { describe, it, expect } from "vitest";
import { buildArtifact } from "../src/core/export/artifact";
import { buildPackagePayload } from "../src/core/export/snapshot";
import { RUNTIME_CODE } from "../src/core/export/runtime";
import { createZip, filesToEntries } from "../src/core/export/zip";
import { createWorkspace, createScreen, createChartSpec } from "../src/core/model/schema";
import type { ChartItem, ComponentItem, ImageItem } from "../src/core/model/types";
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
});
