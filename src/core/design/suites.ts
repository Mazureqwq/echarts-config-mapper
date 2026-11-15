/**
 * Task 15（P1-3）：可视化套件（Design Suite）。
 *
 * ── 这是什么 ────────────────────────────────────────────────────────────
 * DataV 7.0 设计库用「可视化套件」作为**风格约束维度**：同一套件下的地图、
 * 面板、标题都经过统一配置，随便组合都不违和。ChartForge 此前把主题、
 * 地图快速样式、组件默认样式当成三件互不相关的东西，用户要自己保证一致。
 *
 * 套件把三者绑成一个整体。
 *
 * ── 为什么不新造一套色板 ────────────────────────────────────────────────
 * `mapQuickStyles.ts` 的 6 个预设**已经**携带完整可落地的令牌
 * （background / fill / border / label / emphasis / selected / tooltip /
 * accent / atmosphere）。再定义一套套件色板等于制造第二份真相。
 * 因此套件**直接复用这 6 个预设的 id 与令牌**，只是额外派生出画布背景、
 * 文字色与系列色板。
 *
 * 代价（已权衡并接受）：套件语义与地图样式绑在一起，将来若要做「不含地图
 * 的套件」需要解耦。当前 ChartForge 的主场景就是地图大屏，复用的收益
 * 远大于这点耦合成本。
 *
 * ── 边界（关键） ────────────────────────────────────────────────────────
 * 套件**只影响新建元素与显式套用**，绝不静默改写存量元素。
 * 这与 `applyThemeToScreen` 既有的安全语义保持一致：
 * 切换套件只改画布背景，已有元素的位置与显式样式原封不动。
 */

import {
  MAP_QUICK_STYLES,
  applyMapQuickStyle,
  getMapQuickStyle,
  type MapQuickStyleTokens,
} from "../components/mapQuickStyles";
import type { Screen } from "../model/types";

export interface DesignSuite {
  /** 套件 id，与对应地图快速样式的 id 相同 */
  id: string;
  /** 中文名 */
  name: string;
  /** 一句话说明 */
  description: string;
  /** 绑定的地图快速样式 id（当前与 id 相同，保留字段以便将来解耦） */
  mapStyleId: string;
  /** 画布背景色（取自预设 background） */
  canvas: string;
  /** 强调色（取自预设 accent） */
  accent: string;
  /** 文字主色（取自预设 label.color） */
  text: string;
  /** 次级文字色（label 在深底上的柔和版本，由 accent 与 background 混合） */
  muted: string;
  /** 面板色（由 background 提亮，用于卡片/面板底） */
  panel: string;
  /** 边框色（取自预设 border.color） */
  border: string;
  /** 图表系列色板（首项为强调色） */
  palette: readonly string[];
  /** 完整地图令牌，供新建地图直接落地 */
  tokens: MapQuickStyleTokens;
}

/** 默认套件（未设置套件时使用） */
export const DEFAULT_SUITE_ID = "deep-sea";

/** 把两个 #RRGGBB 按比例混合，用于派生 muted / panel 这类辅助色。 */
function mixHex(a: string, b: string, ratio: number): string {
  const parse = (hex: string): [number, number, number] => {
    const clean = hex.replace("#", "");
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const t = Math.min(1, Math.max(0, ratio));
  const to = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${to(ar, br)}${to(ag, bg)}${to(ab, bb)}`;
}

/** 由地图快速样式派生一个套件（纯函数，令牌单一来源）。 */
function suiteFromQuickStyle(id: string): DesignSuite | undefined {
  const preset = getMapQuickStyle(id);
  if (!preset) return undefined;
  const tokens = preset.tokens;
  // 系列色：强调色 → 高值 → 中值 → 低值 → 边框，去重后覆盖多数图表的系列数。
  // 必须带上 fill.min：多数预设里 accent 与 fill.max 同值，只取前四项会去重到 3 个。
  const palette = Array.from(
    new Set([tokens.accent, tokens.fill.max, tokens.fill.mid, tokens.fill.min, tokens.border.color]),
  );
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    mapStyleId: preset.id,
    canvas: tokens.background,
    accent: tokens.accent,
    text: tokens.label.color,
    // muted：文字色向背景色靠拢 40%，得到「次级但不低对比」的灰调
    muted: mixHex(tokens.label.color, tokens.background, 0.4),
    // panel：背景色向文字色提亮 10%，用于面板底不至于与画布糊在一起
    panel: mixHex(tokens.background, tokens.label.color, 0.1),
    border: tokens.border.color,
    palette,
    tokens,
  };
}

/** 六套内置套件（顺序与地图快速样式一致）。 */
export const BUILT_IN_SUITES: readonly DesignSuite[] = Object.freeze(
  MAP_QUICK_STYLES.map((preset) => suiteFromQuickStyle(preset.id)).filter(
    (suite): suite is DesignSuite => suite !== undefined,
  ),
);

export function isSuiteId(value: unknown): value is string {
  return typeof value === "string" && BUILT_IN_SUITES.some((suite) => suite.id === value);
}

export function getSuite(id: string | undefined | null): DesignSuite | undefined {
  if (!id) return undefined;
  return BUILT_IN_SUITES.find((suite) => suite.id === id);
}

/** 屏幕所属套件；未设置或非法 id 回退默认套件。 */
export function suiteForScreen(screen: Pick<Screen, "suiteId"> | null | undefined): DesignSuite {
  const suite = getSuite(screen?.suiteId);
  return suite ?? getSuite(DEFAULT_SUITE_ID)!;
}

/** 套件色板（供图表 palette 使用）；未知 id 回退默认套件。 */
export function suitePalette(id: string | undefined | null): readonly string[] {
  return (getSuite(id) ?? getSuite(DEFAULT_SUITE_ID)!).palette;
}

export type ApplySuiteResult =
  | { ok: true; screen: Screen }
  | { ok: false; reason: string };

/**
 * 显式把套件套用到屏幕。
 *
 * **只做两件事**：写 `suiteId` 与画布背景色。已有元素的 props / 位置
 * 一律不动——静默改写存量元素会让用户失去对自己作品的控制权。
 *
 * 返回新对象，不修改入参。
 */
export function applySuiteToScreen(screen: Screen, suiteId: string): ApplySuiteResult {
  const suite = getSuite(suiteId);
  if (!suite) return { ok: false, reason: `未知套件：${suiteId}` };
  return {
    ok: true,
    screen: {
      ...screen,
      suiteId: suite.id,
      canvas: { ...screen.canvas, background: { kind: "color", color: suite.canvas } },
    },
  };
}

/**
 * 为**新建**组件计算套件化的默认 props。
 *
 * 只填空缺（已显式配置过的键不覆盖），因此同一函数也可以安全地用于
 * 「套件已确定、用户刚把组件拖进画布」的时刻。
 */
export function applySuiteToComponentProps(
  componentId: string,
  props: Record<string, unknown>,
  suiteId: string,
): Record<string, unknown> {
  const suite = getSuite(suiteId);
  if (!suite) return { ...props };

  // 地图：直接落地整套 quickStyle（新建地图即符合当前套件观感）
  if (componentId === "chartforge.map-scene-flat" || componentId === "chartforge.map-scene-tilted") {
    if (props.quickStyle !== undefined) return { ...props };
    const base: Record<string, unknown> = { ...props };
    return applyMapQuickStyle(base, suite.mapStyleId);
  }

  // 组件：只补强调色这一类「有套件语义」的空缺
  const themed: Record<string, unknown> = { ...props };
  const colorKeys = ["color", "accentColor", "fillColor"];
  for (const key of colorKeys) {
    if (themed[key] === undefined || themed[key] === "") {
      // 只有该组件确实声明了这个 prop 才补（避免给无关组件塞脏键）
      if (COMPONENT_COLOR_KEYS[componentId]?.includes(key)) {
        themed[key] = suite.accent;
      }
    }
  }
  return themed;
}

/**
 * 各组件**真实声明过**的颜色类 props（`type: "color"`，且在 `builtins.ts` 的 `props` 里）。
 *
 * 只向这些键注入套件强调色：写入未声明的键会立刻被 schema 归一化丢掉，
 * 既不可见也无法再编辑——那是「假接线」。`tests/design-suite.spec.ts` 里有
 * 守卫测试逐条比对注册表，任何一方改动而另一方未跟随时会直接失败。
 *
 * 注意 `chartforge.kpi` 不在此列：它只声明了 valueField/label/format/aggregation，
 * 外观完全由主题令牌驱动，没有可注入的颜色 props。
 */
export const COMPONENT_COLOR_KEYS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "chartforge.progress-list": ["fillColor", "trackColor"],
  "chartforge.section-title": ["accentColor"],
  "chartforge.corner-frame": ["color"],
});
