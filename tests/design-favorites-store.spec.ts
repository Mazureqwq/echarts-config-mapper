import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWorkspaceStore } from "../src/stores/workspaceStore";
import { createWorkspace, normalizeWorkspace } from "../src/core/model/schema";
import type { FavoriteRef } from "../src/core/design/favorites";

const KPI: FavoriteRef = { kind: "component", id: "chartforge.kpi", version: 1 };
const LAYOUT: FavoriteRef = { kind: "layout", id: "monitor-main-side" };

/** node 环境没有 localStorage，用内存实现顶上（与 style-clipboard-store.spec.ts 同法）。 */
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

describe("工作区持久化收藏（T16 P1-4）", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.stubGlobal("localStorage", memStorage());
    setActivePinia(createPinia());
  });

  it("新建工作区带空收藏列表（不是 undefined）", () => {
    expect(createWorkspace().favorites).toEqual([]);
  });

  it("旧工作区（没有 favorites 字段）读回来为空列表，不报错", () => {
    const legacy = { version: 2, assets: [], designAssets: [], screens: [], datasets: [], settings: { autosave: true } };
    expect(normalizeWorkspace(legacy).favorites).toEqual([]);
  });

  it("规范化时清洗脏收藏数据", () => {
    const raw = {
      version: 2,
      assets: [],
      designAssets: [],
      screens: [],
      datasets: [],
      settings: { autosave: true },
      favorites: [{ kind: "component", id: "chartforge.kpi", version: 1 }, { kind: "bogus", id: "x" }, { kind: "layout", id: "monitor-main-side" }, { kind: "layout", id: "monitor-main-side" }],
    };
    expect(normalizeWorkspace(raw).favorites.map((f) => `${f.kind}:${f.id}`)).toEqual([
      "component:chartforge.kpi",
      "layout:monitor-main-side",
    ]);
  });

  it("toggleFavorite 加入后可读回，再 toggle 移除", () => {
    const ws = useWorkspaceStore();
    expect(ws.isFavorite(KPI)).toBe(false);

    expect(ws.toggleFavorite(KPI)).toEqual({ ok: true, favorited: true });
    expect(ws.isFavorite(KPI)).toBe(true);
    expect(ws.favorites).toEqual([KPI]);

    expect(ws.toggleFavorite(KPI)).toEqual({ ok: true, favorited: false });
    expect(ws.favorites).toEqual([]);
  });

  it("收藏变化会落盘（防抖后写进 localStorage）", async () => {
    const ws = useWorkspaceStore();
    ws.toggleFavorite(LAYOUT);
    expect(ws.saveState).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 700));

    const stored = JSON.parse(localStorage.getItem("chartforge.workspace.v1") ?? "null");
    expect(stored?.favorites).toEqual([LAYOUT]);
  });

  it("收藏不改动大屏、素材与数据集（只存引用）", () => {
    const ws = useWorkspaceStore();
    const before = JSON.stringify({
      screens: ws.workspace.screens,
      assets: ws.workspace.assets,
      datasets: ws.workspace.datasets,
    });
    ws.toggleFavorite(KPI);
    const after = JSON.stringify({
      screens: ws.workspace.screens,
      assets: ws.workspace.assets,
      datasets: ws.workspace.datasets,
    });
    expect(after).toBe(before);
    // 载荷里只有引用三元组，没有任何被复制的内容
    expect(Object.keys(ws.favorites[0]).sort()).toEqual(["id", "kind", "version"]);
  });

  it("移除失效引用：removeFavorite 按身份删除", () => {
    const ws = useWorkspaceStore();
    ws.toggleFavorite(KPI);
    ws.toggleFavorite(LAYOUT);
    expect(ws.removeFavorite({ kind: "component", id: "chartforge.kpi", version: 1 })).toEqual({ ok: true, removed: true });
    expect(ws.favorites).toEqual([LAYOUT]);
    // 已不存在时返回 removed:false，不抛错
    expect(ws.removeFavorite(KPI)).toEqual({ ok: true, removed: false });
  });

  it("收藏列表只保存引用三元组，解析留给 UI 层（避免 store 反向依赖资源表）", () => {
    const ws = useWorkspaceStore();
    ws.toggleFavorite(KPI);
    // store 只暴露引用；解析（含「已失效」判定）由 core/design/favoriteCatalog 负责
    expect(ws.favorites).toEqual([KPI]);
    expect("resolvedFavorites" in ws).toBe(false);
  });
});
