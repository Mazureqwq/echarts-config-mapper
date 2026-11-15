/**
 * 「快速样式」缩略图的美术计算（纯函数，无副作用）。
 *
 * 目标：让六张缩略图呈现**各自独立的观感**，而不是同一张矢量图换配色——
 * 参考图里蓝辉光 / 卫星地形 / 金色地形 / 等高线 / 霓虹轮廓 / 浅色宣纸
 * 各不相同。本模块只负责「算颜色、算图层 id」，具体怎么组装 SVG 在
 * `MapQuickStyleThumbnail.vue`。
 *
 * 颜色一律从预设 tokens 派生，保证缩略图与真实地图同源；
 * 观感差异来自**映射方式**（地形按经纬高低、等高线走滤镜、霓虹走外轮廓辉光）。
 */
import type { MapQuickStyle } from "./mapQuickStyles";

/** 单省做美术计算所需的地理信息。 */
export interface QuickStyleProvinceGeo {
  /** 省级行政区名称 */
  name: string;
  /** 中心点经度 */
  lng: number;
  /** 中心点纬度 */
  lat: number;
  /** 规模标度 */
  size: number;
}

/** 缩略图各类装饰层（滤镜 / 渐变）的 id，按预设区分避免同页冲突。 */
export interface QuickStyleArtworkIds {
  /** 地形纹理滤镜（terrain 观感） */
  terrain?: string;
  /** 等高线滤镜（contour 观感） */
  contour?: string;
  /** 外轮廓辉光滤镜（neon 观感） */
  glow?: string;
  /** 纸张 / 颗粒纹理滤镜（parchment 观感） */
  paper?: string;
}

/**
 * 按预设生成互不冲突的装饰层 id。
 *
 * 只返回该观感真正用到的图层：地形观感要纹理滤镜、等高线观感要等高线滤镜、
 * 霓虹观感要外轮廓辉光、宣纸观感要纸张纹理，其余不声明。
 */
export function buildArtworkIds(preset: MapQuickStyle): QuickStyleArtworkIds {
  const safe = preset.id.replace(/[^a-z0-9-]/gi, "-");
  switch (preset.artwork) {
    case "terrain":
      return { terrain: `cf-thumb-terrain-${safe}` };
    case "contour":
      return { contour: `cf-thumb-contour-${safe}` };
    case "neon":
      return { glow: `cf-thumb-glow-${safe}` };
    case "parchment":
      return { paper: `cf-thumb-paper-${safe}` };
    case "glow-choropleth":
    default:
      return {};
  }
}

/** 相对亮度（WCAG 近似），0..1。 */
export function luminance(hex: string): number {
  const value = hex.replace("#", "");
  if (value.length !== 6) return 0;
  const channel = (index: number): number => {
    const raw = parseInt(value.slice(index, index + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** 两个十六进制色按 t 混合。 */
export function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const pa = parse(a);
  const pb = parse(b);
  const ratio = Math.min(1, Math.max(0, t));
  const mixed = pa.map((value, index) => Math.round(value + (pb[index]! - value) * ratio));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * 地形观感里的「相对高度」代理量。
 *
 * 没有真实 DEM（离线、无外链），用西高东低的构造 + 纬度修正近似：
 * 青藏高原 / 新疆（最西）最高，东南沿海最低。
 */
export function terrainElevation(geo: QuickStyleProvinceGeo): number {
  const westness = clamp01((106 - geo.lng) / 33);
  const northness = clamp01((geo.lat - 20) / 30);
  return clamp01(westness * 0.85 + northness * 0.18);
}

/** 地形色带：雪顶 → 裸岩 → 过渡 → 低地。 */
function terrainRamp(preset: MapQuickStyle): [string, string, string, string] {
  const { fill } = preset.tokens;
  return [
    mixHex("#ffffff", fill.mid, 0.22), // 雪顶
    mixHex("#b9a06a", fill.mid, 0.3), // 裸岩 / 褐黄
    mixHex(fill.mid, fill.max, 0.45), // 过渡带
    mixHex(fill.min, fill.max, 0.55), // 低地
  ];
}

/**
 * 单省填色（按预设观感计算）。
 *
 * @param preset 预设
 * @param geo    该省的地理信息
 * @param t      规模标度归一化后的位置（0..1），由调用方按省规模标度给出
 */
export function buildProvinceFill(preset: MapQuickStyle, geo: QuickStyleProvinceGeo, t: number): string {
  const { fill } = preset.tokens;
  const ratio = clamp01(t);

  switch (preset.artwork) {
    case "terrain": {
      const ramp = terrainRamp(preset);
      const elevation = clamp01(terrainElevation(geo) * 0.88 + ratio * 0.12);
      const base = elevation < 0.22 ? ramp[3] : elevation < 0.45 ? ramp[2] : elevation < 0.7 ? ramp[1] : ramp[0];
      // 规模标度再做一层轻微明暗扰动，避免整片同色。
      return mixHex(base, ratio > 0.5 ? fill.max : fill.min, Math.abs(ratio - 0.5) * 0.18);
    }
    case "neon": {
      // 霓虹观感：内部近乎全黑，只留一点结构层次。
      return mixHex(preset.tokens.background, "#000000", 0.3 + ratio * 0.25);
    }
    case "parchment": {
      // 浅色宣纸：陆地是米白纸面，标度只做很轻的深浅。
      return mixHex(fill.min, "#ffffff", 0.35 + ratio * 0.3);
    }
    case "contour": {
      // 靛蓝等高线：低饱和靛面，等高线纹理交给滤镜表达。
      return mixHex(fill.min, fill.mid, ratio * 0.75);
    }
    case "glow-choropleth":
    default: {
      const base = ratio <= 0.5 ? mixHex(fill.min, fill.mid, ratio * 2) : mixHex(fill.mid, fill.max, (ratio - 0.5) * 2);
      return mixHex(base, ratio > 0.5 ? fill.max : fill.min, Math.abs(ratio - 0.5) * 0.12);
    }
  }
}

/** 缩略图背景色（底图/海洋）。 */
export function buildBackgroundFill(preset: MapQuickStyle): string {
  switch (preset.artwork) {
    case "terrain":
      // 卫星图：深青海面
      return mixHex(preset.tokens.background, "#0a1a1c", 0.6);
    case "parchment":
      // 浅色底图：淡蓝海面
      return mixHex("#dfe8ec", preset.tokens.fill.min, 0.25);
    case "neon":
      return "#05030b";
    case "contour":
      return mixHex(preset.tokens.background, "#02060f", 0.55);
    case "glow-choropleth":
    default:
      // 参考图的深海蓝底是中性深灰蓝，而不是预设的深蓝。
      return mixHex(preset.tokens.background, "#2a2f38", 0.72);
  }
}

/**
 * 省界描边色（各观感的边界表现不同）。
 *
 * 参考图里只有「靛蓝等高线」把省界画得比较清楚；卫星地形观感几乎看不到省界，
 * 宣纸底图的边界也很淡，霓虹观感则只留外轮廓在发光。
 */
export function buildStrokeColor(preset: MapQuickStyle): string {
  switch (preset.artwork) {
    case "neon":
      // 霓虹观感：省界几乎不可见，只有外轮廓在发光。
      return mixHex(preset.tokens.border.color, preset.tokens.background, 0.78);
    case "parchment":
      return mixHex(preset.tokens.border.color, "#ffffff", 0.62);
    case "contour":
      return mixHex(preset.tokens.border.color, preset.tokens.fill.max, 0.55);
    case "terrain":
      // 卫星地形观感：省界隐入地表纹理。
      return mixHex(preset.tokens.border.color, preset.tokens.fill.min, 0.78);
    case "glow-choropleth":
    default:
      return mixHex(preset.tokens.border.color, preset.tokens.fill.max, 0.62);
  }
}

/** 省界描边宽度（viewBox 单位）。 */
export function buildStrokeWidth(preset: MapQuickStyle): number {
  switch (preset.artwork) {
    case "neon":
      return 0.1;
    case "parchment":
      return 0.22;
    case "terrain":
      return 0.14;
    case "contour":
      return 0.38;
    case "glow-choropleth":
    default:
      return 0.26;
  }
}
