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
        { id: "ev-up", kind: "componentEvent", componentId: "chartforge.map-scene-flat", componentVersion: 1, event: "regionUpdrill" },
        { id: "set-up", kind: "setVariable", name: "selectedProvince", value: { source: "literal", value: "浙江省" } },
      ],
      edges: [
        { id: "edge-click", from: { nodeId: "ev-click", port: "next" }, to: { nodeId: "set-click", port: "in" } },
        { id: "edge-dbl", from: { nodeId: "ev-dbl", port: "next" }, to: { nodeId: "set-dbl", port: "in" } },
        { id: "edge-up", from: { nodeId: "ev-up", port: "next" }, to: { nodeId: "set-up", port: "in" } },
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
    const map = vueInstance?.exposed?.getMap?.();
    if (!map) return null;
    const p = map.project([120.1551, 30.2741]);
    return [p.x, p.y];
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

  // 双击 → regionClick×2 后 regionDblclick 置回广东 → 表格翻回深圳行；同时进入镜头下钻
  await page.mouse.dblclick(x, y);
  await expect(table.filter({ hasText: "深圳" })).toBeVisible();
  await expect(table.filter({ hasText: "杭州" })).toHaveCount(0);


  // 下钻：面包屑出现且相机推进（flyTo）
  const breadcrumb = page.locator(".map-scene__breadcrumb");
  await expect(breadcrumb).toBeVisible();
  await expect(breadcrumb).toContainText("全国");
  await expect(breadcrumb).toContainText("浙江省");
  await expect.poll(async () => page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    return map ? map.getZoom() : 0;
  })).toBeGreaterThan(3);

  // Esc 上钻：面包屑消失、相机回原位、regionUpdrill 把变量置回浙江
  await page.keyboard.press("Escape");
  await expect(breadcrumb).toHaveCount(0);
  await expect.poll(async () => page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    if (!map) return false;
    const c = map.getCenter();
    return Math.abs(c.lng - 104.114129) < 0.01 && Math.abs(c.lat - 35.550339) < 0.01 && Math.abs(map.getZoom() - 1.05) < 0.01;
  })).toBe(true);
  await expect(table.filter({ hasText: "杭州" })).toBeVisible();
  await expect(table.filter({ hasText: "深圳" })).toHaveCount(0);
});

test("区域点击触发 setProps 动作并深合并保留视角其余字段", async ({ page, context }) => {
  const actionWorkspace = {
    ...initialWorkspace,
    screens: initialWorkspace.screens.map((screen) => ({
      ...screen,
      blueprint: {
        nodes: [
          { id: "ev", kind: "componentEvent", componentId: "chartforge.map-scene-flat", componentVersion: 1, event: "regionClick" },
          { id: "act", kind: "componentAction", action: "setProps", componentId: "chartforge.map-scene-flat", componentVersion: 1, props: { view: { zoom: 6 } } },
        ],
        edges: [{ id: "e", from: { nodeId: "ev", port: "next" }, to: { nodeId: "act", port: "in" } }],
        variables: [],
      },
    })),
  };
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: actionWorkspace });

  await page.goto(`/#/workbench/${SCREEN_ID}`);
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
  const canvasBox = await page.locator(".map-scene__chart canvas").boundingBox();
  expect(canvasBox).not.toBeNull();
  await page.mouse.click(canvasBox!.x + (pixel as number[])[0], canvasBox!.y + (pixel as number[])[1]);

  await expect(page.getByRole("status").filter({ hasText: "蓝图运行完成" })).toBeVisible();
  // setProps { view: { zoom: 6 } } 生效且 center 未被浅覆盖丢失
  await expect.poll(async () => page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    if (!map) return null;
    const c = map.getCenter();
    return { center: [c.lng, c.lat], zoom: map.getZoom() };
  })).toEqual({ center: [104.114129, 35.550339], zoom: 6 });
});

test("关闭下钻开关后双击不进入下钻", async ({ page, context }) => {
  const disabledWorkspace = {
    ...initialWorkspace,
    screens: initialWorkspace.screens.map((screen) => ({
      ...screen,
      items: screen.items.map((item) =>
        item.id === ITEM_ID ? { ...item, props: { ...item.props, drill: { enabled: false } } } : item,
      ),
    })),
  };
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: disabledWorkspace });

  await page.goto(`/#/workbench/${SCREEN_ID}`);
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
  const canvasBox = await page.locator(".map-scene__chart canvas").boundingBox();
  expect(canvasBox).not.toBeNull();
  const zoomBefore = await page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    return map ? map.getZoom() : -1;
  });
  await page.mouse.dblclick(canvasBox!.x + (pixel as number[])[0], canvasBox!.y + (pixel as number[])[1]);

  await expect(page.getByRole("status").filter({ hasText: "蓝图运行完成" })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator(".map-scene__breadcrumb")).toHaveCount(0);
  // 下钻关闭：双击后相机保持（fitBounds 取景后仍稳定，不发生镜头推进）
  await expect.poll(async () => page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    return map ? map.getZoom() : -1;
  })).toBe(zoomBefore);
});
