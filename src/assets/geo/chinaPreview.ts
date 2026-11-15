/**
 * 中国省界缩略图（地图「快速样式」选择器的 3×2 预览用）。
 *
 * 由 src/assets/geo/china.json 在运行时直接派生：等距圆柱投影 + cos(平均纬度)
 * 横向压缩（贴近常用中国地图比例），再用 Douglas–Peucker 简化（容差 0.35 个
 * viewBox 单位），产出 34 个省级的 SVG path、空洞环与中心点。
 *
 * 为什么运行时算而不是预生成一份 .ts：
 * china.json 本来就被工作台打进包里（MapSceneWidget 已经 import 它），
 * 这里复用同一份数据**零额外字节**；换来的是「预览几何」与「地图几何」永远同源，
 * 也省掉一个需要人工同步的生成物（以及它的生成脚本）。
 *
 * 投影与简化是纯函数，可在 tests/map-quick-style-artwork.spec.ts 中直接断言。
 */
import chinaGeo from "./china.json";

export interface ChinaPreviewRegion {
  /** 省级行政区名称 */
  name: string;
  /** 源数据中的规模标度（用于预览着色的相对深浅） */
  size: number;
  /** 中心点 [经度, 纬度]，供地形观感按地理高低与经纬着色 */
  cp: [number, number];
  /** 可见外环路径（viewBox 坐标系下的 SVG path） */
  d: string;
  /** 行政缺口等空洞路径（与外环一起以 evenodd 规则渲染） */
  holes: string;
}

const W = 160;
const TOL = 0.35;
const PAD = 1.2;

type Pt = [number, number];

interface GeoFeature {
  properties: { name: string; size?: string | number; cp?: [number, number] };
  geometry: { type?: string; coordinates?: unknown };
}

/** 点 p 到线段 a–b 的距离。 */
function perp(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const den = dx * dx + dy * dy;
  if (den === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas–Peucker 折线简化（保留首尾）。 */
function simplify(points: Pt[], tol: number): Pt[] {
  if (points.length < 3) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let worst = 0;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const d = perp(points[i], points[first], points[last]);
      if (d > worst) {
        worst = d;
        index = i;
      }
    }
    if (worst > tol && index > 0) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

/** 一个可见外环 + 它自带的空洞环（行政缺口）。 */
interface PolygonPart {
  outer: Pt[];
  holes: Pt[][];
}

/**
 * 按 GeoJSON 几何拆出可见多边形部件。
 *
 * Polygon → 一个部件（外环 + 其余环为空洞）；
 * MultiPolygon → 每个子多边形一个部件（岛屿与主体各自独立填充，
 * 空洞只跟它所属的那个子多边形配对，不会串到别的部件上）。
 */
function polygonParts(geometry: GeoFeature["geometry"]): PolygonPart[] {
  const coords = geometry.coordinates;
  if (!Array.isArray(coords) || coords.length === 0) return [];
  if (geometry.type === "Polygon") {
    const outer = coords[0] as Pt[];
    if (!Array.isArray(outer) || outer.length === 0) return [];
    return [{ outer, holes: (coords.slice(1) as Pt[][]).filter(Array.isArray) }];
  }
  if (geometry.type === "MultiPolygon") {
    const parts: PolygonPart[] = [];
    for (const polygon of coords as Pt[][][]) {
      if (!Array.isArray(polygon) || polygon.length === 0) continue;
      const outer = polygon[0];
      if (!Array.isArray(outer) || outer.length === 0) continue;
      parts.push({ outer, holes: polygon.slice(1).filter(Array.isArray) });
    }
    return parts;
  }
  return [];
}

function buildPreview(): { regions: ChinaPreviewRegion[]; width: number; height: number } {
  const features = (chinaGeo as unknown as { features: GeoFeature[] }).features;
  const lats = features
    .map((feature) => feature.properties.cp?.[1])
    .filter((lat): lat is number => typeof lat === "number");
  const meanLat = lats.reduce((sum, lat) => sum + lat, 0) / (lats.length || 1);
  const k = Math.cos((meanLat * Math.PI) / 180);

  const all: Pt[] = [];
  for (const feature of features) {
    for (const part of polygonParts(feature.geometry)) {
      for (const point of part.outer) all.push(point);
      for (const hole of part.holes) for (const point of hole) all.push(point);
    }
  }

  const xs = all.map((point) => point[0] * k);
  const ys = all.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const height = Math.round(((W * (maxY - minY)) / spanX) * 10) / 10;
  const scale = (W - 2 * PAD) / spanX;

  const project = (lng: number, lat: number): Pt => [
    (lng * k - minX) * scale + PAD,
    (maxY - lat) * scale + PAD,
  ];

  const toPath = (ring: Pt[]): string => {
    const projected = ring.map((point) => project(point[0], point[1]));
    let simplified = simplify(projected, TOL);
    // 极小行政区（澳门等）简化后不足三点时保留原始折线，避免整省丢失。
    if (simplified.length < 3) simplified = projected;
    if (simplified.length < 3) return "";
    const head = simplified[0];
    let seg = `M${head[0].toFixed(1)} ${head[1].toFixed(1)}`;
    for (let i = 1; i < simplified.length; i += 1) {
      seg += `L${simplified[i][0].toFixed(1)} ${simplified[i][1].toFixed(1)}`;
    }
    return `${seg}Z`;
  };

  const regions: ChinaPreviewRegion[] = [];
  for (const feature of features) {
    const parts = polygonParts(feature.geometry);
    if (!parts.length) continue;
    const outerPaths: string[] = [];
    const holePaths: string[] = [];
    for (const part of parts) {
      const outer = toPath(part.outer);
      if (outer) outerPaths.push(outer);
      for (const hole of part.holes) {
        const path = toPath(hole);
        if (path) holePaths.push(path);
      }
    }
    if (!outerPaths.length) continue;
    regions.push({
      name: feature.properties.name,
      size: Number(feature.properties.size ?? 0),
      cp: feature.properties.cp ?? [0, 0],
      // 可见外环（多部件要素可能有多个，各自独立填充）
      d: outerPaths.join(""),
      // 行政缺口等空洞：与外环同路径以 evenodd 规则挖空，不算独立可见区域
      holes: holePaths.join(""),
    });
  }

  return { regions, width: W, height };
}

const built = buildPreview();

/** 预览画布尺寸（viewBox） */
export const CHINA_PREVIEW_VIEWBOX = { width: built.width, height: built.height };

/** 省级路径（按源数据顺序） */
export const CHINA_PREVIEW_REGIONS: readonly ChinaPreviewRegion[] = built.regions;
