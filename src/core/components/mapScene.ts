export const MAP_LAYER_TYPES = ["regionFill", "geoScatter", "geoHeatmap", "geoFlow"] as const;
export const MAP_REGION_EVENTS = ["regionClick", "regionDblclick", "regionUpdrill"] as const;
export type MapLayerType = typeof MAP_LAYER_TYPES[number];
export type MapPresentation = "flat" | "tilted";
export const MAP_SCENE_MODEL_VERSION = 2 as const;

/** 视图偏移（容器百分比）：正 x = 内容右移，正 y = 内容下移 */
export interface MapSceneViewOffset { x: number; y: number }
export interface MapSceneView {
  center: [number, number];
  zoom: number;
  minZoom: number;
  maxZoom: number;
  dragEnabled: boolean;
  zoomEnabled: boolean;
  showLabels: boolean;
  backgroundColor: string;
  /** v2 增量字段：视图偏移（仅在提供时存在，v1 形状保持不变） */
  offset?: MapSceneViewOffset;
}

export interface MapValueFormat { decimals?: number; suffix?: string }
export interface MapLegendConfig { show: boolean; position: "top-right" | "bottom-right" | "bottom-left"; mode: "continuous" | "segments" }
/** 比例尺控件配置（自绘 DOM，双端同源） */
export interface MapScaleBarConfig { show: boolean; position: "top-left" | "top-right" | "bottom-left" | "bottom-right" }
export interface MapTooltipStyle { background: string; borderColor: string; color: string; fontSize: number }
export interface MapEmphasisStyle { areaColor: string; borderColor: string; labelColor: string }
export interface MapSelectedStyle { areaColor: string; borderColor: string }
export interface MapLabelStyle { show: boolean; color: string; size: number; stroke?: string; strokeWidth?: number; shadow?: string; shadowBlur?: number; /** 标注最小缩放：低于该缩放隐藏标注 */ minZoom?: number }
/** 外轮廓强化层：由省级几何共享边分析重建的精确国界外环 */
export interface MapBorderOutlineStyle { show: boolean; color: string; width: number }
export interface MapBorderStyle { color: string; width: number; type: "solid" | "dashed"; outline?: MapBorderOutlineStyle }
export interface MapUnderlayLayer { areaColor: string; borderColor: string; shadowColor: string }
export interface MapFillColors { min: string; mid: string; max: string; empty: string }
export interface MapLayerBorder { color: string; width: number; type: "solid" | "dashed" }
export interface MapPointLabel { show: boolean; color: string; size: number; stroke?: string }

export interface MapLayerStyle {
  color: string;
  opacity: number;
  size: number;
  colorMode?: "gradient" | "segments";
  colors?: MapFillColors;
  segments?: number;
  border?: MapLayerBorder;
  label?: MapPointLabel;
  animated?: boolean;
}

export interface MapSceneLayer {
  id: string;
  type: MapLayerType;
  name: string;
  visible: boolean;
  style: MapLayerStyle;
  /** Omitted bindings inherit the map container's binding. */
  dataBinding?: DatasetBinding;
  /** Inclusive ECharts geo zoom window when provided. */
  minZoom?: number;
  maxZoom?: number;
}

export interface MapSceneProps extends Record<string, unknown> {
  modelVersion: typeof MAP_SCENE_MODEL_VERSION;
  presentation: MapPresentation;
  pitch: number;
  view: MapSceneView;
  layers: MapSceneLayer[];
  /** v2 optional groups: omitted entirely unless provided (v1 shape preserved). */
  valueFormat?: MapValueFormat;
  legend?: MapLegendConfig;
  tooltipStyle?: MapTooltipStyle;
  emphasis?: MapEmphasisStyle;
  selected?: MapSelectedStyle;
  label?: MapLabelStyle;
  border?: MapBorderStyle;
  scaleBar?: MapScaleBarConfig;
  underlay?: MapUnderlayLayer[];
  drill?: { enabled: boolean };
  appliedSkin?: string;
}

const LAYER_DEFAULTS: Record<MapLayerType, { name: string; color: string }> = {
  regionFill: { name: "区域填色", color: "#32d6ff" },
  geoScatter: { name: "地理散点", color: "#ffcc66" },
  geoHeatmap: { name: "点热力", color: "#ff6b6b" },
  geoFlow: { name: "OD 飞线", color: "#32d6ff" },
};
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export const MAP_LEGEND_DEFAULT: MapLegendConfig = { show: false, position: "top-right", mode: "continuous" };
export const MAP_TOOLTIP_DEFAULT: MapTooltipStyle = { background: "#07121d", borderColor: "#1f2a3a", color: "#e7fbff", fontSize: 12 };
export const MAP_EMPHASIS_DEFAULT: MapEmphasisStyle = { areaColor: "#3a95fd", borderColor: "#ffffff", labelColor: "#ffffff" };
export const MAP_SELECTED_DEFAULT: MapSelectedStyle = { areaColor: "#58d6ff", borderColor: "#ffffff" };
export const MAP_FILL_DEFAULT_MIN = "#102b3d";
export const MAP_FILL_DEFAULT_MID = "#1c5f8f";
export const MAP_FILL_DEFAULT_EMPTY = "#0d1a26";
export const MAP_LAYER_BORDER_DEFAULT: MapLayerBorder = { color: "#ffffff", width: 1, type: "solid" };
export const MAP_LABEL_DEFAULT: MapLabelStyle = { show: true, color: "#e7fbff", size: 10 };
export const MAP_BORDER_DEFAULT: MapBorderStyle = { color: "#c0f3fb", width: 1, type: "solid" };
export const MAP_SCALE_BAR_DEFAULT: MapScaleBarConfig = { show: false, position: "bottom-left" };
export const MAP_OUTLINE_DEFAULT_COLOR = "#bfe9ff";
/** 视图偏移换算所用的参考视口（1280×720），保证双端换算一致 */
export const MAP_SCENE_REFERENCE_VIEWPORT = { width: 1280, height: 720 };

function normalizeHex(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value) ? value : fallback;
}

function normalizeLayerStyle(raw: Record<string, unknown>, defaultColor: string): MapLayerStyle {
  const color = normalizeHex(raw.color, defaultColor);
  const base: MapLayerStyle = {
    color,
    opacity: clamp(raw.opacity, 0, 1, 0.85),
    size: clamp(raw.size, 1, 100, 12),
  };
  const colorMode = raw.colorMode === "gradient" || raw.colorMode === "segments" ? raw.colorMode : undefined;
  if (colorMode !== undefined) base.colorMode = colorMode;
  if (colorMode !== undefined || isRecord(raw.colors)) {
    const colors = isRecord(raw.colors) ? raw.colors : {};
    base.colors = {
      min: normalizeHex(colors.min, MAP_FILL_DEFAULT_MIN),
      mid: normalizeHex(colors.mid, MAP_FILL_DEFAULT_MID),
      max: normalizeHex(colors.max, color),
      empty: normalizeHex(colors.empty, MAP_FILL_DEFAULT_EMPTY),
    };
  }
  if (typeof raw.segments === "number" && Number.isFinite(raw.segments)) base.segments = clamp(raw.segments, 2, 10, 5);
  if (isRecord(raw.border)) {
    base.border = {
      color: normalizeHex(raw.border.color, MAP_LAYER_BORDER_DEFAULT.color),
      width: clamp(raw.border.width, 0, 8, MAP_LAYER_BORDER_DEFAULT.width),
      type: raw.border.type === "dashed" ? "dashed" : "solid",
    };
  }
  if (isRecord(raw.label)) {
    const label: MapPointLabel = {
      show: typeof raw.label.show === "boolean" ? raw.label.show : true,
      color: normalizeHex(raw.label.color, "#e7fbff"),
      size: clamp(raw.label.size, 1, 40, 12),
    };
    if (typeof raw.label.stroke === "string" && HEX_COLOR.test(raw.label.stroke)) label.stroke = raw.label.stroke;
    base.label = label;
  }
  if (typeof raw.animated === "boolean") base.animated = raw.animated;
  return base;
}

function normalizeV2Groups(input: Record<string, unknown>): Partial<MapSceneProps> {
  const out: Partial<MapSceneProps> = {};
  if (isRecord(input.valueFormat)) {
    const fmt: MapValueFormat = { decimals: clamp(input.valueFormat.decimals, 0, 4, 0) };
    if (typeof input.valueFormat.suffix === "string") fmt.suffix = input.valueFormat.suffix.slice(0, 12);
    out.valueFormat = fmt;
  }
  if (isRecord(input.legend)) {
    out.legend = {
      show: typeof input.legend.show === "boolean" ? input.legend.show : false,
      position: input.legend.position === "bottom-right" || input.legend.position === "bottom-left" ? input.legend.position : "top-right",
      mode: input.legend.mode === "segments" ? "segments" : "continuous",
    };
  }
  if (isRecord(input.tooltipStyle)) {
    out.tooltipStyle = {
      background: normalizeHex(input.tooltipStyle.background, MAP_TOOLTIP_DEFAULT.background),
      borderColor: normalizeHex(input.tooltipStyle.borderColor, MAP_TOOLTIP_DEFAULT.borderColor),
      color: normalizeHex(input.tooltipStyle.color, MAP_TOOLTIP_DEFAULT.color),
      fontSize: clamp(input.tooltipStyle.fontSize, 8, 32, MAP_TOOLTIP_DEFAULT.fontSize),
    };
  }
  if (isRecord(input.emphasis)) {
    out.emphasis = {
      areaColor: normalizeHex(input.emphasis.areaColor, MAP_EMPHASIS_DEFAULT.areaColor),
      borderColor: normalizeHex(input.emphasis.borderColor, MAP_EMPHASIS_DEFAULT.borderColor),
      labelColor: normalizeHex(input.emphasis.labelColor, MAP_EMPHASIS_DEFAULT.labelColor),
    };
  }
  if (isRecord(input.selected)) {
    out.selected = {
      areaColor: normalizeHex(input.selected.areaColor, MAP_SELECTED_DEFAULT.areaColor),
      borderColor: normalizeHex(input.selected.borderColor, MAP_SELECTED_DEFAULT.borderColor),
    };
  }
  if (isRecord(input.label)) {
    const label: MapLabelStyle = {
      show: typeof input.label.show === "boolean" ? input.label.show : true,
      color: normalizeHex(input.label.color, MAP_LABEL_DEFAULT.color),
      size: clamp(input.label.size, 8, 40, MAP_LABEL_DEFAULT.size),
    };
    if (typeof input.label.stroke === "string" && HEX_COLOR.test(input.label.stroke)) label.stroke = input.label.stroke;
    if (typeof input.label.strokeWidth === "number") label.strokeWidth = clamp(input.label.strokeWidth, 0, 6, 1);
    if (typeof input.label.shadow === "string" && HEX_COLOR.test(input.label.shadow)) label.shadow = input.label.shadow;
    if (typeof input.label.shadowBlur === "number") label.shadowBlur = clamp(input.label.shadowBlur, 0, 24, 0);
    if (typeof input.label.minZoom === "number") label.minZoom = clamp(input.label.minZoom, 0.5, 20, 1);
    out.label = label;
  }
  if (isRecord(input.border)) {
    const border: MapBorderStyle = {
      color: normalizeHex(input.border.color, MAP_BORDER_DEFAULT.color),
      width: clamp(input.border.width, 0, 8, MAP_BORDER_DEFAULT.width),
      type: input.border.type === "dashed" ? "dashed" : "solid",
    };
    if (isRecord(input.border.outline)) {
      border.outline = {
        show: typeof input.border.outline.show === "boolean" ? input.border.outline.show : true,
        color: normalizeHex(input.border.outline.color, MAP_OUTLINE_DEFAULT_COLOR),
        width: clamp(input.border.outline.width, 0, 12, 2),
      };
    }
    out.border = border;
  }
  if (isRecord(input.scaleBar)) {
    out.scaleBar = {
      show: typeof input.scaleBar.show === "boolean" ? input.scaleBar.show : false,
      position: input.scaleBar.position === "top-left" || input.scaleBar.position === "top-right" || input.scaleBar.position === "bottom-left" || input.scaleBar.position === "bottom-right"
        ? input.scaleBar.position
        : MAP_SCALE_BAR_DEFAULT.position,
    };
  }
  if (Array.isArray(input.underlay)) {
    const entries = input.underlay.slice(0, 3).filter(isRecord).map((entry) => ({
      areaColor: normalizeHex(entry.areaColor, "#10273a"),
      borderColor: normalizeHex(entry.borderColor, "#b5f3ff"),
      shadowColor: normalizeHex(entry.shadowColor, "#8cd3ef"),
    }));
    if (entries.length) out.underlay = entries;
  }
  if (isRecord(input.drill)) out.drill = { enabled: typeof input.drill.enabled === "boolean" ? input.drill.enabled : true };
  if (typeof input.appliedSkin === "string" && input.appliedSkin.trim()) out.appliedSkin = input.appliedSkin.trim().slice(0, 48);
  return out;
}

/** Format a map value for legend/tooltip/valueText display. */
export function formatMapValue(value: number | null, fmt?: MapValueFormat): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const decimals = clamp(fmt?.decimals, 0, 4, 0);
  const text = value.toFixed(decimals);
  return typeof fmt?.suffix === "string" && fmt.suffix ? `${text}${fmt.suffix}` : text;
}

export const CHINA_REGION_NAMES = [
  "新疆维吾尔自治区", "西藏自治区", "内蒙古自治区", "青海省", "四川省", "黑龙江省", "甘肃省", "云南省",
  "广西壮族自治区", "湖南省", "陕西省", "广东省", "吉林省", "河北省", "湖北省", "贵州省", "山东省",
  "江西省", "河南省", "辽宁省", "山西省", "安徽省", "福建省", "浙江省", "江苏省", "重庆市",
  "宁夏回族自治区", "海南省", "台湾省", "北京市", "天津市", "上海市", "香港特别行政区", "澳门特别行政区",
] as const;

function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const pa = parse(a);
  const pb = parse(b);
  const mixed = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.min(1, Math.max(0, t))));
  return "#" + mixed.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Three-stop ramp: min@0, mid@0.5, max@1. */
export function rampColor(colors: MapFillColors, t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped <= 0.5 ? mixHex(colors.min, colors.mid, clamped * 2) : mixHex(colors.mid, colors.max, (clamped - 0.5) * 2);
}

/** Endpoint-inclusive piecewise segments: first piece carries min color, last carries max color. */
export function buildSegmentPieces(colors: MapFillColors, min: number, max: number, count: number): Array<Record<string, unknown>> {
  const n = Math.min(10, Math.max(2, Math.round(count)));
  const span = max - min;
  const pieces: Array<Record<string, unknown>> = [];
  for (let k = 0; k < n; k++) {
    const color = k === 0 ? colors.min : k === n - 1 ? colors.max : rampColor(colors, k / (n - 1));
    const lo = min + (span * k) / n;
    const hi = min + (span * (k + 1)) / n;
    if (k === 0) pieces.push({ lte: hi, color });
    else if (k === n - 1) pieces.push({ gt: lo, color });
    else pieces.push({ gt: lo, lte: hi, color });
  }
  return pieces;
}

export interface DrillView { center: [number, number]; zoom: number }

/** Bounding-box center of a named feature in a GeoJSON FeatureCollection (null when absent/empty). */
export function computeRegionCenter(geoJson: unknown, name: string): [number, number] | null {
  const collection = geoJson as { features?: Array<{ properties?: { name?: string }; geometry?: unknown }> } | undefined;
  const feature = collection?.features?.find((entry) => entry.properties?.name === name);
  if (!feature?.geometry) return null;
  const points: number[][] = [];
  const walk = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      points.push([value[0], value[1]]);
      return;
    }
    value.forEach(walk);
  };
  const geometry = feature.geometry as { type?: string; coordinates?: unknown; geometries?: Array<{ coordinates?: unknown }> };
  if (geometry.type === "GeometryCollection") {
    (geometry.geometries ?? []).forEach((entry) => walk(entry.coordinates));
  } else {
    walk(geometry.coordinates);
  }
  if (!points.length) return null;
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/** 视图偏移换算：容器像素偏移 → 相机中心偏移（正 x = 内容右移 → 相机西移；正 y = 内容下移 → 相机北移）。 */
export function applyViewOffset(
  center: [number, number],
  zoom: number,
  offset: MapSceneViewOffset | undefined,
  viewport: { width: number; height: number },
): [number, number] {
  if (!offset || (!offset.x && !offset.y)) return [center[0], center[1]];
  const worldSize = 512 * 2 ** Math.max(0, zoom);
  const degreesPerPixelLng = 360 / worldSize;
  const metersPerPixel = 40075016.686 * Math.cos((center[1] * Math.PI) / 180) / worldSize;
  const degreesPerPixelLat = metersPerPixel / 111319.49079327358;
  const shiftX = (offset.x / 100) * viewport.width;
  const shiftY = (offset.y / 100) * viewport.height;
  return [
    center[0] - shiftX * degreesPerPixelLng,
    center[1] + shiftY * degreesPerPixelLat,
  ];
}

/** 两点大圆距离（米）——比例尺测量用。 */
export function haversineMeters(a: [number, number], b: [number, number]): number {
  const radius = 6371008.8;
  const toRad = (value: number): number => (value * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface MapScaleBarDistance { meters: number; pixels: number; text: string }

/** 比例尺刻度：取不超过目标长度的 1/2/5×10ⁿ 整数档位。 */
export function pickScaleBarDistance(metersPerPixel: number, maxPixels = 110): MapScaleBarDistance {
  const limit = Number.isFinite(maxPixels) && maxPixels > 0 ? maxPixels : 110;
  const perPixel = Number.isFinite(metersPerPixel) && metersPerPixel > 0 ? metersPerPixel : 1;
  const target = Math.max(1, perPixel * limit);
  const base = 10 ** Math.floor(Math.log10(target));
  const candidates = [1, 2, 5].map((factor) => factor * base);
  const usable = candidates.filter((value) => value <= target);
  let meters = usable.length ? usable[usable.length - 1]! : base / 10;
  if (!Number.isFinite(meters) || meters < 1) meters = 1;
  return { meters, pixels: meters / perPixel, text: formatScaleDistance(meters) };
}

/** 比例尺文本：m / km。 */
export function formatScaleDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "0 m";
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${Number(km.toFixed(km >= 10 ? 0 : 1))} km`;
  }
  return `${Math.round(meters)} m`;
}

/** 国界外环几何（FeatureCollection + MultiLineString） */
export interface MapOutlineCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { name: string };
    geometry: { type: "MultiLineString"; coordinates: number[][][] };
  }>;
}

/** 国界外环几何（FeatureCollection + MultiLineString） */
export interface MapOutlineCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { name: string };
    geometry: { type: "MultiLineString"; coordinates: number[][][] };
  }>;
}

/** 参与并集分析的省级区域：一个 feature 的全部环 + 外包框。 */
interface OutlineRegion {
  rings: number[][][];
  bbox: [number, number, number, number];
}

/** 省级环上的一条原始边。 */
interface OutlineEdge {
  a: readonly number[];
  b: readonly number[];
  region: number;
  /** 切分点：t 为本边上的参数，point 为规范化后的坐标。 */
  splits: Array<{ t: number; point: number[] }>;
}

/** 平面图节点（用于外环追踪）。 */
interface OutlineNode {
  x: number;
  y: number;
  /** 出射边终点，按出射角升序。 */
  next: number[][];
}

/** 节点键精度：1e-9 度远小于数据最小顶点间距（0.033 度），可唯一标识节点。 */
const OUTLINE_KEY_PRECISION = 1e9;
/** 交点 / 共线判定容差。 */
const OUTLINE_PARAM_EPS = 1e-9;
/** 内外侧采样偏移（度，约 0.1 米）。 */
const OUTLINE_SAMPLE_EPS = 1e-6;

function outlineKey(x: number, y: number): string {
  return `${Math.round(x * OUTLINE_KEY_PRECISION)},${Math.round(y * OUTLINE_KEY_PRECISION)}`;
}

function collectOutlineRings(geometry: unknown, out: number[][][]): void {
  if (!geometry || typeof geometry !== "object") return;
  const value = geometry as { type?: string; coordinates?: unknown; geometries?: unknown[] };
  if (value.type === "GeometryCollection") {
    for (const entry of value.geometries ?? []) collectOutlineRings(entry, out);
    return;
  }
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    // 单点 [x, y]：忽略
    if (typeof node[0] === "number" && typeof node[1] === "number") return;
    // 环 [[x, y], ...]：收集为一个环
    if (Array.isArray(node[0]) && typeof node[0][0] === "number") {
      out.push(node as number[][]);
      return;
    }
    for (const child of node) walk(child);
  };
  walk(value.coordinates);
}

/** 收集参与分析的省级区域（每个 feature 一组环）。 */
function collectOutlineRegions(geoJson: unknown): OutlineRegion[] {
  const regions: OutlineRegion[] = [];
  const collection = geoJson as { features?: Array<{ geometry?: unknown }> } | undefined;
  for (const feature of collection?.features ?? []) {
    const rings: number[][][] = [];
    collectOutlineRings(feature.geometry, rings);
    if (!rings.length) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const ring of rings) {
      for (const point of ring) {
        const x = point[0] ?? 0;
        const y = point[1] ?? 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    regions.push({ rings, bbox: [minX, minY, maxX, maxY] });
  }
  return regions;
}

/** 射线法：点是否落在环集合内（跨环按奇偶规则，环即洞）。 */
function pointInOutlineRings(rings: readonly number[][][], x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) {
    const total = ring.length;
    for (let index = 0; index < total; index += 1) {
      const a = ring[index];
      const b = ring[(index + 1) % total];
      if (!a || !b) continue;
      const ax = a[0] ?? 0;
      const ay = a[1] ?? 0;
      const bx = b[0] ?? 0;
      const by = b[1] ?? 0;
      if ((ay > y) !== (by > y)) {
        const xi = ax + ((y - ay) * (bx - ax)) / (by - ay);
        if (xi > x) inside = !inside;
      }
    }
  }
  return inside;
}

/** 点是否落在省级区域的并集内。 */
function pointInOutlineUnion(regions: readonly OutlineRegion[], x: number, y: number): boolean {
  for (const region of regions) {
    const minX = region.bbox[0];
    const minY = region.bbox[1];
    const maxX = region.bbox[2];
    const maxY = region.bbox[3];
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    if (pointInOutlineRings(region.rings, x, y)) return true;
  }
  return false;
}

/** 把省级环拆成原始边（相邻两个顶点构成一条边）。 */
function buildOutlineEdges(regions: readonly OutlineRegion[]): OutlineEdge[] {
  const edges: OutlineEdge[] = [];
  regions.forEach((region, index) => {
    for (const ring of region.rings) {
      const total = ring.length;
      for (let position = 0; position < total; position += 1) {
        const a = ring[position];
        const b = ring[(position + 1) % total];
        if (!a || !b) continue;
        if ((a[0] ?? 0) === (b[0] ?? 0) && (a[1] ?? 0) === (b[1] ?? 0)) continue;
        edges.push({ a, b, region: index, splits: [] });
      }
    }
  });
  return edges;
}

function outlineLerp(a: readonly number[], b: readonly number[], t: number): number[] {
  const ax = a[0] ?? 0;
  const ay = a[1] ?? 0;
  const bx = b[0] ?? 0;
  const by = b[1] ?? 0;
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

/** 两线段是否真交叉（不含端点接触），返回两条线段上的参数。 */
function outlineSegmentCross(
  p1: readonly number[],
  p2: readonly number[],
  p3: readonly number[],
  p4: readonly number[],
): [number, number] | null {
  const d1x = (p2[0] ?? 0) - (p1[0] ?? 0);
  const d1y = (p2[1] ?? 0) - (p1[1] ?? 0);
  const d2x = (p4[0] ?? 0) - (p3[0] ?? 0);
  const d2y = (p4[1] ?? 0) - (p3[1] ?? 0);
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-18) return null;
  const ex = (p3[0] ?? 0) - (p1[0] ?? 0);
  const ey = (p3[1] ?? 0) - (p1[1] ?? 0);
  const t = (ex * d2y - ey * d2x) / den;
  const u = (ex * d1y - ey * d1x) / den;
  if (t > OUTLINE_PARAM_EPS && t < 1 - OUTLINE_PARAM_EPS && u > OUTLINE_PARAM_EPS && u < 1 - OUTLINE_PARAM_EPS) {
    return [t, u];
  }
  return null;
}

/** 点是否落在线段内部，返回其参数。 */
function outlinePointOnSegment(point: readonly number[], a: readonly number[], b: readonly number[]): number | null {
  const dx = (b[0] ?? 0) - (a[0] ?? 0);
  const dy = (b[1] ?? 0) - (a[1] ?? 0);
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return null;
  const t = (((point[0] ?? 0) - (a[0] ?? 0)) * dx + ((point[1] ?? 0) - (a[1] ?? 0)) * dy) / lengthSq;
  if (t <= OUTLINE_PARAM_EPS || t >= 1 - OUTLINE_PARAM_EPS) return null;
  const cx = (a[0] ?? 0) + t * dx;
  const cy = (a[1] ?? 0) + t * dy;
  if (Math.abs(cx - (point[0] ?? 0)) > OUTLINE_PARAM_EPS || Math.abs(cy - (point[1] ?? 0)) > OUTLINE_PARAM_EPS) return null;
  return t;
}

/**
 * 在所有交点与 T 型接点上切分原始边。
 * 交叉点先规范化（两线段插值取中）再同时写入两条边，保证后续节点标识完全一致。
 */
function splitOutlineEdges(edges: OutlineEdge[]): void {
  const order = edges.map((_, index) => index).sort((left, right) => {
    const a = edges[left];
    const b = edges[right];
    if (!a || !b) return 0;
    return Math.min(a.a[0] ?? 0, a.b[0] ?? 0) - Math.min(b.a[0] ?? 0, b.b[0] ?? 0);
  });
  const active: number[] = [];
  for (const index of order) {
    const edge = edges[index];
    if (!edge) continue;
    const minX = Math.min(edge.a[0] ?? 0, edge.b[0] ?? 0);
    for (let position = active.length - 1; position >= 0; position -= 1) {
      const other = edges[active[position] ?? -1];
      if (!other) continue;
      if (Math.max(other.a[0] ?? 0, other.b[0] ?? 0) < minX) active.splice(position, 1);
    }
    for (const otherIndex of active) {
      const other = edges[otherIndex];
      if (!other || edge.region === other.region) continue;
      const minY = Math.min(edge.a[1] ?? 0, edge.b[1] ?? 0);
      const maxY = Math.max(edge.a[1] ?? 0, edge.b[1] ?? 0);
      const otherMinY = Math.min(other.a[1] ?? 0, other.b[1] ?? 0);
      const otherMaxY = Math.max(other.a[1] ?? 0, other.b[1] ?? 0);
      if (maxY < otherMinY || otherMaxY < minY) continue;
      const hit = outlineSegmentCross(edge.a, edge.b, other.a, other.b);
      if (hit) {
        const [t, u] = hit;
        const first = outlineLerp(edge.a, edge.b, t);
        const second = outlineLerp(other.a, other.b, u);
        const canonical = [((first[0] ?? 0) + (second[0] ?? 0)) / 2, ((first[1] ?? 0) + (second[1] ?? 0)) / 2];
        edge.splits.push({ t, point: canonical });
        other.splits.push({ t: u, point: canonical });
        continue;
      }
      // T 型接点：一端的顶点落在另一条边的内部
      const junctions: Array<{ point: readonly number[]; target: OutlineEdge }> = [
        { point: other.a, target: edge },
        { point: other.b, target: edge },
        { point: edge.a, target: other },
        { point: edge.b, target: other },
      ];
      for (const junction of junctions) {
        const t = outlinePointOnSegment(junction.point, junction.target.a, junction.target.b);
        if (t === null) continue;
        junction.target.splits.push({ t, point: [junction.point[0] ?? 0, junction.point[1] ?? 0] });
      }
    }
    active.push(index);
  }
}

/** 切分后的子线段（相邻子段共享端点）。 */
function buildOutlineSegments(edges: readonly OutlineEdge[]): Array<{ p: number[]; q: number[] }> {
  const segments: Array<{ p: number[]; q: number[] }> = [];
  for (const edge of edges) {
    const sorted = [...edge.splits].sort((left, right) => left.t - right.t);
    const seen = new Set<string>();
    const chain: number[][] = [[edge.a[0] ?? 0, edge.a[1] ?? 0]];
    for (const split of sorted) {
      const key = outlineKey(split.point[0] ?? 0, split.point[1] ?? 0);
      if (seen.has(key)) continue;
      seen.add(key);
      chain.push(split.point);
    }
    chain.push([edge.b[0] ?? 0, edge.b[1] ?? 0]);
    for (let index = 0; index + 1 < chain.length; index += 1) {
      const p = chain[index];
      const q = chain[index + 1];
      if (!p || !q) continue;
      if (outlineKey(p[0] ?? 0, p[1] ?? 0) === outlineKey(q[0] ?? 0, q[1] ?? 0)) continue;
      segments.push({ p, q });
    }
  }
  return segments;
}

/**
 * 判定每条子线段是否落在省级并集的边界上：
 * 沿线段两侧各取一个极近采样点，只有恰好一侧在并集内时才是边界，
 * 并统一让并集内部位于左侧。
 */
function classifyOutlineSegments(
  regions: readonly OutlineRegion[],
  segments: readonly { p: number[]; q: number[] }[],
): Array<{ u: number[]; v: number[] }> {
  const boundary: Array<{ u: number[]; v: number[] }> = [];
  for (const segment of segments) {
    const p = segment.p;
    const q = segment.q;
    const mx = ((p[0] ?? 0) + (q[0] ?? 0)) / 2;
    const my = ((p[1] ?? 0) + (q[1] ?? 0)) / 2;
    const dx = (q[0] ?? 0) - (p[0] ?? 0);
    const dy = (q[1] ?? 0) - (p[1] ?? 0);
    const length = Math.hypot(dx, dy);
    if (!length) continue;
    const offset = Math.min(OUTLINE_SAMPLE_EPS, length / 8);
    const nx = (-dy / length) * offset;
    const ny = (dx / length) * offset;
    const left = pointInOutlineUnion(regions, mx + nx, my + ny);
    const right = pointInOutlineUnion(regions, mx - nx, my - ny);
    if (left === right) continue;
    boundary.push(left ? { u: p, v: q } : { u: q, v: p });
  }
  return boundary;
}

/** 平面图左面遍历：在出射边中取相对来向最“顺时针”的那条，保证走出外环而非洞。 */
function nextOutlineEdge(node: OutlineNode, from: readonly number[]): number[] | null {
  if (!node.next.length) return null;
  const back = Math.atan2((from[1] ?? 0) - node.y, (from[0] ?? 0) - node.x);
  let best: number[] | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const candidate of node.next) {
    const outgoing = Math.atan2((candidate[1] ?? 0) - node.y, (candidate[0] ?? 0) - node.x);
    let delta = (back - outgoing) % (Math.PI * 2);
    if (delta < 0) delta += Math.PI * 2;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }
  return best;
}

/** 追踪全部边界环（外环 + 洞）。 */
function traceOutlineLoops(boundary: readonly { u: number[]; v: number[] }[]): number[][][] {
  const adjacency = new Map<string, OutlineNode>();
  for (const edge of boundary) {
    const key = outlineKey(edge.u[0] ?? 0, edge.u[1] ?? 0);
    let node = adjacency.get(key);
    if (!node) {
      node = { x: edge.u[0] ?? 0, y: edge.u[1] ?? 0, next: [] };
      adjacency.set(key, node);
    }
    node.next.push(edge.v);
  }
  for (const entry of adjacency.values()) {
    const node = entry;
    node.next.sort((left, right) => {
      const a = Math.atan2((left[1] ?? 0) - node.y, (left[0] ?? 0) - node.x);
      const b = Math.atan2((right[1] ?? 0) - node.y, (right[0] ?? 0) - node.x);
      return a - b;
    });
  }

  const visited = new Set<string>();
  const loops: number[][][] = [];
  for (const edge of boundary) {
    const startKey = outlineKey(edge.u[0] ?? 0, edge.u[1] ?? 0);
    const firstKey = outlineKey(edge.v[0] ?? 0, edge.v[1] ?? 0);
    if (visited.has(`${startKey}|${firstKey}`)) continue;
    const loop: number[][] = [[edge.u[0] ?? 0, edge.u[1] ?? 0]];
    let current = edge.u;
    let next = edge.v;
    for (;;) {
      visited.add(`${outlineKey(current[0] ?? 0, current[1] ?? 0)}|${outlineKey(next[0] ?? 0, next[1] ?? 0)}`);
      loop.push([next[0] ?? 0, next[1] ?? 0]);
      const node = adjacency.get(outlineKey(next[0] ?? 0, next[1] ?? 0));
      if (!node) break;
      const successor = nextOutlineEdge(node, current);
      if (!successor) break;
      if (visited.has(`${outlineKey(next[0] ?? 0, next[1] ?? 0)}|${outlineKey(successor[0] ?? 0, successor[1] ?? 0)}`)) break;
      current = next;
      next = successor;
      if (loop.length > 100000) break;
    }
    loops.push(loop);
  }
  return loops;
}

/** 有符号面积（鞋带公式）：逆时针为正。 */
function outlineSignedArea(loop: readonly number[][]): number {
  let sum = 0;
  for (let index = 0; index + 1 < loop.length; index += 1) {
    const a = loop[index];
    const b = loop[index + 1];
    if (!a || !b) continue;
    sum += (a[0] ?? 0) * (b[1] ?? 0) - (b[0] ?? 0) * (a[1] ?? 0);
  }
  return sum / 2;
}

/**
 * 依据省级几何的精确平面分析重建国界外环：
 * 先把省界拆成边并在交点 / T 型接点上切分，再按“并集内外两侧采样”判定哪些子边
 * 真正落在省级并集边界上，最后用左面遍历串成闭合环。
 * 只保留外环（逆时针），洞（如甘肃—宁夏、广东—香港之间的行政缝隙）会被排除。
 */
export function buildChinaOutline(geoJson: unknown): MapOutlineCollection {
  const cacheKey = geoJson && typeof geoJson === "object" ? (geoJson as object) : null;
  if (cacheKey) {
    const cached = outlineCache.get(cacheKey);
    if (cached) return cached;
  }
  const built = computeChinaOutline(geoJson);
  if (cacheKey) outlineCache.set(cacheKey, built);
  return built;
}

const outlineCache = new WeakMap<object, MapOutlineCollection>();

function computeChinaOutline(geoJson: unknown): MapOutlineCollection {
  const regions = collectOutlineRegions(geoJson);
  if (!regions.length) return { type: "FeatureCollection", features: [] };
  const edges = buildOutlineEdges(regions);
  splitOutlineEdges(edges);
  const segments = buildOutlineSegments(edges);
  const boundary = classifyOutlineSegments(regions, segments);
  const loops = traceOutlineLoops(boundary);
  const outer = loops
    .map((loop) => ({ loop, area: outlineSignedArea(loop) }))
    .filter((entry) => entry.area > 0)
    .sort((left, right) => right.area - left.area)
    .map((entry) => entry.loop);
  if (!outer.length) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { name: "国界外环" }, geometry: { type: "MultiLineString", coordinates: outer } }],
  };
}

/** Linear camera interpolation for the drill tween; t is clamped to [0, 1]. */
export function interpolateDrillView(from: DrillView, to: DrillView, t: number): DrillView {
  const k = Math.min(1, Math.max(0, t));
  return {
    center: [
      from.center[0] + (to.center[0] - from.center[0]) * k,
      from.center[1] + (to.center[1] - from.center[1]) * k,
    ],
    zoom: from.zoom + (to.zoom - from.zoom) * k,
  };
}

/** Drop layers outside the inclusive zoom window (missing bounds always stay visible). */
export function filterLayersForZoom(layers: readonly MapSceneLayer[], zoom: number): MapSceneLayer[] {
  return layers.filter((layer) => {
    if (layer.minZoom !== undefined && zoom < layer.minZoom) return false;
    if (layer.maxZoom !== undefined && zoom > layer.maxZoom) return false;
    return true;
  });
}

export type MapLegendEntry = { label: string; color: string } | { from: string; to: string; stops: string[] };

/** Legend entries derived from the first visible regionFill layer (empty when legend hidden or no data). */
export function buildMapLegend(
  props: unknown,
  rows: readonly Record<string, unknown>[],
  fields?: DatasetBinding["fields"],
  rowsByLayerId: Readonly<Record<string, readonly MapRow[]>> = {},
): MapLegendEntry[] {
  const scene = normalizeMapSceneProps(props);
  if (!scene.legend?.show) return [];
  const layer = scene.layers.find((entry) => entry.visible && entry.type === "regionFill");
  if (!layer) return [];
  const layerRows = layer.dataBinding ? (rowsByLayerId[layer.id] ?? []) : rows;
  const layerFields = layer.dataBinding ? layer.dataBinding.fields : fields;
  const converted = regionRows(layerRows, layerFields);
  if (converted.error || !converted.data.length) return [];
  const values = converted.data.map((row) => row.value);
  const minimum = values.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
  const maximum = values.reduce((max, value) => Math.max(max, value), Number.NEGATIVE_INFINITY);
  const fmt = scene.valueFormat;
  const colors = layer.style.colors ?? { min: MAP_FILL_DEFAULT_MIN, mid: MAP_FILL_DEFAULT_MID, max: layer.style.color, empty: MAP_FILL_DEFAULT_EMPTY };
  if (scene.legend.mode === "segments" || layer.style.colorMode === "segments") {
    const n = layer.style.segments ?? 5;
    const span = maximum - minimum;
    const entries: MapLegendEntry[] = [];
    for (let k = 0; k < n; k++) {
      const lo = minimum + (span * k) / n;
      const hi = minimum + (span * (k + 1)) / n;
      entries.push({
        label: `${formatMapValue(lo, fmt)} ~ ${formatMapValue(hi, fmt)}`,
        color: k === 0 ? colors.min : k === n - 1 ? colors.max : rampColor(colors, k / (n - 1)),
      });
    }
    return entries;
  }
  return [{ from: formatMapValue(minimum, fmt), to: formatMapValue(maximum, fmt), stops: [colors.min, colors.mid, colors.max] }];
}

const GEO_FIELD_KEYS = ["longitude", "latitude", "name", "value", "originLongitude", "originLatitude", "destinationLongitude", "destinationLatitude"] as const;

function normalizeLayerBinding(raw: unknown): DatasetBinding | undefined {
  if (!isRecord(raw) || typeof raw.datasetId !== "string" || !raw.datasetId.trim()) return undefined;
  const datasetId = raw.datasetId.trim();
  const rawFields = isRecord(raw.fields) ? raw.fields : {};
  const fields: NonNullable<DatasetBinding["fields"]> = {};
  for (const key of ["category", "value", "seriesField"] as const) {
    const value = rawFields[key];
    if (typeof value === "string" && value.trim()) fields[key] = value.trim();
  }
  const rawGeo = isRecord(rawFields.geo) ? rawFields.geo : {};
  const geo: NonNullable<NonNullable<DatasetBinding["fields"]>["geo"]> = {};
  for (const key of GEO_FIELD_KEYS) {
    const value = rawGeo[key];
    if (typeof value === "string" && value.trim()) geo[key] = value.trim();
  }
  if (Object.keys(geo).length) fields.geo = geo;
  const filterRaw = isRecord(raw.filterBy) ? raw.filterBy : {};
  const filterField = typeof filterRaw.field === "string" ? filterRaw.field.trim() : "";
  const globalVariable = typeof filterRaw.globalVariable === "string" ? filterRaw.globalVariable.trim() : "";
  const filterBy = filterField && globalVariable ? { field: filterField, globalVariable } : undefined;
  return {
    datasetId,
    ...(Object.keys(fields).length ? { fields } : {}),
    ...(filterBy ? { filterBy } : {}),
  };
}

const DEFAULT_MAP_VIEW: MapSceneView = {
  center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8,
  dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622",
};

function normalizeMapSceneView(raw: unknown): MapSceneView {
  const input = isRecord(raw) ? raw : {};
  const center = Array.isArray(input.center) ? input.center : [];
  const minZoom = clamp(input.minZoom, 0.5, 20, DEFAULT_MAP_VIEW.minZoom);
  const maxZoom = clamp(input.maxZoom, minZoom, 20, DEFAULT_MAP_VIEW.maxZoom);
  const offset = isRecord(input.offset)
    ? {
        x: Math.round(clamp(input.offset.x, -100, 100, 0) * 10) / 10,
        y: Math.round(clamp(input.offset.y, -100, 100, 0) * 10) / 10,
      }
    : undefined;
  return {
    center: [clamp(center[0], -180, 180, DEFAULT_MAP_VIEW.center[0]), clamp(center[1], -90, 90, DEFAULT_MAP_VIEW.center[1])],
    zoom: clamp(input.zoom, minZoom, maxZoom, DEFAULT_MAP_VIEW.zoom),
    minZoom, maxZoom,
    dragEnabled: typeof input.dragEnabled === "boolean" ? input.dragEnabled : DEFAULT_MAP_VIEW.dragEnabled,
    zoomEnabled: typeof input.zoomEnabled === "boolean" ? input.zoomEnabled : DEFAULT_MAP_VIEW.zoomEnabled,
    showLabels: typeof input.showLabels === "boolean" ? input.showLabels : DEFAULT_MAP_VIEW.showLabels,
    backgroundColor: typeof input.backgroundColor === "string" && HEX_COLOR.test(input.backgroundColor) ? input.backgroundColor : DEFAULT_MAP_VIEW.backgroundColor,
    ...(offset ? { offset } : {}),
  };
}

export function createDefaultMapSceneProps(presentation: MapPresentation): MapSceneProps {
  return { modelVersion: MAP_SCENE_MODEL_VERSION, presentation, pitch: presentation === "tilted" ? 28 : 0, view: { ...DEFAULT_MAP_VIEW, center: [...DEFAULT_MAP_VIEW.center] }, layers: [] };
}

/** Strictly projects persisted/user-supplied data to the built-in map scene allowlist. */
export function normalizeMapSceneProps(raw: unknown, fallbackPresentation: MapPresentation = "flat"): MapSceneProps {
  const input = isRecord(raw) ? raw : {};
  const presentation: MapPresentation = input.presentation === "flat" || input.presentation === "tilted"
    ? input.presentation : fallbackPresentation;
  const rawLayers = Array.isArray(input.layers) ? input.layers.slice(0, 50) : [];
  const layers: MapSceneLayer[] = [];
  rawLayers.forEach((entry, index) => {
    if (!isRecord(entry) || !(MAP_LAYER_TYPES as readonly unknown[]).includes(entry.type)) return;
    const type = entry.type as MapLayerType;
    const layerDefaults = LAYER_DEFAULTS[type];
    const style = isRecord(entry.style) ? entry.style : {};
    const dataBinding = normalizeLayerBinding(entry.dataBinding);
    const name = typeof entry.name === "string" ? entry.name.trim().slice(0, 48) : "";
    layers.push({
      id: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim().slice(0, 80) : `layer-${index + 1}`,
      type,
      name: name || layerDefaults.name,
      visible: typeof entry.visible === "boolean" ? entry.visible : true,
      style: normalizeLayerStyle(style, layerDefaults.color),
      ...(dataBinding ? { dataBinding } : {}),
      ...(typeof entry.minZoom === "number" && Number.isFinite(entry.minZoom) ? { minZoom: clamp(entry.minZoom, 0.5, 20, 1) } : {}),
      ...(typeof entry.maxZoom === "number" && Number.isFinite(entry.maxZoom) ? { maxZoom: clamp(entry.maxZoom, 0.5, 20, 20) } : {}),
    });
  });
  layers.forEach((layer) => {
    if (layer.minZoom !== undefined && layer.maxZoom !== undefined && layer.minZoom > layer.maxZoom) {
      const swap = layer.minZoom;
      layer.minZoom = layer.maxZoom;
      layer.maxZoom = swap;
    }
  });
  return {
    modelVersion: MAP_SCENE_MODEL_VERSION,
    presentation,
    pitch: presentation === "flat" ? 0 : clamp(input.pitch, 0, 60, 28),
    view: normalizeMapSceneView(input.view),
    layers,
    ...normalizeV2Groups(input),
  };
}


import type { DatasetBinding, GeoChartType } from "../model/types";
import { buildGeoChartDataFromRows } from "../chart/geoData";

export interface MapSceneOptionResult { option: Record<string, unknown>; errors: string[] }
type MapRow = Record<string, unknown>;

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
  return null;
}

export function regionRows(rows: readonly MapRow[], binding: DatasetBinding["fields"]): { data: Array<{ name: string; value: number }>; error: string } {
  const nameField = binding?.category?.trim() ?? "";
  const valueField = binding?.value?.trim() ?? "";
  if (!nameField || !valueField) return { data: [], error: "区域填色需要配置区域名称与数值字段映射" };
  if (rows.length && (!rows.some((row) => Object.prototype.hasOwnProperty.call(row, nameField)) || !rows.some((row) => Object.prototype.hasOwnProperty.call(row, valueField)))) {
    return { data: [], error: "加工后数据缺少已映射的区域名称或数值列" };
  }
  const data = rows.flatMap((row) => {
    const rawName = row[nameField];
    const name = typeof rawName === "string" || typeof rawName === "number" ? String(rawName).trim() : "";
    const value = finiteNumber(row[valueField]);
    return name && value !== null ? [{ name, value }] : [];
  });
  return { data, error: rows.length && !data.length ? "没有有效的区域名称/数值行" : "" };
}

function layerError(layer: MapSceneLayer, message: string): string { return `${layer.name}：${message}`; }

/** Build one ECharts geo coordinate system and append the ordered, visible layer series. */
export function buildMapSceneOption(
  rawProps: unknown,
  rows: readonly MapRow[],
  fields?: DatasetBinding["fields"],
  rowsByLayerId: Readonly<Record<string, readonly MapRow[]>> = {},
): MapSceneOptionResult {
  const scene = normalizeMapSceneProps(rawProps);
  const errors: string[] = [];
  const series: Array<Record<string, unknown>> = [];
  const visualMaps: Array<Record<string, unknown>> = [];
  let emptyColor: string | null = null;
  for (const layer of scene.layers) {
    if (!layer.visible) continue;
    const layerRows = layer.dataBinding ? (rowsByLayerId[layer.id] ?? []) : rows;
    const layerFields = layer.dataBinding ? layer.dataBinding.fields : fields;
    if (layer.type === "regionFill") {
      const converted = regionRows(layerRows, layerFields);
      if (converted.error) { errors.push(layerError(layer, converted.error)); continue; }
      if (converted.data.length) {
        const values = converted.data.map((row) => row.value);
        const minimum = values.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
        const maximum = values.reduce((max, value) => Math.max(max, value), Number.NEGATIVE_INFINITY);
        const regionBorder = layer.style.border ?? { color: "#5db9d2", width: 0.65, type: "solid" };
        series.push({
          name: layer.name, type: "map", map: "china", geoIndex: scene.presentation === "tilted" ? 3 : 0, data: converted.data,
          itemStyle: { areaColor: layer.style.color, opacity: layer.style.opacity, borderColor: regionBorder.color, borderWidth: regionBorder.width, borderType: regionBorder.type },
          emphasis: { itemStyle: { areaColor: layer.style.color, opacity: 1 } },
        });
        const seriesIndex = series.length - 1;
        const rampColors = layer.style.colors ?? { min: MAP_FILL_DEFAULT_MIN, mid: MAP_FILL_DEFAULT_MID, max: layer.style.color, empty: MAP_FILL_DEFAULT_EMPTY };
        if (layer.style.colorMode === "segments") {
          visualMaps.push({ show: false, type: "piecewise", min: minimum, max: maximum || 1, seriesIndex, pieces: buildSegmentPieces(rampColors, minimum, maximum || 1, layer.style.segments ?? 5) });
        } else if (layer.style.colorMode === "gradient") {
          visualMaps.push({ show: false, type: "continuous", min: minimum, max: maximum || 1, seriesIndex, inRange: { colorStops: [{ offset: 0, color: rampColors.min }, { offset: 0.5, color: rampColors.mid }, { offset: 1, color: rampColors.max }] } });
        } else {
          visualMaps.push({ show: false, min: minimum, max: maximum || 1, seriesIndex, inRange: { color: ["#102b3d", layer.style.color] } });
        }
        if (layer.style.colors?.empty && !emptyColor) emptyColor = layer.style.colors.empty;
      }
      continue;
    }
    const chartType = layer.type as GeoChartType;
    const converted = buildGeoChartDataFromRows(layerRows, layerFields?.geo, chartType);
    if (!converted.ok) { errors.push(layerError(layer, converted.message)); continue; }
    if (layer.type === "geoScatter" && converted.data.kind === "geoScatter") {
      const pointLabel = layer.style.label
        ? { show: layer.style.label.show, color: layer.style.label.color, fontSize: layer.style.label.size, ...(layer.style.label.stroke ? { stroke: layer.style.label.stroke, strokeWidth: 1 } : {}) }
        : undefined;
      series.push({ name: layer.name, type: "scatter", coordinateSystem: "geo", geoIndex: scene.presentation === "tilted" ? 3 : 0, symbolSize: layer.style.size, data: converted.data.rows.map((point) => ({ name: point.name, value: point.value === undefined ? [point.longitude, point.latitude] : [point.longitude, point.latitude, point.value] })), itemStyle: { color: layer.style.color, opacity: layer.style.opacity }, ...(pointLabel ? { label: pointLabel } : {}) });
    } else if (layer.type === "geoHeatmap" && converted.data.kind === "geoHeatmap") {
      series.push({ name: layer.name, type: "heatmap", coordinateSystem: "geo", geoIndex: scene.presentation === "tilted" ? 3 : 0, data: converted.data.rows.map((point) => [point.longitude, point.latitude, point.value]), pointSize: layer.style.size, blurSize: Math.max(layer.style.size, 12), itemStyle: { color: layer.style.color, opacity: layer.style.opacity } });
    } else if (layer.type === "geoFlow" && converted.data.kind === "geoFlow") {
      series.push({ name: layer.name, type: "lines", coordinateSystem: "geo", geoIndex: scene.presentation === "tilted" ? 3 : 0, data: converted.data.rows.map((line) => ({ name: line.name, coords: [line.from, line.to], ...(line.value !== undefined ? { value: line.value } : {}) })), lineStyle: { color: layer.style.color, width: Math.max(1, layer.style.size / 4), opacity: layer.style.opacity, curveness: 0.2 }, effect: layer.style.animated ? { show: true, trailLength: 0.4, symbol: "arrow", symbolSize: 4 } : { show: false } });
    }
  }
  const view = scene.view;
  const roam = view.dragEnabled && view.zoomEnabled ? true : view.dragEnabled ? "move" : view.zoomEnabled ? "scale" : false;
  const labelGroup = scene.label ?? MAP_LABEL_DEFAULT;
  const labelCfg: Record<string, unknown> = {
    show: view.showLabels && labelGroup.show,
    color: labelGroup.color,
    fontSize: labelGroup.size,
  };
  if (labelGroup.stroke) {
    labelCfg.stroke = labelGroup.stroke;
    labelCfg.strokeWidth = labelGroup.strokeWidth ?? 1;
  }
  if (labelGroup.shadow) {
    labelCfg.textShadowColor = labelGroup.shadow;
    labelCfg.textShadowBlur = labelGroup.shadowBlur ?? 0;
  }
  const borderGroup = scene.border ?? MAP_BORDER_DEFAULT;
  const emphasisCfg = scene.emphasis
    ? { label: { color: scene.emphasis.labelColor }, itemStyle: { areaColor: scene.emphasis.areaColor, borderColor: scene.emphasis.borderColor } }
    : { label: { color: "#ffffff" }, itemStyle: { areaColor: "rgba(0,254,233,0.6)" } };
  const tooltipCfg = scene.tooltipStyle
    ? { trigger: "item", backgroundColor: scene.tooltipStyle.background, borderColor: scene.tooltipStyle.borderColor, textStyle: { color: scene.tooltipStyle.color, fontSize: scene.tooltipStyle.fontSize } }
    : { trigger: "item" };
  const geoBase = { map: "china", center: view.center, zoom: view.zoom, roam, scaleLimit: { min: view.minZoom, max: view.maxZoom }, label: labelCfg, itemStyle: { areaColor: { type: "linear", x: 1, y: 0, x2: 0, y2: 0, colorStops: [{ offset: 0, color: "rgba(3,27,78,0.88)" }, { offset: 1, color: "rgba(58,149,253,0.88)" }] }, borderColor: borderGroup.color, borderWidth: borderGroup.width, borderType: borderGroup.type, shadowColor: "#8cd3ef", shadowOffsetY: 10, shadowBlur: 28 }, emphasis: emphasisCfg };
  // Three purposeful underlays: deep base shadow, mid sidewall, and bright top rim.
  const DEFAULT_EXTRUSION = [{ offset: 3, areaColor: "rgba(5,21,35,0.12)", borderColor: "rgba(58,149,253,0.45)", shadowColor: "rgba(58,149,253,0.85)", shadowOffsetY: 10, shadowBlur: 8 }, { offset: 2, areaColor: "rgba(5,21,35,0.1)", borderColor: "rgba(58,149,253,0.68)", shadowColor: "rgba(65,214,255,0.72)", shadowOffsetY: 6, shadowBlur: 10 }, { offset: 1, areaColor: "#10273a", borderColor: "#b5f3ff", shadowColor: "#8cd3ef", shadowOffsetY: 4, shadowBlur: 10 }];
  const extrusionLayers = scene.underlay
    ? DEFAULT_EXTRUSION.map((base, index) => {
        const palette = scene.underlay?.[index];
        return palette ? { ...base, areaColor: palette.areaColor, borderColor: palette.borderColor, shadowColor: palette.shadowColor } : base;
      })
    : DEFAULT_EXTRUSION;
  const geo = scene.presentation === "tilted"
    ? [...extrusionLayers.map((layer) => ({ ...geoBase, layoutCenter: ["50%", `${49 + layer.offset}%`], layoutSize: "150%", label: { ...geoBase.label, show: false }, roam: false, silent: true, emphasis: { disabled: true }, itemStyle: { areaColor: layer.areaColor, borderColor: layer.borderColor, borderWidth: 1, shadowColor: layer.shadowColor, shadowOffsetY: layer.shadowOffsetY, shadowBlur: layer.shadowBlur } })), { ...geoBase, layoutCenter: ["50%", "49%"], layoutSize: "150%" }]
    : geoBase;
  const topGeo = (Array.isArray(geo) ? geo[geo.length - 1] : geo) as Record<string, unknown>;
  if (emptyColor) {
    const emptyFill = emptyColor;
    topGeo.regions = CHINA_REGION_NAMES.map((name) => ({ name, itemStyle: { areaColor: emptyFill } }));
  }
  if (scene.selected) {
    topGeo.selectedMode = "single";
    topGeo.select = { itemStyle: { areaColor: scene.selected.areaColor, borderColor: scene.selected.borderColor } };
  }
  return {
    option: {
      backgroundColor: scene.presentation === "tilted" ? "transparent" : view.backgroundColor, animation: false, tooltip: tooltipCfg,
      ...(visualMaps.length ? { visualMap: visualMaps } : {}),
      geo,
      series,
    },
    errors,
  };
}

export function createMapSceneLayer(type: MapLayerType): MapSceneLayer {
  const defaults = LAYER_DEFAULTS[type];
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `map-layer-${Date.now().toString(36)}`;
  return { id, type, name: defaults.name, visible: true, style: { color: defaults.color, opacity: 0.85, size: 12 } };
}
