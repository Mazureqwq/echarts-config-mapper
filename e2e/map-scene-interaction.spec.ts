import { expect, test } from "@playwright/test";

const STORAGE_KEY = "chartforge.workspace.v1";
const SCREEN_ID = "map-interaction-e2e-screen";
const ITEM_ID = "map-interaction-e2e-scene";
const TABLE_ID = "map-interaction-e2e-table";
const DATASET_ID = "map-interaction-e2e-dataset";

const initialWorkspace = {
  version: 2,
  assets: [],
  designAssets: [],
  screens: [{
    id: SCREEN_ID,
    name: "地图事件 E2E",
    canvas: { width: 1280, height: 720, background: { kind: "color", color: "#12161d" } },
    items: [
      {
        id: ITEM_ID,
        name: "事件地图",
        kind: "component",
        componentId: "chartforge.map-scene-flat",
        componentVersion: 1,
        frame: { x: 60, y: 60, w: 760, h: 520, rotate: 0 },
        dataBinding: { datasetId: DATASET_ID, fields: { category: "province", value: "score" } },
        props: {
          presentation: "flat",
          pitch: 0,
          layers: [{ id: "fill", type: "regionFill", name: "热度", visible: true, style: { color: "#32d6ff", opacity: 0.85, size: 12 } }],
        },
      },
      {
        id: TABLE_ID,
        name: "省份表",
        kind: "component",
        componentId: "chartforge.data-table",
        componentVersion: 1,
        frame: { x: 860, y: 60, w: 340, h: 280, rotate: 0 },
        props: {
          columns: [{ field: "province", label: "省份", format: "text" }, { field: "city", label: "城市", format: "text" }],
          rowKey: "city",
          striped: true,
        },
        dataBinding: {
          datasetId: DATASET_ID,
          fields: { category: "province", value: "score" },
          filterBy: { field: "province", globalVariable: "selectedProvince" },
        },
      },
    ],
    blueprint: {
      nodes: [
        { id: "ev-click", kind: "componentEvent", componentId: "chartforge.map-scene-flat", componentVersion: 1, event: "regionClick" },
        { id: "set-click", kind: "setVariable", name: "selectedProvince", value: { source: "event", path: "name" } },
        { id: "ev-dbl", kind: "componentEvent", componentId: "chartforge.map-scene-flat", componentVersion: 1, event: "regionDblclick" },
        { id: "set-dbl", kind: "setVariable", name: "selectedProvince", value: { source: "literal", value: "广东省" } },
      ],
      edges: [
        { id: "edge-click", from: { nodeId: "ev-click", port: "next" }, to: { nodeId: "set-click", port: "in" } },
        { id: "edge-dbl", from: { nodeId: "ev-dbl", port: "next" }, to: { nodeId: "set-dbl", port: "in" } },
      ],
      variables: [{ name: "selectedProvince", type: "string", initialValue: "广东省" }],
    },
    updatedAt: Date.now(),
  }],
  datasets: [{
    id: DATASET_ID,
    name: "省份数据",
    source: {
      kind: "static",
      data: [
        { province: "广东省", city: "深圳", score: 92 },
        { province: "浙江省", city: "杭州", score: 78 },
      ],
    },
    pipeline: { filter: [] },
  }],
  settings: { autosave: true },
};

test("区域单击与双击驱动蓝图变量联动表格过滤", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
  await expect(page.locator(".map-scene__chart")).toBeVisible();
  await page.waitForTimeout(700);

  const table = page.locator(`[data-item-id="${TABLE_ID}"] .data-table-widget__table tbody tr`);
  // 初始变量为广东 → 表格仅深圳行
  await expect(table.filter({ hasText: "深圳" })).toBeVisible();

  // 计算浙江省在画布上的像素位置
  const pixel = await page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const chart = vueInstance?.exposed?.getChart?.();
    return chart?.convertToPixel?.({ geoIndex: 0 }, [120.1551, 30.2741]) ?? null;
  });
  expect(pixel).not.toBeNull();
  const canvasBox = await page.locator(".map-scene__chart canvas").boundingBox();
  expect(canvasBox).not.toBeNull();
  const x = canvasBox!.x + (pixel as number[])[0];
  const y = canvasBox!.y + (pixel as number[])[1];

  // 单击浙江省 → regionClick 抛 name → 变量=浙江 → 表格仅杭州行
  await page.mouse.click(x, y);
  await expect(page.getByRole("status").filter({ hasText: "蓝图运行完成" })).toBeVisible();
  await expect(table.filter({ hasText: "杭州" })).toBeVisible();
  await expect(table.filter({ hasText: "深圳" })).toHaveCount(0);

  // 双击 → regionClick×2 后 regionDblclick 置回广东 → 表格翻回深圳行
  await page.mouse.dblclick(x, y);
  await expect(table.filter({ hasText: "深圳" })).toBeVisible();
  await expect(table.filter({ hasText: "杭州" })).toHaveCount(0);
});
