import { describe, expect, it } from "vitest";
import {
  MAP_QUICK_STYLE_IDS,
  applyMapQuickStyle,
  getMapQuickStyle,
  isMapQuickStyleId,
  normalizeMapQuickStyle,
} from "../src/core/components/mapQuickStyles";
import { normalizeMapSceneProps } from "../src/core/components/mapScene";
import { buildMapLibreScene } from "../src/core/components/mapLibreScene";
import { CHINA_PREVIEW_REGIONS, CHINA_PREVIEW_VIEWBOX } from "../src/assets/geo/chinaPreview";

const HEX = /^#[0-9a-fA-F]{6}$/;

describe("map quick style collection", () => {
  it("exposes exactly six built-in presets with unique ids and Chinese names", () => {
    expect(MAP_QUICK_STYLE_IDS).toHaveLength(6);
    expect(new Set(MAP_QUICK_STYLE_IDS).size).toBe(6);
    for (const id of MAP_QUICK_STYLE_IDS) {
      const preset = getMapQuickStyle(id);
      expect(preset).toBeTruthy();
      expect(preset?.id).toBe(id);
      expect(preset?.name.trim().length).toBeGreaterThan(0);
    }
    // 参考图：右上为「金色地形」，右下为「浅色示意」并处于选中态。
    expect(getMapQuickStyle("sandstone")?.name).toBe("暖沙金");
    expect(getMapQuickStyle("parchment")?.name).toBe("素雅宣纸");
  });

  it("keeps every preset color a valid six-digit hex token", () => {
    for (const id of MAP_QUICK_STYLE_IDS) {
      const preset = getMapQuickStyle(id)!;
      expect(HEX.test(preset.tokens.background)).toBe(true);
      expect(HEX.test(preset.tokens.fill.min)).toBe(true);
      expect(HEX.test(preset.tokens.fill.mid)).toBe(true);
      expect(HEX.test(preset.tokens.fill.max)).toBe(true);
      expect(HEX.test(preset.tokens.fill.empty)).toBe(true);
      expect(HEX.test(preset.tokens.border.color)).toBe(true);
      expect(HEX.test(preset.tokens.label.color)).toBe(true);
      expect(HEX.test(preset.tokens.label.stroke)).toBe(true);
      expect(HEX.test(preset.tokens.emphasis.areaColor)).toBe(true);
      expect(HEX.test(preset.tokens.selected.areaColor)).toBe(true);
      expect(HEX.test(preset.tokens.tooltip.background)).toBe(true);
      expect(HEX.test(preset.tokens.tooltip.color)).toBe(true);
      expect(preset.tokens.border.width).toBeGreaterThan(0);
    }
  });

  it("reports unknown ids as not applicable and returns them unchanged", () => {
    expect(isMapQuickStyleId("nope")).toBe(false);
    expect(isMapQuickStyleId("deep-sea")).toBe(true);
    const props = { presentation: "flat" as const, layers: [] };
    expect(applyMapQuickStyle(props, "nope")).toBe(props);
  });

  it("applies a preset by writing concrete values onto the scene props", () => {
    const applied = applyMapQuickStyle(
      { presentation: "flat" as const, layers: [{ id: "f", type: "regionFill" as const, name: "n", visible: true, style: { color: "#336699", opacity: 0.7, size: 12 } }] },
      "jade",
    ) as unknown as {
      view?: { backgroundColor?: string };
      border?: { color?: string };
      label?: { color?: string };
      emphasis?: { areaColor?: string };
      selected?: { areaColor?: string };
      tooltipStyle?: { background?: string };
      layers?: Array<{ style: { colors?: unknown; colorMode?: string } }>;
    };
    const preset = getMapQuickStyle("jade")!;
    expect(applied.view?.backgroundColor).toBe(preset.tokens.background);
    expect(applied.border?.color).toBe(preset.tokens.border.color);
    expect(applied.label?.color).toBe(preset.tokens.label.color);
    expect(applied.emphasis?.areaColor).toBe(preset.tokens.emphasis.areaColor);
    expect(applied.selected?.areaColor).toBe(preset.tokens.selected.areaColor);
    expect(applied.tooltipStyle?.background).toBe(preset.tokens.tooltip.background);
    const layer = applied.layers![0]!;
    expect(layer.style.colors).toEqual(preset.tokens.fill);
    expect(layer.style.colorMode).toBe("gradient");
  });

  it("never mutates the input props when applying a preset", () => {
    const input = { presentation: "flat" as const, layers: [{ id: "f", type: "regionFill" as const, name: "n", visible: true, style: { color: "#336699", opacity: 0.7, size: 12 } }] };
    const snapshot = JSON.stringify(input);
    applyMapQuickStyle(input, "nebula");
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("normalizes a persisted quick-style token and rejects malformed ones", () => {
    const jade = normalizeMapQuickStyle({ id: "jade" });
    expect(jade?.id).toBe("jade");
    expect(jade?.tokens).toEqual(getMapQuickStyle("jade")?.tokens);
    expect(normalizeMapQuickStyle({ id: "unknown-style" })).toBeUndefined();
    expect(normalizeMapQuickStyle({ id: 42 })).toBeUndefined();
    expect(normalizeMapQuickStyle(null)).toBeUndefined();
    expect(normalizeMapQuickStyle("jade")).toBeUndefined();
  });

  it("re-resolves persisted tokens from the registry so hand-written colors are discarded", () => {
    const forged = normalizeMapQuickStyle({ id: "jade", tokens: { background: "#ff0000", fill: { min: "#ff0000", mid: "#ff0000", max: "#ff0000", empty: "#ff0000" } } });
    expect(forged?.tokens.background).toBe(getMapQuickStyle("jade")?.tokens.background);
    expect(forged?.tokens.fill.max).toBe(getMapQuickStyle("jade")?.tokens.fill.max);
  });

  it("keeps the quick-style token in the normalized scene props and survives snapshot normalization", () => {
    const normalized = normalizeMapSceneProps({ quickStyle: { id: "sandstone" } });
    expect(normalized.quickStyle?.id).toBe("sandstone");
    expect(normalized.quickStyle?.tokens.fill.max).toBe(getMapQuickStyle("sandstone")?.tokens.fill.max);
    expect(normalizeMapSceneProps({ quickStyle: { id: "bogus" } }).quickStyle).toBeUndefined();
    expect(normalizeMapSceneProps(null).quickStyle).toBeUndefined();
  });

  it("does not reintroduce the removed legacy skin fields", () => {
    const normalized = normalizeMapSceneProps({ underlay: [], appliedSkin: "jade" });
    expect(normalized).not.toHaveProperty("underlay");
    expect(normalized).not.toHaveProperty("appliedSkin");
  });

  it("applies the preset palette and atmosphere to the MapLibre style in the shared builder", () => {
    const preset = getMapQuickStyle("sandstone")!;
    const result = buildMapLibreScene(
      {
        quickStyle: { id: "sandstone" },
        layers: [{ id: "f", type: "regionFill", name: "n", visible: true, style: { color: "#336699", opacity: 0.7, size: 12 } }],
      },
      [{ name: "广东省", value: 10 }, { name: "北京市", value: 90 }],
      { category: "name", value: "value" },
    );
    const fill = (result.style.layers as Array<{ id: string; paint: { "fill-color": unknown } }>)
      .find((layer) => layer.id === "cf-fill")!;
    const match = fill.paint["fill-color"] as unknown[];
    // match 表达式里必须出现预设的色带端点色
    expect(JSON.stringify(match)).toContain(preset.tokens.fill.max);
    expect(JSON.stringify(match)).toContain(preset.tokens.fill.min);
    // 大气（sky/fog）必须来自预设
    const sky = result.style.sky as Record<string, unknown>;
    expect(sky["sky-color"]).toBe(preset.tokens.atmosphere.sky);
    expect(sky["horizon-color"]).toBe(preset.tokens.atmosphere.horizon);
    expect(sky["fog-color"]).toBe(preset.tokens.atmosphere.fog);
  });

  it("keeps the default sky when no quick style is selected", () => {
    const result = buildMapLibreScene({ layers: [] }, []);
    const sky = result.style.sky as Record<string, unknown>;
    expect(sky["sky-color"]).toBe("#0a1628");
    expect(sky["horizon-color"]).toBe("#12314d");
  });

  it("builds a preview geometry with one path per province and no administrative-gap artefact", () => {
    expect(CHINA_PREVIEW_REGIONS.length).toBe(34);
    expect(CHINA_PREVIEW_VIEWBOX.width).toBeGreaterThan(0);
    expect(CHINA_PREVIEW_VIEWBOX.height).toBeGreaterThan(0);
    for (const region of CHINA_PREVIEW_REGIONS) {
      expect(region.d.startsWith("M")).toBe(true);
      expect(region.d.endsWith("Z")).toBe(true);
      expect(region.name.length).toBeGreaterThan(0);
    }
    const guangdong = CHINA_PREVIEW_REGIONS.find((region) => region.name === "广东省")!;
    // 广东省的行政区缺口环不能被当成另一个可见外环：路径里只允许一个闭合子路径。
    expect(guangdong.d.match(/M/g) ?? []).toHaveLength(1);
  });
});
