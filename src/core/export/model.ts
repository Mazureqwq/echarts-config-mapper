import type { Background, ChartSpec, ChartType, Frame } from "@/core/model/types";

/** 产物格式标识（写进 payload 与 manifest，便于第三方与未来版本识别） */
export const PACKAGE_FORMAT = "chartforge/screen-package";
/** 产物 schema 版本：运行时遇到不认识的版本会显示中文降级页，而不是白屏 */
export const PACKAGE_SCHEMA_VERSION = 1;
/** 生成器标识 */
export const GENERATOR_NAME = "ChartForge";
export const GENERATOR_VERSION = "1.0.0";

export type ArtifactMode = "inline" | "folder";

export interface PackageChartItem {
  kind: "chart";
  id: string;
  name: string;
  frame: Frame;
  opacity: number;
  type: ChartType;
  /** 预计算好的 ECharts option：运行时只负责 setOption，不需要再带一套建图逻辑 */
  option: Record<string, unknown>;
  /** 可访问性描述 */
  alt: string;
}

export interface PackageTextItem {
  kind: "text";
  id: string;
  name: string;
  frame: Frame;
  opacity: number;
  text: string;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  weight: "normal" | "bold";
  lineHeight?: number;
}

export interface PackageImageItem {
  kind: "image";
  id: string;
  name: string;
  frame: Frame;
  opacity: number;
  /** 只允许 data:image/* 或 http(s):（导出时已过滤） */
  src: string;
  fit: "contain" | "cover" | "fill";
}

export interface PackageShapeItem {
  kind: "shape";
  id: string;
  name: string;
  frame: Frame;
  opacity: number;
  shape: "rect" | "ellipse" | "line";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
}

export type PackageItem =
  | PackageChartItem
  | PackageTextItem
  | PackageImageItem
  | PackageShapeItem;

export interface PackageScreen {
  id: string;
  name: string;
  canvas: { width: number; height: number; background: Background };
  items: PackageItem[];
}

export interface PackagePayload {
  format: typeof PACKAGE_FORMAT;
  schemaVersion: number;
  chartforgeVersion: string;
  exportedAt: string;
  title: string;
  screens: PackageScreen[];
  /** 仅当地图图表存在时携带，避免白白多 54 KB */
  geo?: { china: unknown };
  /** 导出过程中的取舍记录（被丢掉的非法 URL、被剔除的令牌等），同时写进 manifest */
  warnings: string[];
}

export interface PackageSourceItem {
  id: string;
  name: string;
  frame: Frame;
  opacity: number;
  spec: ChartSpec;
}

export interface ManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface PackageManifest {
  format: typeof PACKAGE_FORMAT;
  schemaVersion: number;
  generator: { name: string; version: string };
  exportedAt: string;
  title: string;
  mode: ArtifactMode;
  screens: Array<{ id: string; name: string; width: number; height: number; items: number }>;
  files: ManifestFile[];
  /** 完整性说明（单文件模式由 CSP 摘要保证，因此 files 为空） */
  note?: string;
  warnings: string[];
  /** 许可证与安全说明，避免产物被当成「无版权」二次分发 */
  licenses: Array<{ name: string; version: string; license: string }>;
}

export interface ExportOptions {
  /** 是否保留请求头里的令牌（默认 false → 值被剔除） */
  keepHeaders?: boolean;
  /** 是否携带实时数据源配置（V1 默认 false：纯快照最稳） */
  includeLive?: boolean;
  /** 导出时间（测试注入用） */
  now?: () => number;
}
