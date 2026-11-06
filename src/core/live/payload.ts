import type { ChartData, ChartType } from "@/core/model/types";
import { matrixToChartData, validateChartData } from "@/core/chart/chartData";

export type PayloadResult = { ok: true; data: ChartData } | { ok: false; message: string };

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
