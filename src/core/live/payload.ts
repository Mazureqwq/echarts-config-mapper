import type { ChartData, ChartType } from "@/core/model/types";
import { matrixToChartData, validateChartData } from "@/core/chart/chartData";
import type { ChartDataResult, PipelineMap } from "./pipeline";

export type PayloadResult = { ok: true; data: ChartData } | { ok: false; message: string };

function rowText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function rowNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** Map processed dataset rows into chart data without changing the saved chart spec. */
export function buildChartDataFromRows(
  rows: Array<Record<string, unknown>>,
  map: PipelineMap | undefined,
  type: ChartType
): ChartDataResult {
  const first = rows[0] ?? {};
  const keys = Object.keys(first);
  const categoryField = map?.category || keys[0] || "";
  const valueField = map?.value || keys.find((key) => key !== categoryField && rows.some((row) => rowNumber(row[key]) !== 0)) || keys[1] || "";
  const seriesField = map?.seriesField || "";
  const categories: string[] = [];
  const groupNames: string[] = [];
  for (const row of rows) {
    const category = categoryField ? rowText(row[categoryField]) : "";
    if (!categories.includes(category)) categories.push(category);
    const group = seriesField ? rowText(row[seriesField]) : "数值";
    if (!groupNames.includes(group)) groupNames.push(group);
  }

  let data: ChartData;
  if (type === "pie" || type === "map") {
    data = { kind: "nameValue", rows: rows.map((row) => ({ name: categoryField ? rowText(row[categoryField]) : "", value: valueField ? rowNumber(row[valueField]) : 0 })) };
  } else if (type === "scatter") {
    data = { kind: "xy", rows: rows.map((row) => ({ x: categoryField ? rowNumber(row[categoryField]) : 0, y: valueField ? rowNumber(row[valueField]) : 0, ...(seriesField ? { group: rowText(row[seriesField]) } : {}) })) };
  } else if (type === "radar") {
    const series = groupNames.map((group) => ({
      name: group,
      values: categories.map((category) => rows.filter((row) => rowText(row[categoryField]) === category && (!seriesField || rowText(row[seriesField]) === group)).reduce((sum, row) => sum + rowNumber(row[valueField]), 0)),
    }));
    const indicators = categories.map((name, index) => {
      const max = Math.max(0, ...series.map((entry) => entry.values[index] ?? 0));
      return { name, max: max > 0 ? Math.ceil(max * 1.2) : 100 };
    });
    data = { kind: "radar", indicators, series };
  } else {
    const series = groupNames.map((group) => ({
      name: group,
      values: categories.map((category) => rows.filter((row) => rowText(row[categoryField]) === category && (!seriesField || rowText(row[seriesField]) === group)).reduce((sum, row) => sum + rowNumber(row[valueField]), 0)),
    }));
    data = { kind: "category", categories, series };
  }
  const count = rows.length;
  return { ok: true, data, counts: { raw: count, filtered: count, selected: count, sorted: count, limited: count } };
}

const KIND_SET = new Set(["category", "nameValue", "xy", "radar"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isChartDataLike(raw: unknown): raw is ChartData {
  return isRecord(raw) && KIND_SET.has(String(raw.kind));
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** 一维标量数组：按图表类型落成合理形状 */
function scalarsToChartData(values: number[], type: ChartType): ChartData {
  const names = values.map((_, i) => String(i + 1));
  switch (type) {
    case "pie":
    case "map":
      return { kind: "nameValue", rows: values.map((v, i) => ({ name: names[i], value: v })) };
    case "scatter":
      return { kind: "xy", rows: values.map((v, i) => ({ x: i + 1, y: v })) };
    case "radar":
      return {
        kind: "radar",
        indicators: names.map((name, i) => ({
          name,
          max: Math.max(1, Math.ceil((values[i] ?? 0) * 1.2)),
        })),
        series: [{ name: "系列1", values }],
      };
    default:
      return { kind: "category", categories: names, series: [{ name: "数值", values }] };
  }
}

const HEADER_TYPES = new Set<ChartType>(["line", "bar", "radar"]);

/** 这些类型把首行当系列名/指标名，其余类型首行就是数据 */
function withHeaderRow(type: ChartType): boolean {
  return HEADER_TYPES.has(type);
}

/**
 * 把接口返回的载荷归一成 ChartData。支持四种形态：
 *   1. 完整 ChartData（带 kind）
 *   2. 二维表：首行表头
 *   3. 对象数组：[{月份, 销量}] → 字段名做表头
 *   4. 一维标量数组：[10, 20] → 单列
 * 失败时返回中文可读原因，不再把 JS 报错抛给用户。
 */
export function toChartData(raw: unknown, type: ChartType): PayloadResult {
  if (raw === null || raw === undefined) {
    return { ok: false, message: "接口没有返回数据" };
  }

  if (isChartDataLike(raw)) {
    return validateChartData(raw)
      ? { ok: true, data: raw }
      : { ok: false, message: "返回的图表数据结构不合法" };
  }

  if (Array.isArray(raw)) {
    if (raw.length === 0) return { ok: false, message: "接口返回了空数组" };

    let matrix: string[][];

    if (raw.every((row) => Array.isArray(row))) {
      matrix = (raw as unknown[][]).map((row) => row.map(cell));
    } else if (raw.every((row) => isRecord(row))) {
      // 对象数组：字段顺序取第一行的键
      const keys = Object.keys(raw[0] as Record<string, unknown>);
      if (!keys.length) return { ok: false, message: "对象数组里的对象没有字段" };
      const body = (raw as Record<string, unknown>[]).map((row) => keys.map((k) => cell(row[k])));
      // category / radar 的首行是系列名，pie / map / scatter 的首行就是数据（与 matrixToChartData 约定一致）
      matrix = withHeaderRow(type) ? [keys, ...body] : body;
    } else if (raw.every((v) => typeof v === "number" || typeof v === "boolean" || typeof v === "string")) {
      const numbers = raw.map((v) => Number(v)).map((n) => (Number.isFinite(n) ? n : 0));
      const data = scalarsToChartData(numbers, type);
      return validateChartData(data)
        ? { ok: true, data }
        : { ok: false, message: "一维数组无法映射成当前图表类型" };
    } else {
      return {
        ok: false,
        message: "数组元素类型混杂，需要二维表、对象数组或纯数值数组",
      };
    }

    const data = matrixToChartData(matrix, type);
    return validateChartData(data)
      ? { ok: true, data }
      : { ok: false, message: "返回的数据形状不符合当前图表类型的要求" };
  }

  if (isRecord(raw)) {
    return {
      ok: false,
      message: "返回的是单个对象，需要数组（对象数组或二维表），或用 dataPath 取到数组",
    };
  }

  return { ok: false, message: "无法识别的数据格式（需要二维表、对象数组或图表数据）" };
}
