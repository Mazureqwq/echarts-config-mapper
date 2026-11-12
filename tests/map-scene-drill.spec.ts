import { describe, expect, it } from "vitest";
import { computeRegionCenter, interpolateDrillView } from "../src/core/components/mapScene";

const fixture = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "测试省" },
      geometry: { type: "Polygon", coordinates: [[[100, 30], [110, 30], [110, 40], [100, 40], [100, 30]]] },
    },
    {
      type: "Feature",
      properties: { name: "群岛省" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
          [[[100, 100], [120, 100], [120, 120], [100, 120], [100, 100]]],
        ],
      },
    },
    {
      type: "Feature",
      properties: { name: "组合省" },
      geometry: { type: "GeometryCollection", geometries: [{ type: "Point", coordinates: [5, 5] }, { type: "Point", coordinates: [15, 15] }] },
    },
  ],
};

describe("map drill helpers", () => {
  it("computes the bbox center for polygon multi polygon and geometry collection features", () => {
    expect(computeRegionCenter(fixture, "测试省")).toEqual([105, 35]);
    expect(computeRegionCenter(fixture, "群岛省")).toEqual([60, 60]);
    expect(computeRegionCenter(fixture, "组合省")).toEqual([10, 10]);
  });

  it("returns null for unknown or empty geometries", () => {
    expect(computeRegionCenter(fixture, "不存在省")).toBeNull();
    expect(computeRegionCenter(undefined, "测试省")).toBeNull();
    expect(computeRegionCenter({ features: [{ properties: { name: "空" }, geometry: { type: "Polygon", coordinates: [] } }] }, "空")).toBeNull();
  });

  it("interpolates center and zoom with clamped t", () => {
    const from = { center: [104, 35] as [number, number], zoom: 1 };
    const to = { center: [120, 30] as [number, number], zoom: 5 };
    expect(interpolateDrillView(from, to, 0)).toEqual(from);
    expect(interpolateDrillView(from, to, 1)).toEqual(to);
    expect(interpolateDrillView(from, to, 0.5)).toEqual({ center: [112, 32.5], zoom: 3 });
    expect(interpolateDrillView(from, to, -1)).toEqual(from);
    expect(interpolateDrillView(from, to, 9)).toEqual(to);
  });
});
