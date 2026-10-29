/** 图表类型（对应 src/schema 下的基础 option 与左栏图表库） */
export type ChartType = "line" | "bar" | "pie" | "map" | "scatter" | "radar";

/** ECharts option，本质是任意嵌套对象，由 setByPath/getByPath 做安全访问 */
export type EChartsOptionLike = Record<string, any>;

/** 画布上的一张图表卡片 */
export interface ChartInstance {
  id: string;
  type: ChartType;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  option: EChartsOptionLike;
}

/** 视口（画布缩放与平移） */
export interface Viewport {
  zoom: number;
  x: number;
  y: number;
}

/** 属性字段的控件类型 */
export type FieldKind =
  | "boolean"
  | "number"
  | "string"
  | "color"
  | "select"
  | "textStyle"
  | "lineStyle"
  | "axisLine"
  | "axisTick"
  | "axisLabel"
  | "splitArea"
  | "shadow"
  | "arrayData";

/** 单个可编辑字段的元数据 */
export interface FieldMeta {
  kind: FieldKind;
  label: string;
  /** 数值范围 / 步长 */
  min?: number;
  max?: number;
  step?: number;
  /** select 的候选项 */
  options?: Array<{ label: string; value: string | number }>;
  /** 复合控件的子字段 */
  children?: Record<string, FieldMeta>;
  /** 圆角/尺寸等需要单位提示的字段 */
  unit?: string;
}

/** 属性分组（title / legend / grid ...） */
export interface SchemaGroup {
  key: string;
  label: string;
  desc?: string;
  fields: Record<string, FieldMeta>;
}

/** 一个图表类型的完整 schema */
export interface ChartSchema {
  type: ChartType;
  label: string;
  labelEn: string;
  groups: SchemaGroup[];
}

/** 历史快照（单图预览模式下保存类型与各类 option） */
export interface HistorySnapshot {
  type: ChartType;
  options: Partial<Record<ChartType, EChartsOptionLike>>;
}
