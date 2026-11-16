import { expect, test, type Page } from "@playwright/test";

/**
 * T16（P1-4）：我的收藏的真实 UI 行为。
 *
 * 单测只证明「引用逻辑正确」；这里证明的是「星标点得到、刷新后还在、
 * 收藏区真的能一键插入、失效引用不会消失也不会误插」。
 */

const STORAGE_KEY = "chartforge.workspace.v1";
const SCREEN_ID = "favorites-e2e-screen";

const initialWorkspace = {
  version: 2,
  assets: [],
  designAssets: [],
  favoritees: [],
  favorites: [],
  screens: [
    {
      id: SCREEN_ID,
      name: "收藏 E2E",
      canvas: { width: 1600, height: 900, background: { kind: "color", color: "#12161d" } },
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
}

async function readStored(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const workspace = JSON.parse(raw);
    return {
      favorites: workspace.favorites ?? null,
      itemCount: (workspace.screens ?? []).find((s: { id: string }) => s.id === "favorites-e2e-screen")?.items?.length ?? 0,
    };
  }, STORAGE_KEY);
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

test("在设计库收藏区块后，收藏区出现该条目并可一键插入（T16）", async ({ page }) => {
  await openScreen(page);

  // 1) 初始为空态
  await page.locator("#left-panel-tab-design").click();
  await expect(page.locator("[data-favorites-section]")).toBeVisible();
  await expect(page.locator(".favorites-empty")).toContainText("还没有收藏");

  // 2) 在「区块」区点星标
  await page.locator('[data-block-favorite-id="title-panel"]').click();
  await expect(page.locator('[data-block-favorite-id="title-panel"]')).toHaveAttribute("aria-pressed", "true");

  // 3) 收藏区立即出现该条目
  const item = page.locator('[data-favorite-key="block:title-panel"]');
  await expect(item).toBeVisible();
  await expect(item).toContainText("区块");

  // 4) 落盘：只存引用三元组
  await expect.poll(async () => (await readStored(page))?.favorites?.length).toBe(1);
  const stored = await readStored(page);
  expect(stored!.favorites![0]).toMatchObject({ kind: "block", id: "title-panel" });
  expect(Object.keys(stored!.favorites![0]).sort()).toEqual(["id", "kind", "version"]);

  // 5) 点一下即插入到画布
  await item.locator(".favorites-insert").click();
  await expect.poll(async () => (await readStored(page))?.itemCount).toBeGreaterThan(0);
});

test("收藏跨刷新保持（持久化到工作区）（T16）", async ({ page }) => {
  await openScreen(page);
  await page.locator("#left-panel-tab-charts").click();
  await page.locator('[data-favorite-id="chartforge.kpi"]').click();
  await expect.poll(async () => (await readStored(page))?.favorites?.length).toBe(1);

  await page.reload();
  await expect(page.locator(".workbench")).toBeVisible();
  await page.locator("#left-panel-tab-charts").click();
  await expect(page.locator('[data-favorite-id="chartforge.kpi"]')).toHaveAttribute("aria-pressed", "true");

  await page.locator("#left-panel-tab-design").click();
  await expect(page.locator('[data-favorite-key="component:chartforge.kpi"]')).toContainText("指标卡");
});

test("组件收藏一键插入画布（T16）", async ({ page }) => {
  await openScreen(page);
  await page.locator("#left-panel-tab-charts").click();
  await page.locator('[data-favorite-id="chartforge.kpi"]').click();
  await page.locator("#left-panel-tab-design").click();

  await page.locator('[data-favorite-key="component:chartforge.kpi"] .favorites-insert').click();
  await expect.poll(async () => (await readStored(page))?.itemCount).toBe(1);
});

test("失效引用显示为不可用且可移除，不会静默消失（T16）", async ({ page, context }) => {
  // 注入一条指向不存在组件的收藏
  await context.addInitScript((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const workspace = JSON.parse(raw);
    workspace.favorites = [{ kind: "component", id: "chartforge.ghost", version: 1 }];
    localStorage.setItem(key, JSON.stringify(workspace));
  }, STORAGE_KEY);

  await openScreen(page);
  await page.locator("#left-panel-tab-design").click();

  const stale = page.locator('[data-favorite-key="component:chartforge.ghost"]');
  await expect(stale).toBeVisible();
  await expect(stale).toHaveClass(/favorites-item--stale/);
  await expect(stale).toContainText("已失效");
  await expect(stale.locator(".favorites-insert")).toBeDisabled();

  // 移除后回到空态
  await stale.locator(".favorites-remove").click();
  await expect(page.locator(".favorites-empty")).toBeVisible();
  await expect.poll(async () => (await readStored(page))?.favorites?.length).toBe(0);
});

test("取消收藏：星标与收藏区同步移除（T16）", async ({ page }) => {
  await openScreen(page);
  await page.locator("#left-panel-tab-design").click();
  await page.locator('[data-layout-favorite-id="monitor-main-side"]').click();
  await expect(page.locator('[data-favorite-key="layout:monitor-main-side"]')).toBeVisible();

  await page.locator('[data-favorite-key="layout:monitor-main-side"] .favorites-remove').click();
  await expect(page.locator('[data-favorite-key="layout:monitor-main-side"]')).toHaveCount(0);
  await expect(page.locator('[data-layout-favorite-id="monitor-main-side"]')).toHaveAttribute("aria-pressed", "false");
});
