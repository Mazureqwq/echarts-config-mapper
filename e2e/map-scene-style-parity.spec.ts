import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "chartforge.workspace.v1";
const SCREEN_ID = "map-style-parity-screen";
const ITEM_ID = "map-style-parity-scene";
const DATASET_ID = "map-style-parity-dataset";

const T8_SCREEN_ID = "map-style-parity-t8-screen";
const T8_ITEM_ID = "map-style-parity-t8-scene";
const T8_DATASET_ID = "map-style-parity-t8-dataset";

const LEGEND_SCREEN_ID = "map-legend-parity-screen";
const LEGEND_ITEM_ID = "map-legend-parity-scene";
const LEGEND_DATASET_ID = "map-legend-parity-dataset";

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

/** T7：图例 / tooltip / 悬停点击态的工作台夹具（平面地图，坐标系与交互 spec 一致） */
const legendWorkspace = {
  version: 2,
  assets: [],
  designAssets: [],
  screens: [{
    id: LEGEND_SCREEN_ID,
    name: "图例交互双端校验",
    canvas: { width: 1280, height: 720, background: { kind: "color", color: "#12161d" } },
    items: [{
      id: LEGEND_ITEM_ID,
      name: "图例地图",
      kind: "component",
      componentId: "chartforge.map-scene-flat",
      componentVersion: 1,
      frame: { x: 60, y: 60, w: 760, h: 520, rotate: 0 },
      dataBinding: { datasetId: LEGEND_DATASET_ID, fields: { category: "province", value: "score" } },
      props: {
        presentation: "flat",
        pitch: 0,
        valueFormat: { decimals: 0, suffix: " 分" },
        legend: { show: true, position: "top-right", mode: "continuous" },
        border: { color: "#8888ff", width: 2, type: "dashed" },
        emphasis: { areaColor: "#ff0000", borderColor: "#00ff00", labelColor: "#ffffff" },
        selected: { areaColor: "#00ffff", borderColor: "#ffffff" },
        tooltipStyle: { background: "#101820", borderColor: "#334455", color: "#ffffff", fontSize: 13 },
        layers: [{
          id: "fill",
          type: "regionFill",
          name: "热度",
          visible: true,
          style: {
            color: "#32d6ff", opacity: 0.85, size: 12, colorMode: "gradient",
            colors: { min: "#000010", mid: "#0080ff", max: "#66ffff", empty: "#0a0a14" },
          },
        }],
      },
    }],
    updatedAt: Date.now(),
  }],
  datasets: [
    { id: LEGEND_DATASET_ID, name: "省级热度", source: { kind: "static", data: rows }, pipeline: { filter: [] } },
  ],
  settings: { autosave: true },
};

const REGION_POINT: [number, number] = [120.1551, 30.2741];
const REGION_NAME = "浙江省";

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

async function readWorkbenchScene(page: Page) {
  return page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const scene = vueInstance?.exposed?.readAppearance?.();
    if (!scene) return null;
    return { legend: scene.legend, tooltip: scene.tooltip, hover: scene.hover, selected: scene.selected };
  });
}

async function readWorkbenchFeatureState(page: Page, id: string) {
  return page.locator(".map-scene__chart").evaluate((root, featureId) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    if (!map) return null;
    return map.getFeatureState({ source: "china", id: featureId });
  }, id);
}

/** 等待工作台地图完成加载与镜头归位（fitBounds 结束后投影才准确） */
async function waitForMapReady(page: Page) {
  await expect.poll(async () => page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    if (!map) return false;
    return Boolean(map.loaded && map.loaded() && !map.isMoving());
  }), { timeout: 25000 }).toBe(true);
}

/** 工作台端：把经纬度投影到页面坐标（按画布 CSS 缩放换算） */
async function projectWorkbenchPoint(page: Page, coords: [number, number]) {
  const data = await page.locator(".map-scene__chart").evaluate((root, target) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    if (!map) return null;
    const point = map.project(target);
    const canvas = map.getCanvas();
    return { px: point.x, py: point.y, cw: canvas.clientWidth, ch: canvas.clientHeight };
  }, coords);
  expect(data).not.toBeNull();
  const box = await page.locator(".map-scene__chart canvas").boundingBox();
  expect(box).not.toBeNull();
  const scaleX = box!.width / (data!.cw || 1);
  const scaleY = box!.height / (data!.ch || 1);
  return { x: box!.x + data!.px * scaleX, y: box!.y + data!.py * scaleY };
}

/** 离线端：读取 __cfMap 上的场景数据 */
async function readOfflineScene(page: Page) {
  return page.evaluate(() => {
    let host: any = null;
    document.querySelectorAll("[data-item]").forEach((el) => { if ((el as any).__cfMap && !host) host = el; });
    return host ? host.__cfScene : null;
  });
}

async function readOfflineFeatureState(page: Page, id: string) {
  return page.evaluate((featureId) => {
    let map: any = null;
    document.querySelectorAll("[data-item]").forEach((el) => { if ((el as any).__cfMap && !map) map = (el as any).__cfMap; });
    if (!map) return null;
    return map.getFeatureState({ source: "china", id: featureId });
  }, id);
}

async function projectOfflinePoint(page: Page, coords: [number, number]) {
  const data = await page.evaluate((target) => {
    let map: any = null;
    document.querySelectorAll("[data-item]").forEach((el) => { if ((el as any).__cfMap && !map) map = (el as any).__cfMap; });
    if (!map) return null;
    const point = map.project(target);
    const canvas = map.getCanvas();
    const rect = canvas.getBoundingClientRect();
    return { px: point.x, py: point.y, cw: canvas.clientWidth, ch: canvas.clientHeight, rx: rect.left, ry: rect.top, rw: rect.width, rh: rect.height };
  }, coords);
  expect(data).not.toBeNull();
  const scaleX = data!.rw / (data!.cw || 1);
  const scaleY = data!.rh / (data!.ch || 1);
  return { x: data!.rx + data!.px * scaleX, y: data!.ry + data!.py * scaleY };
}

async function buildOfflineHtml(page: Page, screenId: string) {
  const workspace = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), STORAGE_KEY);
  return page.evaluate(async ({ workspace, screenId }) => {
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
    return artifact.files.find((file: { path: string }) => file.path === "index.html")?.content ?? "";
  }, { workspace, screenId });
}

async function openOffline(page: Page, context: any, screenId: string) {
  const html = await buildOfflineHtml(page, screenId);
  const offlinePage = await context.newPage();
  offlinePage.on("console", (m) => { if (m.type() === "error") console.log("OFFLINE_CONSOLE " + m.text().slice(0, 500)); });
  offlinePage.on("pageerror", (e) => console.log("OFFLINE_PAGEERROR " + String(e).slice(0, 500)));
  await offlinePage.setContent(html);
  await offlinePage.waitForSelector(".maplibregl-canvas", { timeout: 25000 });
  await offlinePage.waitForFunction(() => {
    let map: any = null;
    document.querySelectorAll("[data-item]").forEach((el) => { if ((el as any).__cfMap && !map) map = (el as any).__cfMap; });
    return Boolean(map && typeof map.loaded === "function" && map.loaded() && !map.isMoving());
  }, null, { timeout: 25000 });
  return offlinePage;
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
  expect(workbench?.linePaint?.width).toBe(2);
  expect(workbench?.linePaint?.dash).toEqual([2, 2]);
  const lineColorJson = JSON.stringify(workbench?.linePaint?.color);
  expect(lineColorJson).toContain("#8888ff");
  expect(lineColorJson).toContain("cf_hover");
  expect(lineColorJson).toContain("cf_selected");
  const fillColorJson = JSON.stringify(workbench?.fillPaint?.color);
  expect(fillColorJson).toContain("广东省");
  expect(fillColorJson).toContain("西藏自治区");
  expect(fillColorJson).toContain("#0a0a14");
  expect(fillColorJson).toContain("feature-state");

  const offlinePage = await openOffline(page, context, SCREEN_ID);
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

test("图例 / tooltip / 悬停与点击态双端一致（T7）", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: legendWorkspace });

  await page.goto(`/#/workbench/${LEGEND_SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
  await expect(page.locator(".map-scene__chart")).toBeVisible();
  await expect.poll(async () => (await readWorkbenchStyle(page))?.fillPaint != null).toBe(true);
  await waitForMapReady(page);

  // —— 工作台端：图例与 tooltip 数据 ——
  const workbenchScene = await readWorkbenchScene(page);
  expect(workbenchScene).not.toBeNull();
  expect(workbenchScene!.legend).toEqual({
    show: true,
    position: "top-right",
    mode: "continuous",
    entries: [{ from: "31 分", to: "92 分", stops: ["#000010", "#0080ff", "#66ffff"] }],
  });
  expect(workbenchScene!.tooltip.texts["广东省"]).toBe("广东省：92 分");
  expect(workbenchScene!.tooltip.texts["西藏自治区"]).toBe("西藏自治区：31 分");
  expect(workbenchScene!.tooltip.texts[REGION_NAME]).toBe("浙江省：78 分");

  const workbenchLegendText = await page.locator(".map-scene__legend").innerText();
  expect(workbenchLegendText.replace(/\s+/g, "")).toContain("31分–92分");

  // —— 工作台端：悬停 → tooltip + cf_hover feature-state ——
  const wbPoint = await projectWorkbenchPoint(page, REGION_POINT);
  await page.mouse.move(wbPoint.x - 6, wbPoint.y - 6);
  await page.mouse.move(wbPoint.x, wbPoint.y);
  await expect(page.locator(".map-scene__tooltip")).toBeVisible();
  const workbenchTooltipText = await page.locator(".map-scene__tooltip").innerText();
  expect(workbenchTooltipText).toBe("浙江省：78 分");
  expect((await readWorkbenchScene(page))?.hover).toBe(REGION_NAME);
  expect((await readWorkbenchFeatureState(page, REGION_NAME))?.cf_hover).toBe(true);

  // —— 工作台端：点击 → cf_selected feature-state ——
  await page.mouse.click(wbPoint.x, wbPoint.y);
  expect((await readWorkbenchScene(page))?.selected).toBe(REGION_NAME);
  expect((await readWorkbenchFeatureState(page, REGION_NAME))?.cf_selected).toBe(true);

  // —— 离线端 ——
  const offlinePage = await openOffline(page, context, LEGEND_SCREEN_ID);
  const offlineScene = await readOfflineScene(offlinePage);
  expect(offlineScene).not.toBeNull();
  expect(offlineScene!.legend).toEqual(workbenchScene!.legend);
  expect(offlineScene!.tooltip).toEqual(workbenchScene!.tooltip);

  const offlineLegendText = await offlinePage.locator(".cf-map-legend").innerText();
  expect(offlineLegendText.replace(/\s+/g, "")).toBe(workbenchLegendText.replace(/\s+/g, ""));

  const offPoint = await projectOfflinePoint(offlinePage, REGION_POINT);
  await offlinePage.mouse.move(offPoint.x - 6, offPoint.y - 6);
  await offlinePage.mouse.move(offPoint.x, offPoint.y);
  await expect(offlinePage.locator(".cf-map-tooltip")).toBeVisible();
  const offlineTooltipText = await offlinePage.locator(".cf-map-tooltip").innerText();
  expect(offlineTooltipText).toBe(workbenchTooltipText);
  expect((await readOfflineFeatureState(offlinePage, REGION_NAME))?.cf_hover).toBe(true);

  await offlinePage.mouse.click(offPoint.x, offPoint.y);
  expect((await readOfflineFeatureState(offlinePage, REGION_NAME))?.cf_selected).toBe(true);

  await offlinePage.close();
});

/** T8 视觉质感双端夹具：外轮廓强化 + 比例尺 + 视图偏移 + 标注缩放阈值 */
const t8Workspace = {
  version: 2,
  assets: [],
  designAssets: [],
  screens: [{
    id: T8_SCREEN_ID,
    name: "M3 视觉质感双端校验",
    canvas: { width: 1280, height: 720, background: { kind: "color", color: "#12161d" } },
    items: [{
      id: T8_ITEM_ID,
      name: "质感地图",
      kind: "component",
      componentId: "chartforge.map-scene-flat",
      componentVersion: 1,
      frame: { x: 60, y: 60, w: 760, h: 520, rotate: 0 },
      dataBinding: { datasetId: T8_DATASET_ID, fields: { category: "province", value: "score" } },
      props: {
        presentation: "flat",
        pitch: 0,
        legend: { show: true, position: "top-right", mode: "continuous" },
        scaleBar: { show: true, position: "bottom-left" },
        label: { show: true, color: "#eaffff", size: 12, minZoom: 3 },
        border: { color: "#8888ff", width: 2, type: "solid", outline: { show: true, color: "#ffd166", width: 3 } },
        view: { center: [110, 30], zoom: 4, minZoom: 1, maxZoom: 8, dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622", offset: { x: 8, y: -6 } },
        layers: [{
          id: "fill",
          type: "regionFill",
          name: "热度",
          visible: true,
          style: { color: "#32d6ff", opacity: 0.85, size: 12, colorMode: "gradient", colors: { min: "#000010", mid: "#0080ff", max: "#66ffff", empty: "#0a0a14" } },
        }],
      },
    }],
    updatedAt: Date.now(),
  }],
  datasets: [{ id: T8_DATASET_ID, name: "省级热度", source: { kind: "static", data: rows }, pipeline: { filter: [] } }],
  settings: { autosave: true },
};

test("M3 视觉质感（外轮廓/比例尺/视图偏移/标注）双端一致（T8）", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: t8Workspace });

  await page.goto(`/#/workbench/${T8_SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
  await expect(page.locator(".map-scene__chart")).toBeVisible();
  await expect.poll(async () => (await page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    return Boolean(vueInstance?.exposed?.getMap?.()?.getStyle?.());
  }))).toBe(true);
  await waitForMapReady(page);

  const workbench = await page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    if (!map) return null;
    const style: any = map.getStyle();
    const layers = style?.layers ?? [];
    const fill = layers.find((l: any) => l.id === "cf-fill");
    const line = layers.find((l: any) => l.id === "cf-line");
    const outline = layers.find((l: any) => l.id === "cf-outline");
    const glow = layers.find((l: any) => l.id === "cf-outline-glow");
    const outlineSource = (style?.sources as any)?.["china-outline"];
    const center = map.getCenter();
    const canvas = map.getCanvas();
    const zoom = map.getZoom();
    const worldSize = 512 * Math.pow(2, zoom);
    const degPerPixelLng = 360 / worldSize;
    return {
      outlineColor: outline?.paint?.["line-color"] ?? null,
      outlineWidth: outline?.paint?.["line-width"] ?? null,
      outlineSourceType: outlineSource?.type ?? null,
      outlineRingCount: (outlineSource?.data?.features?.[0]?.geometry?.coordinates ?? []).length,
      outlineMainlandPoints: Math.max(
        0,
        ...(outlineSource?.data?.features?.[0]?.geometry?.coordinates ?? []).map((ring: any[]) => ring.length),
      ),
      glowWidth: glow?.paint?.["line-width"] ?? null,
      containerWidth: canvas?.clientWidth ?? 0,
      cameraLng: center?.lng ?? null,
      cameraLat: center?.lat ?? null,
      zoom,
      lngShiftRatio: (110 - (center?.lng ?? 110)) / degPerPixelLng / (canvas?.clientWidth || 1),
    };
  });
  expect(workbench).not.toBeNull();
  // 构建期 style JSON 双端一致（含悬停过渡与外轮廓图层）
  const workbenchStyle = await page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    return vueInstance?.exposed?.getStyle?.() ?? null;
  });
  expect(workbenchStyle).not.toBeNull();
  const workbenchLayers = (workbenchStyle as any).layers as any[];
  expect(workbenchLayers.find((layer) => layer.id === "cf-fill")?.["fill-color-transition"]).toEqual({ duration: 180, delay: 0 });
  expect(workbenchLayers.find((layer) => layer.id === "cf-line")?.["line-color-transition"]).toEqual({ duration: 180, delay: 0 });
  expect(workbenchLayers.find((layer) => layer.id === "cf-outline")?.paint?.["line-color"]).toBe("#ffd166");
  expect(workbenchLayers.find((layer) => layer.id === "cf-outline-glow")?.paint?.["line-width"]).toBe(9);
  expect(workbench!.outlineColor).toBe("#ffd166");
  expect(workbench!.outlineWidth).toBe(3);
  expect(workbench!.outlineSourceType).toBe("geojson");
  // 精确外环：大陆（含海南）与台湾两条；行政区缝隙不产生独立外环
  expect(workbench!.outlineRingCount).toBe(2);
  expect(workbench!.outlineMainlandPoints).toBeGreaterThan(500);
  // 视图偏移：内容右移 8%（相机西移），容器相对比例双端一致
  expect(workbench!.lngShiftRatio).toBeCloseTo(0.08, 3);
  const workbenchScale = (await page.locator(".map-scene__scalebar-text").innerText()).trim();
  expect(workbenchScale).toMatch(/^\d+(\.\d+)? (m|km)$/);
  expect(await page.locator(".map-scene__label").count()).toBeGreaterThan(0);

  const offlinePage = await openOffline(page, context, T8_SCREEN_ID);
  const offline = await offlinePage.evaluate(() => {
    let host: any = null;
    document.querySelectorAll("[data-item]").forEach((el) => { if ((el as any).__cfMap && !host) host = el; });
    if (!host) return null;
    const map = host.__cfMap;
    const style: any = map.getStyle();
    const layers = style?.layers ?? [];
    const fill = layers.find((l: any) => l.id === "cf-fill");
    const line = layers.find((l: any) => l.id === "cf-line");
    const outline = layers.find((l: any) => l.id === "cf-outline");
    const glow = layers.find((l: any) => l.id === "cf-outline-glow");
    const outlineSource = (style?.sources as any)?.["china-outline"];
    const center = map.getCenter();
    const canvas = map.getCanvas();
    const zoom = map.getZoom();
    const worldSize = 512 * Math.pow(2, zoom);
    const degPerPixelLng = 360 / worldSize;
    return {
      outlineColor: outline?.paint?.["line-color"] ?? null,
      outlineWidth: outline?.paint?.["line-width"] ?? null,
      outlineSourceType: outlineSource?.type ?? null,
      outlineRingCount: (outlineSource?.data?.features?.[0]?.geometry?.coordinates ?? []).length,
      outlineMainlandPoints: Math.max(
        0,
        ...(outlineSource?.data?.features?.[0]?.geometry?.coordinates ?? []).map((ring: any[]) => ring.length),
      ),
      glowWidth: glow?.paint?.["line-width"] ?? null,
      containerWidth: canvas?.clientWidth ?? 0,
      cameraLng: center?.lng ?? null,
      cameraLat: center?.lat ?? null,
      zoom,
      lngShiftRatio: (110 - (center?.lng ?? 110)) / degPerPixelLng / (canvas?.clientWidth || 1),
    };
  });
  expect(offline).not.toBeNull();
  const offlineStyle = await offlinePage.evaluate(() => {
    let host: any = null;
    document.querySelectorAll("[data-item]").forEach((el) => { if ((el as any).__cfStyle && !host) host = el; });
    return host ? host.__cfStyle : null;
  });
  expect(offlineStyle).not.toBeNull();
  const offlineLayers = (offlineStyle as any).layers as any[];
  expect(offlineLayers.find((layer) => layer.id === "cf-fill")?.["fill-color-transition"]).toEqual({ duration: 180, delay: 0 });
  expect(offlineLayers.find((layer) => layer.id === "cf-line")?.["line-color-transition"]).toEqual({ duration: 180, delay: 0 });
  expect(offlineLayers.find((layer) => layer.id === "cf-outline")?.paint?.["line-color"]).toBe("#ffd166");
  expect(offlineLayers.find((layer) => layer.id === "cf-outline-glow")?.paint?.["line-width"]).toBe(9);
  expect(offline!.outlineColor).toBe(workbench!.outlineColor);
  expect(offline!.outlineWidth).toBe(workbench!.outlineWidth);
  expect(offline!.outlineSourceType).toBe(workbench!.outlineSourceType);
  expect(offline!.outlineRingCount).toBe(workbench!.outlineRingCount);
  expect(offline!.outlineMainlandPoints).toBe(workbench!.outlineMainlandPoints);
  expect(offline!.glowWidth).toBe(workbench!.glowWidth);
  expect(offline!.lngShiftRatio).toBeCloseTo(workbench!.lngShiftRatio, 3);
  const offlineScale = (await offlinePage.locator(".cf-map-scalebar-text").innerText()).trim();
  expect(offlineScale).toBe(workbenchScale);
  expect(await offlinePage.locator(".cf-map-label").count()).toBeGreaterThan(0);

  await offlinePage.close();
});
