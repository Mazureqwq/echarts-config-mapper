export type ChartType = "line" | "bar" | "pie" | "map" | "scatter" | "radar";

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
}

export interface TextSpec {
  text: string;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  weight: "normal" | "bold";
  lineHeight?: number;
}

export interface ImageSpec {
  src: string;
  fit: "contain" | "cover" | "fill";
}

export interface ShapeSpec {
  shape: "rect" | "ellipse" | "line";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
}

export interface LiveSource {
  url: string;
  intervalSec: number;
  dataPath?: string;
}

export type ChartData =
  | { kind: "category"; categories: string[]; series: { name: string; values: number[] }[] }
  | { kind: "nameValue"; rows: { name: string; value: number }[] }
  | { kind: "xy"; rows: { x: number; y: number; name?: string; group?: string }[] }
  | { kind: "radar"; indicators: { name: string; max: number }[]; series: { name: string; values: number[] }[] };

export interface ChartSpec {
  type: ChartType;
  option: Record<string, unknown>;
  data: ChartData;
  source?: LiveSource;
}

export interface BaseItem {
  id: string;
  name: string;
  frame: Frame;
  locked?: boolean;
  hidden?: boolean;
  opacity?: number;
  groupId?: string;
}

export interface ChartItem extends BaseItem {
  kind: "chart";
  spec: ChartSpec;
  /** 来源图表库资产的 id（拖入大屏时记录，仅作回溯用；spec 是独立副本，删资产不影响它） */
  sourceAssetId?: string;
}

export interface TextItem extends BaseItem, TextSpec {
  kind: "text";
}

export interface ImageItem extends BaseItem, ImageSpec {
  kind: "image";
}

export interface ShapeItem extends BaseItem, ShapeSpec {
  kind: "shape";
}

export type ScreenItem = ChartItem | TextItem | ImageItem | ShapeItem;

export type Background =
  | { kind: "color"; color: string }
  | { kind: "gradient"; from: string; to: string; angle: number }
  | { kind: "image"; src: string };

export interface Screen {
  id: string;
  name: string;
  canvas: { width: number; height: number; background: Background };
  items: ScreenItem[];
  updatedAt: number;
  thumbnail?: string;
  category?: string;
  tags?: string[];
}

export interface ChartAsset {
  id: string;
  name: string;
  thumbnail: string;
  /** 缩略图算法版本（见 core/storage/thumbnail 的 THUMBNAIL_VERSION），用于自动重算旧图 */
  thumbnailVersion?: number;
  spec: ChartSpec;
  /** 检索元信息：分类（图表类型或业务分类） */
  category?: string;
  /** 检索元信息：标签 */
  tags?: string[];
  /** 拖入大屏时的初始尺寸（缺省用 DEFAULT_FRAME） */
  defaultSize?: { w: number; h: number };
  createdAt: number;
  updatedAt: number;
}

export interface Workspace {
  version: 1;
  assets: ChartAsset[];
  screens: Screen[];
  settings: { autosave: boolean };
}
