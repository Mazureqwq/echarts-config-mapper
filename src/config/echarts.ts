/**
 * ECharts 按需注册：只装载当前支持的 6 种图表与必要组件，
 * 避免整包引入导致的体积膨胀。
 */
import * as echarts from "echarts/core";
import {
  BarChart,
  LineChart,
  MapChart,
  PieChart,
  RadarChart,
  ScatterChart,
} from "echarts/charts";
import {
  DatasetComponent,
  GeoComponent,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { LabelLayout, UniversalTransition } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  MapChart,
  ScatterChart,
  RadarChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  VisualMapComponent,
  RadarComponent,
  GeoComponent,
  DatasetComponent,
  LabelLayout,
  UniversalTransition,
  CanvasRenderer,
]);

export type EChartsInstance = echarts.ECharts;
export default echarts;
