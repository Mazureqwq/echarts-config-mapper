import type { ChartType, EChartsOptionLike } from "@/types/chart";

/** 基础组件类型 */
export type WidgetType = "text" | "image" | "datetime" | "iframe";

/** 大屏元素类型：图表或基础组件 */
export type ItemType = "chart" | WidgetType;

/** 元素矩形（画布坐标，px） */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** API 数据源配置 */
export interface DataSourceApi {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  /** 轮询间隔（秒），0 表示只拉取一次 */
  interval: number;
  /** 从 API 响应中取数的路径，如 "data.list" */
  dataPath: string;
  /** 数据写回 option 的目标路径 */
  optionPath: string;
}

/** 数据源配置：静态样例数据或 API 拉取 */
export interface DataSourceConfig {
  mode: "static" | "api";
  api: DataSourceApi;
}

/** 大屏内图表元素携带的图表载荷（资产快照语义：option 为深拷贝） */
export interface ChartPayload {
  sourceAssetId: string | null;
  chartType: ChartType;
  option: EChartsOptionLike;
  dataSource: DataSourceConfig;
}

/** 基础组件属性（按 type 取用对应字段） */
export interface WidgetProps {
  text?: string;
  fontSize?: number;
  color?: string;
  format?: string;
  src?: string;
}

/** 大屏元素 */
export interface ScreenItem {
  id: string;
  type: ItemType;
  name: string;
  rect: Rect;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  chart?: ChartPayload;
  props?: WidgetProps;
}

/** 大屏 schema（仓库内 .screen.json 文件结构） */
export interface ScreenSchema {
  id: string;
  name: string;
  version: 1;
  canvas: { width: number; height: number; background: string };
  items: ScreenItem[];
  createdAt: string;
  updatedAt: string;
}

/** 图表资产（图表库 .chart.json 文件结构） */
export interface ChartAsset {
  id: string;
  name: string;
  category: string;
  tags: string[];
  chartType: ChartType;
  option: EChartsOptionLike;
  createdAt: string;
  updatedAt: string;
}

/** 画布基准尺寸 */
export const SCREEN_W = 1920;
export const SCREEN_H = 1080;

/** 各类型元素默认尺寸 */
export const DEFAULT_SIZES: Record<ItemType, { w: number; h: number }> = {
  chart: { w: 480, h: 320 },
  text: { w: 320, h: 80 },
  image: { w: 320, h: 240 },
  datetime: { w: 320, h: 60 },
  iframe: { w: 640, h: 480 },
};
