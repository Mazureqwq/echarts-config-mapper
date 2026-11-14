import { expect, test } from "@playwright/test";

const STORAGE_KEY = "chartforge.workspace.v1";

const workspace = {
  version: 2,
  assets: [],
  designAssets: [],
  screens: [{
    id: "tilted-drill-screen",
    name: "2.5D 下钻",
    canvas: { width: 1280, height: 720, background: { kind: "color", color: "#050b12" } },
    items: [{
      id: "tilted-drill-item",
      name: "立体地图",
      kind: "component",
      componentId: "chartforge.map-scene-tilted",
      componentVersion: 1,
      frame: { x: 60, y: 50, w: 900, h: 560, rotate: 0 },
      dataBinding: { datasetId: "ds", fields: { category: "province", value: "score" } },
      props: {
        presentation: "tilted",
        pitch: 28,
        view: { center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8, dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622" },
        layers: [{ id: "fill", type: "regionFill", name: "热度", visible: true, style: { color: "#32d6ff", opacity: 0.85, size: 12 } }],
      },
    }],
    updatedAt: Date.now(),
  }],
  datasets: [{ id: "ds", name: "省份", source: { kind: "static", data: [{ province: "广东省", score: 92 }, { province: "浙江省", score: 78 }] }, pipeline: { filter: [] } }],
  settings: { autosave: true },
};

test("2.5D 立体地图双击区域进入镜头下钻", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, ws }) => {
    if (localStorage.getItem(storageKey) === null) localStorage.setItem(storageKey, JSON.stringify(ws));
  }, { storageKey: STORAGE_KEY, ws: workspace });
  await page.goto("/#/workbench/tilted-drill-screen");
  await expect(page.locator(".workbench")).toBeVisible();
  await expect(page.locator(".map-scene__chart")).toBeVisible();
  await page.waitForTimeout(800);

  const pixel = await page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    if (!map) return null;
    const p = map.project([120.1551, 30.2741]);
    return [p.x, p.y];
  });
  expect(pixel).not.toBeNull();
  const box = await page.locator(".map-scene__chart canvas").boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.dblclick(box!.x + (pixel as number[])[0], box!.y + (pixel as number[])[1]);

  const breadcrumb = page.locator(".map-scene__breadcrumb");
  await expect(breadcrumb).toBeVisible();
  await expect(breadcrumb).toContainText("全国");
  await expect(breadcrumb).toContainText("浙江省");
  await expect.poll(async () => page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    return map ? map.getZoom() : 0;
  })).toBeGreaterThan(3);

  // Esc 上钻：面包屑消失、相机回原位（单地图，无叠片对齐概念）
  await page.keyboard.press("Escape");
  await expect(breadcrumb).toHaveCount(0);
  await expect.poll(async () => page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    if (!map) return false;
    const c = map.getCenter();
    return Math.abs(c.lng - 104.114129) < 0.01 && Math.abs(c.lat - 35.550339) < 0.01 && Math.abs(map.getZoom() - 1.05) < 0.01;
  })).toBe(true);
});
