import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWorkspaceStore } from "../src/stores/workspaceStore";
import { useDocumentStore } from "../src/stores/documentStore";
import { createScreen } from "../src/core/model/schema";
import { getSuite } from "../src/core/design/suites";
import type { ComponentItem } from "../src/core/model/types";

/**
 * Task 15 store 层：套件套用与「新建元素继承套件」的端到端行为。
 */

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

beforeEach(() => {
  vi.useRealTimers();
  vi.stubGlobal("localStorage", memStorage());
  setActivePinia(createPinia());
});

function seed() {
  const ws = useWorkspaceStore();
  const doc = useDocumentStore();
  const screen = createScreen("套件测试屏");
  ws.workspace.screens.push(screen);
  doc.currentScreenId = screen.id;
  doc.initHistory();
  return { ws, doc, screen };
}

describe("documentStore.applySuite（T15 P1-3）", () => {
  it("套用套件：写入 suiteId 与画布背景", () => {
    const { doc } = seed();
    const result = doc.applySuite("jade");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("山地绿洲");
    const screen = doc.currentScreen!;
    expect(screen.suiteId).toBe("jade");
    expect(screen.canvas.background).toEqual({ kind: "color", color: getSuite("jade")!.canvas });
  });

  it("套用套件不改动已有元素（关键边界）", () => {
    const { doc } = seed();
    doc.addComponent("chartforge.kpi", 1);
    const before = JSON.stringify(doc.currentScreen!.items);

    doc.applySuite("nebula");

    expect(JSON.stringify(doc.currentScreen!.items)).toBe(before);
  });

  it("未知套件被拒绝且不改动屏幕", () => {
    const { doc } = seed();
    const before = JSON.stringify(doc.currentScreen);
    const result = doc.applySuite("bogus");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("未知套件");
    expect(JSON.stringify(doc.currentScreen)).toBe(before);
  });

  it("未打开大屏时给出可读提示", () => {
    setActivePinia(createPinia());
    const doc = useDocumentStore();
    expect(doc.applySuite("jade")).toEqual({ ok: false, message: "请先打开一个大屏。" });
  });

  it("套用可撤销（进历史栈）", () => {
    const { doc } = seed();
    doc.applySuite("jade");
    expect(doc.currentScreen!.suiteId).toBe("jade");
    doc.undo();
    expect(doc.currentScreen!.suiteId).toBeUndefined();
  });

  it("currentSuiteId 未设置时回退默认套件", () => {
    const { doc } = seed();
    expect(doc.currentSuiteId()).toBe("deep-sea");
    doc.applySuite("parchment");
    expect(doc.currentSuiteId()).toBe("parchment");
  });
});

describe("新建元素继承当前套件（T15 P1-3）", () => {
  it("套件确定后新建标题栏使用套件强调色", () => {
    const { doc } = seed();
    doc.applySuite("sandstone");
    const id = doc.addComponent("chartforge.section-title", 1);
    const item = doc.currentScreen!.items.find((entry) => entry.id === id) as ComponentItem;
    expect(item.props.accentColor).toBe(getSuite("sandstone")!.accent);
  });

  it("没有颜色 props 的组件（KPI）不被注入幽灵键", () => {
    const { doc } = seed();
    doc.applySuite("sandstone");
    const id = doc.addComponent("chartforge.kpi", 1);
    const item = doc.currentScreen!.items.find((entry) => entry.id === id) as ComponentItem;
    expect("color" in item.props).toBe(false);
  });

  it("新建地图直接落地套件 quickStyle", () => {
    const { doc } = seed();
    doc.applySuite("contour");
    const id = doc.addComponent("chartforge.map-scene-flat", 1);
    const item = doc.currentScreen!.items.find((entry) => entry.id === id) as ComponentItem;
    const quickStyle = item.props.quickStyle as { id: string };
    expect(quickStyle.id).toBe("contour");
  });

  it("未设置套件时新建元素回退默认套件，不会留空", () => {
    const { doc } = seed();
    const id = doc.addComponent("chartforge.section-title", 1);
    const item = doc.currentScreen!.items.find((entry) => entry.id === id) as ComponentItem;
    expect(item.props.accentColor).toBe(getSuite("deep-sea")!.accent);
  });

  it("切换套件后再新建，用新套件；老元素保持原样", () => {
    const { doc } = seed();
    doc.applySuite("jade");
    const first = doc.addComponent("chartforge.section-title", 1);
    const firstColor = (doc.currentScreen!.items.find((e) => e.id === first) as ComponentItem).props.accentColor;

    doc.applySuite("parchment");
    const second = doc.addComponent("chartforge.section-title", 1);
    const items = doc.currentScreen!.items as ComponentItem[];

    expect(items.find((e) => e.id === first)!.props.accentColor).toBe(firstColor);
    expect(items.find((e) => e.id === second)!.props.accentColor).toBe(getSuite("parchment")!.accent);
    expect(firstColor).not.toBe(getSuite("parchment")!.accent);
  });
});
