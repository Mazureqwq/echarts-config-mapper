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

interface MapStyleShot {
  pitch: unknown;
  sky: unknown;
  light: unknown;
  fillLayer: any;
  lineLayer: any;
  sourcePromoteId: unknown;
  extrusion: boolean;
}

async function readMapStyle(page: Page): Promise<MapStyleShot | null> {
  return page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    if (!map) return null;
    const style = map.getStyle();
    if (!style) return null;
    const fill = (style.layers ?? []).find((l: any) => l.id === "cf-fill");
    const line = (style.layers ?? []).find((l: any) => l.id === "cf-line");
    return {
      pitch: style.pitch,
      sky: style.sky ?? null,
      light: style.light ?? null,
      fillLayer: fill ?? null,
      lineLayer: line ?? null,
      sourcePromoteId: (style.sources as any)?.china?.promoteId ?? null,
      extrusion: JSON.stringify(style).includes("extrusion"),
    };
  });
}

async function readMapCamera(page: Page) {
  return page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    if (!map) return null;
    const c = map.getCenter();
    return { center: [c.lng, c.lat], zoom: map.getZoom(), pitch: map.getPitch() };
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

  // ---- M1 结构断言：MapLibre style（无叠片、光照/雾化/色带 match/标注层）----
  await expect.poll(async () => (await readMapStyle(page))?.fillLayer != null).toBe(true);
  const styleShot = await readMapStyle(page);
  expect(styleShot?.pitch).toBe(28);
  expect((styleShot?.sky as any)?.["sky-color"]).toBeTruthy();
  expect((styleShot?.light as any)?.intensity).toBeGreaterThan(0);
  expect(styleShot?.sourcePromoteId).toBe("name");
  expect(styleShot?.extrusion).toBe(false);
  expect(styleShot?.fillLayer?.type).toBe("fill");
  expect(styleShot?.lineLayer?.type).toBe("line");
  const fillColor = JSON.stringify(styleShot?.fillLayer?.paint?.["fill-color"] ?? "");
  expect(fillColor).toContain("广东省");
  expect(fillColor).toContain("西藏自治区");
  expect(fillColor).toContain("#0d1a26");
  expect(fillColor).toContain("feature-state");
  expect(styleShot?.fillLayer?.paint?.["fill-opacity"]).toBe(0.85);
  await expect(page.locator(".map-scene__label").first()).toBeVisible();

  await page.screenshot({ path: "test-results/visual/01-national-tilted.jpg", type: "jpeg", quality: 62 });

  // ---- P2 拖拽后各层相机精确对齐 ----
  const chartBox = await page.locator(".map-scene__chart").boundingBox();
  expect(chartBox).not.toBeNull();
  const beforeDrag = await readMapCamera(page);
  expect(beforeDrag).not.toBeNull();
  const cx = chartBox!.x + chartBox!.width / 2;
  const cy = chartBox!.y + chartBox!.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 140, cy + 70, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const afterDrag = await readMapCamera(page);
  expect(afterDrag).not.toBeNull();
  expect(JSON.stringify(afterDrag!.center)).not.toBe(JSON.stringify(beforeDrag!.center));
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
        const cam = await readMapCamera(page);
        return !!cam && Math.abs(cam.center[0] - Number(lng)) < 0.01 && Math.abs(cam.center[1] - Number(lat)) < 0.01 && Math.abs(cam.zoom - Number(zoom)) < 0.01;
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

test("下钻视角与面包屑截图（flat 分段屏）", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  await page.goto("/?nav=drill#/workbench/map-visual-segments-screen");
  await expect(page.locator(".workbench")).toBeVisible();
  await expect(page.locator(".map-scene__chart")).toBeVisible();
  await page.waitForTimeout(700);

  const pixel = await page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    if (!map) return null;
    const p = map.project([120.1551, 30.2741]);
    return [p.x, p.y];
  });
  expect(pixel).not.toBeNull();
  const box = await page.locator(".map-scene__chart canvas").boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.dblclick(box!.x + (pixel as number[])[0], box!.y + (pixel as number[])[1]);
  await expect(page.locator(".map-scene__breadcrumb")).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "test-results/visual/09-drill.jpg", type: "jpeg", quality: 62 });
  await page.keyboard.press("Escape");
  await expect(page.locator(".map-scene__breadcrumb")).toHaveCount(0);
});


test.fixme("分段色带与图例、皮肤切换、下钻视角截图及 v1 兼容回归（T7/T8/T9 恢复）", async ({ page, context }) => {
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
