import { expect, test, type Page } from "@playwright/test";

/**
 * T15（P1-3）：可视化套件的真实 UI 行为。
 *
 * 单测只能证明内核函数正确；这里证明「设计库面板里点得到、画布真的变色、
 * 已有元素一个字节不动、撤销真的回滚、新建组件自动继承套件」。
 */

const STORAGE_KEY = "chartforge.workspace.v1";
const SCREEN_ID = "design-suite-e2e-screen";
const KPI = "kpi-fixed";

const initialWorkspace = {
  version: 2,
  assets: [],
  designAssets: [],
  screens: [
    {
      id: SCREEN_ID,
      name: "套件 E2E",
      canvas: { width: 1600, height: 900, background: { kind: "color", color: "#0a0f16" } },
      items: [
        {
          id: KPI,
          name: "既有指标",
          kind: "component",
          componentId: "chartforge.kpi",
          componentVersion: 1,
          frame: { x: 40, y: 40, w: 260, h: 150, rotate: 0 },
          props: { valueField: "value", label: "既有指标", format: "number", aggregation: "first" },
        },
        {
          id: "frame-fixed",
          name: "既有边框",
          kind: "component",
          componentId: "chartforge.corner-frame",
          componentVersion: 1,
          frame: { x: 340, y: 40, w: 260, h: 150, rotate: 0 },
          // 真实声明过的颜色 props，套用套件后必须原样保留
          props: { variant: "corner", color: "#ff8a3d", thickness: 2, inset: 8 },
        },
      ],
      updatedAt: Date.now(),
    },
  ],
  datasets: [
    { id: "ds-a", name: "A", source: { kind: "static", data: [{ score: 10 }] }, pipeline: { filter: [] } },
  ],
  settings: { autosave: true },
};

async function openScreen(page: Page) {
  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
}

/** 打开左侧「设计库」标签页 */
async function openDesignLibrary(page: Page) {
  await page.locator("#left-panel-tab-design").click();
  await expect(page.locator("[data-suite-section]")).toBeVisible();
}

/** 从 localStorage 读回屏幕级与元素级状态 */
async function readScreen(page: Page) {
  return page.evaluate(
    ({ storageKey, screenId }) => {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const workspace = JSON.parse(raw);
      const screen = (workspace.screens ?? []).find((entry: { id: string }) => entry.id === screenId);
      if (!screen) return null;
      const pick = (id: string) =>
        (screen.items ?? []).find((item: { id: string }) => item.id === id)?.props ?? null;
      return {
        suiteId: screen.suiteId ?? null,
        background: screen.canvas?.background ?? null,
        kpiProps: pick("kpi-fixed"),
        frameProps: pick("frame-fixed"),
        itemCount: (screen.items ?? []).length,
      };
    },
    { storageKey: STORAGE_KEY, screenId: SCREEN_ID },
  );
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

test("设计库展示全部套件，默认套件标记为已应用（T15）", async ({ page }) => {
  await openScreen(page);
  await openDesignLibrary(page);

  const cards = page.locator("[data-suite-section] [data-suite-id]");
  await expect(cards).toHaveCount(6);
  await expect(page.locator('[data-suite-section] [data-suite-id="jade"]')).toContainText("山地绿洲");
  // 未显式设置 suiteId 时回退默认套件
  await expect(page.locator('[data-suite-section] [data-suite-id="deep-sea"]')).toContainText("已应用");
  await expect(page.locator('[data-suite-section] [data-suite-id="jade"]')).toContainText("应用");
});

test("套用套件：画布背景跟随，已有元素保持原样（T15）", async ({ page }) => {
  await openScreen(page);
  await openDesignLibrary(page);

  await page.locator('[data-suite-section] [data-suite-id="jade"]').click();
  await expect(page.locator('[data-suite-section] [data-suite-id="jade"]')).toContainText("已应用");
  await expect(page.locator('[data-suite-section] [data-suite-id="deep-sea"]')).toContainText("应用");

  await expect.poll(async () => (await readScreen(page))?.suiteId).toBe("jade");
  const state = await readScreen(page);
  expect(state!.background).toMatchObject({ kind: "color", color: "#06170f" });
  // 既有元素一字节不动（含显式颜色）
  expect(state!.kpiProps).toMatchObject({ label: "既有指标", format: "number", aggregation: "first" });
  expect(state!.frameProps).toMatchObject({ color: "#ff8a3d", thickness: 2, inset: 8 });
  expect(state!.itemCount).toBe(2);
});

test("套用套件可撤销（T15）", async ({ page }) => {
  await openScreen(page);
  await openDesignLibrary(page);

  await page.locator('[data-suite-section] [data-suite-id="jade"]').click();
  await expect.poll(async () => (await readScreen(page))?.suiteId).toBe("jade");

  await page.locator('.topbar__center button[title^="撤销"]').click();

  await expect.poll(async () => (await readScreen(page))?.suiteId).not.toBe("jade");
  const state = await readScreen(page);
  expect(state!.suiteId).toBeNull();
  expect(state!.background).toMatchObject({ color: "#0a0f16" });
});

test("换套件后新插入的组件自动继承套件色（T15）", async ({ page }) => {
  await openScreen(page);
  await openDesignLibrary(page);

  await page.locator('[data-suite-section] [data-suite-id="jade"]').click();
  await expect.poll(async () => (await readScreen(page))?.suiteId).toBe("jade");

  // 从组件库插入一个标题栏，未指定颜色 → 应自动带上 jade 的 accent
  await page.locator("#left-panel-tab-charts").click();
  await page.getByRole("searchbox", { name: "搜索组件" }).fill("标题栏");
  await page.locator(".component-catalog .catalog-card").first().click();

  await expect
    .poll(async () => (await readScreen(page))?.itemCount)
    .toBe(3);

  const inserted = await page.evaluate(
    ({ storageKey, screenId }) => {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const workspace = JSON.parse(raw);
      const screen = (workspace.screens ?? []).find((entry: { id: string }) => entry.id === screenId);
      const known = new Set(["kpi-fixed", "frame-fixed"]);
      const others = (screen?.items ?? []).filter((item: { id: string }) => !known.has(item.id));
      return others.map((item: { props?: Record<string, unknown> }) => item.props ?? {});
    },
    { storageKey: STORAGE_KEY, screenId: SCREEN_ID },
  );
  expect(inserted).toHaveLength(1);
  expect(inserted![0]).toMatchObject({ accentColor: "#5dffb0" });
});
