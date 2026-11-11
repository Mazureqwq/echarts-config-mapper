import type { ChartData, ChartType, DatasetPipeline, GeoFieldMapping, LiveFilterOp, LiveSource } from "@/core/model/types";
import { toChartData } from "./payload";

export type Row = Record<string, unknown>;

/** 加工链每一步的行数，调试台用它告诉用户「哪一步把数据吃掉了」 */
export interface PipelineCounts {
  raw: number;
  filtered: number;
  selected: number;
  sorted: number;
  limited: number;
}

export type PipelineResult =
  | { ok: true; rows: Row[]; counts: PipelineCounts }
  | { ok: false; message: string; counts: PipelineCounts };

export type ChartDataResult =
  | { ok: true; data: ChartData; counts: PipelineCounts }
  | { ok: false; message: string; counts: PipelineCounts };

export interface PipelineMap {
  category?: string;
  value?: string;
  seriesField?: string;
  geo?: GeoFieldMapping;
}

const WRAPPER_KEYS = ["data", "list", "rows", "items", "result", "records"];

function isRow(v: unknown): v is Row {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function emptyCounts(raw = 0): PipelineCounts {
  return { raw, filtered: raw, selected: raw, sorted: raw, limited: raw };
}

/**
 * 把接口返回摊成对象行（与调试台的字段推断共用同一套规则）：
 * 数组 → 对象行；常见封装 { data / list / rows ... } 逐层下钻；标量 → { value }。
 */
/** 二维表（首行表头）→ 对象行；这样过滤/选列对 Excel 风格的接口同样可用 */
function matrixToRows(matrix: unknown[][]): Row[] {
  if (!matrix.length) return [];
  const header = matrix[0].map((c) => asText(c));
  return matrix.slice(1).map((cells) => {
    const out: Row = {};
    header.forEach((key, i) => {
      if (key) out[key] = cells[i];
    });
    return out;
  });
}

export function toRows(raw: unknown): Row[] {
  if (Array.isArray(raw)) {
    if (raw.length && raw.every((item) => Array.isArray(item))) {
      return matrixToRows(raw as unknown[][]);
    }
    return raw.map((item) => (isRow(item) ? item : { value: item }));
  }
  if (isRow(raw)) {
    for (const key of WRAPPER_KEYS) {
      const v = raw[key];
      if (Array.isArray(v)) return toRows(v);
      if (isRow(v)) {
        const inner = toRows(v);
        const keys = Object.keys(v);
        const firstIsArray = keys.length > 0 && Array.isArray(v[keys[0]]);
        if (firstIsArray || inner.length !== 1) return inner;
      }
    }
    return [raw];
  }
  if (raw === null || raw === undefined) return [];
  return [{ value: raw }];
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** 单条过滤条件：数字能转就按数值比，否则按字符串比 */
export function matchFilter(row: Row, f: { field: string; op: LiveFilterOp; value: string }): boolean {
  const left = row[f.field];
  const right = f.value ?? "";
  switch (f.op) {
    case "notEmpty":
      return !isEmpty(left);
    case "in": {
      const list = right
        .split(/[,|]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!list.length) return true;
      return list.includes(asText(left).trim());
    }
    case "contains":
      return asText(left).toLowerCase().includes(right.toLowerCase());
    case "eq":
      return asText(left).trim() === right.trim();
    case "ne":
      return asText(left).trim() !== right.trim();
    default: {
      if (isEmpty(left)) return false;
      const a = asNumber(left);
      const b = asNumber(right);
      const cmp =
        a !== null && b !== null ? (a === b ? 0 : a < b ? -1 : 1) : asText(left).localeCompare(right);
      switch (f.op) {
        case "gt":
          return cmp > 0;
        case "gte":
          return cmp >= 0;
        case "lt":
          return cmp < 0;
        case "lte":
          return cmp <= 0;
        default:
          return true;
      }
    }
  }
}

/** 多条条件为 AND；缺字段的行直接淘汰 */
export function applyFilter(
  rows: Row[],
  filters: Array<{ field: string; op: LiveFilterOp; value: string }> | undefined
): Row[] {
  if (!filters?.length) return rows;
  return rows.filter((row) => filters.every((f) => matchFilter(row, f)));
}

/** 列投影：只留指定列且保序 */
export function applySelect(rows: Row[], select: string[] | undefined): Row[] {
  if (!select?.length) return rows;
  return rows.map((row) => {
    const out: Row = {};
    for (const key of select) {
      if (key in row) out[key] = row[key];
    }
    return out;
  });
}

/** 稳定排序：数值优先按数值，缺失值沉底 */
export function applySort(rows: Row[], sort: { field: string; desc?: boolean } | undefined): Row[] {
  if (!sort?.field) return rows;
  const field = sort.field;
  const sign = sort.desc ? -1 : 1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      const a = x.row[field];
      const b = y.row[field];
      const aEmpty = isEmpty(a);
      const bEmpty = isEmpty(b);
      if (aEmpty && bEmpty) return x.index - y.index;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      const na = asNumber(a);
      const nb = asNumber(b);
      const cmp =
        na !== null && nb !== null
          ? na === nb
            ? 0
            : na < nb
              ? -1
              : 1
          : asText(a).localeCompare(asText(b));
      return cmp === 0 ? x.index - y.index : cmp * sign;
    })
    .map((x) => x.row);
}

export function applyLimit(rows: Row[], limit: number | undefined): Row[] {
  if (!limit || limit <= 0) return rows;
  return rows.slice(0, limit);
}

/**
 * long → wide：把「一行一个组合」的数据透成「一行一个分类、一列一个系列」。
 * 缺失组合补 0，保证多系列长度一致（ECharts 里不会出现断线）。
 */
export function pivotBySeries(rows: Row[], map: PipelineMap): Row[] {
  const cat = map.category ?? "";
  const val = map.value ?? "";
  const series = map.seriesField ?? "";
  if (!cat || !val || !series) return rows;

  const categories: string[] = [];
  const seriesNames: string[] = [];
  const cells = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const c = asText(row[cat]);
    const s = asText(row[series]);
    const v = asNumber(row[val]) ?? 0;
    if (!cells.has(c)) {
      cells.set(c, new Map());
      categories.push(c);
    }
    if (!seriesNames.includes(s)) seriesNames.push(s);
    cells.get(c)!.set(s, v);
  }

  return categories.map((c) => {
    const out: Row = { [cat]: c };
    for (const s of seriesNames) out[s] = cells.get(c)?.get(s) ?? 0;
    return out;
  });
}

/** 单个对象只有包在已知封套里（{ data: [...] }）才算有行，否则是「没写 dataPath」的典型误用 */
function isWrapperRecord(raw: unknown): boolean {
  if (!isRow(raw)) return false;
  return WRAPPER_KEYS.some((key) => Array.isArray(raw[key]) || isRow(raw[key]));
}

/** 纯内存加工链：过滤 → 选列 → 排序 → 取前 N */
export function runPipeline(raw: unknown, source: DatasetPipeline | undefined): PipelineResult {
  if (isRow(raw) && !isWrapperRecord(raw)) {
    return {
      ok: false,
      counts: emptyCounts(1),
      message: "返回的是单个对象，需要数组（对象数组或二维表），或用 dataPath 取到数组",
    };
  }
  const rows = toRows(raw);
  const counts = emptyCounts(rows.length);
  if (!source) return { ok: true, rows, counts };

  const filtered = applyFilter(rows, source.filter);
  counts.filtered = filtered.length;
  const selected = applySelect(filtered, source.select);
  counts.selected = selected.length;
  const sorted = applySort(selected, source.sort);
  counts.sorted = sorted.length;
  const limited = applyLimit(sorted, source.limit);
  counts.limited = limited.length;

  if (!limited.length) {
    return {
      ok: false,
      counts,
      message: rows.length ? "过滤 / 取前 N 之后没有数据了，检查一下条件" : "接口没有返回可用的行数据",
    };
  }
  return { ok: true, rows: limited, counts };
}

/** 字段映射：分类 / 数值 / 系列字段 → 图表能直接吃的形状 */
export function applyMap(rows: Row[], map: PipelineMap | undefined): Row[] {
  if (!map) return rows;
  const { category, value, seriesField } = map;
  if (seriesField && category && value) return pivotBySeries(rows, map);
  if (category && value) {
    return rows.map((row) => ({ [category]: row[category], [value]: row[value] }));
  }
  if (category) return rows.map((row) => ({ [category]: row[category] }));
  return rows;
}

/** 完整链路：原始载荷 → 行加工 → 字段映射 → ChartData */
export function buildChartData(
  raw: unknown,
  source: LiveSource | undefined,
  type: ChartType
): ChartDataResult {
  const piped = runPipeline(raw, source);
  if (!piped.ok) return { ok: false, message: piped.message, counts: piped.counts };
  const isGeoType = type === "geoScatter" || type === "geoHeatmap" || type === "geoFlow";
  const mapped = isGeoType ? piped.rows : applyMap(piped.rows, source?.map);
  const result = toChartData(mapped, type, isGeoType ? source?.map?.geo : undefined);
  return result.ok
    ? { ok: true, data: result.data, counts: piped.counts }
    : { ok: false, message: result.message, counts: piped.counts };
}
