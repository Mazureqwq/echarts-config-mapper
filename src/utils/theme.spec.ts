import { describe, expect, it } from "vitest";
import { sameOption, toDarkTheme, toLightTheme } from "./theme";

describe("theme 互转", () => {
  it("深色文字转成浅底可读的深色文字", () => {
    const dark = { title: { textStyle: { color: "#E6EAF2" } } };
    expect(toLightTheme(dark).title.textStyle.color).toBe("#1f2937");
  });

  it("大小写不敏感", () => {
    const dark = { a: { color: "#e6eaf2" } };
    expect(toLightTheme(dark).a.color).toBe("#1f2937");
  });

  it("浅色转回深色可与原值一致", () => {
    const dark = { title: { textStyle: { color: "#E6EAF2" } }, axis: { color: "#8A94A6" } };
    const round = toDarkTheme(toLightTheme(dark));
    expect(round).toEqual(dark);
  });

  it("只改颜色字符串，不动数值与结构", () => {
    const option = { series: [{ data: [1, 2, 3], name: "x" }], n: 12 };
    const light = toLightTheme(option);
    expect(light.series[0].data).toEqual([1, 2, 3]);
    expect(light.n).toBe(12);
  });

  it("不修改入参对象", () => {
    const option = { color: "#E6EAF2" };
    toLightTheme(option);
    expect(option.color).toBe("#E6EAF2");
  });

  it("sameOption 比较结构相等", () => {
    expect(sameOption({ a: 1 }, { a: 1 })).toBe(true);
    expect(sameOption({ a: 1 }, { a: 2 })).toBe(false);
  });
});
