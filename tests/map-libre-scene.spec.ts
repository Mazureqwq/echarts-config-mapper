import { describe, expect, it } from "vitest";
import { buildMapLibreScene } from "../src/core/components/mapLibreScene";

const chinaFixture = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { name: "广东省" }, geometry: { type: "Polygon", coordinates: [[[113, 23], [115, 23], [115, 25], [113, 25], [113, 23]]] } },
    { type: "Feature", properties: { name: "西藏自治区" }, geometry: { type: "Polygon", coordinates: [[[88, 30], [92, 30], [92, 34], [88, 34], [88, 30]]] } },
    { type: "Feature", properties: { name: "浙江省" }, geometry: { type: "Polygon", coordinates: [[[119, 28], [122, 28], [122, 31], [119, 31], [119, 28]]] } },
  ],
};

const baseView = { center: [104, 35] as [number, number], zoom: 2, minZoom: 1, maxZoom: 8, dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622" };

describe("buildMapLibreScene", () => {
  it("builds maplibre style v8 with lights fog camera and china geojson source", () => {
    const r = buildMapLibreScene(
      { presentation: "tilted", pitch: 30, view: baseView, layers: [] },
      [], undefined, {}, chinaFixture,
    );
    expect(r.errors).toEqual([]);
    expect(r.style.version).toBe(8);
    expect(r.style.pitch).toBe(30);
    expect(r.style.center).toEqual([104, 35]);
    expect(r.style.zoom).toBe(2);
    expect(r.style.minZoom).toBe(1);
    expect(r.style.maxZoom).toBe(8);
    expect(Array.isArray(r.style.lights) ? (r.style.lights as unknown[]).length : 0).toBeGreaterThan(0);
    expect(r.style.fog).toBeTruthy();
    const source = (r.style.sources as any).china;
    expect(source.type).toBe("geojson");
    expect(source.data).toBe(chinaFixture);
    expect(source.promoteId).toBe("name");
    expect(r.flags).toEqual({ dragEnabled: true, zoomEnabled: true, showLabels: true, drillEnabled: true });
  });

  it("flat presentation forces pitch 0 and tilted uses props pitch", () => {
    const flat = buildMapLibreScene({ presentation: "flat", view: baseView, layers: [] }, [], undefined, {}, chinaFixture);
    expect(flat.style.pitch).toBe(0);
    const tilted = buildMapLibreScene({ presentation: "tilted", pitch: 42, view: baseView, layers: [] }, [], undefined, {}, chinaFixture);
    expect(tilted.style.pitch).toBe(42);
    expect(JSON.stringify(tilted.style)).not.toContain("extrusion");
  });

  it("maps regionFill gradient ramp to per-province match fill-color with empty fallback", () => {
    const r = buildMapLibreScene(
      {
        presentation: "flat", view: baseView,
        layers: [{ id: "r", type: "regionFill", name: "热度", visible: true, style: { color: "#32d6ff", opacity: 0.85, size: 12, colorMode: "gradient", colors: { min: "#000010", mid: "#0080ff", max: "#66ffff", empty: "#0a0a14" } } }],
      },
      [{ province: "广东省", score: 92 }, { province: "西藏自治区", score: 31 }],
      { category: "province", value: "score" }, {}, chinaFixture,
    );
    expect(r.errors).toEqual([]);
    expect(r.regionValues).toEqual({ "广东省": 92, "西藏自治区": 31 });
    const fill = (r.style.layers as any[]).find((l) => l.type === "fill");
    expect(fill).toBeTruthy();
    expect(fill.minzoom).toBeUndefined();
    expect(fill.maxzoom).toBeUndefined();
    const painted = JSON.stringify(fill.paint["fill-color"]);
    expect(painted).toContain("广东省");
    expect(painted).toContain("西藏自治区");
    expect(painted).toContain("#0a0a14");
    expect(fill.paint["fill-opacity"]).toBe(0.85);
    expect(JSON.stringify(fill.paint["fill-color"])).toContain("feature-state");
  });

  it("maps segments mode to quantized colors and layer zoom window", () => {
    const r = buildMapLibreScene(
      {
        presentation: "flat", view: baseView,
        layers: [{ id: "r", type: "regionFill", name: "分段", visible: true, style: { color: "#32d6ff", opacity: 1, size: 12, colorMode: "segments", segments: 4, colors: { min: "#000000", mid: "#808080", max: "#ffffff" } }, minZoom: 2, maxZoom: 6 }],
      },
      [{ province: "广东省", score: 92 }, { province: "西藏自治区", score: 31 }, { province: "浙江省", score: 61 }],
      { category: "province", value: "score" }, {}, chinaFixture,
    );
    const fill = (r.style.layers as any[]).find((l) => l.type === "fill");
    expect(fill.minzoom).toBe(2);
    expect(fill.maxzoom).toBe(6);
    const painted = JSON.stringify(fill.paint["fill-color"]);
    expect(painted).toContain("广东省");
    const grad = buildMapLibreScene(
      { presentation: "flat", view: baseView, layers: [{ id: "r", type: "regionFill", name: "渐变", visible: true, style: { color: "#32d6ff", opacity: 1, size: 12, colorMode: "gradient", colors: { min: "#000000", mid: "#808080", max: "#ffffff" } } }] },
      [{ province: "广东省", score: 92 }, { province: "西藏自治区", score: 31 }, { province: "浙江省", score: 61 }],
      { category: "province", value: "score" }, {}, chinaFixture,
    );
    const gradFill = (grad.style.layers as any[]).find((l) => l.type === "fill");
    expect(painted).not.toBe(JSON.stringify(gradFill.paint["fill-color"]));
  });

  it("reports legacy flat behavior with no data and honors flags", () => {
    const r = buildMapLibreScene(
      { presentation: "flat", view: { ...baseView, dragEnabled: false, zoomEnabled: false, showLabels: false }, drill: { enabled: false }, layers: [] },
      [], undefined, {}, chinaFixture,
    );
    expect(r.errors).toEqual([]);
    expect(r.style.pitch).toBe(0);
    const fill = (r.style.layers as any[]).find((l) => l.type === "fill");
    expect(JSON.stringify(fill.paint["fill-color"])).not.toContain("feature-state");
    expect(fill.paint["fill-color"]).toBe("#32d6ff");
    expect(r.flags).toEqual({ dragEnabled: false, zoomEnabled: false, showLabels: false, drillEnabled: false });
    expect(r.labels.map((l) => l.name).sort()).toEqual(["广东省", "浙江省", "西藏自治区"]);
    expect(r.labels[0].centroid.every((n) => typeof n === "number")).toBe(true);
  });

  it("surfaces missing column errors like the legacy builder", () => {
    const r = buildMapLibreScene(
      { presentation: "flat", view: baseView, layers: [{ id: "r", type: "regionFill", name: "缺失", visible: true, style: { color: "#336699", opacity: 1, size: 12 } }] },
      [], {}, {}, chinaFixture,
    );
    expect(r.errors.join(" ")).toContain("区域填色需要配置区域名称与数值字段映射");
  });
});
