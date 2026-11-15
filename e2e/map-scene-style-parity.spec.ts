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
        },
        {
          id: "heat",
          type: "geoHeatmap",
          name: "热力",
          visible: true,
          // size=6 → 旧 ECharts 的 pointSize=6、blurSize=max(6,12)=12 → MapLibre 半径 12、blur 0.5
          style: { color: "#ff6b6b", opacity: 0.9, size: 6 },
          dataBinding: { datasetId: "heatPts", fields: { geo: { longitude: "lng", latitude: "lat", value: "score" } } },
        }],
      },
    }],
    updatedAt: Date.now(),
  }],
  datasets: [
    { id: DATASET_ID, name: "省级热度", source: { kind: "static", data: rows }, pipeline: { filter: [] } },
    { id: "pts", name: "点线数据", source: { kind: "static", data: [{ city: "广州", lng: 113.26, lat: 23.13, lng2: 114.17, lat2: 22.31, score: 42 }] }, pipeline: { filter: [] } },
    { id: "heatPts", name: "热力点", source: { kind: "static", data: [{ lng: 113.26, lat: 23.13, score: 20 }, { lng: 114.17, lat: 22.31, score: 80 }] }, pipeline: { filter: [] } },
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
    // T13-a：飞线流动拖尾逐帧改写 paint 属性，MapLibre 会持续把 source 标记为 reload，
    // map.loaded() / isStyleLoaded() 因此永远为 false；
    // 改用「样式已解析完成（style._loaded）+ 相机未移动」判定就绪。
    return Boolean(map && map.style && map.style._loaded === true && !map.isMoving());
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

/**
 * 等到目标经纬度上真的能查询到 `cf-fill` 要素再移动鼠标。
 *
 * `style._loaded` 只保证样式解析完成，不保证区域填色已经绘制到画布；
 * 悬停命中依赖 `queryRenderedFeatures`，绘制完成前移动鼠标会让
 * tooltip / feature-state 断言偶发失败。
 */
async function waitForFillHit(page: Page, coords: [number, number], offline: boolean) {
  await page.waitForFunction(({ target, isOffline }) => {
    let map: any = null;
    if (isOffline) {
      document.querySelectorAll("[data-item]").forEach((el) => { if ((el as any).__cfMap && !map) map = (el as any).__cfMap; });
    } else {
      const chart = document.querySelector(".map-scene__chart") as any;
      map = chart?.__vueParentComponent?.exposed?.getMap?.() ?? null;
    }
    if (!map || !map.isStyleLoaded?.()) return false;
    const point = map.project(target);
    const hits = map.queryRenderedFeatures([point.x, point.y], { layers: ["cf-fill"] });
    return hits.length > 0;
  }, { target: coords, isOffline: offline }, { timeout: 15000 });
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
    // T13-a：逐帧动画会让 source 持续处于 reload 状态，map.loaded() / isStyleLoaded()
    // 因此永远为 false；改用「样式已解析完成（style._loaded）+ 相机未移动」判定就绪。
    return Boolean(map && map.style && map.style._loaded === true && !map.isMoving());
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
  await waitForFillHit(page, REGION_POINT, false);
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

  await waitForFillHit(offlinePage, REGION_POINT, true);
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

/** T10 评审修复：地理散点 / 点热力 / OD 飞线在 MapLibre 上双端一致（旧 ECharts 能力不得静默丢失） */
async function readGeoLayerSnapshot(page: Page) {
  return page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    if (!map) return null;
    const style: any = map.getStyle();
    const layers = (style?.layers ?? []).filter((l: any) =>
      l.id.startsWith("cf-scatter-") || l.id.startsWith("cf-heat-") || l.id.startsWith("cf-flow-"));
    return layers.map((l: any) => {
      const source = (style?.sources ?? {})[l.source];
      const features = source?.data?.features ?? [];
      return {
        id: l.id,
        type: l.type,
        source: l.source,
        sourceType: source?.type ?? null,
        color: l.paint["circle-color"] ?? l.paint["line-color"] ?? null,
        // T13-a：拖尾 / 流光头的不透明度与 dash 相位逐帧变化，双端只比对结构
        opacity: l.id.includes("-trail-") || l.id.includes("-head-")
          ? null
          : (l.paint["circle-opacity"] ?? l.paint["line-opacity"] ?? null),
        radius: l.paint["circle-radius"] ?? null,
        // T13：点热力改用 circle + circle-blur 表达径向渐变团
        blur: l.paint["circle-blur"] ?? l.paint["line-blur"] ?? null,
        width: l.paint["line-width"] ?? null,
        // 流动拖尾的 dash 相位逐帧变化，双端只断言「有虚线」
        dashed: Array.isArray(l.paint["line-dasharray"]) ? "dashed" : null,
        animated: l.id.includes("-trail-") || l.id.includes("-head-"),
        featureCount: features.length,
        geometryType: features[0]?.geometry?.type ?? null,
        coordinates: features[0]?.geometry?.coordinates ?? null,
      };
    }).sort((a: any, b: any) => a.id.localeCompare(b.id));
  });
}

async function readOfflineGeoLayerSnapshot(page: Page) {
  return page.evaluate(() => {
    let map: any = null;
    document.querySelectorAll("[data-item]").forEach((el) => { if ((el as any).__cfMap && !map) map = (el as any).__cfMap; });
    if (!map) return null;
    const style: any = map.getStyle();
    const layers = (style?.layers ?? []).filter((l: any) =>
      l.id.startsWith("cf-scatter-") || l.id.startsWith("cf-heat-") || l.id.startsWith("cf-flow-"));
    return layers.map((l: any) => {
      const source = (style?.sources ?? {})[l.source];
      const features = source?.data?.features ?? [];
      return {
        id: l.id,
        type: l.type,
        source: l.source,
        sourceType: source?.type ?? null,
        color: l.paint["circle-color"] ?? l.paint["line-color"] ?? null,
        // T13-a：拖尾 / 流光头的不透明度与 dash 相位逐帧变化，双端只比对结构
        opacity: l.id.includes("-trail-") || l.id.includes("-head-")
          ? null
          : (l.paint["circle-opacity"] ?? l.paint["line-opacity"] ?? null),
        radius: l.paint["circle-radius"] ?? null,
        // T13：点热力改用 circle + circle-blur 表达径向渐变团
        blur: l.paint["circle-blur"] ?? l.paint["line-blur"] ?? null,
        width: l.paint["line-width"] ?? null,
        dashed: Array.isArray(l.paint["line-dasharray"]) ? "dashed" : null,
        animated: l.id.includes("-trail-") || l.id.includes("-head-"),
        featureCount: features.length,
        geometryType: features[0]?.geometry?.type ?? null,
        coordinates: features[0]?.geometry?.coordinates ?? null,
      };
    }).sort((a: any, b: any) => a.id.localeCompare(b.id));
  });
}

test("OD 飞线流动拖尾逐帧推进且肉眼可见（工作台 / 离线双端，T13-a）", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  /** 读取覆盖层挂载状态与各图层归一化相位 */
  const readOverlay = async (target: Page) => target.evaluate(() => {
    const canvas = document.querySelector("canvas.cf-flow-trail-overlay") as any;
    if (!canvas || !canvas.__cfFlowTrail) return null;
    return { kind: canvas.__cfFlowTrail.kind, phases: canvas.__cfFlowTrail.getPhases() };
  });

  /**
   * 覆盖层画布的像素统计：统计「非透明」像素与「亮」像素。
   * 覆盖层是独立的 2D canvas，直接读它就能证明彗星真的被画出来了
   * （此前的自动化只断言 dasharray 在变，无法证明可见性）。
   */
  const readOverlayPixels = async (target: Page) => target.evaluate(() => {
    const canvas = document.querySelector("canvas.cf-flow-trail-overlay") as HTMLCanvasElement;
    if (!canvas || !canvas.width) return null;
    const scratch = document.createElement("canvas");
    scratch.width = canvas.width;
    scratch.height = canvas.height;
    const ctx = scratch.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    let bright = 0;
    let sumX = 0;
    let sumY = 0;
    let maxAlpha = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha > maxAlpha) maxAlpha = alpha;
      if (alpha > 8) {
        painted++;
        const px = (i / 4) % canvas.width;
        const py = Math.floor(i / 4 / canvas.width);
        sumX += px;
        sumY += py;
        // 流光头核心接近白色
        if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) bright++;
      }
    }
    return {
      painted,
      bright,
      maxAlpha,
      centroid: painted ? { x: sumX / painted, y: sumY / painted } : null,
    };
  });

  /** 把地图放大到航线范围：夹具里的航线只有约 1.2 度跨度，缩到最大才看得清彗星推进 */
  const focusRoute = async (target: Page, maxZoom: number) => target.evaluate((limit) => {
    let map: any = null;
    const chart = document.querySelector(".map-scene__chart") as any;
    if (chart?.__vueParentComponent?.exposed?.getMap) {
      map = chart.__vueParentComponent.exposed.getMap();
    } else {
      document.querySelectorAll("[data-item]").forEach((el) => { if ((el as any).__cfMap && !map) map = (el as any).__cfMap; });
    }
    if (!map) return false;
    map.jumpTo({ zoom: Math.min(limit, map.getMaxZoom()), center: [113.7, 22.7] });
    return true;
  }, maxZoom);

  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".map-scene__chart")).toBeVisible();
  await waitForMapReady(page);

  // 1) 覆盖层已挂载且接管了飞线动画
  await expect(page.locator("canvas.cf-flow-trail-overlay")).toHaveCount(1);
  const first = await readOverlay(page);
  expect(first?.kind).toBe("flow-trail-overlay");
  const firstPhase = first!.phases.flow;
  expect(typeof firstPhase).toBe("number");

  // 2) 相位确实在推进
  await page.waitForTimeout(400);
  const second = await readOverlay(page);
  expect(second!.phases.flow).not.toBe(firstPhase);

  // 3) 可见性：覆盖层上必须有实画出来的像素，且出现接近白色的流光头
  //    先把地图放大到航线附近，让「彗星沿航线推进」在像素上真的可测
  expect(await focusRoute(page, 7)).toBe(true);
  await page.waitForTimeout(300);
  //    采样一小段时间，覆盖彗星穿过航线中段（fade 全不透明）的时刻
  let best = { painted: 0, bright: 0, maxAlpha: 0, centroid: null as any };
  let moved = false;
  let previousCentroid: any = null;
  for (let i = 0; i < 14; i++) {
    const px = await readOverlayPixels(page);
    if (px) {
      if (px.painted > best.painted) best = px as any;
      if (px.bright > best.bright) best.bright = px.bright;
      if (previousCentroid && px.centroid && px.painted > 200) {
        const shift = Math.hypot(px.centroid.x - previousCentroid.x, px.centroid.y - previousCentroid.y);
        if (shift > 3) moved = true;
      }
      if (px.centroid && px.painted > 200) previousCentroid = px.centroid;
    }
    await page.waitForTimeout(120);
  }
  // 拖尾（宽 4px × 长度最长 64px）+ 辉光半径 6px ⇒ 正常应远大于 100 像素
  expect(best.painted).toBeGreaterThan(100);
  expect(best.maxAlpha).toBeGreaterThan(60);
  // 流光头白热核心必须真实着色
  expect(best.bright).toBeGreaterThan(0);
  // 彗星沿航线移动（质心发生位移）
  expect(moved).toBe(true);

  // 4) 离线产物：同样的覆盖层、同样的推进
  const offlinePage = await openOffline(page, context, SCREEN_ID);
  await expect(offlinePage.locator("canvas.cf-flow-trail-overlay")).toHaveCount(1);
  expect(await focusRoute(offlinePage, 7)).toBe(true);
  await offlinePage.waitForTimeout(300);
  const offlineFirst = await readOverlay(offlinePage);
  expect(offlineFirst?.kind).toBe("flow-trail-overlay");
  const offlinePhaseA = offlineFirst!.phases.flow;
  expect(typeof offlinePhaseA).toBe("number");
  await offlinePage.waitForTimeout(400);
  const offlineSecond = await readOverlay(offlinePage);
  expect(offlineSecond!.phases.flow).not.toBe(offlinePhaseA);
  let offlineBest = { painted: 0, bright: 0, maxAlpha: 0 };
  for (let i = 0; i < 14; i++) {
    const px = await readOverlayPixels(offlinePage);
    if (px) {
      if (px.painted > offlineBest.painted) offlineBest.painted = px.painted;
      if (px.bright > offlineBest.bright) offlineBest.bright = px.bright;
      if (px.maxAlpha > offlineBest.maxAlpha) offlineBest.maxAlpha = px.maxAlpha;
    }
    await offlinePage.waitForTimeout(120);
  }
  expect(offlineBest.painted).toBeGreaterThan(100);
  expect(offlineBest.bright).toBeGreaterThan(0);
  await offlinePage.close();
});

test("地理散点 / 点热力 / OD 飞线双端一致（T10 评审修复）", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
  await expect(page.locator(".map-scene__chart")).toBeVisible();
  await waitForMapReady(page);
  // 数据绑定错误必须显式提示，不能静默丢层
  await expect(page.locator(".map-scene__status")).toHaveCount(0);

  const workbench = await readGeoLayerSnapshot(page);
  expect(workbench).not.toBeNull();
  // T13-a：拖尾改由 Canvas2D 覆盖层绘制 ⇒ 飞线只剩底稿图层
  expect(workbench!.map((l: any) => l.id)).toEqual([
    "cf-flow-flow", "cf-heat-heat", "cf-scatter-pts-scatter",
  ]);
  const scatter = workbench!.find((l: any) => l.id === "cf-scatter-pts-scatter")!;
  expect(scatter.type).toBe("circle");
  expect(scatter.sourceType).toBe("geojson");
  expect(scatter.color).toBe("#ffcc66");
  expect(scatter.opacity).toBe(1);
  expect(scatter.radius).toBe(6);
  expect(scatter.featureCount).toBe(1);
  expect(scatter.geometryType).toBe("Point");
  expect(scatter.coordinates).toEqual([113.26, 23.13]);
  const heat = workbench!.find((l: any) => l.id === "cf-heat-heat")!;
  // T13：点热力 = 每点径向渐变团（circle + blur），颜色按点值走 visualMap 色带
  expect(heat.type).toBe("circle");
  expect(heat.featureCount).toBe(2);
  // size=6 → blurSize=12 → 外缘半径 18，blur=0.6667 → 实心核 6
  expect(heat.radius).toBe(18);
  expect(heat.blur).toBe(0.6667);
  expect(heat.opacity).toBe(0.9);
  expect(heat.color).toEqual([
    "interpolate", ["linear"], ["get", "value"], 20, "#102b3d", 80, "#ff6b6b",
  ]);
  const flow = workbench!.find((l: any) => l.id === "cf-flow-flow")!;
  expect(flow.type).toBe("line");
  expect(flow.color).toBe("#32d6ff");
  expect(flow.width).toBe(2);
  expect(flow.dashed).toBe("dashed");
  expect(flow.animated).toBe(false);
  expect(flow.geometryType).toBe("LineString");
  expect(flow.coordinates).toEqual([[113.26, 23.13], [114.17, 22.31]]);
  // T13-a：流动拖尾不进 MapLibre 图层（dasharray 无法平移相位且会耗尽 dash 图集），
  // 改由 Canvas2D 覆盖层绘制；此处断言覆盖层已挂载
  expect(workbench!.find((l: any) => l.id === "cf-flow-trail-flow")).toBeUndefined();
  expect(workbench!.find((l: any) => l.id === "cf-flow-head-flow")).toBeUndefined();
  await expect(page.locator("canvas.cf-flow-trail-overlay")).toHaveCount(1);
  // 散点标注进 HTML 覆盖层
  await expect(page.locator(".map-scene__label", { hasText: "广州" })).toBeVisible();

  const offlinePage = await openOffline(page, context, SCREEN_ID);
  const offline = await readOfflineGeoLayerSnapshot(offlinePage);
  expect(offline).toEqual(workbench);
  await expect(offlinePage.locator("canvas.cf-flow-trail-overlay")).toHaveCount(1);
  await expect(offlinePage.locator(".cf-map-label", { hasText: "广州" })).toBeVisible();
  await offlinePage.close();
});
