import { describe, expect, it } from "vitest";
import { getByPath, hasPath, setByPath, toPath, unsetByPath } from "../src/utils/object";

describe("toPath", () => {
  it("解析点号与下标", () => {
    expect(toPath("series.0.data")).toEqual(["series", 0, "data"]);
    expect(toPath("a.b[1].c")).toEqual(["a", "b", 1, "c"]);
  });
});

describe("getByPath", () => {
  const source = { a: { b: [{ c: 1 }] } };
  it("读取嵌套值", () => {
    expect(getByPath(source, "a.b.0.c")).toBe(1);
  });
  it("缺失时返回 fallback", () => {
    expect(getByPath(source, "a.x.y", "def")).toBe("def");
  });
});

describe("setByPath", () => {
  it("不可变写入且不修改原对象", () => {
    const source = { a: { b: 1 } };
    const next = setByPath(source, "a.b", 2);
    expect(next.a.b).toBe(2);
    expect(source.a.b).toBe(1);
  });
  it("自动创建缺失层级", () => {
    const next = setByPath({} as any, "series.0.lineStyle.width", 3);
    expect(next.series[0].lineStyle.width).toBe(3);
  });
  it("支持数组下标写入", () => {
    const next = setByPath({ list: [1, 2] }, "list.1", 9);
    expect(next.list).toEqual([1, 9]);
  });
});

describe("unsetByPath", () => {
  it("删除键并保持不可变", () => {
    const source = { a: { b: 1, c: 2 } };
    const next = unsetByPath(source, "a.b");
    expect(hasPath(next, "a.b")).toBe(false);
    expect(source.a.b).toBe(1);
  });
});
