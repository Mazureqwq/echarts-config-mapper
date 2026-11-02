import { describe, expect, it } from "vitest";
import { slugifyName } from "../src/utils/slug";

describe("slugifyName", () => {
  it("空白替换为连字符并剔除路径非法字符", () => {
    expect(slugifyName("基础 折线/图")).toBe("基础-折线图");
  });

  it("结果为空时返回默认 fallback", () => {
    expect(slugifyName("///")).toBe("chart");
  });

  it("支持自定义 fallback", () => {
    expect(slugifyName("***", "asset")).toBe("asset");
  });

  it("截断到 40 字符", () => {
    expect(slugifyName("a".repeat(60)).length).toBe(40);
  });

  it("去除首尾空白", () => {
    expect(slugifyName("  趋势图  ")).toBe("趋势图");
  });

  it("剔除全部 Windows 非法字符", () => {
    expect(slugifyName("a\\b:c*d?e\"f<g>h|i")).toBe("abcdefghi");
  });
});
