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
        view: { center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8, dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622" },
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
  datasets: [{ id: DATASET_ID, name: "省级热度", source: { kind: "static", data: rows }, pipeline: { filter: [] } }],
  settings: { autosave: true },
};

async function readWorkbenchRamp(page: Page) {
  return page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const option = vueInstance?.exposed?.getChart?.()?.getOption?.();
    const geo = Array.isArray(option?.geo) ? option.geo[option.geo.length - 1] : option?.geo;
    const vm = Array.isArray(option?.visualMap) ? option.visualMap[0] : option?.visualMap;
    return {
      vmType: vm?.type ?? null,
      colorStops: vm?.inRange?.colorStops ?? null,
      inRangeColor: vm?.inRange?.color ?? null,
      emptyRegion: geo?.regions?.[0]?.itemStyle?.areaColor ?? null,
    };
  });
}

test("色带/空值区域/图例在工作台与离线运行时一致", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
  await expect(page.locator(".map-scene__chart")).toBeVisible();
  await page.waitForTimeout(700);

  const workbench = await readWorkbenchRamp(page);
  expect(workbench.vmType).toBe("continuous");
  expect(workbench.colorStops).toEqual([
    { offset: 0, color: "#000010" },
    { offset: 0.5, color: "#0080ff" },
    { offset: 1, color: "#66ffff" },
  ]);
  expect(workbench.emptyRegion).toBe("#0a0a14");

  const legendText = await page.locator(".map-scene__legend").textContent();
  expect(legendText?.replace(/\s+/g, " ").trim()).toBe("31 分 – 92 分");
  const workbenchBar = await page.locator(".map-scene__legend-bar").evaluate((el) => (el as HTMLElement).style.background);
  expect(workbenchBar).toContain("linear-gradient");

  const workspace = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), STORAGE_KEY);
  const offlineBuild = await page.evaluate(async ({ workspace, screenId }) => {
    const snapshotUrl = new URL("/src/core/export/snapshot.ts", location.href).href;
    const artifactUrl = new URL("/src/core/export/artifact.ts", location.href).href;
    const runtimeUrl = new URL("/src/core/export/runtime.ts", location.href).href;
    const [snapshotModule, artifactModule, runtimeModule] = await Promise.all([import(snapshotUrl), import(artifactUrl), import(runtimeUrl)]);
    const payload = snapshotModule.buildPackagePayload(workspace, [screenId]);
    const echartsCode = `(function(){window.__cfCapturedOptions=[];window.echarts={registerMap:function(){},init:function(){return{setOption:function(option){window.__cfCapturedOptions.push(option);},resize:function(){},dispose:function(){}};}};})();`;
    const artifact = await artifactModule.buildArtifact({
      payload,
      echartsCode,
      runtimeCode: runtimeModule.RUNTIME_CODE,
      mode: "inline",
      now: () => 1794280000000,
    });
    return { html: artifact.files.find((file: { path: string }) => file.path === "index.html")?.content ?? "" };
  }, { workspace, screenId: SCREEN_ID });

  const offlinePage = await context.newPage();
  await offlinePage.setContent(offlineBuild.html);
  await offlinePage.waitForFunction(() => {
    const options = (window as any).__cfCapturedOptions;
    return Array.isArray(options) && options.length > 0;
  });
  await expect(offlinePage.locator(".cf-map-legend")).toBeVisible();

  const offlineRamp = await offlinePage.evaluate(() => {
    const options = (window as any).__cfCapturedOptions ?? [];
    const option = options[options.length - 1];
    const geo = Array.isArray(option?.geo) ? option.geo[option.geo.length - 1] : option?.geo;
    const vm = Array.isArray(option?.visualMap) ? option.visualMap[0] : option?.visualMap;
    return {
      vmType: vm?.type ?? null,
      colorStops: vm?.inRange?.colorStops ?? null,
      inRangeColor: vm?.inRange?.color ?? null,
      emptyRegion: geo?.regions?.[0]?.itemStyle?.areaColor ?? null,
    };
  });
  expect(offlineRamp).toEqual(workbench);

  const offlineLegendText = await offlinePage.locator(".cf-map-legend").textContent();
  expect(offlineLegendText?.replace(/\s+/g, " ").trim()).toBe(legendText?.replace(/\s+/g, " ").trim());
  const offlineBar = await offlinePage.locator(".cf-map-legend i").first().evaluate((el) => (el as HTMLElement).style.background);
  expect(offlineBar).toBe(workbenchBar);
  await offlinePage.close();
});
