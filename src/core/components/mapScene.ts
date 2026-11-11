export const MAP_LAYER_TYPES = ["regionFill", "geoScatter", "geoHeatmap", "geoFlow"] as const;
export type MapLayerType = typeof MAP_LAYER_TYPES[number];
export type MapPresentation = "flat" | "tilted";
export const MAP_SCENE_MODEL_VERSION = 1 as const;

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

export interface MapSceneLayer {
  id: string;
  type: MapLayerType;
  name: string;
  visible: boolean;
  style: { color: string; opacity: number; size: number };
  /** Omitted bindings inherit the map container's binding. */
  dataBinding?: DatasetBinding;
}

export interface MapSceneProps extends Record<string, unknown> {
  modelVersion: typeof MAP_SCENE_MODEL_VERSION;
  presentation: MapPresentation;
  pitch: number;
  view: MapSceneView;
  layers: MapSceneLayer[];
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
      style: {
        color: typeof style.color === "string" && HEX_COLOR.test(style.color) ? style.color : layerDefaults.color,
        opacity: clamp(style.opacity, 0, 1, 0.85),
        size: clamp(style.size, 1, 100, 12),
      },
      ...(dataBinding ? { dataBinding } : {}),
    });
  });
  return {
    modelVersion: MAP_SCENE_MODEL_VERSION,
    presentation,
    pitch: presentation === "flat" ? 0 : clamp(input.pitch, 0, 60, 28),
    view: normalizeMapSceneView(input.view),
    layers,
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
        visualMaps.push({ show: false, min: minimum, max: maximum || 1, seriesIndex: series.length - 1, inRange: { color: ["#102b3d", layer.style.color] } });
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
