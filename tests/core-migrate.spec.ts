import { describe, it, expect } from "vitest";
import { migrate } from "../src/core/model/migrate";
import { ImportError } from "../src/core/model/errors";

describe("model/migrate 版本迁移", () => {
  it("version:1 的合法工作区原样规范化返回", () => {
    const ws = migrate({ version: 1, assets: [], screens: [], settings: { autosave: true } });
    expect(ws.version).toBe(1);
    expect(ws.screens).toEqual([]);
  });

  it("空对象抛 ImportError", () => {
    expect(() => migrate({})).toThrow(ImportError);
  });

  it("未来版本抛 ImportError", () => {
    expect(() => migrate({ version: 99 })).toThrow(ImportError);
  });

  it("缺 version 的旧格式不识别时抛 ImportError 而非部分写入", () => {
    expect(() => migrate({ screens: [] })).toThrow(ImportError);
  });

  it("version:1 但字段残缺时由规范化补齐", () => {
    const ws = migrate({ version: 1, screens: [{ id: "a" }] });
    expect(ws.screens[0].name).toBe("未命名大屏");
    expect(ws.assets).toEqual([]);
  });
});
