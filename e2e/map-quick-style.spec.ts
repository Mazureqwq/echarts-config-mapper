import { expect, test, type Page } from "@playwright/test";

/**
 * T11：地图「快速样式」集合（3×2 六张缩略图）的工作台 / 离线双端校验。
 *
 * 覆盖：
 * - 检查器里的「快速样式」下拉与 3×2 六项网格，选中态与点击回写 props；
 * - 预设色带 / 大气（sky·horizon·fog）/ 背景在工作台与离线产物里完全一致；
 * - 旧 props（无 quickStyle）行为不变，且不复活已移除的皮肤字段。
 */

const STORAGE_KEY = "chartforge.workspace.v1";
const SCREEN_ID = "map-quick-style-screen";
const ITEM_ID = "map-quick-style-scene";
const DATASET_ID = "map-quick-style-dataset";

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
    name: "快速样式双端校验",
    canvas: { width: 1280, height: 720, background: { kind: "color", color: "#050b12" } },
    items: [{
      id: ITEM_ID,
      name: "快速样式地图",
      kind: "component",
      componentId: "chartforge.map-scene-tilted",
      componentVersion: 1,
      frame: { x: 60, y: 50, w: 900, h: 560, rotate: 0 },
      dataBinding: { datasetId: DATASET_ID, fields: { category: "province", value: "score" } },
      props: {
        presentation: "tilted",
        pitch: 28,
        view: { center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8, dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622" },
        layers: [{
          id: "fill",
          type: "regionFill",
          name: "热度",
          visible: true,
          style: { color: "#32d6ff", opacity: 0.85, size: 12 },
        }],
      },
    }],
    updatedAt: Date.now(),
  }],
  datasets: [
    { id: DATASET_ID, name: "省级热度", source: { kind: "static", data: rows }, pipeline: { filter: [] } },
  ],
  settings: { autosave: true },
};

async function readWorkbenchStyle(page: Page) {
  return page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    if (!map) return null;
    const style: any = map.getStyle();
    const fill = (style?.layers ?? []).find((l: any) => l.id === "cf-fill");
    return {
      skyColor: style?.sky?.["sky-color"] ?? null,
      horizonColor: style?.sky?.["horizon-color"] ?? null,
      fogColor: style?.sky?.["fog-color"] ?? null,
      fillColor: fill?.paint?.["fill-color"] ?? null,
      outline: fill?.paint?.["fill-outline-color"] ?? null,
    };
  });
}

async function readOfflineStyle(page: Page) {
  return page.evaluate(() => {
    let map: any = null;
    document.querySelectorAll("[data-item]").forEach((el) => { if ((el as any).__cfMap && !map) map = (el as any).__cfMap; });
    if (!map) return null;
    const style: any = map.getStyle();
    const fill = (style?.layers ?? []).find((l: any) => l.id === "cf-fill");
    return {
      skyColor: style?.sky?.["sky-color"] ?? null,
      horizonColor: style?.sky?.["horizon-color"] ?? null,
      fogColor: style?.sky?.["fog-color"] ?? null,
      fillColor: fill?.paint?.["fill-color"] ?? null,
      outline: fill?.paint?.["fill-outline-color"] ?? null,
    };
  });
}

async function buildOfflineHtml(page: Page, screenId: string) {
  const workspace = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), STORAGE_KEY);
  return page.evaluate(async ({ workspace, screenId }) => {
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
    return artifact.files.find((file: { path: string }) => file.path === "index.html")?.content ?? "";
  }, { workspace, screenId });
}

async function openOffline(page: Page, context: any, screenId: string) {
  const html = await buildOfflineHtml(page, screenId);
  const offlinePage = await context.newPage();
  offlinePage.on("pageerror", (e) => console.log("OFFLINE_PAGEERROR " + String(e).slice(0, 300)));
  await offlinePage.setContent(html);
  await offlinePage.waitForSelector(".maplibregl-canvas", { timeout: 25000 });
  await offlinePage.waitForFunction(() => {
    let map: any = null;
    document.querySelectorAll("[data-item]").forEach((el) => { if ((el as any).__cfMap && !map) map = (el as any).__cfMap; });
    // T13-a：逐帧动画会让 source 持续处于 reload 状态，map.loaded() / isStyleLoaded()
    // 因此永远为 false；改用「样式已解析完成（style._loaded）+ 相机未移动」判定就绪。
    return Boolean(map && map.style && map.style._loaded === true && !map.isMoving());
  }, null, { timeout: 25000 });
  return offlinePage;
}

/** 读取工作台存储里的地图组件 props（用于断言快速样式回写结果）。 */
async function readStoredProps(page: Page) {
  return page.evaluate((key) => {
    const workspace = JSON.parse(localStorage.getItem(key) ?? "null");
    const screen = workspace?.screens?.find((entry: any) => entry.id === "map-quick-style-screen");
    const item = screen?.items?.find((entry: any) => entry.id === "map-quick-style-scene");
    return item?.props ?? null;
  }, STORAGE_KEY);
}

test("快速样式：检查器 3×2 六张缩略图与选中态", async ({ page }) => {
  await page.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();

  // 选中组件后检查器出现「快速样式」触发器
  await page.locator(`[data-item-id="${ITEM_ID}"]`).click();
  await expect(page.locator(".map-scene-inspector")).toBeVisible();
  const trigger = page.getByTestId("map-quick-style-trigger");
  await expect(trigger).toBeVisible();
  await expect(trigger).toContainText("快速样式");

  await trigger.click();
  const panel = page.getByTestId("map-quick-style-panel");
  await expect(panel).toBeVisible();

  // 3 列 × 2 行 = 六项
  const items = panel.locator(".map-quick-style__item");
  await expect(items).toHaveCount(6);
  const boxes = await items.evaluateAll((nodes) => nodes.map((node) => {
    const rect = (node as HTMLElement).getBoundingClientRect();
    return { x: Math.round(rect.x), y: Math.round(rect.y) };
  }));
  const columns = new Set(boxes.map((box) => box.x));
  const rowsCount = new Set(boxes.map((box) => box.y));
  expect(columns.size).toBe(3);
  expect(rowsCount.size).toBe(2);

  // 每张缩略图都是真实省界矢量（而不是抽象色卡）
  for (const item of await items.all()) {
    await expect(item.locator("svg path").first()).toBeVisible();
  }

  // 初始无选中项 → 点击第三项后应出现选中态并回写 props
  await expect(items.nth(2)).not.toHaveAttribute("aria-pressed", "true");
  await items.nth(2).click();
  await expect(page.getByTestId("map-quick-style-panel")).toHaveCount(0);

  // 再次展开后第三项应处于选中态
  await trigger.click();
  await expect(page.getByTestId("map-quick-style-panel").locator('[data-style-id="sandstone"]'))
    .toHaveAttribute("aria-pressed", "true");

  await expect.poll(async () => (await readStoredProps(page))?.quickStyle?.id ?? null).toBe("sandstone");
  const stored = await readStoredProps(page);
  expect(stored?.view?.backgroundColor).toBe("#1a1206");
  expect(stored?.quickStyle?.tokens?.fill?.max).toBe("#ffd98a");
});

test("快速样式：预设色带与大气在工作台 / 离线双端一致", async ({ page, context }) => {
  await page.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".map-scene__chart")).toBeVisible();

  // 通过检查器选择「霓虹紫蓝」预设
  await page.locator(`[data-item-id="${ITEM_ID}"]`).click();
  await page.getByTestId("map-quick-style-trigger").click();
  await page.getByTestId("map-quick-style-panel").locator('[data-style-id="nebula"]').click();

  await expect.poll(async () => (await readWorkbenchStyle(page))?.skyColor != null).toBe(true);
  const workbench = await readWorkbenchStyle(page);
  expect(workbench?.skyColor).toBe("#120a22");
  expect(workbench?.horizonColor).toBe("#2f1d55");
  expect(workbench?.fogColor).toBe("#120a22");
  expect(JSON.stringify(workbench?.fillColor)).toContain("#c4a8ff");

  // 等自动保存落盘后再构建离线产物（产物读取同一份 workspace）
  await expect.poll(async () => (await readStoredProps(page))?.quickStyle?.id ?? null).toBe("nebula");

  // 离线产物用同一份 props 渲染
  const offlinePage = await openOffline(page, context, SCREEN_ID);
  const offline = await readOfflineStyle(offlinePage);
  expect(offline?.skyColor).toBe(workbench?.skyColor);
  expect(offline?.horizonColor).toBe(workbench?.horizonColor);
  expect(offline?.fogColor).toBe(workbench?.fogColor);
  expect(JSON.stringify(offline?.fillColor)).toBe(JSON.stringify(workbench?.fillColor));
  expect(offline?.outline).toBe(workbench?.outline);
  await offlinePage.close();
});

test("快速样式：未选择预设时保持既有外观（不复活皮肤字段）", async ({ page, context }) => {
  await page.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".map-scene__chart")).toBeVisible();
  await expect.poll(async () => (await readWorkbenchStyle(page))?.skyColor != null).toBe(true);

  const workbench = await readWorkbenchStyle(page);
  expect(workbench?.skyColor).toBe("#0a1628");
  expect(workbench?.horizonColor).toBe("#12314d");
  expect(workbench?.fogColor).toBe("#0a1628");

  const offlinePage = await openOffline(page, context, SCREEN_ID);
  const offline = await readOfflineStyle(offlinePage);
  expect(offline?.skyColor).toBe("#0a1628");
  expect(offline?.horizonColor).toBe("#12314d");
  expect(offline?.fogColor).toBe("#0a1628");
  await offlinePage.close();

  // props 里不得出现已移除的皮肤字段
  const stored = await readStoredProps(page);
  expect(stored).not.toHaveProperty("underlay");
  expect(stored).not.toHaveProperty("appliedSkin");
  expect(stored?.quickStyle).toBeUndefined();
});

test("快速样式：六张缩略图呈现各自独立的视觉观感（参考图的六种处理）", async ({ page }) => {
  await page.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
  await page.locator(`[data-item-id="${ITEM_ID}"]`).click();
  await expect(page.locator(".map-scene-inspector")).toBeVisible();
  await page.getByTestId("map-quick-style-trigger").click();
  const panel = page.getByTestId("map-quick-style-panel");
  await expect(panel).toBeVisible();

  const ids = ["deep-sea", "jade", "sandstone", "nebula", "contour", "parchment"];
  const shots = new Map<string, Buffer>();
  for (const id of ids) {
    const thumb = panel.locator(`[data-style-id="${id}"] .map-quick-style__thumb`);
    await expect(thumb).toBeVisible();
    // 每张缩略图的陆地图层仍是 34 省真实矢量
    await expect(thumb.locator(".map-quick-style-thumb__land path")).toHaveCount(34);
    shots.set(id, await thumb.screenshot());
  }

  // 六张缩略图必须两两不同——不能只是同一张图换配色
  const digests = [...shots.values()].map((buffer) => buffer.toString("base64"));
  expect(new Set(digests).size).toBe(6);

  // 霓虹观感：内部近黑 + 国界辉光层（辉光层复刻同一份 34 省几何）
  const nebula = panel.locator('[data-style-id="nebula"]');
  await expect(nebula.locator(".map-quick-style-thumb__glow")).toHaveCount(1);
  await expect(nebula.locator(".map-quick-style-thumb__glow path")).toHaveCount(34);

  // 等高线观感：专属等高线纹理层
  const contour = panel.locator('[data-style-id="contour"]');
  await expect(contour.locator(".map-quick-style-thumb__contour")).toHaveCount(1);
  await expect(contour.locator(".map-quick-style-thumb__contour path")).toHaveCount(34);

  // 宣纸观感：浅色底；深海观感：深色底（读缩略图自身绘制的背景渐变，而非容器 CSS 兜底色）
  const backgroundOf = async (id: string): Promise<string> =>
    panel.locator(`#cf-thumb-bg-${id} stop`).first().getAttribute("stop-color") ?? "";
  const backgrounds = await Promise.all(ids.map((id) => backgroundOf(id)));
  expect(new Set(backgrounds).size).toBe(6);
  const parchmentBg = await backgroundOf("parchment");
  const deepSeaBg = await backgroundOf("deep-sea");
  expect(parchmentBg).not.toBe(deepSeaBg);
});
