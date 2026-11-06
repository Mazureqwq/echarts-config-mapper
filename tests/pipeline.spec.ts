import { describe, it, expect } from "vitest";
import {
  toRows,
  applyFilter,
  applySelect,
  applySort,
  applyLimit,
  pivotBySeries,
  runPipeline,
  buildChartData,
} from "../src/core/live/pipeline";
import type { LiveSource } from "../src/core/model/types";

const rows = [
  { 月份: "一月", 渠道: "线上", 销量: 10 },
  { 月份: "一月", 渠道: "线下", 销量: 4 },
  { 月份: "二月", 渠道: "线上", 销量: 22 },
  { 月份: "二月", 渠道: "线下", 销量: 8 },
  { 月份: "三月", 渠道: "线上", 销量: 15 },
];

const base: LiveSource = { url: "", path: "/api", intervalSec: 30 };

describe("live/pipeline 行桥接", () => {
  it("对象数组原样成行，标量包成 value 列", () => {
    expect(toRows([{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(toRows([5, 6])).toEqual([{ value: 5 }, { value: 6 }]);
    expect(toRows({ data: { list: [{ a: 1 }] } })).toEqual([{ a: 1 }]);
    expect(toRows(null)).toEqual([]);
  });
});

describe("live/pipeline 行过滤", () => {
  it("数字比较按数值而不是字典序", () => {
    expect(applyFilter(rows, [{ field: "销量", op: "gt", value: "9" }])).toHaveLength(3);
    expect(applyFilter(rows, [{ field: "销量", op: "gte", value: "10" }])).toHaveLength(3);
    expect(applyFilter(rows, [{ field: "销量", op: "lt", value: "10" }])).toHaveLength(2);
  });

  it("字符串相等、包含、in 与 notEmpty", () => {
    expect(applyFilter(rows, [{ field: "渠道", op: "eq", value: "线下" }])).toHaveLength(2);
    expect(applyFilter(rows, [{ field: "月份", op: "ne", value: "一月" }])).toHaveLength(3);
    expect(applyFilter(rows, [{ field: "月份", op: "contains", value: "二" }])).toHaveLength(2);
    expect(applyFilter(rows, [{ field: "渠道", op: "in", value: "线上, 线下" }])).toHaveLength(5);
    expect(applyFilter(rows, [{ field: "渠道", op: "in", value: "线上" }])).toHaveLength(3);
    expect(applyFilter([{ a: 1 }, { a: "" }, { a: null }], [{ field: "a", op: "notEmpty", value: "" }])).toHaveLength(1);
  });

  it("多条条件是 AND，缺失字段一律过滤掉", () => {
    const out = applyFilter(rows, [
      { field: "渠道", op: "eq", value: "线上" },
      { field: "销量", op: "gte", value: "15" },
    ]);
    expect(out.map((r) => r.月份)).toEqual(["二月", "三月"]);
    expect(applyFilter(rows, [{ field: "不存在", op: "eq", value: "x" }])).toHaveLength(0);
  });
});

describe("live/pipeline 选列 / 排序 / 取前 N", () => {
  it("选列保序且不改变行数", () => {
    const out = applySelect(rows, ["销量", "月份"]);
    expect(Object.keys(out[0])).toEqual(["销量", "月份"]);
    expect(out).toHaveLength(rows.length);
  });

  it("排序支持升降序，缺失值排最后", () => {
    const asc = applySort(rows, { field: "销量" });
    expect(asc[0].销量).toBe(4);
    expect(asc[asc.length - 1].销量).toBe(22);
    const desc = applySort(rows, { field: "销量", desc: true });
    expect(desc[0].销量).toBe(22);
    const withMissing = applySort([{ a: 1 }, {}, { a: 3 }], { field: "a" });
    expect(withMissing[withMissing.length - 1].a).toBeUndefined();
  });

  it("取前 N 行", () => {
    expect(applyLimit(rows, 2)).toHaveLength(2);
    expect(applyLimit(rows, 0)).toHaveLength(5);
  });
});

describe("live/pipeline 透视", () => {
  it("long → wide：字段名变成系列名，缺失组合补 0", () => {
    const wide = pivotBySeries(rows, { category: "月份", value: "销量", seriesField: "渠道" });
    expect(wide).toEqual([
      { 月份: "一月", 线上: 10, 线下: 4 },
      { 月份: "二月", 线上: 22, 线下: 8 },
      { 月份: "三月", 线上: 15, 线下: 0 },
    ]);
  });
});

describe("live/pipeline 全链路", () => {
  it("每步行数可以回放给调试台", () => {
    const res = runPipeline(rows, {
      ...base,
      filter: [{ field: "渠道", op: "eq", value: "线上" }],
      sort: { field: "销量", desc: true },
      limit: 2,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.counts).toEqual({ raw: 5, filtered: 3, selected: 3, sorted: 3, limited: 2 });
    expect(res.rows.map((r) => r.销量)).toEqual([22, 15]);
  });

  it("过滤后为空时给出人话原因", () => {
    const res = runPipeline(rows, { ...base, filter: [{ field: "渠道", op: "eq", value: "不存在" }] });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toContain("没有数据");
  });

  it("字段映射把任意列名映射成分类/数值列", () => {
    const raw = [{ t: "一月", v: 3 }, { t: "二月", v: 5 }];
    const res = buildChartData(raw, { ...base, map: { category: "t", value: "v" } }, "bar");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toEqual({
      kind: "category",
      categories: ["一月", "二月"],
      series: [{ name: "v", values: [3, 5] }],
    });
  });

  it("seriesField 透视为多系列", () => {
    const res = buildChartData(rows, {
      ...base,
      map: { category: "月份", value: "销量", seriesField: "渠道" },
    }, "line");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = res.data;
    if (data.kind !== "category") throw new Error("应为 category");
    expect(data.categories).toEqual(["一月", "二月", "三月"]);
    expect(data.series.map((s) => s.name)).toEqual(["线上", "线下"]);
    expect(data.series[1].values).toEqual([4, 8, 0]);
  });

  it("无映射时沿用原有自动推断", () => {
    const res = buildChartData([{ 名称: "A", 数量: 2 }], base, "pie");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toEqual({ kind: "nameValue", rows: [{ name: "A", value: 2 }] });
  });
});
