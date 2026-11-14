import { describe, expect, it } from "vitest";
import { buildMapLegend } from "../src/core/components/mapScene";

const rows = [
  { province: "广东省", score: 92 },
  { province: "西藏自治区", score: 31 },
  { province: "浙江省", score: 78 },
];
const fields = { category: "province", value: "score" };

describe("map color ramp and legend", () => {
  it("formats legend entries with valueFormat and omits hidden layers", () => {
    expect(buildMapLegend({
      valueFormat: { decimals: 1, suffix: " 分" }, legend: { show: true, position: "top-right", mode: "continuous" },
      layers: [{ id: "r", type: "regionFill", name: "热度", visible: true, style: { colorMode: "gradient", colors: { min: "#000010", mid: "#0080ff", max: "#66ffff" } } }],
    }, rows, fields)).toEqual([{ from: "31.0 分", to: "92.0 分", stops: ["#000010", "#0080ff", "#66ffff"] }]);
    expect(buildMapLegend({ legend: { show: false, position: "top-right", mode: "continuous" }, layers: [] }, [], undefined)).toEqual([]);
    expect(buildMapLegend({ legend: { show: true, position: "top-right", mode: "continuous" }, layers: [] }, [], undefined)).toEqual([]);
  });

});
