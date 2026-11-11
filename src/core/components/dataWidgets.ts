import type { DatasetBinding } from "@/core/model/types";

export type DataTableFormat = "text" | "number" | "percent";
export type KpiFormat = "number" | "currency" | "percent";
export type KpiAggregation = "first" | "sum" | "average";
export type DataRow = Record<string, unknown>;

export function buildProgressRows(
  rows: readonly DataRow[],
  labelField: string,
  valueField: string,
  maxValue: number
): Array<{ label: string; value: number; percent: number }> {
  const normalizedMax = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 100;
  return rows.flatMap((row) => {
    const value = asFiniteNumber(row[valueField]);
    if (value === null) return [];
    const rawLabel = row[labelField];
    const label = rawLabel === null || rawLabel === undefined || (typeof rawLabel === "string" && !rawLabel.trim())
      ? "—"
      : asText(rawLabel).trim() || "—";
    return [{ label, value, percent: Math.min(100, Math.max(0, (value / normalizedMax) * 100)) }];
  });
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch { return "[对象]"; }
  }
  return String(value);
}

export function formatWidgetValue(value: unknown, format: DataTableFormat | KpiFormat): string {
  if (format === "text") return asText(value);
  const number = asFiniteNumber(value);
  if (number === null) return "—";
  if (format === "percent") {
    return new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 2 }).format(number);
  }
  if (format === "currency") {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(number);
  }
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(number);
}

export function emitDataTableRowSelect(
  emitEvent: (name: string, payload: unknown) => void,
  row: DataRow,
  index: number
): void {
  emitEvent("rowSelect", { row, index });
}

export function aggregateKpi(rows: readonly DataRow[], field: string, aggregation: KpiAggregation): number {
  const values = rows.map((row) => asFiniteNumber(row[field])).filter((value): value is number => value !== null);
  if (!values.length) return 0;
  if (aggregation === "first") return values[0];
  const sum = values.reduce((total, value) => total + value, 0);
  return aggregation === "average" ? sum / values.length : sum;
}

/** Apply the same declared equality binding to widget and legacy-chart rows. */
export function filterRowsByBinding<T extends DataRow>(
  rows: readonly T[],
  binding: DatasetBinding | undefined,
  variables: Readonly<Record<string, unknown>>
): T[] {
  const filter = binding?.filterBy;
  if (!filter || !filter.field.trim() || !filter.globalVariable.trim() || !Object.prototype.hasOwnProperty.call(variables, filter.globalVariable)) return [...rows];
  const expected = variables[filter.globalVariable];
  const expectedText = expected === null || expected === undefined ? "" : String(expected);
  return rows.filter((row) => {
    const actual = row[filter.field];
    return (actual === null || actual === undefined ? "" : String(actual)) === expectedText;
  });
}
