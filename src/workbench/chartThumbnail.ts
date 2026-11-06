import { init as echartsInit } from "echarts/core";
import type { ChartSpec } from "@/core/model/types";
import { buildOption } from "@/core/chart/optionBuilder";
import { makeThumbnail } from "@/core/storage/thumbnail";
import { registerCharts } from "@/core/chart/registerCharts";

/** 与图表库卡片一致的比例（16:9），避免卡片 object-fit: cover 把坐标轴裁掉 */
export const THUMBNAIL_WIDTH = 640;
export const THUMBNAIL_HEIGHT = 360;
/** 成图最长边：比通用 256 更清晰，卡片里文字仍可辨认 */
export const CHART_THUMBNAIL_MAX_SIDE = 384;
/** JPEG 没有 alpha 通道，必须有不透明底色，否则透明画布会被压成黑底 */
export const THUMBNAIL_BACKGROUND = "#ffffff";

/**
 * 生成「静态终态」option：
 * - animation 必须关掉。ECharts 在 setOption 后第一帧画的是动画起点
 *   （柱子高度 0、饼图半径 0、折线贴底），此时截图就只剩坐标轴没有数据，
 *   看起来和编辑页里的图表完全不是一张图。
 * - backgroundColor 给不透明底色，JPEG 才不会变黑底。
 * 放在 buildOption 之后展开，保证用户配置里的 animation/backgroundColor 覆盖不掉。
 */
export function thumbnailOption(spec: ChartSpec): Record<string, unknown> {
  return { ...buildOption(spec), animation: false, backgroundColor: THUMBNAIL_BACKGROUND };
}

export function renderChartThumbnail(spec: ChartSpec): string {
  registerCharts();
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_WIDTH;
  canvas.height = THUMBNAIL_HEIGHT;
  // devicePixelRatio: 2 —— 缩到 384 宽后文字和细线依然清晰
  const chart = echartsInit(canvas, undefined, {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    devicePixelRatio: 2,
  });
  try {
    chart.setOption(thumbnailOption(spec), { notMerge: true });
    return makeThumbnail(canvas, undefined, CHART_THUMBNAIL_MAX_SIDE);
  } finally {
    chart.dispose();
  }
}
