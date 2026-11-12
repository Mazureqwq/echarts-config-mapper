import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "chartforge.workspace.v1";
const SCREEN_ID = "map-visual-e2e-screen";
const ITEM_ID = "map-visual-e2e-scene";
const REGION_DATASET_ID = "map-visual-e2e-regions";
const POINT_DATASET_ID = "map-visual-e2e-points";

const regionRows = [
  { province: "广东省", score: 92 },
  { province: "西藏自治区", score: 31 },
  { province: "浙江省", score: 78 },
  { province: "四川省", score: 66 },
  { province: "新疆维吾尔自治区", score: 44 },
  { province: "黑龙江省", score: 52 },
  { province: "山东省", score: 71 },
  { province: "云南省", score: 49 },
];

const pointRows = [
  { name: "广州", longitude: 113.2644, latitude: 23.1291, score: 92 },
  { name: "深圳", longitude: 114.0579, latitude: 22.5431, score: 88 },
  { name: "拉萨", longitude: 91.1145, latitude: 29.644, score: 31 },
  { name: "杭州", longitude: 120.1551, latitude: 30.2741, score: 78 },
  { name: "成都", longitude: 104.0657, latitude: 30.6594, score: 66 },
  { name: "乌鲁木齐", longitude: 87.6177, latitude: 43.7928, score: 44 },
];

const initialWorkspace = {
  version: 2,
  assets: [],
  designAssets: [],
  screens: [
    {
      id: SCREEN_ID,
      name: "2.5D 地图场景视觉验收",
      canvas: { width: 1280, height: 720, background: { kind: "color", color: "#050b12" } },
      items: [
        {
          id: ITEM_ID,
          name: "立体地图场景",
          kind: "component",
          componentId: "chartforge.map-scene-tilted",
          componentVersion: 1,
          frame: { x: 60, y: 50, w: 900, h: 560, rotate: 0 },
          dataBinding: {
            datasetId: REGION_DATASET_ID,
            fields: { category: "province", value: "score" },
          },
          props: {
            presentation: "tilted",
            pitch: 28,
            view: {
              center: [104.114129, 35.550339],
              zoom: 1.05,
              minZoom: 1,
              maxZoom: 8,
              dragEnabled: true,
              zoomEnabled: true,
              showLabels: true,
              backgroundColor: "#081622",
            },
            layers: [
              {
                id: "fill-heat",
                type: "regionFill",
                name: "省份热度",
                visible: true,
                style: { color: "#32d6ff", opacity: 0.85, size: 12 },
              },
              {
                id: "city-points",
                type: "geoScatter",
                name: "城市点位",
                visible: true,
                style: { color: "#ffcc66", opacity: 1, size: 14 },
                dataBinding: {
                  datasetId: POINT_DATASET_ID,
                  fields: {
                    geo: {
                      longitude: "longitude",
                      latitude: "latitude",
                      name: "name",
                      value: "score",
                    },
                  },
                },
              },
            ],
          },
        },
      ],
      updatedAt: Date.now(),
    },
    {
      id: "map-visual-segments-screen",
      name: "分段色带截图",
      canvas: { width: 1280, height: 720, background: { kind: "color", color: "#050b12" } },
      items: [{
        id: "map-visual-segments-scene",
        name: "分段地图",
        kind: "component",
        componentId: "chartforge.map-scene-flat",
        componentVersion: 1,
        frame: { x: 60, y: 50, w: 900, h: 560, rotate: 0 },
        dataBinding: { datasetId: REGION_DATASET_ID, fields: { category: "province", value: "score" } },
        props: {
          presentation: "flat",
          pitch: 0,
          legend: { show: true, position: "top-right", mode: "segments" },
          view: { center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8, dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622" },
          layers: [{
            id: "seg",
            type: "regionFill",
            name: "分段热度",
            visible: true,
            style: { color: "#32d6ff", opacity: 0.85, size: 12, colorMode: "segments", segments: 5, colors: { min: "#0b1f33", mid: "#1c7fa8", max: "#66ffff" } },
          }],
        },
      }],
      updatedAt: Date.now(),
    },
    {
      id: "map-visual-v1-screen",
      name: "v1 兼容回归",
      canvas: { width: 1280, height: 720, background: { kind: "color", color: "#050b12" } },
      items: [{
        id: "map-visual-v1-scene",
        name: "旧版地图",
        kind: "component",
        componentId: "chartforge.map-scene-flat",
        componentVersion: 1,
        frame: { x: 60, y: 50, w: 900, h: 560, rotate: 0 },
        dataBinding: { datasetId: REGION_DATASET_ID, fields: { category: "province", value: "score" } },
        props: {
          presentation: "flat",
          pitch: 0,
          view: { center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8, dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622" },
          layers: [{ id: "old", type: "regionFill", name: "旧区域", visible: true, style: { color: "#336699", opacity: 0.8, size: 12 } }],
        },
      }],
      updatedAt: Date.now(),
    },
  ],
  datasets: [
    { id: REGION_DATASET_ID, name: "省级热度集", source: { kind: "static", data: regionRows }, pipeline: { filter: [] } },
    { id: POINT_DATASET_ID, name: "城市点位集", source: { kind: "static", data: pointRows }, pipeline: { filter: [] } },
  ],
  settings: { autosave: true },
};

interface GeoShot {
  center: unknown;
  zoom: unknown;
  roam: unknown;
  layoutCenter: unknown;
  layoutSize: unknown;
  silent: unknown;
  labelShow: unknown;
  borderColor: unknown;
  areaKind: string;
  colorStops: unknown;
}

async function readGeos(page: Page): Promise<GeoShot[]> {
  return page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const option = vueInstance?.exposed?.getChart?.()?.getOption?.();
    const rawGeo = option?.geo;
    const geos = Array.isArray(rawGeo) ? rawGeo : [rawGeo];
    return geos.filter(Boolean).map((geo: any) => {
      const label = Array.isArray(geo.label) ? geo.label[0] : geo.label;
      const areaColor = geo.itemStyle?.areaColor;
      return {
        center: geo.center,
        zoom: geo.zoom,
        roam: geo.roam,
        layoutCenter: geo.layoutCenter,
        layoutSize: geo.layoutSize,
        silent: geo.silent,
        labelShow: label?.show,
        borderColor: geo.itemStyle?.borderColor,
        areaKind: areaColor && typeof areaColor === "object" ? areaColor.type : typeof areaColor,
        colorStops: areaColor && typeof areaColor === "object" ? areaColor.colorStops ?? null : null,
      };
    });
  });
}

async function readSeries(page: Page) {
  return page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const series = vueInstance?.exposed?.getChart?.()?.getOption?.()?.series ?? [];
    return (series as any[]).map((entry) => ({
      type: entry.type,
      geoIndex: entry.geoIndex,
      count: Array.isArray(entry.data) ? entry.data.length : -1,
      regionValues:
        entry.type === "map" && Array.isArray(entry.data)
          ? entry.data.map((row: any) => ({ name: row?.name, value: row?.value }))
          : null,
    }));
  });
}

test("2.5D 地图场景结构、相机同步与视觉抽查截图", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(
    ({ storageKey, workspace }) => {
      if (localStorage.getItem(storageKey) === null) {
        localStorage.setItem(storageKey, JSON.stringify(workspace));
      }
    },
    { storageKey: STORAGE_KEY, workspace: initialWorkspace },
  );

  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
  await expect(page.locator(".map-scene__chart")).toBeVisible();
  await page.waitForTimeout(600);

  // ---- P1/P2 结构断言：4 层叠片、固定偏移、样式白名单 ----
  const geos = await readGeos(page);
  expect(geos).toHaveLength(4);
  const underlays = geos.slice(0, 3);
  const top = geos[3];
  for (const layer of underlays) {
    expect(layer.labelShow).toBe(false);
    expect(layer.roam).toBe(false);
    expect(layer.silent).toBe(true);
    expect(layer.layoutSize).toBe("150%");
  }
  expect(underlays.map((layer) => layer.layoutCenter)).toEqual([
    ["50%", "52%"],
    ["50%", "51%"],
    ["50%", "50%"],
  ]);
  expect(top.layoutCenter).toEqual(["50%", "49%"]);
  expect(top.layoutSize).toBe("150%");
  expect(top.labelShow).toBe(true);
  expect(top.borderColor).toBe("#c0f3fb");
  expect(top.areaKind).toBe("linear");
  expect(Array.isArray(top.colorStops) && top.colorStops.length).toBe(2);

  const series = await readSeries(page);
  const mapSeries = series.find((entry) => entry.type === "map");
  // ECharts getOption 会把 map 系列数据归一为全部省区（含南海诸岛），断言输入省份数值真实入图即可。
  expect(mapSeries?.count).toBeGreaterThanOrEqual(regionRows.length);
  const regionValues = Object.fromEntries((mapSeries?.regionValues ?? []).map((row) => [row.name, row.value]));
  expect(regionValues["广东省"]).toBe(92);
  expect(regionValues["西藏自治区"]).toBe(31);
  expect(series.find((entry) => entry.type === "scatter")?.count).toBe(pointRows.length);
  for (const entry of series) expect(entry.geoIndex).toBe(3);

  await page.screenshot({ path: "test-results/visual/01-national-tilted.jpg", type: "jpeg", quality: 62 });

  // ---- P2 拖拽后各层相机精确对齐 ----
  const chartBox = await page.locator(".map-scene__chart").boundingBox();
  expect(chartBox).not.toBeNull();
  const cx = chartBox!.x + chartBox!.width / 2;
  const cy = chartBox!.y + chartBox!.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 140, cy + 70, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect
    .poll(async () => {
      const synced = await readGeos(page);
      if (synced.length !== 4) return "layer-count";
      const [first, ...rest] = synced;
      const same = rest.every(
        (geo) => JSON.stringify(geo.center) === JSON.stringify(first.center) && geo.zoom === first.zoom,
      );
      const underlayRoamOff = synced.slice(0, 3).every((geo) => geo.roam === false);
      return same && underlayRoamOff;
    })
    .toBe(true);
  await page.screenshot({ path: "test-results/visual/02-after-drag.jpg", type: "jpeg", quality: 62 });

  // ---- P4 聚焦验收：局部边界放大抽查（广东省 / 西藏自治区）----
  await page.locator(`[data-item-id="${ITEM_ID}"]`).click();
  await expect(page.locator(".map-scene-inspector")).toBeVisible();
  const mapSettings = page.locator(".map-scene-inspector__section").filter({ hasText: "地图容器" });
  const setCamera = async (lng: string, lat: string, zoom: string) => {
    await mapSettings.getByLabel("地图中心经度").fill(lng);
    await mapSettings.getByLabel("地图中心经度").press("Tab");
    await mapSettings.getByLabel("地图中心纬度").fill(lat);
    await mapSettings.getByLabel("地图中心纬度").press("Tab");
    await mapSettings.getByLabel("地图默认缩放").fill(zoom);
    await mapSettings.getByLabel("地图默认缩放").press("Tab");
    await expect
      .poll(async () => {
        const [topGeo] = await readGeos(page);
        return JSON.stringify(topGeo?.center) === JSON.stringify([Number(lng), Number(lat)]) && topGeo?.zoom === Number(zoom);
      })
      .toBe(true);
    await page.waitForTimeout(350);
  };

  await setCamera("113.4", "23.4", "4.6");
  await page.screenshot({ path: "test-results/visual/03-guangdong.jpg", type: "jpeg", quality: 62 });

  await setCamera("88.5", "31.5", "4.6");
  await page.screenshot({ path: "test-results/visual/04-tibet.jpg", type: "jpeg", quality: 62 });

  // ---- P4 窄容器裁切抽查 ----
  await page.setViewportSize({ width: 780, height: 540 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/visual/05-narrow.jpg", type: "jpeg", quality: 62 });
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("分段色带与图例、皮肤切换、下钻视角截图及 v1 兼容回归", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  // --- 分段色带 + 分段图例 ---
  await page.goto("/?nav=segments#/workbench/map-visual-segments-screen");
  await expect(page.locator(".workbench")).toBeVisible();
  await expect(page.locator(".map-scene__chart")).toBeVisible();
  await page.waitForTimeout(700);
  const ramp = await page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const option = vueInstance?.exposed?.getChart?.()?.getOption?.();
    const vm = Array.isArray(option?.visualMap) ? option.visualMap[0] : option?.visualMap;
    return { type: vm?.type ?? null, pieces: Array.isArray(vm?.pieces) ? vm.pieces.length : 0 };
  });
  expect(ramp).toEqual({ type: "piecewise", pieces: 5 });
  await expect(page.locator(".map-scene__legend-item")).toHaveCount(5);
  await page.screenshot({ path: "test-results/visual/06-segments-legend.jpg", type: "jpeg", quality: 62 });

  // --- 下钻视角 + 面包屑截图（flat 分段屏，geoIndex0 路径已在交互 e2e 验证）---
  const flatPixel = await page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const chart = vueInstance?.exposed?.getChart?.();
    return chart?.convertToPixel?.({ geoIndex: 0 }, [120.1551, 30.2741]) ?? null;
  });
  expect(flatPixel).not.toBeNull();
  const flatBox = await page.locator(".map-scene__chart canvas").boundingBox();
  expect(flatBox).not.toBeNull();
  await page.mouse.dblclick(flatBox!.x + (flatPixel as number[])[0], flatBox!.y + (flatPixel as number[])[1]);
  await expect(page.locator(".map-scene__breadcrumb")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/visual/09-drill.jpg", type: "jpeg", quality: 62 });

  // --- 皮肤一键切换（翡翠青绿 → 晨曦浅色）---
  await page.goto(`/?nav=skin#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
  await page.locator(`[data-item-id="${ITEM_ID}"]`).click();
  const inspector = page.locator(".map-scene-inspector");
  await expect(inspector.locator(".map-scene-inspector__skin")).toHaveCount(5);
  await inspector.locator('[title="翡翠青绿"]').click();
  await expect.poll(async () => page.evaluate(({ key, screenId, itemId }) => {
    const ws = JSON.parse(localStorage.getItem(key) ?? "null");
    const scene = ws?.screens?.find((s: any) => s.id === screenId)?.items?.find((i: any) => i.id === itemId);
    return scene?.props?.view?.backgroundColor ?? null;
  }, { key: STORAGE_KEY, screenId: SCREEN_ID, itemId: ITEM_ID })).toBe("#06170f");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/visual/07-skin-jade.jpg", type: "jpeg", quality: 62 });
  await inspector.locator('[title="晨曦浅色"]').click();
  await expect.poll(async () => page.evaluate(({ key, screenId, itemId }) => {
    const ws = JSON.parse(localStorage.getItem(key) ?? "null");
    const scene = ws?.screens?.find((s: any) => s.id === screenId)?.items?.find((i: any) => i.id === itemId);
    return scene?.props?.view?.backgroundColor ?? null;
  }, { key: STORAGE_KEY, screenId: SCREEN_ID, itemId: ITEM_ID })).toBe("#f4f7fb");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/visual/08-skin-dawn.jpg", type: "jpeg", quality: 62 });


  // --- v1 旧形状 props 回归：遗留双色 visualMap、无 regions、无图例、无 v2 键 ---
  await page.goto("/?nav=v1#/workbench/map-visual-v1-screen");
  await expect(page.locator(".workbench")).toBeVisible();
  await expect(page.locator(".map-scene__chart")).toBeVisible();
  await page.waitForTimeout(700);
  const legacy = await page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const option = vueInstance?.exposed?.getChart?.()?.getOption?.();
    const geo = Array.isArray(option?.geo) ? option.geo[option.geo.length - 1] : option?.geo;
    const vm = Array.isArray(option?.visualMap) ? option.visualMap[0] : option?.visualMap;
    return {
      vmType: vm?.type ?? null,
      inRangeColor: vm?.inRange?.color ?? null,
      hasEmptyColor: Array.isArray(geo?.regions) ? geo.regions.some((entry: any) => entry?.itemStyle?.areaColor === "#0d1a26") : false,
      legendCount: document.querySelectorAll(".map-scene__legend").length,
    };
  });
  expect(legacy.vmType).toBeNull();
  expect(legacy.inRangeColor).toEqual(["#102b3d", "#336699"]);
  expect(legacy.hasEmptyColor).toBe(false);
  expect(legacy.legendCount).toBe(0);
  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), STORAGE_KEY);
  const v1Props = persisted?.screens?.find((s: any) => s.id === "map-visual-v1-screen")?.items?.[0]?.props ?? {};
  expect(Object.keys(v1Props).sort()).toEqual(["layers", "modelVersion", "pitch", "presentation", "view"]);
});
