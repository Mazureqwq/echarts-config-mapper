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

test("检查器三页签、图层模板、缩放级别与交互页", async ({ page, context }) => {
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

  // 样式页：三页签 + 图层模板按钮（皮肤体系已随 T9 废弃清理移除）
  await expect(inspector.getByRole("tab", { name: "样式", exact: true })).toBeVisible();
  await expect(inspector.getByRole("tab", { name: "数据", exact: true })).toBeVisible();
  await expect(inspector.getByRole("tab", { name: "交互", exact: true })).toBeVisible();
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

  // 外观与图例控件：图例开关/位置、边线线型、值格式化
  const appearance = inspector.locator(".map-scene-inspector__section").filter({ hasText: "外观与图例" });
  await expect(appearance.getByLabel("显示图例")).toBeVisible();
  await appearance.getByLabel("图例位置").selectOption("bottom-left");
  await appearance.getByLabel("边线线型").selectOption("dashed");
  await appearance.getByLabel("数值小数位").fill("2");
  await appearance.getByLabel("数值小数位").press("Tab");
  await appearance.getByLabel("数值单位").fill(" 个");
  await appearance.getByLabel("数值单位").press("Tab");
  await expect.poll(async () => page.evaluate(({ key, screenId, itemId }) => {
    const ws = JSON.parse(localStorage.getItem(key) ?? "null");
    const props = ws?.screens?.find((s: any) => s.id === screenId)?.items?.find((i: any) => i.id === itemId)?.props ?? {};
    return {
      position: props.legend?.position ?? null,
      borderType: props.border?.type ?? null,
      decimals: props.valueFormat?.decimals ?? null,
      suffix: props.valueFormat?.suffix ?? null,
    };
  }, { key: STORAGE_KEY, screenId: SCREEN_ID, itemId: ITEM_ID })).toEqual({ position: "bottom-left", borderType: "dashed", decimals: 2, suffix: " 个" });

  // 图层色带控件：区域填色 1 切分段 + 分段数 + 低值色
  const heatLayer = inspector.locator(".map-scene-inspector__layer").nth(2);
  await heatLayer.getByLabel("区域填色 1色带模式").selectOption("segments");
  await expect.poll(async () => page.evaluate(({ key, screenId, itemId }) => {
    const ws = JSON.parse(localStorage.getItem(key) ?? "null");
    const layer = ws?.screens?.find((s: any) => s.id === screenId)?.items?.find((i: any) => i.id === itemId)?.props?.layers?.find((l: any) => l.name === "区域填色 1");
    return layer?.style?.colorMode ?? null;
  }, { key: STORAGE_KEY, screenId: SCREEN_ID, itemId: ITEM_ID })).toBe("segments");
  await heatLayer.getByLabel("区域填色 1分段数").fill("4");
  await heatLayer.getByLabel("区域填色 1分段数").press("Tab");
  await heatLayer.getByLabel("区域填色 1色带低值色").evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = "#0a0a14";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect.poll(async () => page.evaluate(({ key, screenId, itemId }) => {
    const ws = JSON.parse(localStorage.getItem(key) ?? "null");
    const layer = ws?.screens?.find((s: any) => s.id === screenId)?.items?.find((i: any) => i.id === itemId)?.props?.layers?.find((l: any) => l.name === "区域填色 1");
    return { segments: layer?.style?.segments ?? null, min: layer?.style?.colors?.min ?? null };
  }, { key: STORAGE_KEY, screenId: SCREEN_ID, itemId: ITEM_ID })).toEqual({ segments: 4, min: "#0a0a14" });

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
