import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "chartforge.workspace.v1";
const SCREEN_ID = "map-visual-t8-screen";
const ITEM_ID = "map-visual-t8-scene";
const DATASET_ID = "map-visual-e2e-regions";

const rows = [
  { province: "广东省", score: 92 },
  { province: "西藏自治区", score: 31 },
  { province: "浙江省", score: 78 },
  { province: "四川省", score: 66 },
  { province: "新疆维吾尔自治区", score: 44 },
  { province: "黑龙江省", score: 52 },
  { province: "山东省", score: 71 },
  { province: "云南省", score: 49 },
];

const workspace = {
  version: 2,
  assets: [],
  designAssets: [],
  screens: [
    {
      id: SCREEN_ID,
      name: "M3 视觉质感验收",
      canvas: { width: 1280, height: 720, background: { kind: "color", color: "#050b12" } },
      items: [
        {
          id: ITEM_ID,
          name: "质感地图",
          kind: "component",
          componentId: "chartforge.map-scene-tilted",
          componentVersion: 1,
          frame: { x: 60, y: 50, w: 900, h: 560, rotate: 0 },
          dataBinding: { datasetId: DATASET_ID, fields: { category: "province", value: "score" } },
          props: {
            presentation: "tilted",
            pitch: 28,
            legend: { show: true, position: "top-right", mode: "continuous" },
            scaleBar: { show: true, position: "bottom-left" },
            label: { show: true, color: "#eaffff", size: 12, minZoom: 1 },
            border: { color: "#8888ff", width: 1.5, type: "solid", outline: { show: true, color: "#ffd166", width: 3 } },
            view: {
              center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8,
              dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622", offset: { x: 0, y: 0 },
            },
            layers: [
              {
                id: "t8-fill",
                type: "regionFill",
                name: "热度",
                visible: true,
                style: {
                  color: "#32d6ff", opacity: 0.85, size: 12, colorMode: "gradient",
                  colors: { min: "#102b3d", mid: "#1c5f8f", max: "#66ffff", empty: "#0d1a26" },
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
    { id: DATASET_ID, name: "省级热度集", source: { kind: "static", data: rows }, pipeline: { filter: [] } },
  ],
  settings: { autosave: true },
};

/** 工作台端：经纬度 → 页面坐标（按画布 CSS 缩放换算） */
async function projectPoint(page: Page, coords: [number, number]) {
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

async function buildOfflineHtml(page: Page) {
  // 用初始工作台状态（未经检查器改动）构建离线产物，保证与 01 全景为同一场景
  const stored = workspace;
  return page.evaluate(async ({ workspace: ws, screenId }) => {
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
    const payload = assetsModule.attachGeo(snapshotModule.buildPackagePayload(ws, [screenId]));
    const echartsCode = `(function(){window.echarts={registerMap:function(){},init:function(){return{setOption:function(){},resize:function(){},dispose:function(){}};}};})();`;
    const artifact = await artifactModule.buildArtifact({
      payload, echartsCode, maplibreCode, maplibreWorkerCode,
      runtimeCode: runtimeModule.RUNTIME_CODE, mode: "inline", now: () => 1794280000000,
    });
    return artifact.files.find((file: { path: string }) => file.path === "index.html")?.content ?? "";
  }, { workspace: stored, screenId: SCREEN_ID });
}

test("GATE M3 截图采集：外轮廓/比例尺/视图偏移/悬停态/标注覆盖层", async ({ page, context }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await context.addInitScript(({ storageKey, ws }) => {
    if (localStorage.getItem(storageKey) === null) localStorage.setItem(storageKey, JSON.stringify(ws));
  }, { storageKey: STORAGE_KEY, ws: workspace });

  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
  await expect(page.locator(".map-scene__chart")).toBeVisible();
  await expect.poll(async () => page.locator(".map-scene__label").count()).toBeGreaterThan(3);
  await page.waitForTimeout(1500);

  const item = page.locator(`[data-item-id="${ITEM_ID}"]`);

  // 01 全景：外轮廓强化层 + 比例尺 + 标注覆盖层 + 图例
  await item.screenshot({ path: "t8-shots/01-outline-scalebar-labels.png" });

  // 02 外轮廓局部放大（国界外环 + 省界）
  await page.locator(`[data-item-id="${ITEM_ID}"]`).click();
  const inspector = page.locator(".map-scene-inspector");
  await expect(inspector).toBeVisible();
  const container = page.locator(".map-scene-inspector__section").filter({ hasText: "地图容器" });
  await container.getByLabel("地图中心经度").fill("113.4");
  await container.getByLabel("地图中心经度").press("Tab");
  await container.getByLabel("地图中心纬度").fill("23.4");
  await container.getByLabel("地图中心纬度").press("Tab");
  await container.getByLabel("地图默认缩放").fill("4.2");
  await container.getByLabel("地图默认缩放").press("Tab");
  await page.waitForTimeout(1200);
  await item.screenshot({ path: "t8-shots/02-outline-closeup.png" });

  // 03 悬停态（fill/line 颜色过渡）
  const hoverPoint = await projectPoint(page, [113.4, 23.4]);
  await page.mouse.move(hoverPoint.x - 8, hoverPoint.y - 8);
  await page.mouse.move(hoverPoint.x, hoverPoint.y);
  await expect(page.locator(".map-scene__tooltip")).toBeVisible();
  await page.waitForTimeout(700);
  await item.screenshot({ path: "t8-shots/03-hover-state.png" });

  // 04 标注覆盖层局部
  await page.locator(".map-scene__labels").screenshot({ path: "t8-shots/04-label-overlay.png" });

  // 05 视图偏移（水平 +25%、垂直 -10%）
  await container.getByLabel("地图默认缩放").fill("1.05");
  await container.getByLabel("地图默认缩放").press("Tab");
  await page.waitForTimeout(800);
  await container.getByLabel("视图水平偏移").fill("25");
  await container.getByLabel("视图水平偏移").press("Tab");
  await container.getByLabel("视图垂直偏移").fill("-10");
  await container.getByLabel("视图垂直偏移").press("Tab");
  await page.waitForTimeout(1200);
  await item.screenshot({ path: "t8-shots/05-view-offset.png" });

  // 06 离线产物同场景（外轮廓 + 比例尺 + 标注）
  const html = await buildOfflineHtml(page);
  const offlinePage = await context.newPage();
  await offlinePage.setViewportSize({ width: 1600, height: 1000 });
  await offlinePage.setContent(html);
  await offlinePage.waitForSelector(".maplibregl-canvas", { timeout: 30000 });
  await offlinePage.waitForFunction(() => {
    let map: any = null;
    document.querySelectorAll("[data-item]").forEach((el) => { if ((el as any).__cfMap && !map) map = (el as any).__cfMap; });
    return Boolean(map && typeof map.loaded === "function" && map.loaded() && !map.isMoving());
  }, null, { timeout: 30000 });
  await offlinePage.waitForTimeout(1200);
  const offlineItem = offlinePage.locator(".cf-item[data-item]");
  await offlineItem.screenshot({ path: "t8-shots/06-offline-outline-scalebar.png" });

  const offlineLabels = await offlinePage.locator(".cf-map-label").count();
  const offlineScale = (await offlinePage.locator(".cf-map-scalebar-text").innerText()).trim();
  console.log("OFFLINE_LABELS " + offlineLabels + " SCALE " + offlineScale);
  await offlinePage.close();
});
