import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "chartforge.workspace.v1";
const SCREEN_ID = "map-editor-e2e-screen";
const ITEM_ID = "map-editor-e2e-scene";
const DATASET_ID = "map-editor-e2e-dataset";
const OVERRIDE_DATASET_ID = "map-editor-e2e-override-dataset";
const TABLE_ID = "map-editor-e2e-variable-table";
const VARIABLE_NAME = "selectedProvince";

const sourceRows = [
  { province: "广东", city: "深圳", longitude: 114.0579, latitude: 22.5431, score: 88 },
  { province: "广东", city: "广州", longitude: 113.2644, latitude: 23.1291, score: 62 },
  { province: "浙江", city: "杭州", longitude: 120.1551, latitude: 30.2741, score: 92 },
];

const initialWorkspace = {
  version: 2,
  assets: [],
  designAssets: [],
  screens: [{
    id: SCREEN_ID,
    name: "地图图层编辑器 E2E",
    canvas: { width: 1280, height: 720, background: { kind: "color", color: "#12161d" } },
    items: [
      {
        id: ITEM_ID,
        name: "测试地图场景",
        kind: "component",
        componentId: "chartforge.map-scene-flat",
        componentVersion: 1,
        frame: { x: 100, y: 80, w: 760, h: 500, rotate: 0 },
        props: { presentation: "flat", pitch: 0, layers: [] },
      },
      {
        id: TABLE_ID,
        name: "地区切换表",
        kind: "component",
        componentId: "chartforge.data-table",
        componentVersion: 1,
        frame: { x: 900, y: 80, w: 320, h: 500, rotate: 0 },
        props: { columns: [{ field: "province", label: "省份", format: "text" }, { field: "city", label: "城市", format: "text" }], rowKey: "city", striped: true },
        dataBinding: { datasetId: DATASET_ID },
      },
    ],
    blueprint: {
      nodes: [
        { id: "table-row-select", kind: "componentEvent", componentId: "chartforge.data-table", componentVersion: 1, event: "rowSelect" },
        { id: "set-selected-province", kind: "setVariable", name: VARIABLE_NAME, value: { source: "event", path: "row.province" } },
      ],
      edges: [{ id: "select-to-variable", from: { nodeId: "table-row-select", port: "next" }, to: { nodeId: "set-selected-province", port: "in" } }],
      variables: [
        { name: VARIABLE_NAME, type: "string", initialValue: "广东" },
        { name: "overrideProvince", type: "string", initialValue: "重庆" },
      ],
    },
    updatedAt: Date.now(),
  }],
  datasets: [
    {
      id: DATASET_ID,
      name: "城市点位测试集",
      source: { kind: "static", data: sourceRows },
      pipeline: { filter: [{ field: "score", op: "gte", value: "70" }] },
    },
    {
      id: OVERRIDE_DATASET_ID,
      name: "独立图层测试集",
      source: { kind: "static", data: [{ province: "重庆", city: "重庆独立", longitude: 106.5516, latitude: 29.563, score: 71 }] },
      pipeline: { filter: [] },
    },
  ],
  settings: { autosave: true },
};

async function readScene(page: Page) {
  return page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    return vueInstance?.exposed?.readScene?.() ?? null;
  });
}

async function readMapCamera(page: Page) {
  return page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    if (!map) return null;
    const c = map.getCenter();
    return { center: [c.lng, c.lat], zoom: map.getZoom(), minZoom: map.getMinZoom(), maxZoom: map.getMaxZoom() };
  });
}

test("地图容器绑定继承、图层独立覆盖与变量切换在刷新和离线导出中一致", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
  await page.locator("#left-panel-tab-layers").click();
  const mapItemLayerName = page.locator(".layers-panel__name").filter({ hasText: "测试地图场景" });
  await expect(mapItemLayerName).toBeVisible();
  await expect(mapItemLayerName).toHaveText("测试地图场景");
  await page.locator(`[data-item-id="${ITEM_ID}"]`).click();
  await expect(page.locator(".map-scene-inspector")).toBeVisible();

  // 在地图容器上配置共享数据、地理字段和全局变量过滤（数据页签）。
  await page.locator(".map-scene-inspector").getByRole("tab", { name: "数据", exact: true }).click();
  const containerBinding = page.locator(".map-scene-inspector__section").filter({ hasText: "共享数据绑定" });
  await containerBinding.getByLabel("工作区数据集").selectOption(DATASET_ID);
  await containerBinding.getByLabel("区域名称字段").fill("province");
  await containerBinding.getByLabel("区域数值字段").fill("score");
  await containerBinding.getByRole("combobox", { name: "经度", exact: true }).fill("longitude");
  await containerBinding.getByRole("combobox", { name: "纬度", exact: true }).fill("latitude");
  await containerBinding.getByLabel("名称（可选）").fill("city");
  await containerBinding.getByLabel("数值（可选）").fill("score");
  await containerBinding.getByLabel("匹配字段").fill("province");
  await containerBinding.getByLabel("全局变量").selectOption(VARIABLE_NAME);

  await page.locator(".map-scene-inspector").getByRole("tab", { name: "样式", exact: true }).click();
  const mapSettings = page.locator(".map-scene-inspector__section").filter({ hasText: "地图容器" });
  await mapSettings.getByLabel("地图中心经度").fill("110.5");
  await mapSettings.getByLabel("地图中心经度").press("Tab");
  await mapSettings.getByLabel("地图中心纬度").fill("33.25");
  await mapSettings.getByLabel("地图中心纬度").press("Tab");
  await mapSettings.getByLabel("最小缩放").fill("1.2");
  await mapSettings.getByLabel("最小缩放").press("Tab");
  await mapSettings.getByLabel("最大缩放").fill("5");
  await mapSettings.getByLabel("最大缩放").press("Tab");
  await mapSettings.getByLabel("地图默认缩放").fill("1.6");
  await mapSettings.getByLabel("地图默认缩放").press("Tab");
  await mapSettings.getByLabel("允许拖拽平移").uncheck();
  await mapSettings.getByLabel("显示省级名称").uncheck();
  await mapSettings.getByLabel("地图背景色").evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "#102030";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  // 第一层：继承容器绑定的地理散点。
  await page.getByLabel("新增地图图层类型").selectOption("geoScatter");
  await page.getByRole("button", { name: "添加图层" }).click();
  const inheritedLayer = page.locator(".map-scene-inspector__layer").nth(0);
  await expect(inheritedLayer.locator(".map-scene-inspector__type")).toHaveText("地理散点");
  await expect(inheritedLayer.locator(".map-scene-inspector__name")).toHaveValue("地理散点 1");
  await expect(inheritedLayer.locator(".map-scene-inspector__name-display")).toHaveText("地理散点 1");
  await inheritedLayer.getByLabel("地理散点名称").fill("容器继承层");
  await inheritedLayer.getByLabel("地理散点名称").press("Tab");
  await expect(inheritedLayer.locator(".map-scene-inspector__name")).toHaveValue("容器继承层");
  await expect(inheritedLayer.locator("details summary")).toHaveText("数据绑定 · 继承容器");

  // 第二层：独立绑定覆盖容器绑定。
  await page.getByRole("button", { name: "添加图层" }).click();
  const overrideLayer = page.locator(".map-scene-inspector__layer").nth(1);
  await expect(overrideLayer.locator(".map-scene-inspector__type")).toHaveText("地理散点");
  await expect(overrideLayer.locator(".map-scene-inspector__name")).toHaveValue("地理散点 2");
  await overrideLayer.getByLabel("地理散点名称").fill("独立覆盖层");
  await overrideLayer.getByLabel("地理散点名称").press("Tab");
  await overrideLayer.locator("details summary").click();
  await overrideLayer.getByLabel("工作区数据集").selectOption(OVERRIDE_DATASET_ID);
  await overrideLayer.getByRole("combobox", { name: "经度", exact: true }).fill("longitude");
  await overrideLayer.getByRole("combobox", { name: "纬度", exact: true }).fill("latitude");
  await overrideLayer.getByLabel("名称（可选）").fill("city");
  await overrideLayer.getByLabel("数值（可选）").fill("score");
  await expect(overrideLayer.locator("details summary")).toHaveText("数据绑定 · 独立");

  // 第三层：继承容器（含变量过滤）的区域填色 —— MapLibre 下可观测的变量切换载体。
  await page.getByLabel("新增地图图层类型").selectOption("regionFill");
  await page.getByRole("button", { name: "添加图层" }).click();
  const fillLayer = page.locator(".map-scene-inspector__layer").nth(2);
  await expect(fillLayer.locator(".map-scene-inspector__type")).toHaveText("区域填色");

  const initialValues = { "广东": 88 };
  const switchedValues = { "浙江": 92 };
  await expect(page.locator(".map-scene__layers")).toHaveText("3 个可见图层");
  await expect(page.locator(".map-scene__status")).toHaveCount(0);
  const expectedCamera = { center: [110.5, 33.25], zoom: 1.6, minZoom: 1.2, maxZoom: 5 };
  await expect.poll(() => readMapCamera(page)).toEqual(expectedCamera);
  await expect.poll(() => readScene(page)).toEqual({ regionValues: initialValues, errors: [] });
  // 关闭省名与自定义背景同样生效
  expect(await page.locator(".map-scene__label").count()).toBe(0);
  expect((await page.locator(".map-scene__surface").getAttribute("style")) ?? "").toContain("rgb(16, 32, 48)");

  // 真实表格行选择触发蓝图，把变量从广东切到浙江 → 区域填色数值随之变化。
  const hangzhouRow = page.locator(`[data-item-id="${TABLE_ID}"] .data-table-widget__table tbody tr`).filter({ hasText: "杭州" });
  await expect(hangzhouRow).toBeVisible();
  await hangzhouRow.click();
  await expect(page.getByRole("status").filter({ hasText: "蓝图运行完成" })).toBeVisible();
  await expect.poll(() => readScene(page)).toEqual({ regionValues: switchedValues, errors: [] });

  // 自动保存：容器绑定/继承层/独立覆盖层/视角分别持久化。
  await expect.poll(async () => page.evaluate(({ key, screenId, itemId }) => {
    const ws = JSON.parse(localStorage.getItem(key) ?? "null");
    const scene = ws?.screens?.find((screen: any) => screen.id === screenId)?.items?.find((item: any) => item.id === itemId);
    return {
      containerDataset: scene?.dataBinding?.datasetId ?? null,
      inheritedLayerDataset: scene?.props?.layers?.[0]?.dataBinding?.datasetId ?? null,
      overrideLayerDataset: scene?.props?.layers?.[1]?.dataBinding?.datasetId ?? null,
      mapView: scene?.props?.view ?? null,
    };
  }, { key: STORAGE_KEY, screenId: SCREEN_ID, itemId: ITEM_ID })).toEqual({
    containerDataset: DATASET_ID,
    inheritedLayerDataset: null,
    overrideLayerDataset: OVERRIDE_DATASET_ID,
    mapView: { center: [110.5, 33.25], zoom: 1.6, minZoom: 1.2, maxZoom: 5, dragEnabled: false, zoomEnabled: true, showLabels: false, backgroundColor: "#102030" },
  });

  await page.reload();
  await expect(page.locator(".workbench")).toBeVisible();
  await page.locator(`[data-item-id="${ITEM_ID}"]`).click();
  await expect(page.locator(".map-scene__layers")).toHaveText("3 个可见图层");
  const reloadedInheritedLayer = page.locator(".map-scene-inspector__layer").nth(0);
  const reloadedOverrideLayer = page.locator(".map-scene-inspector__layer").nth(1);
  await expect(reloadedInheritedLayer.locator(".map-scene-inspector__name")).toHaveValue("容器继承层");
  await expect(reloadedInheritedLayer.locator("details summary")).toHaveText("数据绑定 · 继承容器");
  await expect(reloadedOverrideLayer.locator(".map-scene-inspector__name")).toHaveValue("独立覆盖层");
  await expect(reloadedOverrideLayer.locator("details summary")).toHaveText("数据绑定 · 独立");
  // 刷新后变量回到初始值 → 区域数值回初始；再次点击表格切到浙江。
  await expect.poll(() => readScene(page)).toEqual({ regionValues: initialValues, errors: [] });
  const editorHangzhouCell = page.locator(`[data-item-id="${TABLE_ID}"] .data-table-widget__table tbody tr`).filter({ hasText: "杭州" }).getByRole("cell", { name: "杭州", exact: true });
  await editorHangzhouCell.click();
  await expect(page.getByRole("status").filter({ hasText: "蓝图运行完成" })).toBeVisible();
  await expect.poll(() => readScene(page)).toEqual({ regionValues: switchedValues, errors: [] });

  // ---------- 离线导出：真实 MapLibre 运行时 ----------
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
    return {
      datasetRows: payload.datasets.find((dataset: { id: string }) => dataset.id === "map-editor-e2e-dataset")?.rows ?? [],
      html: artifact.files.find((file: { path: string }) => file.path === "index.html")?.content ?? "",
    };
  }, { workspace, screenId: SCREEN_ID });

  // 管线过滤（score>=70）后进入 payload 的行：深圳/杭州。
  expect(offlineBuild.datasetRows.map((row: { city: string }) => row.city).sort()).toEqual(["杭州", "深圳"]);
  expect(offlineBuild.html).toContain("cf-payload");

  const offlinePage = await context.newPage();
  await offlinePage.setContent(offlineBuild.html);
  await offlinePage.waitForSelector(".maplibregl-canvas", { timeout: 25000 });
  await offlinePage.waitForFunction(() => {
    const hosts = document.querySelectorAll("[data-item]");
    for (const el of hosts) if ((el as any).__cfMap) return true;
    return false;
  }, null, { timeout: 25000 });

  const readOffline = () => offlinePage.evaluate(() => {
    let map: any = null;
    document.querySelectorAll("[data-item]").forEach((el) => { if ((el as any).__cfMap && !map) map = (el as any).__cfMap; });
    if (!map) return null;
    const c = map.getCenter();
    return {
      camera: { center: [c.lng, c.lat], zoom: map.getZoom(), minZoom: map.getMinZoom(), maxZoom: map.getMaxZoom() },
      regionValues: { ...(map.getContainer().__cfRegionValues ?? {}) },
      labelCount: document.querySelectorAll(".cf-map-labels span").length,
      surfaceStyle: document.querySelector(".cf-map-scene")?.getAttribute("style") ?? "",
    };
  });

  await expect.poll(readOffline).toMatchObject({ camera: expectedCamera, regionValues: initialValues, labelCount: 0 });
  const offlineState = await readOffline();
  expect(offlineState?.surfaceStyle).toContain("rgb(16, 32, 48)");
  const onlineCamera = await readMapCamera(page);
  expect(offlineState?.camera).toEqual(onlineCamera);

  // 离线蓝图：表格行选择切变量 → 重建后区域数值切换，且与工作台一致。
  const offlineHangzhouCell = offlinePage.locator(".cf-data-table tbody tr").filter({ hasText: "杭州" }).getByRole("cell", { name: "杭州", exact: true });
  await offlineHangzhouCell.click();
  await expect.poll(readOffline).toMatchObject({ regionValues: switchedValues });
  const finalOnline = await readScene(page);
  expect((await readOffline())?.regionValues).toEqual(finalOnline?.regionValues);
  await offlinePage.close();
});
