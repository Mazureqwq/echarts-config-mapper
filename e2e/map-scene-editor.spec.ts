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

type SeriesData = { type: string; data: unknown[] }[];

async function readCanvasSeries(page: Page): Promise<SeriesData | null> {
  return page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const chart = vueInstance?.exposed?.getChart?.();
    if (!chart) return null;
    const series = chart.getOption()?.series ?? [];
    return series.map((entry: { type: string; data: unknown[] }) => ({
      type: entry.type,
      data: entry.data,
    }));
  });
}

async function readCanvasMapCamera(page: Page) {
  return page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const option = vueInstance?.exposed?.getChart?.()?.getOption?.();
    const rawGeo = option?.geo;
    const geo = Array.isArray(rawGeo) ? rawGeo[0] : rawGeo;
    const rawLabel = geo?.label;
    const label = Array.isArray(rawLabel) ? rawLabel[0] : rawLabel;
    return { center: geo?.center, zoom: geo?.zoom, minZoom: geo?.scaleLimit?.min, maxZoom: geo?.scaleLimit?.max, roam: geo?.roam, showLabels: label?.show, backgroundColor: option?.backgroundColor };
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

  // 在地图容器上配置共享数据、地理字段和全局变量过滤。
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

  // 第一层保持无独立绑定，明确继承容器数据与字段映射。
  await page.getByLabel("新增地图图层类型").selectOption("geoScatter");
  await page.getByRole("button", { name: "添加图层" }).click();
  const inheritedLayer = page.locator(".map-scene-inspector__layer").nth(0);
  await expect(inheritedLayer.locator(".map-scene-inspector__type")).toHaveText("地理散点");
  await expect(inheritedLayer.getByText("图层名称", { exact: true })).toBeVisible();
  await expect(inheritedLayer.locator(".map-scene-inspector__name")).toHaveValue("地理散点 1");
  await expect(inheritedLayer.locator(".map-scene-inspector__name-display")).toBeVisible();
  await expect(inheritedLayer.locator(".map-scene-inspector__name-display")).toHaveText("地理散点 1");
  await inheritedLayer.getByLabel("地理散点名称").fill("容器继承层");
  await inheritedLayer.getByLabel("地理散点名称").press("Tab");
  await expect(inheritedLayer.locator(".map-scene-inspector__name")).toHaveValue("容器继承层");
  await expect(inheritedLayer.locator(".map-scene-inspector__name-display")).toHaveText("容器继承层");
  await expect(inheritedLayer.locator("details summary")).toHaveText("数据绑定 · 继承容器");

  // 第二层绑定另一数据集，证明独立绑定覆盖而不是合并容器绑定。
  await page.getByRole("button", { name: "添加图层" }).click();
  const overrideLayer = page.locator(".map-scene-inspector__layer").nth(1);
  await expect(overrideLayer.locator(".map-scene-inspector__type")).toHaveText("地理散点");
  await expect(overrideLayer.getByText("图层名称", { exact: true })).toBeVisible();
  await expect(overrideLayer.locator(".map-scene-inspector__name")).toHaveValue("地理散点 2");
  await expect(overrideLayer.locator(".map-scene-inspector__name-display")).toBeVisible();
  await expect(overrideLayer.locator(".map-scene-inspector__name-display")).toHaveText("地理散点 2");
  await overrideLayer.getByLabel("地理散点名称").fill("独立覆盖层");
  await overrideLayer.getByLabel("地理散点名称").press("Tab");
  await expect(overrideLayer.locator(".map-scene-inspector__name")).toHaveValue("独立覆盖层");
  await expect(overrideLayer.locator(".map-scene-inspector__name-display")).toHaveText("独立覆盖层");
  await overrideLayer.locator("details summary").click();
  await overrideLayer.getByLabel("工作区数据集").selectOption(OVERRIDE_DATASET_ID);
  await overrideLayer.getByRole("combobox", { name: "经度", exact: true }).fill("longitude");
  await overrideLayer.getByRole("combobox", { name: "纬度", exact: true }).fill("latitude");
  await overrideLayer.getByLabel("名称（可选）").fill("city");
  await overrideLayer.getByLabel("数值（可选）").fill("score");
  await expect(overrideLayer.locator("details summary")).toHaveText("数据绑定 · 独立");

  const initialSeries = [
    { type: "scatter", data: [{ name: "深圳", value: [114.0579, 22.5431, 88] }] },
    { type: "scatter", data: [{ name: "重庆独立", value: [106.5516, 29.563, 71] }] },
  ];
  const switchedSeries = [
    { type: "scatter", data: [{ name: "杭州", value: [120.1551, 30.2741, 92] }] },
    { type: "scatter", data: [{ name: "重庆独立", value: [106.5516, 29.563, 71] }] },
  ];
  await expect(page.locator(".map-scene__layers")).toHaveText("2 个可见图层");
  await expect(page.locator(".map-scene__status")).toHaveCount(0);
  const expectedMapCamera = { center: [110.5, 33.25], zoom: 1.6, minZoom: 1.2, maxZoom: 5, roam: "scale", showLabels: false, backgroundColor: "#102030" };
  await expect.poll(() => readCanvasSeries(page)).toEqual(initialSeries);
  await expect.poll(() => readCanvasMapCamera(page)).toEqual(expectedMapCamera);

  // 真实表格行选择触发受控蓝图，将全局变量从广东切换为浙江。
  const hangzhouRow = page.locator(`[data-item-id="${TABLE_ID}"] .data-table-widget__table tbody tr`).filter({ hasText: "杭州" });
  await expect(hangzhouRow).toBeVisible();
  await hangzhouRow.click();
  await expect(page.getByRole("status").filter({ hasText: "蓝图运行完成" })).toBeVisible();
  await expect.poll(() => readCanvasSeries(page)).toEqual(switchedSeries);

  // 等待自动保存，确认容器绑定、继承层与独立覆盖层分别持久化。
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
  await expect(page.locator(".map-scene__layers")).toHaveText("2 个可见图层");
  const reloadedInheritedLayer = page.locator(".map-scene-inspector__layer").nth(0);
  const reloadedOverrideLayer = page.locator(".map-scene-inspector__layer").nth(1);
  await expect(reloadedInheritedLayer.locator(".map-scene-inspector__type")).toHaveText("地理散点");
  await expect(reloadedInheritedLayer.locator(".map-scene-inspector__name")).toHaveValue("容器继承层");
  await expect(reloadedInheritedLayer.locator(".map-scene-inspector__name-display")).toBeVisible();
  await expect(reloadedInheritedLayer.locator(".map-scene-inspector__name-display")).toHaveText("容器继承层");
  await expect(reloadedInheritedLayer.locator("details summary")).toHaveText("数据绑定 · 继承容器");
  await expect(reloadedOverrideLayer.locator(".map-scene-inspector__type")).toHaveText("地理散点");
  await expect(reloadedOverrideLayer.locator(".map-scene-inspector__name")).toHaveValue("独立覆盖层");
  await expect(reloadedOverrideLayer.locator(".map-scene-inspector__name-display")).toBeVisible();
  await expect(reloadedOverrideLayer.locator(".map-scene-inspector__name-display")).toHaveText("独立覆盖层");
  await expect(reloadedOverrideLayer.locator("details summary")).toHaveText("数据绑定 · 独立");
  // 编辑器会在刷新后从变量初始值重建运行时状态；再次通过表格事件切换到浙江。
  await expect.poll(() => readCanvasSeries(page)).toEqual(initialSeries);
  const editorHangzhouCell = page.locator(`[data-item-id="${TABLE_ID}"] .data-table-widget__table tbody tr`).filter({ hasText: "杭州" }).getByRole("cell", { name: "杭州", exact: true });
  await editorHangzhouCell.click();
  await expect(page.getByRole("status").filter({ hasText: "蓝图运行完成" })).toBeVisible();
  await expect.poll(() => readCanvasSeries(page)).toEqual(switchedSeries);

  const workspace = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), STORAGE_KEY);
  const offlineBuild = await page.evaluate(async ({ workspace, screenId }) => {
    const snapshotUrl = new URL("/src/core/export/snapshot.ts", location.href).href;
    const artifactUrl = new URL("/src/core/export/artifact.ts", location.href).href;
    const runtimeUrl = new URL("/src/core/export/runtime.ts", location.href).href;
    const [snapshotModule, artifactModule, runtimeModule] = await Promise.all([
      import(snapshotUrl), import(artifactUrl), import(runtimeUrl),
    ]);
    const payload = snapshotModule.buildPackagePayload(workspace, [screenId]);
    // 测试桩仅捕获离线 runtime 交给 ECharts 的 option；数据包与 runtime 仍由正式导出器生成。
    const echartsCode = `(function(){window.__cfCapturedOptions=[];window.echarts={registerMap:function(){},init:function(){return{setOption:function(option){window.__cfCapturedOptions.push(option);},resize:function(){},dispose:function(){}};}};})();`;
    const artifact = await artifactModule.buildArtifact({
      payload,
      echartsCode,
      runtimeCode: runtimeModule.RUNTIME_CODE,
      mode: "inline",
      now: () => 1794280000000,
    });
    return {
      datasetRows: payload.datasets.find((dataset: { id: string }) => dataset.id === "map-editor-e2e-dataset")?.rows ?? [],
      html: artifact.files.find((file: { path: string }) => file.path === "index.html")?.content ?? "",
    };
  }, { workspace, screenId: SCREEN_ID });

  // 两份数据快照分别进入离线 runtime；管线过滤后容器变量过滤仍只留下初始省份。
  expect(offlineBuild.datasetRows.map((row: { city: string }) => row.city).sort()).toEqual(["杭州", "深圳"]);
  expect(offlineBuild.html).toContain("cf-payload");
  const offlinePage = await context.newPage();
  await offlinePage.setContent(offlineBuild.html);
  await offlinePage.waitForFunction(() => {
    const options = (window as any).__cfCapturedOptions;
    return Array.isArray(options) && options.length > 0;
  });
  const readLatestOfflineSeries = () => offlinePage.evaluate(() => {
    const options = (window as any).__cfCapturedOptions ?? [];
    const option = options[options.length - 1];
    return (option?.series ?? []).map((entry: { type: string; data: unknown[] }) => ({ type: entry.type, data: entry.data }));
  });
  const readLatestOfflineCamera = () => offlinePage.evaluate(() => {
    const options = (window as any).__cfCapturedOptions ?? [];
    const option = options[options.length - 1];
    const geo = Array.isArray(option?.geo) ? option.geo[0] : option?.geo;
    return { center: geo?.center, zoom: geo?.zoom, minZoom: geo?.scaleLimit?.min, maxZoom: geo?.scaleLimit?.max, roam: geo?.roam, showLabels: geo?.label?.show, backgroundColor: option?.backgroundColor };
  });
  await expect.poll(readLatestOfflineSeries).toEqual(initialSeries);
  await expect.poll(readLatestOfflineCamera).toEqual(expectedMapCamera);
  expect(await readLatestOfflineCamera()).toEqual(await readCanvasMapCamera(page));

  // 离线包里的同一表格交互与蓝图也切换变量，继承层更新、独立图层保持原数据。
  const offlineHangzhouCell = offlinePage.locator(".cf-data-table tbody tr").filter({ hasText: "杭州" }).getByRole("cell", { name: "杭州", exact: true });
  await offlineHangzhouCell.click();
  await offlinePage.waitForFunction(() => ((window as any).__cfCapturedOptions ?? []).length >= 2);
  await expect.poll(readLatestOfflineSeries).toEqual(switchedSeries);
  expect(await readLatestOfflineSeries()).toEqual(await readCanvasSeries(page));
  await offlinePage.close();
});
