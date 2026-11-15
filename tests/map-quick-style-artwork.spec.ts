import { describe, expect, it } from "vitest";
import {
  MAP_QUICK_STYLE_ARTWORKS,
  MAP_QUICK_STYLE_IDS,
  getMapQuickStyle,
  type MapQuickStyleArtwork,
} from "../src/core/components/mapQuickStyles";
import {
  buildArtworkIds,
  buildProvinceFill,
  luminance,
  type QuickStyleProvinceGeo,
} from "../src/core/components/mapQuickStyleArtwork";
import { CHINA_PREVIEW_REGIONS, CHINA_PREVIEW_VIEWBOX } from "../src/assets/geo/chinaPreview";

const HEX = /^#[0-9a-fA-F]{6}$/;

function geoOf(name: string): QuickStyleProvinceGeo {
  const region = CHINA_PREVIEW_REGIONS.find((item) => item.name === name);
  expect(region, `缺少省份 ${name}`).toBeTruthy();
  return { name: region!.name, lng: region!.cp[0], lat: region!.cp[1], size: region!.size };
}

describe("快速样式缩略图：预设视觉语义（artwork）", () => {
  it("为六个预设分别声明视觉语义，且地形观感由绿/金两套配色共用", () => {
    expect(MAP_QUICK_STYLE_ARTWORKS.length).toBeGreaterThan(0);
    for (const id of MAP_QUICK_STYLE_IDS) {
      const preset = getMapQuickStyle(id)!;
      expect(MAP_QUICK_STYLE_ARTWORKS).toContain(preset.artwork);
    }
    // 参考图：绿地形与金地形是**同一种卫星地形渲染**、只是配色不同，
    // 因此观感种类为 5 种，而六张缩略图的实际画面彼此不同（由配色与图层共同保证）。
    const kinds = MAP_QUICK_STYLE_IDS.map((id) => getMapQuickStyle(id)!.artwork);
    expect(new Set(kinds).size).toBe(5);
    expect(getMapQuickStyle("jade")!.artwork).toBe(getMapQuickStyle("sandstone")!.artwork);
  });

  it("按预设名对齐参考图的六种观感", () => {
    expect(getMapQuickStyle("deep-sea")!.artwork).toBe("glow-choropleth");
    expect(getMapQuickStyle("jade")!.artwork).toBe("terrain");
    expect(getMapQuickStyle("sandstone")!.artwork).toBe("terrain");
    expect(getMapQuickStyle("nebula")!.artwork).toBe("neon");
    expect(getMapQuickStyle("contour")!.artwork).toBe("contour");
    expect(getMapQuickStyle("parchment")!.artwork).toBe("parchment");
  });

  it("每个预设的 artwork 都在允许集合内", () => {
    const allowed: MapQuickStyleArtwork[] = [
      "glow-choropleth",
      "terrain",
      "contour",
      "neon",
      "parchment",
    ];
    for (const id of MAP_QUICK_STYLE_IDS) {
      expect(allowed).toContain(getMapQuickStyle(id)!.artwork);
    }
  });
});

describe("快速样式缩略图：单省填色计算", () => {
  it("对任意预设 × 任意省份都产出合法六位十六进制颜色", () => {
    for (const id of MAP_QUICK_STYLE_IDS) {
      const preset = getMapQuickStyle(id)!;
      for (const region of CHINA_PREVIEW_REGIONS) {
        const fill = buildProvinceFill(preset, {
          name: region.name,
          lng: region.cp[0],
          lat: region.cp[1],
          size: region.size,
        }, 0.5);
        expect(fill, `${id}/${region.name}`).toMatch(HEX);
      }
    }
  });

  it("同一预设内的不同省份填色互不相同（不是一整块纯色）", () => {
    for (const id of MAP_QUICK_STYLE_IDS) {
      const preset = getMapQuickStyle(id)!;
      const fills = new Set(
        CHINA_PREVIEW_REGIONS.map((region, index) =>
          buildProvinceFill(preset, {
            name: region.name,
            lng: region.cp[0],
            lat: region.cp[1],
            size: region.size,
          }, index / CHINA_PREVIEW_REGIONS.length),
        ),
      );
      expect(fills.size, `${id} 的各省填色应当有层次`).toBeGreaterThan(8);
    }
  });

  it("地形观感按地理高低分出雪白高地、褐黄过渡与翠绿低地", () => {
    const preset = getMapQuickStyle("jade")!;
    const highland = buildProvinceFill(preset, geoOf("西藏自治区"), 0.5);
    const lowland = buildProvinceFill(preset, geoOf("上海市"), 0.5);
    // 高地（青藏高原）应当比东部低地更亮——参考图里西部是雪白/褐色高地。
    expect(luminance(highland)).toBeGreaterThan(luminance(lowland));
    // 低地偏绿
    expect(lowland).toMatch(/^#[0-9a-f]{2}[0-9a-f]{2}[0-9a-f]{2}$/i);
    const green = parseInt(lowland.slice(3, 5), 16);
    const red = parseInt(lowland.slice(1, 3), 16);
    expect(green).toBeGreaterThan(red);
  });

  it("霓虹观感内部近黑、描边高亮紫（外轮廓发光的前提）", () => {
    const preset = getMapQuickStyle("nebula")!;
    const fill = buildProvinceFill(preset, geoOf("四川省"), 0.5);
    expect(luminance(fill)).toBeLessThan(0.2);
    const border = preset.tokens.border.color;
    expect(luminance(border)).toBeGreaterThan(0.4);
    // 描边与填充必须明显不同，否则轮廓不会“发光”
    expect(border.toLowerCase()).not.toBe(fill.toLowerCase());
  });

  it("宣纸观感整体明亮，深海观感整体偏暗", () => {
    const parchment = getMapQuickStyle("parchment")!;
    const deepSea = getMapQuickStyle("deep-sea")!;
    const p = buildProvinceFill(parchment, geoOf("江苏省"), 0.5);
    const d = buildProvinceFill(deepSea, geoOf("江苏省"), 0.5);
    expect(luminance(p)).toBeGreaterThan(0.5);
    expect(luminance(d)).toBeLessThan(0.5);
  });
});

describe("快速样式缩略图：装饰层 id 与预览几何", () => {
  it("每个预设给出互不冲突的滤镜/渐变 id", () => {
    const ids = MAP_QUICK_STYLE_IDS.map((id) => buildArtworkIds(getMapQuickStyle(id)!));
    const flat = ids.map((item) => JSON.stringify(item));
    expect(new Set(flat).size).toBe(6);
    for (const item of ids) {
      for (const value of Object.values(item)) {
        if (typeof value === "string") expect(value).toMatch(/^[a-z0-9-]+$/);
      }
    }
  });

  it("等高线与霓虹观感各自声明专属滤镜，其余观感不声明", () => {
    const idsOf = (id: string) => buildArtworkIds(getMapQuickStyle(id)!);
    expect(idsOf("contour").contour).toBeTruthy();
    expect(idsOf("nebula").glow).toBeTruthy();
    expect(idsOf("parchment").paper).toBeTruthy();
    expect(idsOf("contour").glow).toBeUndefined();
    expect(idsOf("nebula").contour).toBeUndefined();
    expect(idsOf("jade").terrain).toBeTruthy();
    expect(idsOf("deep-sea").terrain).toBeUndefined();
    expect(idsOf("deep-sea").glow).toBeUndefined();
  });

  it("预览几何仍为 34 省、路径合法且全部落在画布内", () => {
    expect(CHINA_PREVIEW_REGIONS.length).toBe(34);
    expect(CHINA_PREVIEW_VIEWBOX.width).toBeGreaterThan(0);
    expect(CHINA_PREVIEW_VIEWBOX.height).toBeGreaterThan(0);
    for (const region of CHINA_PREVIEW_REGIONS) {
      expect(region.d.startsWith("M")).toBe(true);
      expect(region.d.endsWith("Z")).toBe(true);
      expect(region.cp.length).toBe(2);
      expect(Number.isFinite(region.cp[0])).toBe(true);
      expect(Number.isFinite(region.cp[1])).toBe(true);
      // 路径坐标必须落在 viewBox 内（不能溢出缩略图）
      const coords = region.d.match(/-?\d+(\.\d+)?/g) ?? [];
      expect(coords.length).toBeGreaterThan(4);
      for (let i = 0; i < coords.length; i += 2) {
        const x = Number(coords[i]);
        const y = Number(coords[i + 1]);
        expect(x).toBeGreaterThanOrEqual(-1);
        expect(x).toBeLessThanOrEqual(CHINA_PREVIEW_VIEWBOX.width + 1);
        expect(y).toBeGreaterThanOrEqual(-1);
        expect(y).toBeLessThanOrEqual(CHINA_PREVIEW_VIEWBOX.height + 1);
      }
    }
  });

  it("广东省的行政区缺口环仍作为空洞而非独立外环", () => {
    const guangdong = CHINA_PREVIEW_REGIONS.find((region) => region.name === "广东省")!;
    expect(guangdong.d.match(/M/g) ?? []).toHaveLength(1);
    expect(guangdong.holes.length).toBeGreaterThan(0);
  });
});
