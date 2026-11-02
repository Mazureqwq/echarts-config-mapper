import type { ChartInstance } from "@/types/chart";
import { createDefaultOption } from "@/config/optionFactory";
import { createId } from "@/utils/id";
import type {
  ChartAsset,
  DataSourceConfig,
  ItemType,
  Rect,
  ScreenItem,
  ScreenSchema,
  WidgetProps,
} from "./types";
import { DEFAULT_SIZES, SCREEN_H, SCREEN_W } from "./types";

/** 各类型元素的默认中文名 */
const DEFAULT_NAMES: Record<ItemType, string> = {
  chart: "图表",
  text: "文本",
  image: "图片",
  datetime: "时间",
  iframe: "网页",
};

/** 默认数据源配置：静态模式，数据写回 series.0.data */
export function createDefaultDataSource(): DataSourceConfig {
  return {
    mode: "static",
    api: {
      url: "",
      method: "GET",
      headers: {},
      interval: 0,
      dataPath: "",
      optionPath: "series.0.data",
    },
  };
}

/** 基础组件的默认 props（chart 类型无 props） */
function createDefaultProps(type: ItemType): WidgetProps | undefined {
  switch (type) {
    case "text":
      return { text: "双击编辑文本", fontSize: 24, color: "#E6EAF2" };
    case "datetime":
      return { format: "YYYY-MM-DD HH:mm:ss" };
    case "image":
    case "iframe":
      return { src: "" };
    default:
      return undefined;
  }
}

/** 创建大屏元素：rect 缺省 {x:40,y:40} 叠加类型默认尺寸 */
export function createScreenItem(type: ItemType, rect?: Partial<Rect>): ScreenItem {
  const size = DEFAULT_SIZES[type];
  const item: ScreenItem = {
    id: createId("item"),
    type,
    name: DEFAULT_NAMES[type],
    rect: { x: 40, y: 40, w: size.w, h: size.h, ...rect },
    zIndex: 1,
    visible: true,
    locked: false,
  };
  if (type === "chart") {
    item.chart = {
      sourceAssetId: null,
      chartType: "line",
      option: createDefaultOption("line"),
      dataSource: createDefaultDataSource(),
    };
  } else {
    item.props = createDefaultProps(type);
  }
  return item;
}

/** 创建空大屏 schema（1920×1080 深蓝画布） */
export function createScreenSchema(id: string, name: string): ScreenSchema {
  const now = new Date().toISOString();
  return {
    id,
    name,
    version: 1,
    canvas: { width: SCREEN_W, height: SCREEN_H, background: "#0a1a2e" },
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** 运行态/舞台渲染用：chart 元素 → ChartInstance（type 取 chartType）；非 chart 返回 null */
export function toChartInstance(item: ScreenItem): ChartInstance | null {
  const chart = item.chart;
  if (item.type !== "chart" || !chart) return null;
  return {
    id: item.id,
    type: chart.chartType,
    title: item.name,
    x: item.rect.x,
    y: item.rect.y,
    w: item.rect.w,
    h: item.rect.h,
    option: chart.option,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 规范化 api 数据源：补齐手写/旧版文件缺失字段 */
function normalizeDataSource(raw: unknown): DataSourceConfig {
  const base = createDefaultDataSource();
  if (!isObject(raw)) return base;
  const api = isObject(raw.api) ? raw.api : {};
  const headers = isObject(api.headers) ? (api.headers as Record<string, string>) : {};
  return {
    mode: raw.mode === "api" ? "api" : "static",
    api: {
      url: typeof api.url === "string" ? api.url : base.api.url,
      method: api.method === "POST" ? "POST" : "GET",
      headers,
      interval: typeof api.interval === "number" ? api.interval : base.api.interval,
      dataPath: typeof api.dataPath === "string" ? api.dataPath : base.api.dataPath,
      optionPath: typeof api.optionPath === "string" ? api.optionPath : base.api.optionPath,
    },
  };
}

/** 规范化大屏元素：补齐缺失字段，无 id 的坏 item 返回 null */
function normalizeScreenItem(raw: unknown): ScreenItem | null {
  if (!isObject(raw) || typeof raw.id !== "string" || !raw.id) return null;
  const type: ItemType = raw.type === "text" || raw.type === "image" || raw.type === "datetime" || raw.type === "iframe" ? raw.type : "chart";
  const size = DEFAULT_SIZES[type];
  const rect = isObject(raw.rect) ? raw.rect : {};
  const item: ScreenItem = {
    id: raw.id,
    type,
    name: typeof raw.name === "string" ? raw.name : DEFAULT_NAMES[type],
    rect: {
      x: typeof rect.x === "number" ? rect.x : 0,
      y: typeof rect.y === "number" ? rect.y : 0,
      w: typeof rect.w === "number" ? rect.w : size.w,
      h: typeof rect.h === "number" ? rect.h : size.h,
    },
    zIndex: typeof raw.zIndex === "number" ? raw.zIndex : 1,
    visible: raw.visible !== false,
    locked: raw.locked === true,
  };
  if (type === "chart") {
    const chart = isObject(raw.chart) ? raw.chart : {};
    const chartType = chart.chartType === "bar" || chart.chartType === "pie" || chart.chartType === "map" || chart.chartType === "scatter" || chart.chartType === "radar" ? chart.chartType : "line";
    item.chart = {
      sourceAssetId: typeof chart.sourceAssetId === "string" ? chart.sourceAssetId : null,
      chartType,
      option: isObject(chart.option) ? chart.option : createDefaultOption(chartType),
      dataSource: normalizeDataSource(chart.dataSource),
    };
  } else if (isObject(raw.props)) {
    item.props = raw.props as WidgetProps;
  }
  return item;
}

/** 规范化大屏 schema：补齐手写/旧版文件缺失字段；非法输入返回 null（加载时过滤坏文件） */
export function normalizeScreenSchema(raw: unknown): ScreenSchema | null {
  if (!isObject(raw) || typeof raw.id !== "string" || !raw.id) return null;
  const base = createScreenSchema(raw.id, "未命名大屏");
  const canvas = isObject(raw.canvas) ? raw.canvas : {};
  const items = Array.isArray(raw.items) ? raw.items : [];
  return {
    id: raw.id,
    name: typeof raw.name === "string" && raw.name ? raw.name : base.name,
    version: 1,
    canvas: {
      width: typeof canvas.width === "number" ? canvas.width : base.canvas.width,
      height: typeof canvas.height === "number" ? canvas.height : base.canvas.height,
      background: typeof canvas.background === "string" ? canvas.background : base.canvas.background,
    },
    items: items
      .map(normalizeScreenItem)
      .filter((item): item is ScreenItem => item !== null),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : base.createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : base.updatedAt,
  };
}

/** 规范化图表资产：补齐缺失字段；非法输入返回 null（加载时过滤坏文件） */
export function normalizeChartAsset(raw: unknown): ChartAsset | null {
  if (!isObject(raw) || typeof raw.id !== "string" || !raw.id) return null;
  const chartType = raw.chartType === "bar" || raw.chartType === "pie" || raw.chartType === "map" || raw.chartType === "scatter" || raw.chartType === "radar" ? raw.chartType : "line";
  const now = new Date().toISOString();
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : "未命名资产",
    category: typeof raw.category === "string" ? raw.category : "",
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    chartType,
    option: isObject(raw.option) ? raw.option : createDefaultOption(chartType),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
  };
}
