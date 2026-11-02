import { describe, expect, test } from "vitest";
import { isAllowedSavePath } from "../server/savePathGuard";

describe("isAllowedSavePath", () => {
  test("白名单内合法路径返回 true", () => {
    expect(isAllowedSavePath("src/assets/library/a-b.chart.json")).toBe(true);
    expect(isAllowedSavePath("src/assets/screens/x.screen.json")).toBe(true);
  });

  test("相对路径穿越被拒绝", () => {
    expect(isAllowedSavePath("src/assets/library/../../package.json")).toBe(false);
  });

  test("绝对路径被拒绝", () => {
    expect(isAllowedSavePath("E:/x.json")).toBe(false);
    expect(isAllowedSavePath("E:\\x.json")).toBe(false);
    expect(isAllowedSavePath("/etc/passwd.json")).toBe(false);
  });

  test("非 json 扩展名被拒绝", () => {
    expect(isAllowedSavePath("src/assets/library/a.png")).toBe(false);
  });

  test("白名单外目录被拒绝", () => {
    expect(isAllowedSavePath("src/assets/geo/china.json")).toBe(false);
  });

  test("反斜杠归一为斜杠后命中白名单", () => {
    expect(isAllowedSavePath("src\\assets\\library\\a.chart.json")).toBe(true);
  });

  test("文件名段为空被拒绝", () => {
    expect(isAllowedSavePath("src/assets/screens/")).toBe(false);
    expect(isAllowedSavePath("src/assets/screens//x.json")).toBe(false);
  });
});
