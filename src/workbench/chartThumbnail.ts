import { init as echartsInit } from "echarts/core";
import type { ChartSpec } from "@/core/model/types";
import { buildOption } from "@/core/chart/optionBuilder";
import { makeThumbnail } from "@/core/storage/thumbnail";
import { registerCharts } from "@/core/chart/registerCharts";

export function renderChartThumbnail(spec: ChartSpec): string {
  registerCharts();
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  const chart = echartsInit(canvas, undefined, { width: 512, height: 320 });
  try {
    chart.setOption(buildOption(spec), { notMerge: true });
    return makeThumbnail(canvas);
  } finally {
    chart.dispose();
  }
}
