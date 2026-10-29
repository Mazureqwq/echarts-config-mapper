import type { ChartType } from "@/types/chart";

export const CHART_META: Record<
  ChartType,
  { label: string; labelEn: string; hint: string }
> = {
  line: { label: "折线图", labelEn: "Line", hint: "趋势与时间序列" },
  bar: { label: "柱状图", labelEn: "Bar", hint: "分类对比" },
  pie: { label: "饼图", labelEn: "Pie", hint: "占比构成" },
  map: { label: "地图", labelEn: "Map", hint: "地域分布" },
  scatter: { label: "散点图", labelEn: "Scatter", hint: "相关性分布" },
  radar: { label: "雷达图", labelEn: "Radar", hint: "多维评分" },
};

export const CHART_TYPES: ChartType[] = ["line", "bar", "pie", "map", "scatter", "radar"];

/** 默认调色板（与深色主题协调的 8 色） */
export const DARK_PALETTE = [
  "#6366F1",
  "#22D3EE",
  "#34D399",
  "#FBBF24",
  "#F472B6",
  "#A78BFA",
  "#FB7185",
  "#2DD4BF",
];

/** 预览画布尺寸限制 */
export const MIN_CANVAS_W = 240;
export const MAX_CANVAS_W = 1920;
export const MIN_CANVAS_H = 160;
export const MAX_CANVAS_H = 1200;

/** 历史快照上限 */
export const HISTORY_LIMIT = 60;

/** 本地持久化键名 */
export const STORAGE_KEY = "chartforge:workspace:v1";
