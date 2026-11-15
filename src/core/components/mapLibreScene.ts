import type { DatasetBinding } from "../model/types";
import type { FlowTrailLayerSpec } from "./mapFlowTrail";
import { buildGeoChartDataFromRows } from "../chart/geoData";
import {
  FLOW_DASH_PATTERN,
  HEAT_BLUR_MIN_RADIUS,
  MAP_BORDER_DEFAULT,
  MAP_SCALE_BAR_DEFAULT,
  MAP_TOOLTIP_DEFAULT,
  buildChinaOutline,
  buildMapLegend,
  MAP_EMPHASIS_DEFAULT,
  MAP_FILL_DEFAULT_EMPTY,
  MAP_FILL_DEFAULT_MID,
  MAP_FILL_DEFAULT_MIN,
  MAP_SELECTED_DEFAULT,
  computeRegionCenter,
  roundHeatBlur,
  formatMapValue,
  normalizeMapSceneProps,
  rampColor,
  regionRows,
  type MapFillColors,
  type MapLegendEntry,
  type MapScaleBarConfig,
  type MapValueFormat,
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
  /** 覆盖层列表的稳定 key（省名与散点标注可重名） */
  key?: string;
  /** 散点标注的独立配色/字号（缺省时沿用场景级 label 样式） */
  color?: string;
  size?: number;
  stroke?: string;
}


/** 统一的区域 tooltip 文案（工作台与离线同源，避免两端文案漂移） */
export function formatMapTooltipText(name: string, value: number | null, fmt?: MapValueFormat): string {
  return `${name}\uff1a${formatMapValue(value, fmt)}`;
}

/** 区域 tooltip：文案与配色双端同源 */
export interface MapLibreSceneTooltip {
  show: boolean;
  background: string;
  borderColor: string;
  color: string;
  fontSize: number;
  /** 区域名 → tooltip 文案 */
  texts: Record<string, string>;
}

export interface MapLibreSceneLegend {
  show: boolean;
  position: "top-right" | "bottom-right" | "bottom-left";
  mode: "continuous" | "segments";
  entries: MapLegendEntry[];
}

export interface MapLibreSceneResult {
  /** MapLibre style（v8）：camera/lights/fog/sources/layers 全量描述 */
  style: Record<string, unknown>;
  /** 图例：条目与色带 match 表达式同源，双端渲染一致 */
  legend: MapLibreSceneLegend;
  /** tooltip：文案与配色双端同源 */
  tooltip: MapLibreSceneTooltip;
  /** 中国范围 bounds [[minLng,minLat],[maxLng,maxLat]]（默认视角 fitBounds 用；无 geo 时为 null） */
  bounds: [[number, number], [number, number]] | null;
  /** 省全称 → 数值（区域事件 value 载荷与色带计算共用） */
  regionValues: Record<string, number>;
  /** 省名 + bbox 中心（HTML 标注覆盖层数据源） */
  labels: MapLibreSceneLabel[];
  /** 比例尺控件配置（双端同源自绘 DOM） */
  scaleBar: MapScaleBarConfig;
  /** 标注最小缩放（null = 不设阈值） */
  labelMinZoom: number | null;
  /** T13-a：需要 Canvas2D 流动拖尾覆盖层的飞线图层（geoFlow + animated） */
  flowTrails: FlowTrailLayerSpec[];
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

  // 快速样式预设：色带与氛围令牌（工作台与离线同源，令牌随 props 持久化）。
  const quickStyle = scene.quickStyle;

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
      // 优先级：图层自带色带 > 快速样式预设色带 > 内置默认。
      // 预设色带只在图层未显式设置时兜底，避免用户逐项微调被覆盖。
      const colors = regionFill.style.colors ?? quickStyle?.tokens.fill ?? {
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
  const emphasisBorderColor = scene.emphasis?.borderColor ?? MAP_EMPHASIS_DEFAULT.borderColor;
  const selectedBorderColor = scene.selected?.borderColor ?? MAP_SELECTED_DEFAULT.borderColor;
  // T13-a：交给 Canvas2D 覆盖层的流动拖尾目标（geoFlow + animated）
  const flowTrails: FlowTrailLayerSpec[] = [];
  const layers: Array<Record<string, unknown>> = [
    {
      id: "cf-fill",
      type: "fill",
      source: "china",
      ...windowKeys,
      "fill-color-transition": { duration: 180, delay: 0 },
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
      "line-color-transition": { duration: 180, delay: 0 },
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", SELECTED_STATE], false], selectedBorderColor,
          ["boolean", ["feature-state", HOVER_STATE], false], emphasisBorderColor,
          border.color,
        ],
        "line-width": border.width,
        ...(dashed ? { "line-dasharray": [2, 2] } : {}),
      },
    },
  ];

  // 外轮廓强化层：共享边分析重建的精确国界外环（省界 fill-outline-color 之上再叠一层）
  const sources: Record<string, unknown> = {
    china: { type: "geojson", data: geoJson ?? {}, promoteId: "name" },
  };

  // 地理散点 / 点热力 / OD 飞线：MapLibre 原生图层（circle / heatmap / line）+ 独立 geojson 源
  const geoLabels: MapLibreSceneLabel[] = [];
  for (const layer of scene.layers) {
    if (!layer.visible || layer.type === "regionFill") continue;
    const layerRows = layer.dataBinding ? (rowsByLayerId[layer.id] ?? []) : rows;
    const layerFields = layer.dataBinding ? layer.dataBinding.fields : fields;
    const converted = buildGeoChartDataFromRows(layerRows, layerFields?.geo, layer.type);
    if (!converted.ok) {
      errors.push(`${layer.name}：${converted.message}`);
      continue;
    }
    const window: Record<string, unknown> = {};
    if (layer.minZoom !== undefined) window.minzoom = layer.minZoom;
    if (layer.maxZoom !== undefined) window.maxzoom = layer.maxZoom;
    if (layer.type === "geoScatter" && converted.data.kind === "geoScatter") {
      const points = converted.data.rows;
      if (!points.length) continue;
      const sourceId = `cf-scatter-${layer.id}`;
      sources[sourceId] = {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: points.map((point) => ({
            type: "Feature",
            properties: { name: point.name ?? "", value: point.value ?? null },
            geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
          })),
        },
      };
      layers.push({
        id: sourceId,
        type: "circle",
        source: sourceId,
        ...window,
        paint: {
          "circle-color": layer.style.color,
          "circle-opacity": layer.style.opacity,
          "circle-radius": Math.max(1, layer.style.size / 2),
        },
      });
      if (layer.style.label?.show) {
        for (const point of points) {
          if (!point.name) continue;
          geoLabels.push({
            name: point.name,
            centroid: [point.longitude, point.latitude],
            key: `point:${layer.id}:${point.name}`,
            color: layer.style.label.color,
            size: layer.style.label.size,
            stroke: layer.style.label.stroke,
          });
        }
      }
      continue;
    }
    if (layer.type === "geoHeatmap" && converted.data.kind === "geoHeatmap") {
      const points = converted.data.rows;
      if (!points.length) continue;
      const sourceId = `cf-heat-${layer.id}`;
      const values = points.map((point) => point.value);
      const minimum = Math.min(...values);
      const maximum = Math.max(...values);
      // T13：点热力回到旧 ECharts 的「每点径向渐变团」语义。
      // 旧配置：pointSize = size、blurSize = max(size, 12)、visualMap.inRange.color = ["#102b3d", layerColor]
      // 旧 ECharts 用「实心圆 + shadowBlur」画笔：实心核半径 = pointSize，渐变外缘半径 = pointSize + blurSize。
      // MapLibre 的 circle-blur 同样是径向衰减（外缘全透明），故：
      //   circle-radius = pointSize + blurSize（渐变外缘半径）
      //   circle-blur   = blurSize / 外缘半径 → 实心核半径 = 外缘半径 × (1 - blur) = pointSize
      const pointSize = Math.max(1, layer.style.size);
      const blurSize = Math.max(pointSize, HEAT_BLUR_MIN_RADIUS);
      const outerRadius = pointSize + blurSize;
      sources[sourceId] = {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: points.map((point) => ({
            type: "Feature",
            properties: { name: "", value: point.value },
            geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
          })),
        },
      };
      layers.push({
        id: sourceId,
        type: "circle",
        source: sourceId,
        ...window,
        paint: {
          // 颜色按**点值**走旧 visualMap 色带，而不是按核密度场
          "circle-color": minimum === maximum
            ? layer.style.color
            : [
              "interpolate", ["linear"], ["get", "value"],
              minimum, MAP_FILL_DEFAULT_MIN,
              maximum, layer.style.color,
            ],
          "circle-opacity": layer.style.opacity,
          "circle-radius": outerRadius,
          "circle-blur": roundHeatBlur(blurSize / outerRadius),
          "circle-stroke-width": 0,
        },
      });
      continue;
    }
    if (layer.type === "geoFlow" && converted.data.kind === "geoFlow") {
      const lines = converted.data.rows;
      if (!lines.length) continue;
      const sourceId = `cf-flow-${layer.id}`;
      sources[sourceId] = {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: lines.map((line) => ({
            type: "Feature",
            properties: { name: line.name ?? "", value: line.value ?? null },
            geometry: { type: "LineString", coordinates: [line.from, line.to] },
          })),
        },
      };
      const flowWidth = Math.max(1, layer.style.size / 4);
      layers.push({
        id: sourceId,
        type: "line",
        source: sourceId,
        ...window,
        paint: {
          "line-color": layer.style.color,
          "line-width": flowWidth,
          "line-opacity": layer.style.opacity,
          ...(layer.style.animated ? { "line-dasharray": [...FLOW_DASH_PATTERN] } : {}),
        },
      });
      if (layer.style.animated) {
        // T13-a：流动拖尾由 Canvas2D 覆盖层绘制（MapLibre 的 line-dasharray
        // 无法平移相位，逐帧改写还会耗尽 dash 纹理图集 ⇒ 见 mapFlowTrail.ts）。
        // 这里只把航线几何与配色交给覆盖层。
        flowTrails.push({
          id: layer.id,
          color: layer.style.color,
          opacity: layer.style.opacity,
          width: flowWidth,
          routes: lines.map((line) => ({ from: [line.from[0], line.from[1]], to: [line.to[0], line.to[1]], name: line.name })),
        });
      }
    }
  }

  const outline = scene.border?.outline;
  if (outline?.show) {
    const outlineData = buildChinaOutline(geoJson);
    if (outlineData.features.length) {
      sources["china-outline"] = { type: "geojson", data: outlineData };
      layers.push(
        {
          id: "cf-outline-glow",
          type: "line",
          source: "china-outline",
          paint: {
            "line-color": outline.color,
            "line-width": Math.max(outline.width, 1) * 3,
            "line-opacity": 0.22,
            "line-blur": 8,
          },
        },
        {
          id: "cf-outline",
          type: "line",
          source: "china-outline",
          paint: {
            "line-color": outline.color,
            "line-width": outline.width,
            "line-opacity": 0.95,
          },
        },
      );
    }
  }

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
    if (centroid) labels.push({ name, centroid, key: `region:${name}` });
  }
  // 散点标注与省名标注共用 HTML 覆盖层（散点自带配色/字号）
  labels.push(...geoLabels);
  const bounds: [[number, number], [number, number]] | null =
    Number.isFinite(minLng) && Number.isFinite(minLat) ? [[minLng, minLat], [maxLng, maxLat]] : null;

  const style: Record<string, unknown> = {
    version: 8,
    name: "chartforge-map-scene",
    sources,
    pitch: scene.pitch,
    center: [...scene.view.center],
    zoom: scene.view.zoom,
    minZoom: scene.view.minZoom,
    maxZoom: scene.view.maxZoom,
    light: { ...SCENE_LIGHT },
    sky: quickStyle
      ? {
          ...SCENE_SKY,
          "sky-color": quickStyle.tokens.atmosphere.sky,
          "horizon-color": quickStyle.tokens.atmosphere.horizon,
          "fog-color": quickStyle.tokens.atmosphere.fog,
        }
      : { ...SCENE_SKY },
    layers,
  };

  const legendEntries = buildMapLegend(props, rows, fields, rowsByLayerId);
  // 图例模式与 buildMapLegend 保持一致：图例配置或色带分段任一为分段即走分段图例
  const legendMode: "continuous" | "segments" =
    scene.legend?.mode === "segments" || regionFill?.style.colorMode === "segments" ? "segments" : "continuous";
  const legend: MapLibreSceneLegend = {
    show: Boolean(scene.legend?.show) && legendEntries.length > 0,
    position: scene.legend?.position ?? "top-right",
    mode: legendMode,
    entries: legendEntries,
  };

  const tooltipStyle = scene.tooltipStyle ?? MAP_TOOLTIP_DEFAULT;
  const tooltipTexts: Record<string, string> = {};
  for (const [name, value] of Object.entries(regionValues)) {
    tooltipTexts[name] = formatMapTooltipText(name, value, scene.valueFormat);
  }
  const tooltip: MapLibreSceneTooltip = {
    show: true,
    background: tooltipStyle.background,
    borderColor: tooltipStyle.borderColor,
    color: tooltipStyle.color,
    fontSize: tooltipStyle.fontSize,
    texts: tooltipTexts,
  };

  return {
    style,
    bounds,
    regionValues,
    labels,
    legend,
    tooltip,
    scaleBar: {
      show: Boolean(scene.scaleBar?.show),
      position: scene.scaleBar?.position ?? MAP_SCALE_BAR_DEFAULT.position,
    },
    labelMinZoom: typeof scene.label?.minZoom === "number" ? scene.label.minZoom : null,
    flowTrails,
    flags: {
      dragEnabled: scene.view.dragEnabled,
      zoomEnabled: scene.view.zoomEnabled,
      showLabels: scene.view.showLabels,
      drillEnabled: scene.drill?.enabled ?? true,
    },
    errors,
  };
}
