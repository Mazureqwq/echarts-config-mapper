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
});
