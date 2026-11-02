import { describe, expect, test } from "vitest";
import { formatDateTime } from "../src/core/format";

describe("formatDateTime", () => {
  const d = new Date(2026, 0, 2, 3, 4, 5);

  test("完整 token：YYYY-MM-DD HH:mm:ss", () => {
    expect(formatDateTime(d, "YYYY-MM-DD HH:mm:ss")).toBe("2026-01-02 03:04:05");
  });

  test("缺省 fmt 同值", () => {
    expect(formatDateTime(d)).toBe("2026-01-02 03:04:05");
  });

  test("中文格式 YYYY年MM月DD日", () => {
    expect(formatDateTime(d, "YYYY年MM月DD日")).toBe("2026年01月02日");
  });

  test("个位数值补零", () => {
    expect(formatDateTime(new Date(2026, 10, 30, 23, 5, 0), "YYYY-MM-DD HH:mm:ss")).toBe(
      "2026-11-30 23:05:00",
    );
  });
});
