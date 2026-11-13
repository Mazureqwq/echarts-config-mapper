import type { DatasetBinding } from "../model/types";
import {
  MAP_BORDER_DEFAULT,
  MAP_EMPHASIS_DEFAULT,
  MAP_FILL_DEFAULT_EMPTY,
  MAP_FILL_DEFAULT_MID,
  MAP_FILL_DEFAULT_MIN,
  MAP_SELECTED_DEFAULT,
  computeRegionCenter,
  normalizeMapSceneProps,
  rampColor,
  regionRows,
  type MapFillColors,
} from "./mapScene";

export interface MapLibreSceneFlags {
  dragEnabled: boolean;
  zoomEnabled: boolean;
  showLabels: boolean;
  drillEnabled: boolean;
}

export interface MapLibreSceneLabel {
  name: string;
  centroid: [number, number];
}

export interface MapLibreSceneResult {
  /** MapLibre style（v8）：camera/lights/fog/sources/layers 全量描述 */
  style: Record<string, unknown>;
  /** 中国范围 bounds [[minLng,minLat],[maxLng,maxLat]]（默认视角 fitBounds 用；无 geo 时为 null） */
  bounds: [[number, number], [number, number]] | null;
  /** 省全称 → 数值（区域事件 value 载荷与色带计算共用） */
  regionValues: Record<string, number>;
  /** 省名 + bbox 中心（HTML 标注覆盖层数据源） */
  labels: MapLibreSceneLabel[];
  flags: MapLibreSceneFlags;
  errors: string[];
}

// MapLibre v6：样式根只有经典单数 light 对象与 sky 对象（无根 fog/lights）
const SCENE_LIGHT = {
  anchor: "map",
  color: "#ffffff",
  intensity: 0.4,
  position: [1.15, 210, 40],
} as const;

const SCENE_SKY = {
  "sky-color": "#0a1628",
  "horizon-color": "#12314d",
  "sky-horizon-blend": 0.5,
  "fog-color": "#0a1628",
  "horizon-fog-blend": 0.15,
  "fog-ground-blend": 0.3,
  "atmosphere-blend": 0.6,
} as const;

const HOVER_STATE = "cf_hover";
const SELECTED_STATE = "cf_selected";

function colorForValue(value: number, min: number, max: number, colors: MapFillColors, mode: "gradient" | "segments", segments: number): string {
  const span = max - min;
  const t = span > 0 ? (value - min) / span : 0;
  if (mode === "segments") {
    const n = Math.min(10, Math.max(2, Math.round(segments)));
    const k = Math.min(n - 1, Math.max(0, Math.floor(t * n)));
    return k === 0 ? colors.min : k === n - 1 ? colors.max : rampColor(colors, k / (n - 1));
  }
  return rampColor(colors, t);
}

/**
 * 由归一化 props + 数据行构建 MapLibre style（纯函数，双端共用语义）。
 * geoJson 缺省为空对象（由调用方注入 china FeatureCollection）。
 */
export function buildMapLibreScene(
  props: unknown,
  rows: readonly Record<string, unknown>[],
  fields?: DatasetBinding["fields"],
  rowsByLayerId: Readonly<Record<string, readonly Record<string, unknown>[]>> = {},
  geoJson?: unknown,
): MapLibreSceneResult {
  const scene = normalizeMapSceneProps(props);
  const errors: string[] = [];
  const regionFill = scene.layers.find((layer) => layer.visible && layer.type === "regionFill");
  const regionValues: Record<string, number> = {};

  let fillColor: unknown = regionFill ? regionFill.style.color : "#32d6ff";
  let fillOpacity = regionFill ? regionFill.style.opacity : 0.7;
  let windowKeys: Record<string, unknown> = {};
  if (regionFill) {
    const layerRows = regionFill.dataBinding ? (rowsByLayerId[regionFill.id] ?? []) : rows;
    const layerFields = regionFill.dataBinding ? regionFill.dataBinding.fields : fields;
    const converted = regionRows(layerRows, layerFields);
    if (converted.error) {
      errors.push(`${regionFill.name}：${converted.error}`);
    } else if (converted.data.length) {
      for (const row of converted.data) regionValues[row.name] = row.value;
      const values = converted.data.map((row) => row.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const colors = regionFill.style.colors ?? {
        min: MAP_FILL_DEFAULT_MIN,
        mid: MAP_FILL_DEFAULT_MID,
        max: regionFill.style.color,
        empty: MAP_FILL_DEFAULT_EMPTY,
      };
      const mode = regionFill.style.colorMode ?? "gradient";
      const segments = regionFill.style.segments ?? 5;
      const entries: unknown[] = [];
      for (const [name, value] of Object.entries(regionValues)) {
        entries.push(name, colorForValue(value, min, max, colors, mode, segments));
      }
      const matchExpr = ["match", ["get", "name"], ...entries, colors.empty];
      const emphasisColor = scene.emphasis?.areaColor ?? MAP_EMPHASIS_DEFAULT.areaColor;
      const selectedColor = scene.selected?.areaColor ?? MAP_SELECTED_DEFAULT.areaColor;
      fillColor = [
        "case",
        ["boolean", ["feature-state", SELECTED_STATE], false], selectedColor,
        ["boolean", ["feature-state", HOVER_STATE], false], emphasisColor,
        matchExpr,
      ];
    }
    const window: Record<string, unknown> = {};
    if (regionFill.minZoom !== undefined) window.minzoom = regionFill.minZoom;
    if (regionFill.maxZoom !== undefined) window.maxzoom = regionFill.maxZoom;
    windowKeys = window;
  }

  const border = scene.border ?? MAP_BORDER_DEFAULT;
  const dashed = border.type === "dashed";
  const layers: Array<Record<string, unknown>> = [
    {
      id: "cf-fill",
      type: "fill",
      source: "china",
      ...windowKeys,
      paint: {
        "fill-color": fillColor,
        "fill-opacity": fillOpacity,
        "fill-outline-color": border.color,
      },
    },
    {
      id: "cf-line",
      type: "line",
      source: "china",
      ...windowKeys,
      paint: {
        "line-color": border.color,
        "line-width": border.width,
        ...(dashed ? { "line-dasharray": [2, 2] } : {}),
      },
    },
  ];

  const labels: MapLibreSceneLabel[] = [];
  const collection = geoJson as { features?: Array<{ properties?: { name?: string }; geometry?: unknown }> } | undefined;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const collectCoords = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      minLng = Math.min(minLng, value[0]);
      maxLng = Math.max(maxLng, value[0]);
      minLat = Math.min(minLat, value[1]);
      maxLat = Math.max(maxLat, value[1]);
      return;
    }
    value.forEach(collectCoords);
  };
  for (const feature of collection?.features ?? []) {
    const name = feature.properties?.name;
    const geometry = feature.geometry as { type?: string; coordinates?: unknown; geometries?: Array<{ coordinates?: unknown }> } | undefined;
    if (geometry) {
      if (geometry.type === "GeometryCollection") (geometry.geometries ?? []).forEach((entry) => collectCoords(entry.coordinates));
      else collectCoords(geometry.coordinates);
    }
    if (!name) continue;
    const centroid = computeRegionCenter(geoJson, name);
    if (centroid) labels.push({ name, centroid });
  }
  const bounds: [[number, number], [number, number]] | null =
    Number.isFinite(minLng) && Number.isFinite(minLat) ? [[minLng, minLat], [maxLng, maxLat]] : null;

  const style: Record<string, unknown> = {
    version: 8,
    name: "chartforge-map-scene",
    sources: {
      china: { type: "geojson", data: geoJson ?? {}, promoteId: "name" },
    },
    pitch: scene.pitch,
    center: [...scene.view.center],
    zoom: scene.view.zoom,
    minZoom: scene.view.minZoom,
    maxZoom: scene.view.maxZoom,
    light: { ...SCENE_LIGHT },
    sky: { ...SCENE_SKY },
    layers,
  };

  return {
    style,
    bounds,
    regionValues,
    labels,
    flags: {
      dragEnabled: scene.view.dragEnabled,
      zoomEnabled: scene.view.zoomEnabled,
      showLabels: scene.view.showLabels,
      drillEnabled: scene.drill?.enabled ?? true,
    },
    errors,
  };
}
