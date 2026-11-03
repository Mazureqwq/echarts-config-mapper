import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadWorkspace,
  saveWorkspace,
  exportJson,
  importJson,
} from "../src/core/storage/workspaceRepo";
import {
  createWorkspace,
  createScreen,
  createChartAsset,
  createChartSpec,
} from "../src/core/model/schema";
import { ImportError, StorageQuotaError } from "../src/core/model/errors";

function memStorage() {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
    _map: map,
  };
}

let store: ReturnType<typeof memStorage>;

beforeEach(() => {
  store = memStorage();
  vi.stubGlobal("localStorage", store);
});

describe("storage/workspaceRepo", () => {
  it("save→load 往返相等", () => {
    const ws = createWorkspace();
    ws.screens.push(createScreen("大屏A"));
    saveWorkspace(ws);
    expect(loadWorkspace()).toEqual(ws);
  });

  it("配额超限抛 StorageQuotaError 且上一次保存的数据完好", () => {
    const ws1 = createWorkspace();
    ws1.screens.push(createScreen("旧数据"));
    saveWorkspace(ws1);
    store.setItem = () => {
      const e = new Error("quota exceeded");
      e.name = "QuotaExceededError";
      throw e;
    };
    const ws2 = createWorkspace();
    ws2.screens.push(createScreen("新数据"));
    expect(() => saveWorkspace(ws2)).toThrow(StorageQuotaError);
    store.setItem = (k: string, v: string) => {
      store._map.set(k, v);
    };
    expect(loadWorkspace().screens[0].name).toBe("旧数据");
  });

  it("importJson 解析失败抛 ImportError 且现有数据不动", () => {
    const ws = createWorkspace();
    ws.screens.push(createScreen("保留"));
    saveWorkspace(ws);
    expect(() => importJson("not json", "replace")).toThrow(ImportError);
    expect(loadWorkspace().screens[0].name).toBe("保留");
  });

  it("merge 导入单个大屏生成新 id", () => {
    const screen = createScreen("外部大屏");
    const result = importJson(exportJson(screen), "merge");
    expect(result.screens).toHaveLength(1);
    expect(result.screens[0].id).not.toBe(screen.id);
    expect(result.screens[0].name).toBe("外部大屏");
  });

  it("replace 导入整个工作区往返相等并落盘", () => {
    const ws = createWorkspace();
    ws.screens.push(createScreen("S1"));
    ws.assets.push(createChartAsset("A1", createChartSpec("pie")));
    const result = importJson(exportJson(ws), "replace");
    expect(result.screens.map((s) => s.name)).toEqual(["S1"]);
    expect(result.assets.map((a) => a.name)).toEqual(["A1"]);
    expect(loadWorkspace().screens).toHaveLength(1);
    expect(loadWorkspace().assets).toHaveLength(1);
  });
});
