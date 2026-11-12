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

test("容器样式组（标注/边线/悬停/点击态/tooltip）在工作台与离线一致", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
  await expect(page.locator(".map-scene__chart")).toBeVisible();
  await page.waitForTimeout(700);

  const workbench = await page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const option = vueInstance?.exposed?.getChart?.()?.getOption?.();
    const geo = Array.isArray(option?.geo) ? option.geo[option.geo.length - 1] : option?.geo;
    const label = Array.isArray(geo?.label) ? geo.label[0] : geo?.label;
    return {
      label,
      itemStyle: geo?.itemStyle ? { borderColor: geo.itemStyle.borderColor, borderWidth: geo.itemStyle.borderWidth, borderType: geo.itemStyle.borderType ?? null } : null,
      emphasis: geo?.emphasis,
      select: geo?.select ?? null,
      selectedMode: geo?.selectedMode ?? null,
      tooltip: Array.isArray(option?.tooltip) ? option.tooltip[0] : option?.tooltip,
    };
  });
  expect(workbench.label).toMatchObject({ show: true, color: "#eaffff", fontSize: 13, stroke: "#010133", strokeWidth: 2, textShadowColor: "#00ffff", textShadowBlur: 6 });
  expect(workbench.itemStyle).toMatchObject({ borderColor: "#8888ff", borderWidth: 2 });
  expect(workbench.emphasis).toMatchObject({ itemStyle: { areaColor: "#ff0000", borderColor: "#00ff00" }, label: { color: "#ffffff" } });
  expect(workbench.select).toMatchObject({ itemStyle: { areaColor: "#00ffff", borderColor: "#ffffff" } });
  expect(workbench.selectedMode).toBe("single");
  expect(workbench.tooltip).toMatchObject({ backgroundColor: "#101820", borderColor: "#334455", textStyle: { color: "#ffffff", fontSize: 13 } });

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
  const offline = await offlinePage.evaluate(() => {
    const options = (window as any).__cfCapturedOptions ?? [];
    const option = options[options.length - 1];
    const geo = Array.isArray(option?.geo) ? option.geo[option.geo.length - 1] : option?.geo;
    return {
      label: geo?.label,
      itemStyle: geo?.itemStyle ? { borderColor: geo.itemStyle.borderColor, borderWidth: geo.itemStyle.borderWidth, borderType: geo.itemStyle.borderType ?? null } : null,
      emphasis: geo?.emphasis,
      select: geo?.select ?? null,
      selectedMode: geo?.selectedMode ?? null,
      tooltip: option?.tooltip,
    };
  });
  expect(workbench.label).toMatchObject(offline.label);
  expect(workbench.itemStyle).toEqual(offline.itemStyle);
  expect(workbench.emphasis).toMatchObject(offline.emphasis);
  expect(workbench.select).toMatchObject(offline.select);
  expect(workbench.selectedMode).toEqual(offline.selectedMode);
  expect(workbench.tooltip).toMatchObject(offline.tooltip);
  await offlinePage.close();
});

test("图层样式（边线/点标注/飞线流光）在工作台与离线一致", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
  await expect(page.locator(".map-scene__chart")).toBeVisible();
  await page.waitForTimeout(700);

  const pickSeries = (series: any[]) => {
    const map = series.find((entry) => entry.type === "map");
    const scatter = series.find((entry) => entry.type === "scatter");
    const lines = series.find((entry) => entry.type === "lines");
    const scatterLabel = Array.isArray(scatter?.label) ? scatter.label[0] : scatter?.label;
    return {
      mapBorder: map?.itemStyle ? { borderColor: map.itemStyle.borderColor, borderWidth: map.itemStyle.borderWidth, borderType: map.itemStyle.borderType ?? null } : null,
      scatterLabel: scatterLabel ? { show: scatterLabel.show, color: scatterLabel.color, fontSize: scatterLabel.fontSize, stroke: scatterLabel.stroke ?? null } : null,
      flowEffect: lines?.effect ? { show: lines.effect.show, trailLength: lines.effect.trailLength ?? null } : null,
    };
  };

  const workbench = await page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const series = vueInstance?.exposed?.getChart?.()?.getOption?.()?.series ?? [];
    const map = series.find((entry: any) => entry.type === "map");
    const scatter = series.find((entry: any) => entry.type === "scatter");
    const lines = series.find((entry: any) => entry.type === "lines");
    const scatterLabel = Array.isArray(scatter?.label) ? scatter.label[0] : scatter?.label;
    return {
      mapBorder: map?.itemStyle ? { borderColor: map.itemStyle.borderColor, borderWidth: map.itemStyle.borderWidth, borderType: map.itemStyle.borderType ?? null } : null,
      scatterLabel: scatterLabel ? { show: scatterLabel.show, color: scatterLabel.color, fontSize: scatterLabel.fontSize, stroke: scatterLabel.stroke ?? null } : null,
      flowEffect: lines?.effect ? { show: lines.effect.show, trailLength: lines.effect.trailLength ?? null } : null,
    };
  });
  expect(workbench.mapBorder).toEqual({ borderColor: "#aabbcc", borderWidth: 2, borderType: "dashed" });
  expect(workbench.scatterLabel).toMatchObject({ show: true, color: "#ffffff", fontSize: 12, stroke: "#000000" });
  expect(workbench.flowEffect).toMatchObject({ show: true, trailLength: 0.4 });

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
  const offline = await offlinePage.evaluate(() => {
    const options = (window as any).__cfCapturedOptions ?? [];
    const option = options[options.length - 1];
    const series = option?.series ?? [];
    const map = series.find((entry: any) => entry.type === "map");
    const scatter = series.find((entry: any) => entry.type === "scatter");
    const lines = series.find((entry: any) => entry.type === "lines");
    return {
      mapBorder: map?.itemStyle ? { borderColor: map.itemStyle.borderColor, borderWidth: map.itemStyle.borderWidth, borderType: map.itemStyle.borderType ?? null } : null,
      scatterLabel: scatter?.label ? { show: scatter.label.show, color: scatter.label.color, fontSize: scatter.label.fontSize, stroke: scatter.label.stroke ?? null } : null,
      flowEffect: lines?.effect ? { show: lines.effect.show, trailLength: lines.effect.trailLength ?? null } : null,
    };
  });
  expect(offline.mapBorder).toEqual(workbench.mapBorder);
  expect(offline.scatterLabel).toMatchObject(workbench.scatterLabel);
  expect(offline.flowEffect).toMatchObject(workbench.flowEffect);
  await offlinePage.close();
});
