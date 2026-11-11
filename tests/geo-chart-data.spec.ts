import { describe, expect, it } from "vitest";
import { buildGeoChartDataFromRows } from "../src/core/chart/geoData";

describe("buildGeoChartDataFromRows", () => {
  it("maps numeric and numeric-string coordinates into geographic scatter points", () => {
    const result = buildGeoChartDataFromRows(
      [{ lng: "114.17", lat: 22.31, city: "香港", weight: "7" }],
      { longitude: "lng", latitude: "lat", name: "city", value: "weight" },
      "geoScatter"
    );
    expect(result).toEqual({
      ok: true,
      data: { kind: "geoScatter", rows: [{ longitude: 114.17, latitude: 22.31, name: "香港", value: 7 }] },
      invalidRows: 0,
    });
  });

  it("accepts inclusive longitude/latitude bounds and skips rows outside them", () => {
    const result = buildGeoChartDataFromRows(
      [
        { lng: -180, lat: -90 },
        { lng: 180, lat: 90 },
        { lng: 180.01, lat: 0 },
        { lng: 0, lat: -90.01 },
        { lng: "", lat: 1 },
        { lng: NaN, lat: 1 },
      ],
      { longitude: "lng", latitude: "lat" },
      "geoScatter"
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: "geoScatter",
        rows: [
          { longitude: -180, latitude: -90 },
          { longitude: 180, latitude: 90 },
        ],
      },
      invalidRows: 4,
    });
  });

  it("requires finite heat intensity and never turns invalid values into zero", () => {
    const result = buildGeoChartDataFromRows(
      [{ lng: 114, lat: 22, intensity: "3.5" }, { lng: 113, lat: 23, intensity: "NaN" }],
      { longitude: "lng", latitude: "lat", value: "intensity" },
      "geoHeatmap"
    );
    expect(result).toMatchObject({
      ok: true,
      data: { kind: "geoHeatmap", rows: [{ longitude: 114, latitude: 22, value: 3.5 }] },
      invalidRows: 1,
    });
  });

  it("builds OD lines with [longitude, latitude] origin and destination pairs", () => {
    const result = buildGeoChartDataFromRows(
      [{ ox: "113.9", oy: "22.3", dx: 114.2, dy: 22.5, route: "A→B", trips: 12 }],
      {
        originLongitude: "ox", originLatitude: "oy",
        destinationLongitude: "dx", destinationLatitude: "dy",
        name: "route", value: "trips",
      },
      "geoFlow"
    );
    expect(result).toEqual({
      ok: true,
      data: { kind: "geoFlow", rows: [{ from: [113.9, 22.3], to: [114.2, 22.5], name: "A→B", value: 12 }] },
      invalidRows: 0,
    });
  });

  it("reports missing required mappings and all-invalid non-empty input; accepts an empty valid dataset", () => {
    expect(buildGeoChartDataFromRows([{ lng: 1 }], undefined, "geoHeatmap")).toMatchObject({ ok: false, message: expect.any(String) });
    const invalid = buildGeoChartDataFromRows(
      [{ lng: 999, lat: 22, intensity: 1 }],
      { longitude: "lng", latitude: "lat", value: "intensity" },
      "geoHeatmap"
    );
    expect(invalid).toMatchObject({ ok: false, message: expect.any(String), invalidRows: 1 });
    expect(buildGeoChartDataFromRows([], { longitude: "lng", latitude: "lat", value: "intensity" }, "geoHeatmap"))
      .toEqual({ ok: true, data: { kind: "geoHeatmap", rows: [] }, invalidRows: 0 });
  });
});
