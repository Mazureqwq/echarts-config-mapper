export const MAP_LAYER_TYPES = ["regionFill", "geoScatter", "geoHeatmap", "geoFlow"] as const;
export type MapLayerType = typeof MAP_LAYER_TYPES[number];
export type MapPresentation = "flat" | "tilted";
export const MAP_SCENE_MODEL_VERSION = 2 as const;

export interface MapSceneView {
  center: [number, number];
  zoom: number;
  minZoom: number;
  maxZoom: number;
  dragEnabled: boolean;
  zoomEnabled: boolean;
  showLabels: boolean;
  backgroundColor: string;
}

export interface MapValueFormat { decimals?: number; suffix?: string }
export interface MapLegendConfig { show: boolean; position: "top-right" | "bottom-right" | "bottom-left"; mode: "continuous" | "segments" }
export interface MapTooltipStyle { background: string; borderColor: string; color: string; fontSize: number }
export interface MapEmphasisStyle { areaColor: string; borderColor: string; labelColor: string }
export interface MapSelectedStyle { areaColor: string; borderColor: string }
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
function rampColor(colors: MapFillColors, t: number): string {
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
  return {
    center: [clamp(center[0], -180, 180, DEFAULT_MAP_VIEW.center[0]), clamp(center[1], -90, 90, DEFAULT_MAP_VIEW.center[1])],
    zoom: clamp(input.zoom, minZoom, maxZoom, DEFAULT_MAP_VIEW.zoom),
    minZoom, maxZoom,
    dragEnabled: typeof input.dragEnabled === "boolean" ? input.dragEnabled : DEFAULT_MAP_VIEW.dragEnabled,
    zoomEnabled: typeof input.zoomEnabled === "boolean" ? input.zoomEnabled : DEFAULT_MAP_VIEW.zoomEnabled,
    showLabels: typeof input.showLabels === "boolean" ? input.showLabels : DEFAULT_MAP_VIEW.showLabels,
    backgroundColor: typeof input.backgroundColor === "string" && HEX_COLOR.test(input.backgroundColor) ? input.backgroundColor : DEFAULT_MAP_VIEW.backgroundColor,
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

function regionRows(rows: readonly MapRow[], binding: DatasetBinding["fields"]): { data: Array<{ name: string; value: number }>; error: string } {
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
        series.push({
          name: layer.name, type: "map", map: "china", geoIndex: scene.presentation === "tilted" ? 3 : 0, data: converted.data,
          itemStyle: { areaColor: layer.style.color, opacity: layer.style.opacity, borderColor: "#5db9d2", borderWidth: 0.65 },
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
      series.push({ name: layer.name, type: "scatter", coordinateSystem: "geo", geoIndex: scene.presentation === "tilted" ? 3 : 0, symbolSize: layer.style.size, data: converted.data.rows.map((point) => ({ name: point.name, value: point.value === undefined ? [point.longitude, point.latitude] : [point.longitude, point.latitude, point.value] })), itemStyle: { color: layer.style.color, opacity: layer.style.opacity } });
    } else if (layer.type === "geoHeatmap" && converted.data.kind === "geoHeatmap") {
      series.push({ name: layer.name, type: "heatmap", coordinateSystem: "geo", geoIndex: scene.presentation === "tilted" ? 3 : 0, data: converted.data.rows.map((point) => [point.longitude, point.latitude, point.value]), pointSize: layer.style.size, blurSize: Math.max(layer.style.size, 12), itemStyle: { color: layer.style.color, opacity: layer.style.opacity } });
    } else if (layer.type === "geoFlow" && converted.data.kind === "geoFlow") {
      series.push({ name: layer.name, type: "lines", coordinateSystem: "geo", geoIndex: scene.presentation === "tilted" ? 3 : 0, data: converted.data.rows.map((line) => ({ name: line.name, coords: [line.from, line.to], ...(line.value !== undefined ? { value: line.value } : {}) })), lineStyle: { color: layer.style.color, width: Math.max(1, layer.style.size / 4), opacity: layer.style.opacity, curveness: 0.2 }, effect: { show: false } });
    }
  }
  const view = scene.view;
  const roam = view.dragEnabled && view.zoomEnabled ? true : view.dragEnabled ? "move" : view.zoomEnabled ? "scale" : false;
  const geoBase = { map: "china", center: view.center, zoom: view.zoom, roam, scaleLimit: { min: view.minZoom, max: view.maxZoom }, label: { show: view.showLabels, color: "#e7fbff", fontSize: 10 }, itemStyle: { areaColor: { type: "linear", x: 1, y: 0, x2: 0, y2: 0, colorStops: [{ offset: 0, color: "rgba(3,27,78,0.88)" }, { offset: 1, color: "rgba(58,149,253,0.88)" }] }, borderColor: "#c0f3fb", borderWidth: 1, shadowColor: "#8cd3ef", shadowOffsetY: 10, shadowBlur: 28 }, emphasis: { label: { color: "#ffffff" }, itemStyle: { areaColor: "rgba(0,254,233,0.6)" } } };
  // Three purposeful underlays: deep base shadow, mid sidewall, and bright top rim.
  const extrusionLayers = [{ offset: 3, areaColor: "rgba(5,21,35,0.12)", borderColor: "rgba(58,149,253,0.45)", shadowColor: "rgba(58,149,253,0.85)", shadowOffsetY: 10, shadowBlur: 8 }, { offset: 2, areaColor: "rgba(5,21,35,0.1)", borderColor: "rgba(58,149,253,0.68)", shadowColor: "rgba(65,214,255,0.72)", shadowOffsetY: 6, shadowBlur: 10 }, { offset: 1, areaColor: "#10273a", borderColor: "#b5f3ff", shadowColor: "#8cd3ef", shadowOffsetY: 4, shadowBlur: 10 }];
  const geo = scene.presentation === "tilted"
    ? [...extrusionLayers.map((layer) => ({ ...geoBase, layoutCenter: ["50%", `${49 + layer.offset}%`], layoutSize: "150%", label: { ...geoBase.label, show: false }, roam: false, silent: true, emphasis: { disabled: true }, itemStyle: { areaColor: layer.areaColor, borderColor: layer.borderColor, borderWidth: 1, shadowColor: layer.shadowColor, shadowOffsetY: layer.shadowOffsetY, shadowBlur: layer.shadowBlur } })), { ...geoBase, layoutCenter: ["50%", "49%"], layoutSize: "150%" }]
    : geoBase;
  if (emptyColor) {
    const topGeo = (Array.isArray(geo) ? geo[geo.length - 1] : geo) as Record<string, unknown>;
    const emptyFill = emptyColor;
    topGeo.regions = CHINA_REGION_NAMES.map((name) => ({ name, itemStyle: { areaColor: emptyFill } }));
  }
  return {
    option: {
      backgroundColor: scene.presentation === "tilted" ? "transparent" : view.backgroundColor, animation: false, tooltip: { trigger: "item" },
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
