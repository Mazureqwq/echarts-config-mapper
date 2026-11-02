import { createDefaultOption } from "@/config/optionFactory";
import { createId } from "@/utils/id";
import type {
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
