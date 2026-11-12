import { describe, expect, it } from "vitest";
import { buildMapLegend, buildMapSceneOption } from "../src/core/components/mapScene";

const rows = [
  { province: "广东省", score: 92 },
  { province: "西藏自治区", score: 31 },
  { province: "浙江省", score: 78 },
];
const fields = { category: "province", value: "score" };

describe("map color ramp and legend", () => {
  it("builds a three-stop continuous visualMap from min/mid/max", () => {
    const result = buildMapSceneOption({
      valueFormat: { decimals: 0, suffix: " 分" },
      legend: { show: true, position: "top-right", mode: "continuous" },
      layers: [{ id: "r", type: "regionFill", name: "热度", visible: true, style: { color: "#32d6ff", opacity: 0.85, size: 12, colorMode: "gradient", colors: { min: "#000010", mid: "#0080ff", max: "#66ffff", empty: "#0a0a14" } } }],
    }, rows, fields);
    expect(result.errors).toEqual([]);
    const vm = (result.option.visualMap as any[])[0];
    expect(vm).toMatchObject({ show: false, type: "continuous", min: 31, max: 92 });
    expect(vm.inRange.colorStops).toEqual([
      { offset: 0, color: "#000010" }, { offset: 0.5, color: "#0080ff" }, { offset: 1, color: "#66ffff" },
    ]);
    expect((result.option.geo as any).regions?.[0]?.itemStyle.areaColor).toBe("#0a0a14");
  });

  it("builds piecewise segments with endpoint-inclusive ramp", () => {
    const result = buildMapSceneOption({
      layers: [{ id: "r", type: "regionFill", name: "热度", visible: true, style: { color: "#32d6ff", opacity: 1, size: 12, colorMode: "segments", segments: 4, colors: { min: "#000000", mid: "#808080", max: "#ffffff" } } }],
    }, rows, fields);
    const vm = (result.option.visualMap as any[])[0];
    expect(vm.type).toBe("piecewise");
    expect(vm.pieces).toHaveLength(4);
    expect(vm.pieces[0]).toMatchObject({ color: "#000000" });
    expect(vm.pieces[3]).toMatchObject({ color: "#ffffff" });
    expect(vm.pieces[1].color).toMatch(/^#/);
    expect(vm.pieces[1]).toHaveProperty("gt");
    expect(vm.pieces[1]).toHaveProperty("lte");
  });

  it("keeps legacy two-color visualMap when colorMode is absent", () => {
    const result = buildMapSceneOption({
      layers: [{ id: "r", type: "regionFill", name: "热度", visible: true, style: { color: "#336699", opacity: 1, size: 12 } }],
    }, rows, fields);
    const vm = (result.option.visualMap as any[])[0];
    expect(vm.type).toBeUndefined();
    expect(vm.inRange).toEqual({ color: ["#102b3d", "#336699"] });
    expect((result.option.geo as any).regions).toBeUndefined();
  });

  it("formats legend entries with valueFormat and omits hidden layers", () => {
    expect(buildMapLegend({
      valueFormat: { decimals: 1, suffix: " 分" }, legend: { show: true, position: "top-right", mode: "continuous" },
      layers: [{ id: "r", type: "regionFill", name: "热度", visible: true, style: { colorMode: "gradient", colors: { min: "#000010", mid: "#0080ff", max: "#66ffff" } } }],
    }, rows, fields)).toEqual([{ from: "31.0 分", to: "92.0 分", stops: ["#000010", "#0080ff", "#66ffff"] }]);
    expect(buildMapLegend({ legend: { show: false, position: "top-right", mode: "continuous" }, layers: [] }, [], undefined)).toEqual([]);
    expect(buildMapLegend({ legend: { show: true, position: "top-right", mode: "continuous" }, layers: [] }, [], undefined)).toEqual([]);
  });

  it("applies container label border hover selected and tooltip style groups", () => {
    const result = buildMapSceneOption({
      view: { showLabels: true },
      label: { show: true, color: "#eaffff", size: 13, stroke: "#010133", strokeWidth: 2, shadow: "#00ffff", shadowBlur: 6 },
      border: { color: "#8888ff", width: 2, type: "dashed" },
      emphasis: { areaColor: "#ff0000", borderColor: "#00ff00", labelColor: "#ffffff" },
      selected: { areaColor: "#00ffff", borderColor: "#ffffff" },
      tooltipStyle: { background: "#101820", borderColor: "#334455", color: "#ffffff", fontSize: 13 },
      layers: [{ id: "r", type: "regionFill", name: "热度", visible: true, style: { color: "#32d6ff", opacity: 1, size: 12 } }],
    }, rows, fields);
    const geo = result.option.geo as any;
    expect(geo.label).toMatchObject({ show: true, color: "#eaffff", fontSize: 13, stroke: "#010133", strokeWidth: 2, textShadowColor: "#00ffff", textShadowBlur: 6 });
    expect(geo.itemStyle).toMatchObject({ borderColor: "#8888ff", borderWidth: 2, borderType: "dashed" });
    expect(geo.emphasis).toMatchObject({ itemStyle: { areaColor: "#ff0000", borderColor: "#00ff00" }, label: { color: "#ffffff" } });
    expect(geo.select).toMatchObject({ itemStyle: { areaColor: "#00ffff", borderColor: "#ffffff" } });
    expect(geo.selectedMode).toBe("single");
    expect(result.option.tooltip).toMatchObject({ backgroundColor: "#101820", borderColor: "#334455", textStyle: { color: "#ffffff", fontSize: 13 } });
    const off = buildMapSceneOption({ view: { showLabels: false }, label: { show: true, color: "#eaffff", size: 13 }, layers: [] }, [], undefined);
    expect((off.option.geo as any).label.show).toBe(false);
  });

  it("keeps legacy container styles when v2 style groups are absent", () => {
    const result = buildMapSceneOption({ layers: [] }, [], undefined);
    const geo = result.option.geo as any;
    expect(geo.label).toEqual({ show: true, color: "#e7fbff", fontSize: 10 });
    expect(geo.itemStyle).toMatchObject({ borderColor: "#c0f3fb", borderWidth: 1 });
    expect(geo.emphasis).toEqual({ label: { color: "#ffffff" }, itemStyle: { areaColor: "rgba(0,254,233,0.6)" } });
    expect(geo.select).toBeUndefined();
    expect(result.option.tooltip).toEqual({ trigger: "item" });
  });

  it("applies per-layer border point labels and flyline animation", () => {
    const result = buildMapSceneOption({ layers: [
      { id: "r", type: "regionFill", name: "热度", visible: true, style: { color: "#336699", opacity: 1, size: 12, border: { color: "#aabbcc", width: 2, type: "dashed" } } },
      { id: "s", type: "geoScatter", name: "网点", visible: true, style: { color: "#ffcc66", opacity: 1, size: 12, label: { show: true, color: "#ffffff", size: 12, stroke: "#000000" } } },
      { id: "f", type: "geoFlow", name: "航线", visible: true, style: { color: "#32d6ff", opacity: 1, size: 8, animated: true } },
      { id: "f2", type: "geoFlow", name: "静线", visible: true, style: { color: "#32d6ff", opacity: 1, size: 8 } },
    ] }, [{ province: "广东省", score: 9, lng: 113.26, lat: 23.13, fromLng: 113.26, fromLat: 23.13, toLng: 114.17, toLat: 22.31 }],
    { category: "province", value: "score", geo: { longitude: "lng", latitude: "lat", originLongitude: "fromLng", originLatitude: "fromLat", destinationLongitude: "toLng", destinationLatitude: "toLat" } });
    const series = result.option.series as any[];
    expect(series[0].itemStyle).toMatchObject({ borderColor: "#aabbcc", borderWidth: 2, borderType: "dashed" });
    expect(series[1].label).toMatchObject({ show: true, color: "#ffffff", fontSize: 12, stroke: "#000000" });
    expect(series[2].effect).toMatchObject({ show: true, trailLength: 0.4 });
    expect(series[3].effect).toMatchObject({ show: false });
  });
});
