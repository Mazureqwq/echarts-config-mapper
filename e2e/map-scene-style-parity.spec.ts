import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "chartforge.workspace.v1";
const SCREEN_ID = "map-style-parity-screen";
const ITEM_ID = "map-style-parity-scene";
const DATASET_ID = "map-style-parity-dataset";

const rows = [
  { province: "广东省", score: 92 },
  { province: "西藏自治区", score: 31 },
  { province: "浙江省", score: 78 },
];

const initialWorkspace = {
  version: 2,
  assets: [],
  designAssets: [],
  screens: [{
    id: SCREEN_ID,
    name: "色带图例奇偶校验",
    canvas: { width: 1280, height: 720, background: { kind: "color", color: "#050b12" } },
    items: [{
      id: ITEM_ID,
      name: "色带地图",
      kind: "component",
      componentId: "chartforge.map-scene-tilted",
      componentVersion: 1,
      frame: { x: 60, y: 50, w: 900, h: 560, rotate: 0 },
      dataBinding: { datasetId: DATASET_ID, fields: { category: "province", value: "score" } },
      props: {
        presentation: "tilted",
        pitch: 28,
        valueFormat: { decimals: 0, suffix: " 分" },
        legend: { show: true, position: "top-right", mode: "continuous" },
        label: { show: true, color: "#eaffff", size: 13, stroke: "#010133", strokeWidth: 2, shadow: "#00ffff", shadowBlur: 6 },
        border: { color: "#8888ff", width: 2, type: "dashed" },
        emphasis: { areaColor: "#ff0000", borderColor: "#00ff00", labelColor: "#ffffff" },
        selected: { areaColor: "#00ffff", borderColor: "#ffffff" },
        tooltipStyle: { background: "#101820", borderColor: "#334455", color: "#ffffff", fontSize: 13 },
        view: { center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8, dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622" },
        layers: [{
          id: "fill",
          type: "regionFill",
          name: "热度",
          visible: true,
          style: {
            color: "#32d6ff", opacity: 0.85, size: 12, colorMode: "gradient",
            colors: { min: "#000010", mid: "#0080ff", max: "#66ffff", empty: "#0a0a14" },
            border: { color: "#aabbcc", width: 2, type: "dashed" },
          },
        },
        {
          id: "pts-scatter",
          type: "geoScatter",
          name: "网点",
          visible: true,
          style: { color: "#ffcc66", opacity: 1, size: 12, label: { show: true, color: "#ffffff", size: 12, stroke: "#000000" } },
          dataBinding: { datasetId: "pts", fields: { geo: { longitude: "lng", latitude: "lat", name: "city" } } },
        },
        {
          id: "flow",
          type: "geoFlow",
          name: "航线",
          visible: true,
          style: { color: "#32d6ff", opacity: 1, size: 8, animated: true },
          dataBinding: { datasetId: "pts", fields: { geo: { originLongitude: "lng", originLatitude: "lat", destinationLongitude: "lng2", destinationLatitude: "lat2" } } },
        }],
      },
    }],
    updatedAt: Date.now(),
  }],
  datasets: [
    { id: DATASET_ID, name: "省级热度", source: { kind: "static", data: rows }, pipeline: { filter: [] } },
    { id: "pts", name: "点线数据", source: { kind: "static", data: [{ city: "广州", lng: 113.26, lat: 23.13, lng2: 114.17, lat2: 22.31 }] }, pipeline: { filter: [] } },
  ],
  settings: { autosave: true },
};

async function readWorkbenchStyle(page: Page) {
  return page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    if (!map) return null;
    const style: any = map.getStyle();
    const fill = (style?.layers ?? []).find((l: any) => l.id === "cf-fill");
    const line = (style?.layers ?? []).find((l: any) => l.id === "cf-line");
    return {
      version: style?.version ?? null,
      pitch: style?.pitch ?? null,
      center: style?.center ?? null,
      zoom: style?.zoom ?? null,
      minZoom: style?.minZoom ?? null,
      maxZoom: style?.maxZoom ?? null,
      promoteId: style?.sources?.china?.promoteId ?? null,
      skyColor: style?.sky?.["sky-color"] ?? null,
      lightIntensity: style?.light?.intensity ?? null,
      fillPaint: fill
        ? {
            color: fill.paint["fill-color"],
            opacity: fill.paint["fill-opacity"],
            outline: fill.paint["fill-outline-color"],
            minzoom: fill.minzoom ?? null,
            maxzoom: fill.maxzoom ?? null,
          }
        : null,
      linePaint: line
        ? { color: line.paint["line-color"], width: line.paint["line-width"], dash: line.paint["line-dasharray"] ?? null }
        : null,
    };
  });
}

test("MapLibre style（色带 match/边线/状态色/相机/光照雾化）双端一致", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
  await expect(page.locator(".map-scene__chart")).toBeVisible();
  await expect.poll(async () => (await readWorkbenchStyle(page))?.fillPaint != null).toBe(true);

  const workbench = await readWorkbenchStyle(page);
  expect(workbench?.version).toBe(8);
  expect(workbench?.pitch).toBe(28);
  expect(workbench?.promoteId).toBe("name");
  expect(workbench?.skyColor).toBe("#0a1628");
  expect((workbench?.lightIntensity as number) ?? 0).toBeGreaterThan(0);
  expect(workbench?.fillPaint).toMatchObject({ opacity: 0.85, outline: "#8888ff", minzoom: null, maxzoom: null });
  expect(workbench?.linePaint).toEqual({ color: "#8888ff", width: 2, dash: [2, 2] });
  const fillColorJson = JSON.stringify(workbench?.fillPaint?.color);
  expect(fillColorJson).toContain("广东省");
  expect(fillColorJson).toContain("西藏自治区");
  expect(fillColorJson).toContain("#0a0a14");
  expect(fillColorJson).toContain("feature-state");

  const workspace = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), STORAGE_KEY);
  const offlineBuild = await page.evaluate(async ({ workspace, screenId }) => {
    const snapshotUrl = new URL("/src/core/export/snapshot.ts", location.href).href;
    const artifactUrl = new URL("/src/core/export/artifact.ts", location.href).href;
    const runtimeUrl = new URL("/src/core/export/runtime.ts", location.href).href;
    const assetsUrl = new URL("/src/core/export/assets.ts", location.href).href;
    const [snapshotModule, artifactModule, runtimeModule, assetsModule] = await Promise.all([
      import(snapshotUrl), import(artifactUrl), import(runtimeUrl), import(assetsUrl),
    ]);
    const [maplibreCode, maplibreWorkerCode] = await Promise.all([
      assetsModule.loadMaplibreSource(),
      assetsModule.loadMaplibreWorkerSource(),
    ]);
    const payload = assetsModule.attachGeo(snapshotModule.buildPackagePayload(workspace, [screenId]));
    const echartsCode = `(function(){window.echarts={registerMap:function(){},init:function(){return{setOption:function(){},resize:function(){},dispose:function(){}};}};})();`;
    const artifact = await artifactModule.buildArtifact({
      payload,
      echartsCode,
      maplibreCode,
      maplibreWorkerCode,
      runtimeCode: runtimeModule.RUNTIME_CODE,
      mode: "inline",
      now: () => 1794280000000,
    });
    return { html: artifact.files.find((file: { path: string }) => file.path === "index.html")?.content ?? "" };
  }, { workspace, screenId: SCREEN_ID });

  const offlinePage = await context.newPage();
  offlinePage.on("console", (m) => { if (m.type() === "error") console.log("OFFLINE_CONSOLE " + m.text().slice(0, 500)); });
  offlinePage.on("pageerror", (e) => console.log("OFFLINE_PAGEERROR " + String(e).slice(0, 500)));
  await offlinePage.setContent(offlineBuild.html);
  await offlinePage.waitForSelector(".maplibregl-canvas", { timeout: 25000 });
  await offlinePage.waitForTimeout(8000);
  const dump = await offlinePage.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll(".maplibregl-canvas"));
    const items = Array.from(document.querySelectorAll("[data-item]")).map((el) => ({
      cls: (el as HTMLElement).className.slice(0, 60),
      hasMap: Boolean((el as any).__cfMap),
      childIsCanvas: Boolean(el.querySelector(".maplibregl-canvas")),
    }));
    const s = document.querySelector(".cf-map-scene__status");
    return { canvasCount: canvases.length, canvasParents: canvases.map((c) => ({ parentCls: (c.parentElement as HTMLElement)?.className?.slice(0, 60), parentHasMap: Boolean((c.parentElement as any)?.__cfMap) })), items, status: s ? s.textContent : null };
  });
  console.log("PARITY_DUMP " + JSON.stringify(dump));
  await offlinePage.waitForFunction(() => {
    const hosts = document.querySelectorAll("[data-item]");
    for (const el of hosts) {
      if ((el as any).__cfMap) return true;
    }
    return false;
  }, null, { timeout: 15000 });
  const offline = await offlinePage.evaluate(() => {
    let map: any = null;
    document.querySelectorAll("[data-item]").forEach((el) => { if ((el as any).__cfMap && !map) map = (el as any).__cfMap; });
    if (!map) return null;
    const style: any = map.getStyle();
    const fill = (style?.layers ?? []).find((l: any) => l.id === "cf-fill");
    const line = (style?.layers ?? []).find((l: any) => l.id === "cf-line");
    return {
      version: style?.version ?? null,
      pitch: style?.pitch ?? null,
      center: style?.center ?? null,
      zoom: style?.zoom ?? null,
      minZoom: style?.minZoom ?? null,
      maxZoom: style?.maxZoom ?? null,
      promoteId: style?.sources?.china?.promoteId ?? null,
      skyColor: style?.sky?.["sky-color"] ?? null,
      lightIntensity: style?.light?.intensity ?? null,
      fillPaint: fill
        ? {
            color: fill.paint["fill-color"],
            opacity: fill.paint["fill-opacity"],
            outline: fill.paint["fill-outline-color"],
            minzoom: fill.minzoom ?? null,
            maxzoom: fill.maxzoom ?? null,
          }
        : null,
      linePaint: line
        ? { color: line.paint["line-color"], width: line.paint["line-width"], dash: line.paint["line-dasharray"] ?? null }
        : null,
    };
  });
  expect(offline).toEqual(workbench);
  await offlinePage.close();
});

test.fixme("图层样式（散点/飞线）双端一致（T7 恢复）", async () => {
  // scatter/heat/flow 的 MapLibre 渲染排入 T7（台账裁决）
});

test.fixme("图例/tooltip/标注覆盖层双端一致（T7 恢复）", async () => {
  // 图例与 tooltip 在 T7 于双端重建后恢复本断言
});
