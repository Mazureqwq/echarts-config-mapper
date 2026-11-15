import { expect, test, type Page } from "@playwright/test";

/**
 * T14（P0-1 / P0-2）：复制 / 粘贴样式的真实 UI 行为。
 *
 * 纯函数单测只能证明载荷正确；这里证明的是「用户在界面上点得到、
 * 位置与数据绑定真的不变、跨类型真的被拒」。
 */

const STORAGE_KEY = "chartforge.workspace.v1";
const SCREEN_ID = "style-clipboard-e2e-screen";
const KPI_A = "kpi-source";
const KPI_B = "kpi-target";
const MAP_FLAT = "map-flat";
const MAP_TILTED = "map-tilted";

const initialWorkspace = {
  version: 2,
  assets: [],
  designAssets: [],
  screens: [{
    id: SCREEN_ID,
    name: "样式剪贴板 E2E",
    canvas: { width: 1600, height: 900, background: { kind: "color", color: "#12161d" } },
    items: [
      {
        id: KPI_A,
        name: "来源指标",
        kind: "component",
        componentId: "chartforge.kpi",
        componentVersion: 1,
        frame: { x: 40, y: 40, w: 260, h: 150, rotate: 0 },
        props: { valueField: "value", label: "来源指标", format: "currency", aggregation: "sum" },
        dataBinding: { datasetId: "ds-a", fields: { value: "score" } },
      },
      {
        id: KPI_B,
        name: "目标指标",
        kind: "component",
        componentId: "chartforge.kpi",
        componentVersion: 1,
        frame: { x: 340, y: 40, w: 260, h: 150, rotate: 0 },
        props: { valueField: "value", label: "目标指标", format: "number", aggregation: "first" },
        dataBinding: { datasetId: "ds-b", fields: { value: "weight" } },
      },
      {
        id: MAP_FLAT,
        name: "平面地图",
        kind: "component",
        componentId: "chartforge.map-scene-flat",
        componentVersion: 1,
        frame: { x: 40, y: 240, w: 420, h: 280, rotate: 0 },
        props: {
          presentation: "flat", pitch: 0, layers: [],
          quickStyle: { id: "jade", tokens: { background: "#0b2b1e", accent: "#5dffb0" } },
        },
      },
      {
        id: MAP_TILTED,
        name: "2.5D 地图",
        kind: "component",
        componentId: "chartforge.map-scene-tilted",
        componentVersion: 1,
        frame: { x: 500, y: 240, w: 420, h: 280, rotate: 0 },
        props: {
          presentation: "tilted", pitch: 28, layers: [],
          quickStyle: { id: "deep-sea", tokens: { background: "#102b3d", accent: "#32d6ff" } },
        },
      },
    ],
    updatedAt: Date.now(),
  }],
  datasets: [
    { id: "ds-a", name: "A", source: { kind: "static", data: [{ score: 10 }] }, pipeline: { filter: [] } },
    { id: "ds-b", name: "B", source: { kind: "static", data: [{ weight: 99 }] }, pipeline: { filter: [] } },
  ],
  settings: { autosave: true },
};

async function openScreen(page: Page) {
  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
}

async function selectItem(page: Page, id: string) {
  await page.locator(`[data-item-id="${id}"]`).click();
  await expect(page.locator("[data-style-clipboard]")).toBeVisible();
}

/** 从 localStorage 读回工作区里的目标元素（验证真实落盘状态，而不只是 DOM） */
async function readItem(page: Page, id: string) {
  return page.evaluate(({ storageKey, itemId }) => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const workspace = JSON.parse(raw);
    for (const screen of workspace.screens ?? []) {
      for (const item of screen.items ?? []) {
        if (item.id === itemId) {
          return {
            props: item.props ?? {},
            frame: item.frame ?? null,
            name: item.name ?? null,
            dataBinding: item.dataBinding ?? null,
          };
        }
      }
    }
    return null;
  }, { storageKey: STORAGE_KEY, itemId: id });
}

test("复制样式 → 粘贴到同类元素：外观生效，位置与数据绑定不变（T14 P0-1）", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) localStorage.setItem(storageKey, JSON.stringify(workspace));
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  await openScreen(page);

  // 1) 复制来源 KPI 的样式
  await selectItem(page, KPI_A);
  await page.locator("[data-style-copy]").click();
  await expect(page.locator(".style-clipboard__feedback--ok")).toContainText("已复制「指标卡」的样式");

  // 2) 选中目标 KPI，粘贴按钮此时必须可用
  await selectItem(page, KPI_B);
  const paste = page.locator("[data-style-paste]");
  await expect(paste).toBeEnabled();
  await paste.click();
  await expect(page.locator(".style-clipboard__feedback--ok")).toContainText("已粘贴样式");

  // 3) 落盘校验：外观跟随来源，位置/名称/数据绑定保持目标自身
  //    工作区保存有防抖，先等目标元素的样式真的写进 localStorage
  await expect.poll(async () => (await readItem(page, KPI_B))?.props.label).toBe("来源指标");
  const target = await readItem(page, KPI_B);
  expect(target).not.toBeNull();
  expect(target!.props.label).toBe("来源指标");
  expect(target!.props.format).toBe("currency");
  // 数据口径不被带过来
  expect(target!.props.aggregation).toBe("first");
  expect(target!.props.valueField).toBe("value");
  // 位置 / 名称 / 绑定原封不动
  expect(target!.frame).toEqual({ x: 340, y: 40, w: 260, h: 150, rotate: 0 });
  expect(target!.name).toBe("目标指标");
  expect(target!.dataBinding).toEqual({ datasetId: "ds-b", fields: { value: "weight" } });
});

test("跨组件类型粘贴被拒（T14 P0-1）", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) localStorage.setItem(storageKey, JSON.stringify(workspace));
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  await openScreen(page);
  await selectItem(page, KPI_A);
  await page.locator("[data-style-copy]").click();

  // 地图与 KPI 不同族 ⇒ 粘贴按钮禁用，并给出可读提示
  await selectItem(page, MAP_FLAT);
  await expect(page.locator("[data-style-paste]")).toBeDisabled();
  await expect(page.locator(".style-clipboard__hint")).toContainText("类型不同");
});

test("地图快速样式可在平面 / 2.5D 之间传递，且不覆盖 presentation（T14 P0-2）", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) localStorage.setItem(storageKey, JSON.stringify(workspace));
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  await openScreen(page);

  await selectItem(page, MAP_FLAT);
  await page.locator("[data-style-copy]").click();
  await expect(page.locator(".style-clipboard__feedback--ok")).toContainText("平面地图");

  await selectItem(page, MAP_TILTED);
  const paste = page.locator("[data-style-paste]");
  await expect(paste).toBeEnabled();
  await paste.click();

  await expect.poll(async () => {
    const item = await readItem(page, MAP_TILTED);
    return (item?.props.quickStyle as { id?: string } | undefined)?.id;
  }).toBe("jade");
  const target = await readItem(page, MAP_TILTED);
  expect(target).not.toBeNull();
  const quickStyle = target!.props.quickStyle as { id: string; tokens: { background: string } };
  expect(quickStyle.id).toBe("jade");
  // quickStyle 令牌按 id 从注册表重新解析（不信任 props 里携带的旧令牌），
  // 因此这里断言「不再是 deep-sea 的背景色」，而不是硬编码 jade 的具体值
  expect(quickStyle.tokens.background).not.toBe("#102b3d");
  // 元素身份字段不被来源覆盖
  expect(target!.props.presentation).toBe("tilted");
  expect(target!.props.pitch).toBe(28);
});

test("粘贴样式可撤销（T14 P0-1）", async ({ page, context }) => {
  await context.addInitScript(({ storageKey, workspace }) => {
    if (localStorage.getItem(storageKey) === null) localStorage.setItem(storageKey, JSON.stringify(workspace));
  }, { storageKey: STORAGE_KEY, workspace: initialWorkspace });

  await openScreen(page);
  await selectItem(page, KPI_A);
  await page.locator("[data-style-copy]").click();
  await selectItem(page, KPI_B);
  await page.locator("[data-style-paste]").click();
  await expect(page.locator(".style-clipboard__feedback--ok")).toContainText("已粘贴样式");

  // Ctrl+Z 撤销
  await page.locator(".workbench").click({ position: { x: 1200, y: 700 } });
  await page.keyboard.press("Control+z");

  await expect.poll(async () => (await readItem(page, KPI_B))?.props.label).toBe("目标指标");
});
