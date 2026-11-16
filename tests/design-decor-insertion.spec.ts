import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick, watchEffect } from "vue";
import { useDocumentStore } from "../src/stores/documentStore";
import { useWorkspaceStore } from "../src/stores/workspaceStore";
import { createScreen } from "../src/core/model/schema";
import { decorDragPayload, parseDecorDragPayload } from "../src/workbench/decorActions";
import { getDecorEntry, listDecorEntries } from "../src/core/design/decorations";
import type { ImageItem } from "../src/core/model/types";

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
  };
}

function seedScreen(width = 1600, height = 900) {
  const ws = useWorkspaceStore();
  const doc = useDocumentStore();
  const screen = createScreen("装饰素材测试");
  screen.canvas.width = width;
  screen.canvas.height = height;
  ws.workspace.screens.push(screen);
  doc.currentScreenId = screen.id;
  // 应用里 WorkbenchView 打开大屏时会建基线快照（History.canUndo 要求 index > 0），
  // 撤销类用例必须复现这一步，否则第一次 commit 后根本没有可回退的状态。
  doc.initHistory();
  return { ws, doc, screen };
}

beforeEach(() => {
  vi.useRealTimers();
  vi.stubGlobal("localStorage", memStorage());
  setActivePinia(createPinia());
});

describe("documentStore.insertDecoration（T17）", () => {
  it("插入装饰元素，并压到已有元素下面（装饰是背景层）", () => {
    const { doc, screen } = seedScreen();
    const chartId = doc.addChart("bar");
    expect(screen.items[0]!.id).toBe(chartId);

    const ids = doc.insertDecoration("decor-border-bracket");
    expect(ids).toHaveLength(1);
    // unshift：装饰排在图表之前（更靠底层）
    expect(screen.items[0]!.id).toBe(ids[0]);
    expect(screen.items.map((item) => item.id)).toContain(chartId);
  });

  it("大屏边框铺满画布", () => {
    const { doc, screen } = seedScreen(1280, 720);
    const [id] = doc.insertDecoration("decor-border-tick-rail");
    const item = screen.items.find((entry) => entry.id === id) as ImageItem;
    expect(item.frame).toMatchObject({ x: 0, y: 0, w: 1280, h: 720 });
  });

  it("装饰强调色跟随当前屏幕主题", () => {
    const { doc, screen } = seedScreen();
    doc.applyTheme("business-light");
    const [id] = doc.insertDecoration("decor-panel-glass");
    const item = screen.items.find((entry) => entry.id === id) as ImageItem;
    // business-light 的 accent 是 #3478f6
    expect(atob(item.src.split(",")[1] ?? "")).toContain("#3478f6");
  });

  it("插入后可撤销（走 commit）", () => {
    const { doc, screen } = seedScreen();
    doc.insertDecoration("decor-orn-rings");
    expect(screen.items).toHaveLength(1);
    doc.undo();
    expect(screen.items).toHaveLength(0);
  });

  it("每个内置装饰在 1600×900 画布上都能成功插入", () => {
    const { doc, screen } = seedScreen();
    for (const entry of listDecorEntries()) {
      const ids = doc.insertDecoration(entry.id);
      expect(ids.length, `${entry.id} 插入失败`).toBe(1);
    }
    expect(screen.items).toHaveLength(listDecorEntries().length);
    // id 全部唯一
    const ids = screen.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("未知 id 不插入、不报错", () => {
    const { doc, screen } = seedScreen();
    expect(doc.insertDecoration("decor-nope")).toEqual([]);
    expect(screen.items).toHaveLength(0);
  });

  it("没有当前大屏时返回空数组", () => {
    const doc = useDocumentStore();
    expect(doc.insertDecoration("decor-panel-glass")).toEqual([]);
  });
});

describe("撤销/重做可用态必须是响应式的（T17 顺带修复）", () => {
  /**
   * `history` 是 `markRaw` 的（避免 Pinia 深度代理 History 实例），
   * 因此 `history.canUndo` 本身**不可追踪**。TopBar 的撤销按钮又只依赖它，
   * 结果是：编辑之后按钮仍然禁用，用户点不动撤销。
   * 修法是在 store 上暴露可追踪的 getter。
   */
  it("初始不可撤销，首次编辑后 canUndo 变 true", () => {
    const { doc } = seedScreen();
    expect(doc.canUndo).toBe(false);
    doc.insertDecoration("decor-orn-rings");
    expect(doc.canUndo).toBe(true);
    expect(doc.canRedo).toBe(false);
  });

  it("撤销后 canUndo / canRedo 随之翻转", () => {
    const { doc } = seedScreen();
    doc.insertDecoration("decor-orn-rings");
    doc.undo();
    expect(doc.canUndo).toBe(false);
    expect(doc.canRedo).toBe(true);
    doc.redo();
    expect(doc.canUndo).toBe(true);
    expect(doc.canRedo).toBe(false);
  });

  it("canUndo 的读取会建立响应式依赖（读它能追踪到变化）", async () => {
    const { doc } = seedScreen();
    const seen: boolean[] = [];
    const stop = watchEffect(() => {
      seen.push(doc.canUndo);
    });
    doc.insertDecoration("decor-orn-rings");
    // watchEffect 的副作用重跑是异步调度的，等一次 tick 再断言
    await nextTick();
    stop();
    expect(seen).toEqual([false, true]);
  });
});

describe("装饰拖拽载荷（T17）", () => {
  const sample = getDecorEntry("decor-title-angled")!;

  it("合法条目生成 {kind,id} 两字段载荷", () => {
    const payload = decorDragPayload(sample);
    expect(JSON.parse(payload!.data)).toEqual({ kind: "decor", id: "decor-title-angled" });
  });

  it("解析回来一致", () => {
    const payload = decorDragPayload(sample)!;
    expect(parseDecorDragPayload(payload.data)).toEqual({ kind: "decor", id: "decor-title-angled" });
  });

  it("拒绝非法输入：非对象 / 未知 id / 多带字段 / 错 kind / 坏 JSON", () => {
    expect(decorDragPayload(null)).toBeNull();
    expect(decorDragPayload({ id: "decor-nope" })).toBeNull();
    expect(decorDragPayload({ id: 42 })).toBeNull();

    expect(parseDecorDragPayload("{")).toBeNull();
    expect(parseDecorDragPayload(JSON.stringify({ kind: "decor", id: "decor-nope" }))).toBeNull();
    expect(parseDecorDragPayload(JSON.stringify({ kind: "decor", id: "decor-title-angled", extra: 1 }))).toBeNull();
    expect(parseDecorDragPayload(JSON.stringify({ kind: "block", id: "decor-title-angled" }))).toBeNull();
    expect(parseDecorDragPayload("[]")).toBeNull();
  });
});
