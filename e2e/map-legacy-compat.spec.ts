import { expect, test, type Page } from "@playwright/test";

/**
 * D5 兼容地板：旧屏降级验证。
 *
 * 覆盖两类历史产物：
 * (a) v1 旧 props 形状（只有 modelVersion/presentation/pitch/view/layers，无任何 v2 增量字段）；
 * (b) 历史皮肤体系写入的具体颜色值（皮肤在旧版本里把色值直接写进 props，
 *     因此即使皮肤体系被废弃，这些具体色值仍必须继续生效）。
 *
 * 断言：渲染不空白（fill 层存在且有颜色）、pitch === 28、历史 colors 仍然生效、
 *       废弃字段（underlay / appliedSkin）被忽略而不是让渲染失败。
 */

const STORAGE_KEY = "chartforge.workspace.v1";
const SCREEN_ID = "map-legacy-compat-screen";
const ITEM_ID = "map-legacy-compat-scene";
const DATASET_ID = "map-legacy-compat-regions";

/** 分数刻意让 浙江省 落在色带正中点（min=30 / max=90 → t=0.5），以便直接断言历史 mid 色值。 */
const rows = [
  { province: "广东省", score: 90 },
  { province: "西藏自治区", score: 30 },
  { province: "浙江省", score: 60 },
  { province: "四川省", score: 45 },
];

/** (a) v1 旧 props：没有 legend/label/border/emphasis/tooltipStyle/scaleBar/offset 等 v2 字段。 */
const legacyProps = {
  modelVersion: 1,
  presentation: "tilted",
  pitch: 28,
  view: {
    center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8,
    dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622",
  },
  layers: [
    { id: "legacy-fill", type: "regionFill", name: "旧填色", visible: true, style: { color: "#336699", opacity: 0.85, size: 12 } },
  ],
};

/** (b) 历史皮肤写入值：翡翠青绿（jade）预设的具体色值 + 已废弃的 underlay / appliedSkin 字段。 */
const skinProps = {
  modelVersion: 1,
  presentation: "tilted",
  pitch: 28,
  view: {
    center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8,
    dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#06170f",
  },
  border: { color: "#9ff5cf", width: 1, type: "solid" },
  label: { show: true, color: "#eafff5", size: 10, stroke: "#0b3a28" },
  emphasis: { areaColor: "#2fd98a", borderColor: "#ffffff", labelColor: "#ffffff" },
  tooltipStyle: { background: "#071d13", borderColor: "#1f4a35", color: "#eafff5", fontSize: 12 },
  underlay: [
    { areaColor: "#04150d", borderColor: "#1f9d66", shadowColor: "#1f9d66" },
    { areaColor: "#0a2a1c", borderColor: "#3ad6a0", shadowColor: "#3ad6a0" },
    { areaColor: "#103826", borderColor: "#b8f5d8", shadowColor: "#8cd3b4" },
  ],
  appliedSkin: "jade",
  layers: [
    {
      id: "skin-fill", type: "regionFill", name: "翡翠青绿", visible: true,
      style: {
        colorMode: "gradient",
        colors: { min: "#0b2b1e", mid: "#178a5a", max: "#5dffb0", empty: "#0a2018" },
        opacity: 0.85, size: 12,
      },
    },
  ],
};

function workspaceWith(props: Record<string, unknown>) {
  return {
    version: 2,
    assets: [],
    designAssets: [],
    screens: [{
      id: SCREEN_ID,
      name: "旧屏兼容",
      canvas: { width: 1280, height: 720, background: { kind: "color", color: "#050b12" } },
      items: [{
        id: ITEM_ID,
        name: "旧屏地图",
        kind: "component",
        componentId: "chartforge.map-scene-tilted",
        componentVersion: 1,
        frame: { x: 60, y: 50, w: 900, h: 560, rotate: 0 },
        dataBinding: { datasetId: DATASET_ID, fields: { category: "province", value: "score" } },
        props,
      }],
      updatedAt: Date.now(),
    }],
    datasets: [{ id: DATASET_ID, name: "省级热度集", source: { kind: "static", data: rows }, pipeline: { filter: [] } }],
    settings: { autosave: true },
  };
}

async function readStyle(page: Page) {
  return page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    const map = vueInstance?.exposed?.getMap?.();
    if (!map) return null;
    const style = map.getStyle();
    if (!style) return null;
    const layers = (style.layers ?? []) as any[];
    const fill = layers.find((l) => l.id === "cf-fill");
    const line = layers.find((l) => l.id === "cf-line");
    return {
      pitch: style.pitch,
      layerIds: layers.map((l) => l.id),
      fillColor: JSON.stringify(fill?.paint?.["fill-color"] ?? ""),
      fillOpacity: fill?.paint?.["fill-opacity"] ?? null,
      lineColor: JSON.stringify(line?.paint?.["line-color"] ?? ""),
      lineWidth: line?.paint?.["line-width"] ?? null,
    };
  });
}

async function readAppearance(page: Page) {
  return page.locator(".map-scene__chart").evaluate((root) => {
    const vueInstance = (root as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent;
    return vueInstance?.exposed?.readAppearance?.() ?? null;
  });
}

async function openLegacyScene(page: Page, props: Record<string, unknown>) {
  await page.addInitScript(
    ({ storageKey, workspace }) => {
      if (localStorage.getItem(storageKey) === null) localStorage.setItem(storageKey, JSON.stringify(workspace));
    },
    { storageKey: STORAGE_KEY, workspace: workspaceWith(props) },
  );
  await page.goto(`/#/workbench/${SCREEN_ID}`);
  await expect(page.locator(".workbench")).toBeVisible();
  await expect(page.locator(".map-scene__chart")).toBeVisible();
  await expect.poll(async () => Boolean((await readStyle(page))?.fillColor)).toBe(true);
  await page.waitForTimeout(600);
  return readStyle(page);
}

test("D5 兼容地板：v1 旧 props 渲染不空白且倾角生效", async ({ page }) => {
  const style = await openLegacyScene(page, legacyProps);
  expect(style).not.toBeNull();
  // 渲染不空白：MapLibre 画布存在且填色层有颜色
  await expect(page.locator(".map-scene__chart canvas.maplibregl-canvas")).toHaveCount(1);
  expect(style!.fillColor).not.toBe("");
  expect(style!.fillColor).toContain("#336699");
  expect(style!.fillOpacity).toBe(0.85);
  // 旧 tilted props 的 pitch 仍然生效
  expect(style!.pitch).toBe(28);
  // 旧 props 没有 v2 增量字段 → 不应凭空出现图例/比例尺/外轮廓强化层
  expect(style!.layerIds).not.toContain("cf-outline");
  await expect(page.locator(".map-scene__scalebar")).toHaveCount(0);
  await expect(page.locator(".map-scene__legend")).toHaveCount(0);
});

test("D5 兼容地板：历史皮肤写入的颜色值仍然生效，废弃字段被忽略", async ({ page }) => {
  const style = await openLegacyScene(page, skinProps);
  expect(style).not.toBeNull();
  await expect(page.locator(".map-scene__chart canvas.maplibregl-canvas")).toHaveCount(1);
  // 皮肤写入的色带四色仍然驱动填色（min / mid / max / empty）
  expect(style!.fillColor).toContain("#0b2b1e");
  expect(style!.fillColor).toContain("#178a5a");
  expect(style!.fillColor).toContain("#5dffb0");
  expect(style!.fillColor).toContain("#0a2018");
  // 皮肤写入的悬停强调色仍然生效
  expect(style!.fillColor).toContain("#2fd98a");
  // 皮肤写入的边线色与线宽仍然生效
  expect(style!.lineColor).toContain("#9ff5cf");
  expect(style!.lineWidth).toBe(1);
  // 皮肤写入的标注色仍然生效
  await expect(page.locator(".map-scene__label").first()).toBeVisible();
  const labelColor = await page.locator(".map-scene__label").first().evaluate((el) => getComputedStyle(el).color);
  expect(labelColor).toBe("rgb(234, 255, 245)");
  // 皮肤写入的 tooltip 配色仍然生效
  const appearance = await readAppearance(page);
  expect(appearance?.tooltip?.background).toBe("#071d13");
  expect(appearance?.tooltip?.borderColor).toBe("#1f4a35");
  expect(appearance?.tooltip?.color).toBe("#eafff5");
  // 废弃字段（underlay / appliedSkin）被忽略而不是让渲染失败
  expect(style!.pitch).toBe(28);
  await expect(page.locator(".map-scene__status")).toHaveCount(0);
});
