import { expect, test } from "@playwright/test";

const STORAGE_KEY = "chartforge.workspace.v1";
const SCREEN_ID = "map-inspector-e2e-screen";
const ITEM_ID = "map-inspector-e2e-scene";

const initialWorkspace = {
  version: 2,
  assets: [],
  designAssets: [],
  screens: [{
    id: SCREEN_ID,
    name: "地图检查器 E2E",
    canvas: { width: 1280, height: 720, background: { kind: "color", color: "#12161d" } },
    items: [{
      id: ITEM_ID,
      name: "检查器地图",
      kind: "component",
      componentId: "chartforge.map-scene-tilted",
      componentVersion: 1,
      frame: { x: 60, y: 50, w: 900, h: 560, rotate: 0 },
      props: { presentation: "tilted", pitch: 28, layers: [] },
    }],
    updatedAt: Date.now(),
  }],
  datasets: [],
  settings: { autosave: true },
};

test("检查器三页签、皮肤、图层模板、缩放级别与交互页", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
  await page.locator(`[data-item-id="${ITEM_ID}"]`).click();
  const inspector = page.locator(".map-scene-inspector");
  await expect(inspector).toBeVisible();

  // 样式页：三页签 + 5 张皮肤卡 + 图层模板按钮
  await expect(inspector.getByRole("tab", { name: "样式", exact: true })).toBeVisible();
  await expect(inspector.getByRole("tab", { name: "数据", exact: true })).toBeVisible();
  await expect(inspector.getByRole("tab", { name: "交互", exact: true })).toBeVisible();
  await expect(inspector.locator(".map-scene-inspector__skin")).toHaveCount(5);
  await expect(inspector.getByRole("button", { name: "区域热力+图例" })).toBeVisible();

  // 模板：散点+飞线一次生成两层
  await inspector.getByRole("button", { name: "散点+飞线" }).click();
  await expect(inspector.locator(".map-scene-inspector__layer")).toHaveCount(2);
  await expect(inspector.getByText("地理散点 1")).toBeVisible();
  await expect(inspector.getByText("OD 飞线 1")).toBeVisible();

  // 图层可见缩放级别输入
  await expect(inspector.getByLabel("地理散点 1最小缩放")).toBeVisible();
  await inspector.getByLabel("地理散点 1最大缩放").fill("4");
  await inspector.getByLabel("地理散点 1最大缩放").press("Tab");
  await expect.poll(async () => page.evaluate(({ key, screenId, itemId }) => {
    const ws = JSON.parse(localStorage.getItem(key) ?? "null");
    const scene = ws?.screens?.find((s: any) => s.id === screenId)?.items?.find((i: any) => i.id === itemId);
    return scene?.props?.layers?.find((l: any) => l.name === "地理散点 1")?.maxZoom ?? null;
  }, { key: STORAGE_KEY, screenId: SCREEN_ID, itemId: ITEM_ID })).toBe(4);

  // 区域热力+图例模板：生成区域填色层并打开图例开关
  await inspector.getByRole("button", { name: "区域热力+图例" }).click();
  await expect(inspector.locator(".map-scene-inspector__layer")).toHaveCount(3);
  await expect.poll(async () => page.evaluate(({ key, screenId, itemId }) => {
    const ws = JSON.parse(localStorage.getItem(key) ?? "null");
    const scene = ws?.screens?.find((s: any) => s.id === screenId)?.items?.find((i: any) => i.id === itemId);
    return scene?.props?.legend?.show ?? null;
  }, { key: STORAGE_KEY, screenId: SCREEN_ID, itemId: ITEM_ID })).toBe(true);

  // 数据页：共享数据绑定字段
  await inspector.getByRole("tab", { name: "数据", exact: true }).click();
  await expect(inspector.getByLabel("工作区数据集")).toBeVisible();

  // 交互页：下钻开关 + 打开蓝图编辑器
  await inspector.getByRole("tab", { name: "交互", exact: true }).click();
  const drillToggle = inspector.getByLabel("双击区域下钻定位");
  await expect(drillToggle).toBeVisible();
  await drillToggle.uncheck();
  await expect.poll(async () => page.evaluate(({ key, screenId, itemId }) => {
    const ws = JSON.parse(localStorage.getItem(key) ?? "null");
    const scene = ws?.screens?.find((s: any) => s.id === screenId)?.items?.find((i: any) => i.id === itemId);
    return scene?.props?.drill?.enabled ?? null;
  }, { key: STORAGE_KEY, screenId: SCREEN_ID, itemId: ITEM_ID })).toBe(false);

  await inspector.getByRole("button", { name: "打开蓝图编辑器" }).click();
  await expect(page.locator(".blueprint-editor")).toBeVisible();
  await page.reload();
  await expect(page.locator(".workbench")).toBeVisible();
});
