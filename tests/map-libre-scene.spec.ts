import { describe, expect, it } from "vitest";
import {
  applyViewOffset,
  buildChinaOutline,
  formatScaleDistance,
  haversineMeters,
  normalizeMapSceneProps,
  pickScaleBarDistance,
} from "../src/core/components/mapScene";
import { buildMapLibreScene, formatMapTooltipText } from "../src/core/components/mapLibreScene";
import chinaGeo from "../src/assets/geo/china.json";

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
    expect((r.style.light as any)?.intensity).toBeGreaterThan(0);
    expect((r.style.sky as any)?.["sky-color"]).toBeTruthy();
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

  it("exposes legend entries and tooltip texts shared by workbench and offline runtime", () => {
    const r = buildMapLibreScene(
      {
        presentation: "flat", view: baseView,
        valueFormat: { decimals: 0, suffix: " 分" },
        legend: { show: true, position: "top-right", mode: "continuous" },
        emphasis: { areaColor: "#ff0000", borderColor: "#00ff00", labelColor: "#ffffff" },
        selected: { areaColor: "#00ffff", borderColor: "#ffffff" },
        layers: [{ id: "r", type: "regionFill", name: "热度", visible: true, style: { color: "#32d6ff", opacity: 0.85, size: 12, colorMode: "gradient", colors: { min: "#000010", mid: "#0080ff", max: "#66ffff", empty: "#0a0a14" } } }],
      },
      [{ province: "广东省", score: 92 }, { province: "西藏自治区", score: 31 }],
      { category: "province", value: "score" }, {}, chinaFixture,
    );
    expect(r.legend.show).toBe(true);
    expect(r.legend.position).toBe("top-right");
    expect(r.legend.mode).toBe("continuous");
    expect(r.legend.entries).toEqual([{ from: "31 分", to: "92 分", stops: ["#000010", "#0080ff", "#66ffff"] }]);
    expect(r.tooltip.show).toBe(true);
    expect(r.tooltip.texts["广东省"]).toBe("广东省：92 分");
    expect(r.tooltip.texts["西藏自治区"]).toBe("西藏自治区：31 分");
    const line = (r.style.layers as any[]).find((l) => l.id === "cf-line");
    const lineColor = JSON.stringify(line.paint["line-color"]);
    expect(lineColor).toContain("cf_hover");
    expect(lineColor).toContain("cf_selected");
    expect(lineColor).toContain("#00ff00");
    expect(lineColor).toContain("#ffffff");
  });

  it("switches legend mode to segments when the color ramp is segmented", () => {
    const r = buildMapLibreScene(
      {
        presentation: "flat", view: baseView,
        valueFormat: { decimals: 0, suffix: " 分" },
        legend: { show: true, position: "top-right", mode: "continuous" },
        layers: [{ id: "r", type: "regionFill", name: "分段", visible: true, style: { color: "#32d6ff", opacity: 1, size: 12, colorMode: "segments", segments: 2, colors: { min: "#000000", mid: "#808080", max: "#ffffff" } } }],
      },
      [{ province: "广东省", score: 92 }, { province: "西藏自治区", score: 31 }],
      { category: "province", value: "score" }, {}, chinaFixture,
    );
    expect(r.legend.mode).toBe("segments");
    expect(r.legend.entries).toHaveLength(2);
    expect((r.legend.entries[0] as any).color).toBe("#000000");
    expect((r.legend.entries[1] as any).color).toBe("#ffffff");
  });

  it("formats region tooltip text in one shared way", () => {
    expect(formatMapTooltipText("广东省", 92, { decimals: 0, suffix: " 分" })).toBe("广东省：92 分");
    expect(formatMapTooltipText("西藏自治区", null)).toBe("西藏自治区：—");
  });
});

describe("T8 视觉质感共享语义", () => {
  const twoSquares = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "A" }, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } },
      { type: "Feature", properties: { name: "B" }, geometry: { type: "Polygon", coordinates: [[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]] } },
    ],
  };

  it("rebuilds the country outline from unshared edges only", () => {
    const outline = buildChinaOutline(twoSquares);
    expect(outline.type).toBe("FeatureCollection");
    expect(outline.features).toHaveLength(1);
    const geometry = outline.features[0].geometry;
    expect(geometry.type).toBe("MultiLineString");
    expect(geometry.coordinates).toHaveLength(1);
    const ring = geometry.coordinates[0]!;
    // 共享边（x=1）被剔除，只剩 6 条外缘边 + 闭合点
    expect(ring).toHaveLength(7);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    const xs = ring.map((point) => point[0]);
    const ys = ring.map((point) => point[1]);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(2);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(1);
    const three = buildChinaOutline(chinaFixture);
    expect(three.features[0].geometry.coordinates).toHaveLength(3);
  });

  it("rebuilds the exact national outline from the provincial union", () => {
    const outline = buildChinaOutline(chinaGeo);
    expect(outline.features).toHaveLength(1);
    const rings = outline.features[0].geometry.coordinates;
    // 精确外环只有两条：大陆（含海南）与台湾
    expect(rings).toHaveLength(2);
    const mainland = rings.reduce((a, b) => (a.length >= b.length ? a : b));
    expect(mainland.length).toBeGreaterThan(500);
    const xs = mainland.map((point) => point[0]);
    const ys = mainland.map((point) => point[1]);
    expect(Math.min(...xs)).toBeLessThan(74);
    expect(Math.max(...xs)).toBeGreaterThan(134);
    expect(Math.min(...ys)).toBeLessThan(19);
    expect(Math.max(...ys)).toBeGreaterThan(53);
    const taiwan = rings.find((ring) => ring !== mainland)!;
    const taiwanXs = taiwan.map((point) => point[0]);
    const taiwanYs = taiwan.map((point) => point[1]);
    expect(Math.min(...taiwanXs)).toBeGreaterThan(119);
    expect(Math.max(...taiwanXs)).toBeLessThan(123);
    expect(Math.min(...taiwanYs)).toBeGreaterThan(21);
    expect(Math.max(...taiwanYs)).toBeLessThan(26);
    // 行政区缝隙（甘肃—宁夏、广东—香港）不产生独立外环
    const within = (ring: number[][], box: [number, number, number, number]) => {
      const rx = ring.map((point) => point[0]);
      const ry = ring.map((point) => point[1]);
      return Math.min(...rx) >= box[0] && Math.max(...rx) <= box[2] && Math.min(...ry) >= box[1] && Math.max(...ry) <= box[3];
    };
    for (const ring of rings) {
      expect(within(ring, [105.8, 35.3, 106.2, 35.6])).toBe(false);
      expect(within(ring, [114.3, 22.3, 114.7, 22.6])).toBe(false);
      expect(within(ring, [113.8, 22.3, 114.2, 22.6])).toBe(false);
    }
  });

  it("converts a view offset into a camera center offset", () => {
    const viewport = { width: 1000, height: 500 };
    const shifted = applyViewOffset([104, 35], 2, { x: 20, y: 10 }, viewport);
    expect(shifted[0]).toBeLessThan(104);
    expect(shifted[1]).toBeGreaterThan(35);
    expect(applyViewOffset([104, 35], 2, { x: 0, y: 0 }, viewport)).toEqual([104, 35]);
    expect(applyViewOffset([104, 35], 2, undefined, viewport)).toEqual([104, 35]);
  });

  it("measures ground distance and picks a nice scale bar distance", () => {
    expect(haversineMeters([120, 30], [120, 30])).toBe(0);
    expect(haversineMeters([120, 30], [121, 30])).toBeGreaterThan(95000);
    expect(haversineMeters([120, 30], [121, 30])).toBeLessThan(97000);
    expect(pickScaleBarDistance(0.5, 100)).toEqual({ meters: 50, pixels: 100, text: "50 m" });
    expect(pickScaleBarDistance(30, 100)).toEqual({ meters: 2000, pixels: 2000 / 30, text: "2 km" });
    expect(formatScaleDistance(500)).toBe("500 m");
    expect(formatScaleDistance(1500)).toBe("1.5 km");
    expect(formatScaleDistance(2000)).toBe("2 km");
  });

  it("adds the outline layer, hover transitions and scale bar config", () => {
    const r = buildMapLibreScene(
      {
        presentation: "flat", view: baseView,
        scaleBar: { show: true, position: "bottom-left" },
        label: { show: true, color: "#e7fbff", size: 10, minZoom: 2.5 },
        border: { color: "#8888ff", width: 2, type: "dashed", outline: { show: true, width: 3, color: "#ffd166" } },
        layers: [{ id: "r", type: "regionFill", name: "热度", visible: true, style: { color: "#32d6ff", opacity: 0.85, size: 12 } }],
      },
      [{ province: "广东省", score: 92 }], { category: "province", value: "score" }, {}, chinaFixture,
    );
    const layers = r.style.layers as any[];
    const outline = layers.find((layer) => layer.id === "cf-outline");
    expect(outline).toBeTruthy();
    expect(outline.source).toBe("china-outline");
    expect(outline.paint["line-color"]).toBe("#ffd166");
    expect(outline.paint["line-width"]).toBe(3);
    expect((r.style.sources as any)["china-outline"]).toBeTruthy();
    const fill = layers.find((layer) => layer.id === "cf-fill");
    expect(fill["fill-color-transition"]).toEqual({ duration: 180, delay: 0 });
    const line = layers.find((layer) => layer.id === "cf-line");
    expect(line["line-color-transition"]).toEqual({ duration: 180, delay: 0 });
    expect(r.scaleBar).toEqual({ show: true, position: "bottom-left" });
    expect(r.labelMinZoom).toBe(2.5);
  });

  it("keeps the v1 shape and normalizes the new v2 visual props", () => {
    const v1 = normalizeMapSceneProps({
      modelVersion: 1, presentation: "flat", pitch: 0,
      view: { center: [104, 35], zoom: 2, minZoom: 1, maxZoom: 8, dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622" },
      layers: [],
    });
    expect(v1.view.offset).toBeUndefined();
    expect(v1.scaleBar).toBeUndefined();
    expect(v1.label?.minZoom).toBeUndefined();
    expect(v1.border?.outline).toBeUndefined();
    const v2 = normalizeMapSceneProps({
      presentation: "flat", pitch: 0,
      view: { center: [104, 35], zoom: 2, minZoom: 1, maxZoom: 8, dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622", offset: { x: 150, y: -400 } },
      scaleBar: { show: true, position: "top-right" },
      label: { show: true, color: "#e7fbff", size: 10, minZoom: 3 },
      border: { color: "#8888ff", width: 2, type: "dashed", outline: { show: true, width: 99, color: "bad" } },
      layers: [],
    });
    expect(v2.view.offset).toEqual({ x: 100, y: -100 });
    expect(v2.scaleBar).toEqual({ show: true, position: "top-right" });
    expect(v2.label?.minZoom).toBe(3);
    expect(v2.border?.outline).toEqual({ show: true, width: 12, color: "#bfe9ff" });
  });
});
