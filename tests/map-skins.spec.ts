import { describe, expect, it } from "vitest";
import { MAP_SKINS, applyMapSkin } from "../src/core/components/mapSkins";
import { createDefaultMapSceneProps, normalizeMapSceneProps, type MapSceneProps } from "../src/core/components/mapScene";

const HEX = /^#[0-9a-fA-F]{6}$/;

describe("map skin presets", () => {
  it("ships five unique skins with complete hex token groups", () => {
    expect(MAP_SKINS).toHaveLength(5);
    const ids = MAP_SKINS.map((skin) => skin.id);
    expect(new Set(ids).size).toBe(5);
    for (const skin of MAP_SKINS) {
      expect(skin.name.length).toBeGreaterThan(0);
      const colors = [
        skin.tokens.background,
        skin.tokens.fill.min, skin.tokens.fill.mid, skin.tokens.fill.max, skin.tokens.fill.empty,
        skin.tokens.border.color,
        skin.tokens.label.color, skin.tokens.label.stroke,
        skin.tokens.emphasis.areaColor, skin.tokens.emphasis.borderColor, skin.tokens.emphasis.labelColor,
        skin.tokens.tooltip.background, skin.tokens.tooltip.borderColor, skin.tokens.tooltip.color,
        ...skin.tokens.underlay.flatMap((entry) => [entry.areaColor, entry.borderColor, entry.shadowColor]),
      ];
      expect(colors.every((color) => HEX.test(color))).toBe(true);
      expect(skin.tokens.underlay).toHaveLength(3);
      expect(skin.tokens.border.width).toBeGreaterThan(0);
      expect(skin.tokens.label.size).toBeGreaterThan(0);
    }
  });

  it("applies a skin as a pure write of style fields, preserving valueFormat and the input", () => {
    const base = createDefaultMapSceneProps("tilted");
    const input: MapSceneProps = {
      ...base,
      valueFormat: { decimals: 1, suffix: " 次" },
      layers: [{ id: "a", type: "regionFill", name: "热度", visible: true, style: { color: "#32d6ff", opacity: 0.85, size: 12 } }],
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    const jade = MAP_SKINS.find((skin) => skin.id === "jade")!;
    const applied = applyMapSkin(input, jade.id);
    expect(input).toEqual(snapshot);
    expect(applied).not.toBe(input);
    expect(applied.appliedSkin).toBe("jade");
    expect(applied.valueFormat).toEqual({ decimals: 1, suffix: " 次" });
    expect(applied.view.backgroundColor).toBe(jade.tokens.background);
    const layer = applied.layers[0]!;
    expect(layer.style.colorMode).toBe("gradient");
    expect(layer.style.colors).toEqual(jade.tokens.fill);
    expect(applied.border).toEqual({ color: jade.tokens.border.color, width: jade.tokens.border.width, type: "solid" });
    expect(applied.label).toMatchObject({ color: jade.tokens.label.color, size: jade.tokens.label.size, stroke: jade.tokens.label.stroke });
    expect(applied.emphasis).toEqual(jade.tokens.emphasis);
    expect(applied.tooltipStyle).toMatchObject({
      background: jade.tokens.tooltip.background,
      borderColor: jade.tokens.tooltip.borderColor,
      color: jade.tokens.tooltip.color,
    });
    expect(applied.underlay).toEqual(jade.tokens.underlay);
  });

  it("returns the input unchanged for unknown skin ids", () => {
    const input = createDefaultMapSceneProps("flat");
    expect(applyMapSkin(input, "does-not-exist")).toEqual(input);
  });

  it("normalizes the underlay palette with hex fallbacks and a three-entry cap", () => {
    const out = normalizeMapSceneProps({
      underlay: [
        { areaColor: "#010203", borderColor: "#040506", shadowColor: "#070809" },
        { areaColor: "bad" },
        { areaColor: "#0a0b0c", borderColor: "#0d0e0f", shadowColor: "#101112" },
        { areaColor: "#131415", borderColor: "#161718", shadowColor: "#191a1b" },
      ],
    });
    expect(out.underlay).toHaveLength(3);
    expect(out.underlay![0]).toEqual({ areaColor: "#010203", borderColor: "#040506", shadowColor: "#070809" });
    expect(out.underlay![1]).toEqual({ areaColor: "#10273a", borderColor: "#b5f3ff", shadowColor: "#8cd3ef" });
    expect(out.underlay![2]).toEqual({ areaColor: "#0a0b0c", borderColor: "#0d0e0f", shadowColor: "#101112" });
    expect(normalizeMapSceneProps(null).underlay).toBeUndefined();
  });
});
