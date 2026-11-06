import { describe, it, expect } from "vitest";
import { resolveDataPath } from "../src/core/live/dataPath";
import { toChartData } from "../src/core/live/payload";

const payload = {
  code: 0,
  result: {
    rows: [
      { month: "一月", value: 10, extra: { score: 1 } },
      { month: "二月", value: 20, extra: { score: 2 } },
    ],
    meta: { total: 2 },
  },
};

describe("live/dataPath 扩展语法", () => {
  it("点路径与数字下标仍然可用（向后兼容）", () => {
    expect(resolveDataPath(payload, "result.rows.0.value")).toBe(10);
    expect(resolveDataPath(payload, "result.meta.total")).toBe(2);
  });

  it("方括号下标 a[0].b", () => {
    expect(resolveDataPath(payload, "result.rows[1].value")).toBe(20);
    expect(resolveDataPath(payload, "result.rows[0].extra.score")).toBe(1);
  });

  it("通配 [*] 把嵌套字段投影成扁平数组", () => {
    expect(resolveDataPath(payload, "result.rows[*].value")).toEqual([10, 20]);
    expect(resolveDataPath(payload, "result.rows[*].month")).toEqual(["一月", "二月"]);
    expect(resolveDataPath(payload, "result.rows[*].extra.score")).toEqual([1, 2]);
  });

  it("[*] 取整段数组", () => {
    expect(resolveDataPath(payload, "result.rows[*]")).toHaveLength(2);
  });

  it("通配作用在非数组上返回 undefined", () => {
    expect(resolveDataPath(payload, "result.meta[*].total")).toBeUndefined();
  });

  it("通配中途缺失的键会被跳过", () => {
    const data = { rows: [{ v: 1 }, {}, { v: 3 }] };
    expect(resolveDataPath(data, "rows[*].v")).toEqual([1, 3]);
  });

  it("空路径与缺失路径行为不变", () => {
    expect(resolveDataPath(payload, "")).toBe(payload);
    expect(resolveDataPath(payload, undefined)).toBe(payload);
    expect(resolveDataPath(payload, "nope.deep")).toBeUndefined();
  });
});

describe("live/payload 载荷归一", () => {
  it("二维表（首行表头）", () => {
    const r = toChartData(
      [["月份", "销量"], ["一月", 10], ["二月", 20]],
      "bar"
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual({
      kind: "category",
      categories: ["一月", "二月"],
      series: [{ name: "销量", values: [10, 20] }],
    });
  });

  it("对象数组自动推断成二维表（回归：以前报 header.slice is not a function）", () => {
    const r = toChartData(
      [
        { 月份: "一月", 销量: 10, 利润: 3 },
        { 月份: "二月", 销量: 20, 利润: 6 },
      ],
      "line"
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual({
      kind: "category",
      categories: ["一月", "二月"],
      series: [
        { name: "销量", values: [10, 20] },
        { name: "利润", values: [3, 6] },
      ],
    });
  });

  it("对象数组用于饼图走 nameValue（第一列名 + 第二列值）", () => {
    const r = toChartData([{ 渠道: "线上", 占比: 60 }], "pie");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual({ kind: "nameValue", rows: [{ name: "线上", value: 60 }] });
  });

  it("一维数值数组（配合 rows[*].value）", () => {
    const r = toChartData([10, 20, 30], "line");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.kind).toBe("category");
    if (r.data.kind !== "category") return;
    expect(r.data.categories).toEqual(["1", "2", "3"]);
    expect(r.data.series[0].values).toEqual([10, 20, 30]);
  });

  it("一维数组给饼图/散点图也能落成合理形状", () => {
    const pie = toChartData([1, 2], "pie");
    expect(pie.ok && pie.data.kind).toBe("nameValue");
    const scatter = toChartData([1, 2], "scatter");
    expect(scatter.ok && scatter.data.kind).toBe("xy");
  });

  it("完整 ChartData 原样通过", () => {
    const data = { kind: "nameValue" as const, rows: [{ name: "A", value: 1 }] };
    const r = toChartData(data, "pie");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual(data);
  });

  it("空/无法识别的载荷给出人话错误", () => {
    expect(toChartData(null, "line")).toMatchObject({ ok: false });
    expect(toChartData([], "line")).toEqual({ ok: false, message: "接口返回了空数组" });
    const single = toChartData({ a: 1 }, "line");
    expect(single.ok).toBe(false);
    if (single.ok) return;
    expect(single.message).toContain("数组");
    expect(toChartData("文本", "line")).toMatchObject({ ok: false });
  });
});
