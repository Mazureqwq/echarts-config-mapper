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
