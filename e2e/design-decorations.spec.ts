import { expect, test, type Page } from "@playwright/test";

/**
 * T17：内置装饰素材的真实 UI 行为。
 *
 * 单测证明几何与落位规则；这里证明「分类筛得到、点击能插入、
 * 大屏边框真的铺满、能拖到画布、能收藏、能撤销」。
 */

const STORAGE_KEY = "chartforge.workspace.v1";
const SCREEN_ID = "decor-e2e-screen";

const initialWorkspace = {
  version: 2,
  assets: [],
  designAssets: [],
  favorites: [],
  screens: [
    {
      id: SCREEN_ID,
      name: "装饰 E2E",
      canvas: { width: 1600, height: 900, background: { kind: "color", color: "#0a1220" } },
      items: [],
      updatedAt: Date.now(),
    },
  ],
  datasets: [],
  settings: { autosave: true },
};

async function openScreen(page: Page) {
  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
  await page.locator("#left-panel-tab-design").click();
  await expect(page.locator("[data-decor-section]")).toBeVisible();
}

async function readItems(page: Page) {
  return page.evaluate(({ key, screenId }) => {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const ws = JSON.parse(raw);
    const screen = (ws.screens ?? []).find((s: { id: string }) => s.id === screenId);
    return (screen?.items ?? []).map((item: { name: string; kind: string; frame: Record<string, number> }) => ({
      name: item.name,
      kind: item.kind,
      frame: item.frame,
    }));
  }, { key: STORAGE_KEY, screenId: SCREEN_ID });
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(
    ({ storageKey, workspace }) => {
      if (localStorage.getItem(storageKey) === null) {
        localStorage.setItem(storageKey, JSON.stringify(workspace));
      }
    },
    { storageKey: STORAGE_KEY, workspace: initialWorkspace },
  );
});

test("装饰目录按四个分组展示，筛选生效（T17）", async ({ page }) => {
  await openScreen(page);

  // 四个分组筛选 + 全部
  await expect(page.locator("[data-decor-filter]")).toHaveCount(5);
  await expect(page.locator("[data-decor-id]")).toHaveCount(23);

  await page.locator('[data-decor-filter="screen-border"]').click();
  await expect(page.locator("[data-decor-id]")).toHaveCount(5);
  await expect(page.locator('[data-decor-id="decor-border-bracket"]')).toBeVisible();

  await page.locator('[data-decor-filter="panel-frame"]').click();
  await expect(page.locator("[data-decor-id]")).toHaveCount(6);

  await page.locator('[data-decor-filter="all"]').click();
  await expect(page.locator("[data-decor-id]")).toHaveCount(23);
});

test("点击大屏边框 → 铺满画布并落到最底层（T17）", async ({ page }) => {
  await openScreen(page);
  await page.locator('[data-decor-id="decor-border-bracket"]').click();

  await expect.poll(async () => (await readItems(page)).length).toBe(1);
  const [item] = await readItems(page);
  expect(item.name).toBe("四角折角边框");
  expect(item.kind).toBe("image");
  expect(item.frame).toMatchObject({ x: 0, y: 0, w: 1600, h: 900 });
});

test("点击背景框/标题框 → 按标称尺寸居中（T17）", async ({ page }) => {
  await openScreen(page);
  await page.locator('[data-decor-id="decor-panel-glass"]').click();
  await expect.poll(async () => (await readItems(page)).length).toBe(1);
  const [item] = await readItems(page);
  expect(item.name).toBe("玻璃面板框");
  expect(item.frame).toMatchObject({ x: 560, y: 300, w: 480, h: 300 });
});

test("连续插入多个装饰，全部保留且 id 唯一（T17）", async ({ page }) => {
  await openScreen(page);
  for (const id of ["decor-border-scan", "decor-title-angled", "decor-orn-rings", "decor-orn-led-bar"]) {
    await page.locator(`[data-decor-id="${id}"]`).click();
  }
  await expect.poll(async () => (await readItems(page)).length).toBe(4);
  const names = (await readItems(page)).map((item) => item.name).sort();
  expect(names).toEqual(["LED 灯带", "同心环组", "扫描光带边框", "斜切标题框"].sort());
});

test("装饰可撤销（T17）", async ({ page }) => {
  await openScreen(page);
  await page.locator('[data-decor-id="decor-orn-rings"]').click();
  await expect.poll(async () => (await readItems(page)).length).toBe(1);

  await page.locator('.topbar__center button[title^="撤销"]').click();
  await expect.poll(async () => (await readItems(page)).length).toBe(0);
});

test("装饰可收藏，并出现在我的收藏区（T17 × T16）", async ({ page }) => {
  await openScreen(page);
  await page.locator('[data-decor-favorite-id="decor-panel-hex-grid"]').click();
  await expect(page.locator('[data-decor-favorite-id="decor-panel-hex-grid"]')).toHaveAttribute("aria-pressed", "true");

  const favorite = page.locator('[data-favorite-key="decor:decor-panel-hex-grid"]');
  await expect(favorite).toBeVisible();
  await expect(favorite).toContainText("装饰素材");
  await expect(favorite).toContainText("蜂巢网点面板");

  // 从收藏一键插入
  await favorite.locator(".favorites-insert").click();
  await expect.poll(async () => (await readItems(page)).length).toBe(1);
});

test("把装饰拖到画布指定位置（T17）", async ({ page }) => {
  await openScreen(page);
  const source = page.locator('[data-decor-id="decor-orn-tri-corner"]');
  const stage = page.locator(".canvas-stage__surface, .canvas-stage").first();

  await source.dragTo(stage, { targetPosition: { x: 400, y: 300 } });
  await expect.poll(async () => (await readItems(page)).length).toBe(1);
  const [item] = await readItems(page);
  expect(item.name).toBe("三角角饰");
  // 落点被夹在画布内
  expect(item.frame.x).toBeGreaterThanOrEqual(0);
  expect(item.frame.y).toBeGreaterThanOrEqual(0);
});
