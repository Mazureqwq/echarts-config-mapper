import type { GeoChartData, GeoChartType, GeoFieldMapping, GeoPoint, GeoHeatPoint, GeoFlowLine } from "../model/types";

export type GeoChartBuildResult =
  | { ok: true; data: GeoChartData; invalidRows: number }
  | { ok: false; message: string; invalidRows: number };

type GeoFieldKey = keyof GeoFieldMapping;

function field(mapping: GeoFieldMapping | undefined, key: GeoFieldKey): string {
  const value = mapping?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function optionalName(row: Record<string, unknown>, key: string): string | undefined {
  if (!key) return undefined;
  const value = row[key];
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const name = String(value).trim();
  return name || undefined;
}

function optionalValue(row: Record<string, unknown>, key: string): { valid: boolean; value?: number } {
  if (!key) return { valid: true };
  const value = numeric(row[key]);
  return value === null ? { valid: false } : { valid: true, value };
}

function validLongitude(value: number): boolean {
  return value >= -180 && value <= 180;
}

function validLatitude(value: number): boolean {
  return value >= -90 && value <= 90;
}

const FIELD_LABELS: Record<GeoFieldKey, string> = {
  longitude: "经度", latitude: "纬度", name: "名称", value: "数值",
  originLongitude: "起点经度", originLatitude: "起点纬度",
  destinationLongitude: "终点经度", destinationLatitude: "终点纬度",
};

function requiredFields(type: GeoChartType): GeoFieldKey[] {
  if (type === "geoFlow") {
    return ["originLongitude", "originLatitude", "destinationLongitude", "destinationLatitude"];
  }
  return type === "geoHeatmap" ? ["longitude", "latitude", "value"] : ["longitude", "latitude"];
}

/** Convert row-shaped values through explicit, serializable field mappings only. */
export function buildGeoChartDataFromRows(
  rows: readonly Record<string, unknown>[],
  mapping: GeoFieldMapping | undefined,
  type: GeoChartType
): GeoChartBuildResult {
  const missing = requiredFields(type).filter((key) => !field(mapping, key));
  if (missing.length) {
    return { ok: false, message: `缺少必需的地理字段映射：${missing.map((key) => FIELD_LABELS[key]).join("、")}`, invalidRows: 0 };
  }
  if (rows.length > 0) {
    const mappedColumns = Object.values(mapping ?? {}).flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : []);
    const absentColumns = [...new Set(mappedColumns.filter((column) =>
      rows.every((row) => !Object.prototype.hasOwnProperty.call(row, column))
    ))];
    if (absentColumns.length) {
      return { ok: false, message: `加工后缺少已映射的地理字段列：${absentColumns.join("、")}`, invalidRows: rows.length };
    }
  }

  let skipped = 0;
  const result: Array<GeoPoint | GeoHeatPoint | GeoFlowLine> = [];
  for (const row of rows) {
    let converted: GeoPoint | GeoHeatPoint | GeoFlowLine | null = null;
    if (type === "geoFlow") {
      const fromLongitude = numeric(row[field(mapping, "originLongitude")]);
      const fromLatitude = numeric(row[field(mapping, "originLatitude")]);
      const toLongitude = numeric(row[field(mapping, "destinationLongitude")]);
      const toLatitude = numeric(row[field(mapping, "destinationLatitude")]);
      const value = optionalValue(row, field(mapping, "value"));
      if (
        fromLongitude !== null && fromLatitude !== null && toLongitude !== null && toLatitude !== null &&
        validLongitude(fromLongitude) && validLatitude(fromLatitude) &&
        validLongitude(toLongitude) && validLatitude(toLatitude) && value.valid
      ) {
        converted = {
          from: [fromLongitude, fromLatitude],
          to: [toLongitude, toLatitude],
          ...(optionalName(row, field(mapping, "name")) ? { name: optionalName(row, field(mapping, "name")) } : {}),
          ...(value.value !== undefined ? { value: value.value } : {}),
        };
      }
    } else {
      const longitude = numeric(row[field(mapping, "longitude")]);
      const latitude = numeric(row[field(mapping, "latitude")]);
      const value = optionalValue(row, field(mapping, "value"));
      if (
        longitude !== null && latitude !== null && validLongitude(longitude) && validLatitude(latitude) && value.valid &&
        (type !== "geoHeatmap" || value.value !== undefined)
      ) {
        if (type === "geoHeatmap") {
          converted = { longitude, latitude, value: value.value! };
        } else {
          converted = {
            longitude,
            latitude,
            ...(optionalName(row, field(mapping, "name")) ? { name: optionalName(row, field(mapping, "name")) } : {}),
            ...(value.value !== undefined ? { value: value.value } : {}),
          };
        }
      }
    }
    if (converted) result.push(converted);
    else skipped++;
  }

  if (rows.length > 0 && result.length === 0) {
    return { ok: false, message: "没有可用的地理数据行，请检查经纬度范围与数值字段", invalidRows: skipped };
  }
  return {
    ok: true,
    data: { kind: type, rows: result } as GeoChartData,
    invalidRows: skipped,
  };
}
