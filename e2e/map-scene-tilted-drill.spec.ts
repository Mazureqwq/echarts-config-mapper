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

  // 探针：区域系列像素点（选无散点遮挡的浙江省界内点）
  const pixel = await page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const chart = vueInstance?.exposed?.getChart?.();
    return chart?.convertToPixel?.({ seriesIndex: 0 }, [120.1551, 30.2741]) ?? null;
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
    const option = vueInstance?.exposed?.getChart?.()?.getOption?.();
    const geo = Array.isArray(option?.geo) ? option.geo[option.geo.length - 1] : option?.geo;
    return typeof geo?.zoom === "number" ? geo.zoom : 0;
  })).toBeGreaterThan(3);

  // Esc 上钻：面包屑消失、相机回原位（四层叠片保持对齐）
  await page.keyboard.press("Escape");
  await expect(breadcrumb).toHaveCount(0);
  await expect.poll(async () => page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const option = vueInstance?.exposed?.getChart?.()?.getOption?.();
    const geos = Array.isArray(option?.geo) ? option.geo : [option?.geo];
    const top = geos[geos.length - 1];
    if (!Array.isArray(top?.center) || typeof top?.zoom !== "number") return false;
    const aligned = geos.every((g: any) => JSON.stringify(g.center) === JSON.stringify(top.center) && g.zoom === top.zoom);
    return aligned && Math.abs(top.zoom - 1.05) < 0.01;
  })).toBe(true);
});
