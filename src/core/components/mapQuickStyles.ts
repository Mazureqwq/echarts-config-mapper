/**
 * 地图「快速样式」预设集（MapLibre 版）。
 *
 * 与已被整体废弃并从仓库删除的旧 ECharts 皮肤体系无关：
 * 这里只描述「氛围 + 色板」两组可落地的具体样式值，不含任何 2.5D 叠片挤出几何。
 *
 * 设计要点：
 * - 每个预设是一组**具体色值**（而不是隐藏状态）。应用预设时把具体色值写回 props，
 *   因此工作台与离线产物读到的永远是同一批具体颜色。
 * - 归一化时按 id 从本注册表**重新解析**令牌，props 里携带的手写/过期令牌一律作废，
 *   保证「预设 id → 具体色值」只有一个来源。
 * - 令牌随 props 持久化（quickStyle.tokens），离线运行时无需内嵌第二份注册表即可同源渲染。
 */

export interface MapQuickStyleFill {
  /** 色带低值色 */
  min: string;
  /** 色带中值色 */
  mid: string;
  /** 色带高值色 */
  max: string;
  /** 无数据色 */
  empty: string;
}

export interface MapQuickStyleTokens {
  /** 画布背景色 */
  background: string;
  /** 区域填色色带 */
  fill: MapQuickStyleFill;
  /** 省界线 */
  border: { color: string; width: number };
  /** 省名标注 */
  label: { color: string; stroke: string };
  /** 悬停态 */
  emphasis: { areaColor: string; borderColor: string };
  /** 选中态 */
  selected: { areaColor: string; borderColor: string };
  /** Tooltip */
  tooltip: { background: string; borderColor: string; color: string };
  /** 散点 / 热力 / 飞线的强调色 */
  accent: string;
  /** 大气（MapLibre sky/fog）：工作台与离线同源 */
  atmosphere: { sky: string; horizon: string; fog: string };
}

export interface MapQuickStyle {
  id: string;
  /** 中文名（检查器与图例展示） */
  name: string;
  /** 一句话说明（悬浮提示） */
  description: string;
  tokens: MapQuickStyleTokens;
}

/** 六套内置快速样式（顺序即检查器 3×2 网格的展示顺序）。 */
export const MAP_QUICK_STYLES: readonly MapQuickStyle[] = [
  {
    id: "deep-sea",
    name: "深海蓝",
    description: "冷调深蓝底色与青蓝高值，适合科技风大屏。",
    tokens: {
      background: "#081622",
      fill: { min: "#102b3d", mid: "#1c5f8f", max: "#32d6ff", empty: "#0d1a26" },
      border: { color: "#c0f3fb", width: 1 },
      label: { color: "#e7fbff", stroke: "#013a4a" },
      emphasis: { areaColor: "#3a95fd", borderColor: "#ffffff" },
      selected: { areaColor: "#58d6ff", borderColor: "#ffffff" },
      tooltip: { background: "#07121d", borderColor: "#1f2a3a", color: "#e7fbff" },
      accent: "#32d6ff",
      atmosphere: { sky: "#0a1628", horizon: "#12314d", fog: "#0a1628" },
    },
  },
  {
    id: "jade",
    name: "山地绿洲",
    description: "青绿渐层，模拟山地植被到高值亮绿的过渡。",
    tokens: {
      background: "#06170f",
      fill: { min: "#0b2b1e", mid: "#178a5a", max: "#5dffb0", empty: "#0a2018" },
      border: { color: "#9ff5cf", width: 1 },
      label: { color: "#eafff5", stroke: "#0b3a28" },
      emphasis: { areaColor: "#2fd98a", borderColor: "#ffffff" },
      selected: { areaColor: "#7dffc4", borderColor: "#ffffff" },
      tooltip: { background: "#071d13", borderColor: "#1f4a35", color: "#eafff5" },
      accent: "#5dffb0",
      atmosphere: { sky: "#061a12", horizon: "#0f3a28", fog: "#061a12" },
    },
  },
  {
    id: "sandstone",
    name: "暖沙金",
    description: "沙金暖调，适合人文地理与文旅主题。",
    tokens: {
      background: "#1a1206",
      fill: { min: "#3d2a0b", mid: "#b8862f", max: "#ffd98a", empty: "#241a09" },
      border: { color: "#ffe3ad", width: 1 },
      label: { color: "#fff3dd", stroke: "#4a3008" },
      emphasis: { areaColor: "#f0a93c", borderColor: "#ffffff" },
      selected: { areaColor: "#ffd070", borderColor: "#ffffff" },
      tooltip: { background: "#1f1406", borderColor: "#4a3416", color: "#fff3dd" },
      accent: "#ffd98a",
      atmosphere: { sky: "#1d1408", horizon: "#4a3416", fog: "#1d1408" },
    },
  },
  {
    id: "nebula",
    name: "霓虹紫蓝",
    description: "紫蓝霓虹渐层，适合夜间大屏与发布会视觉。",
    tokens: {
      background: "#0d0719",
      fill: { min: "#1f1140", mid: "#5b32b8", max: "#c4a8ff", empty: "#150b2b" },
      border: { color: "#d7c4ff", width: 1 },
      label: { color: "#f3edff", stroke: "#2c1660" },
      emphasis: { areaColor: "#8b5cf6", borderColor: "#ffffff" },
      selected: { areaColor: "#b98cff", borderColor: "#ffffff" },
      tooltip: { background: "#150b28", borderColor: "#35245c", color: "#f3edff" },
      accent: "#c4a8ff",
      atmosphere: { sky: "#120a22", horizon: "#2f1d55", fog: "#120a22" },
    },
  },
  {
    id: "contour",
    name: "靛蓝等高线",
    description: "低饱和靛蓝配亮青描边，突出地理轮廓而非色带。",
    tokens: {
      background: "#050a14",
      fill: { min: "#0a1626", mid: "#12314d", max: "#1d5a86", empty: "#070f1a" },
      border: { color: "#7fe6ff", width: 1.2 },
      label: { color: "#d6f6ff", stroke: "#04222e" },
      emphasis: { areaColor: "#1e6f9c", borderColor: "#bff2ff" },
      selected: { areaColor: "#2a8fc4", borderColor: "#ffffff" },
      tooltip: { background: "#061019", borderColor: "#1d3a4f", color: "#d6f6ff" },
      accent: "#7fe6ff",
      atmosphere: { sky: "#050a14", horizon: "#0d2138", fog: "#050a14" },
    },
  },
  {
    id: "parchment",
    name: "素雅宣纸",
    description: "浅色宣纸底与赭石色带，适合浅色主题与报表场景。",
    tokens: {
      background: "#f5f1e8",
      fill: { min: "#e4d9c3", mid: "#c98f52", max: "#8c4a24", empty: "#efe9dc" },
      border: { color: "#a8785a", width: 1 },
      label: { color: "#3b2a1c", stroke: "#f7f2e8" },
      emphasis: { areaColor: "#c2703c", borderColor: "#ffffff" },
      selected: { areaColor: "#a4552a", borderColor: "#ffffff" },
      tooltip: { background: "#ffffff", borderColor: "#d6c7ae", color: "#3b2a1c" },
      accent: "#c2703c",
      atmosphere: { sky: "#f5f1e8", horizon: "#d9cbb2", fog: "#efe8da" },
    },
  },
];

/** 预设 id 列表（顺序与 MAP_QUICK_STYLES 一致）。 */
export const MAP_QUICK_STYLE_IDS: readonly string[] = MAP_QUICK_STYLES.map((preset) => preset.id);

const PRESET_BY_ID = new Map(MAP_QUICK_STYLES.map((preset) => [preset.id, preset]));

/** 按 id 取预设（未知 id 返回 undefined）。 */
export function getMapQuickStyle(id: string): MapQuickStyle | undefined {
  return PRESET_BY_ID.get(id);
}

/** 判断字符串是否为已知预设 id。 */
export function isMapQuickStyleId(value: unknown): value is string {
  return typeof value === "string" && PRESET_BY_ID.has(value);
}

/** 持久化的快速样式状态：预设 id + 解析后的具体令牌。 */
export interface MapQuickStyleState {
  id: string;
  tokens: MapQuickStyleTokens;
}

/**
 * 归一化持久化的 quickStyle 令牌。
 *
 * 只认注册表里的 id，并**按 id 重新解析**令牌：props 里携带的手写令牌一律作废，
 * 这样「预设 id → 具体色值」永远只有一个来源，离线产物也不会带上过期色值。
 */
export function normalizeMapQuickStyle(raw: unknown): MapQuickStyleState | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const id = (raw as { id?: unknown }).id;
  if (!isMapQuickStyleId(id)) return undefined;
  const preset = PRESET_BY_ID.get(id)!;
  return { id: preset.id, tokens: cloneTokens(preset.tokens) };
}

function cloneTokens(tokens: MapQuickStyleTokens): MapQuickStyleTokens {
  return {
    background: tokens.background,
    fill: { ...tokens.fill },
    border: { ...tokens.border },
    label: { ...tokens.label },
    emphasis: { ...tokens.emphasis },
    selected: { ...tokens.selected },
    tooltip: { ...tokens.tooltip },
    accent: tokens.accent,
    atmosphere: { ...tokens.atmosphere },
  };
}

/**
 * 把预设写回 props（纯函数，不变异入参）。
 *
 * 写入的是**具体色值**而非隐藏状态，这样工作台与离线产物读到的 props 完全一致，
 * 且用户之后仍可逐项微调（微调结果落在 view/border/label/... 等既有样式组里）。
 * 未知 id 原样返回入参。
 */
export function applyMapQuickStyle<T extends Record<string, unknown>>(props: T, id: string): T {
  const preset = getMapQuickStyle(id);
  if (!preset) return props;
  const tokens = preset.tokens;
  const rawLayers = Array.isArray(props.layers) ? props.layers : [];
  const layers = rawLayers.map((layer) => {
    if (!layer || typeof layer !== "object") return layer;
    const record = layer as Record<string, unknown>;
    const style = record.style && typeof record.style === "object" ? (record.style as Record<string, unknown>) : {};
    if (record.type === "regionFill") {
      return { ...record, style: { ...style, colorMode: "gradient", color: tokens.fill.max, colors: { ...tokens.fill } } };
    }
    if (record.type === "geoScatter" || record.type === "geoHeatmap" || record.type === "geoFlow") {
      return { ...record, style: { ...style, color: tokens.accent } };
    }
    return layer;
  });
  const rawView = props.view && typeof props.view === "object" ? (props.view as Record<string, unknown>) : {};
  const rawLabel = props.label && typeof props.label === "object" ? (props.label as Record<string, unknown>) : {};
  const rawEmphasis = props.emphasis && typeof props.emphasis === "object" ? (props.emphasis as Record<string, unknown>) : {};
  const rawSelected = props.selected && typeof props.selected === "object" ? (props.selected as Record<string, unknown>) : {};
  const rawTooltip = props.tooltipStyle && typeof props.tooltipStyle === "object" ? (props.tooltipStyle as Record<string, unknown>) : {};
  const rawBorder = props.border && typeof props.border === "object" ? (props.border as Record<string, unknown>) : {};
  return {
    ...props,
    quickStyle: { id: preset.id, tokens: cloneTokens(tokens) },
    view: { ...rawView, backgroundColor: tokens.background },
    border: { ...rawBorder, color: tokens.border.color, width: tokens.border.width },
    label: { ...rawLabel, color: tokens.label.color, stroke: tokens.label.stroke },
    emphasis: { ...rawEmphasis, areaColor: tokens.emphasis.areaColor, borderColor: tokens.emphasis.borderColor },
    selected: { ...rawSelected, areaColor: tokens.selected.areaColor, borderColor: tokens.selected.borderColor },
    tooltipStyle: { ...rawTooltip, background: tokens.tooltip.background, borderColor: tokens.tooltip.borderColor, color: tokens.tooltip.color },
    layers,
  };
}
