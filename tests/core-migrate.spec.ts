import { describe, it, expect } from "vitest";
import { migrate } from "../src/core/model/migrate";
import { createItem } from "../src/core/model/schema";
import { ImportError } from "../src/core/model/errors";

describe("model/migrate 版本迁移", () => {
  it("version:1 迁移为 version:2 并默认补齐 datasets", () => {
    const ws = migrate({ version: 1, assets: [], screens: [], settings: { autosave: true } });
    expect(ws.version).toBe(2);
    expect(ws.datasets).toEqual([]);
    expect(ws.screens).toEqual([]);
  });

  it("接受 version:2 并规范化数据集，同时兼容缺省 datasets", () => {
    const ws = migrate({
      version: 2,
      datasets: [{ id: "d1", name: "静态", source: { kind: "static", data: [{ count: 1 }] } }],
    });
    expect(ws.version).toBe(2);
    expect(ws.datasets).toHaveLength(1);
    expect(ws.datasets[0]).toMatchObject({ id: "d1", source: { kind: "static", data: [{ count: 1 }] } });
    expect(migrate({ version: 2 }).datasets).toEqual([]);
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
  it("保留旧工作区中的图表、文本、图片和形状", () => {
    const items = [createItem("chart"), createItem("text"), createItem("image"), createItem("shape")];
    const workspace = migrate({
      version: 1,
      assets: [],
      screens: [{ id: "legacy-screen", items }],
      settings: { autosave: true },
    });

    expect(workspace.screens[0].items.map((item) => item.kind)).toEqual([
      "chart",
      "text",
      "image",
      "shape",
    ]);
  });
});
