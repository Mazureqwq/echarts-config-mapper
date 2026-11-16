import { describe, expect, it } from "vitest";
import {
  FAVORITE_KINDS,
  favoriteKey,
  isFavorite,
  normalizeFavorites,
  toggleFavorite,
  type FavoriteRef,
} from "../src/core/design/favorites";
import { resolveFavorite, resolveFavorites } from "../src/core/design/favoriteCatalog";
import { componentRegistry } from "../src/core/components/builtins";
import { builtInBlocks } from "../src/core/design/library";
import { LAYOUT_BACKGROUND_ENTRIES } from "../src/core/design/layoutBackgrounds";

const kpi: FavoriteRef = { kind: "component", id: "chartforge.kpi", version: 1 };
const titleBlock: FavoriteRef = { kind: "block", id: "title-panel", version: 1 };
const layout: FavoriteRef = { kind: "layout", id: "monitor-main-side" };

describe("收藏引用（T16 P1-4）", () => {
  it("只支持组件 / 区块 / 布局三类引用", () => {
    expect([...FAVORITE_KINDS]).toEqual(["component", "block", "layout"]);
  });

  it("favoriteKey 把 kind/id/version 归一为一个稳定字符串", () => {
    expect(favoriteKey(kpi)).toBe("component:chartforge.kpi@1");
    expect(favoriteKey(layout)).toBe("layout:monitor-main-side");
    // 版本缺省与显式 1 视为不同引用：升级后应当能各自收藏
    expect(favoriteKey({ kind: "component", id: "chartforge.kpi" })).toBe("component:chartforge.kpi");
  });
});

describe("toggleFavorite（只存引用，不复制内容）", () => {
  it("未收藏时加入，已收藏时移除", () => {
    const added = toggleFavorite([], kpi);
    expect(added).toEqual([kpi]);
    expect(toggleFavorite(added, kpi)).toEqual([]);
  });

  it("不修改传入数组（不可变更新）", () => {
    const list: FavoriteRef[] = [];
    toggleFavorite(list, kpi);
    expect(list).toEqual([]);
  });

  it("同一引用不会被重复收藏", () => {
    const once = toggleFavorite([], kpi);
    // 用等价但非同一对象再添加一次，应先移除而不是堆两份
    expect(toggleFavorite(once, { kind: "component", id: "chartforge.kpi", version: 1 })).toEqual([]);
  });

  it("不同引用互不影响，且保持加入顺序", () => {
    let list = toggleFavorite([], kpi);
    list = toggleFavorite(list, titleBlock);
    list = toggleFavorite(list, layout);
    expect(list.map(favoriteKey)).toEqual([
      "component:chartforge.kpi@1",
      "block:title-panel@1",
      "layout:monitor-main-side",
    ]);
  });
});

describe("isFavorite", () => {
  it("按引用身份判断，不看对象身份", () => {
    const list = toggleFavorite([], kpi);
    expect(isFavorite(list, { kind: "component", id: "chartforge.kpi", version: 1 })).toBe(true);
    expect(isFavorite(list, { kind: "component", id: "chartforge.kpi", version: 2 })).toBe(false);
    expect(isFavorite(list, titleBlock)).toBe(false);
  });
});

describe("normalizeFavorites（持久化读回的清洗）", () => {
  it("丢弃未知 kind、缺 id 的条目", () => {
    const raw = [
      { kind: "component", id: "chartforge.kpi", version: 1 },
      { kind: "unknown", id: "x" },
      { kind: "component" },
      { kind: "component", id: "  " },
      null,
      "nonsense",
    ];
    expect(normalizeFavorites(raw)).toEqual([{ kind: "component", id: "chartforge.kpi", version: 1 }]);
  });

  it("去重并保留首次出现的位置", () => {
    const raw = [
      { kind: "layout", id: "monitor-main-side" },
      { kind: "component", id: "chartforge.kpi", version: 1 },
      { kind: "layout", id: "monitor-main-side" },
    ];
    expect(normalizeFavorites(raw).map(favoriteKey)).toEqual([
      "layout:monitor-main-side",
      "component:chartforge.kpi@1",
    ]);
  });

  it("非数组输入返回空列表（旧工作区没有该字段）", () => {
    expect(normalizeFavorites(undefined)).toEqual([]);
    expect(normalizeFavorites({ kind: "component", id: "x" })).toEqual([]);
  });

  it("version 非法时按缺省处理，不被当成 0", () => {
    const [entry] = normalizeFavorites([{ kind: "component", id: "chartforge.kpi", version: 0 }]);
    expect(entry.version).toBeUndefined();
  });
});

describe("resolveFavorite（引用 → 可展示条目）", () => {
  it("组件引用能解析出名称与描述", () => {
    const resolved = resolveFavorite(kpi);
    expect(resolved).toMatchObject({ available: true, kind: "component", name: "指标卡" });
    expect(resolved!.description.length).toBeGreaterThan(0);
  });

  it("区块引用能解析出名称", () => {
    const resolved = resolveFavorite(titleBlock);
    expect(resolved).toMatchObject({ available: true, kind: "block" });
    expect(resolved!.name).toBe(builtInBlocks().find((b) => b.id === "title-panel")!.name);
  });

  it("布局引用能解析出名称", () => {
    const resolved = resolveFavorite(layout);
    expect(resolved!.name).toBe("主辅分栏");
  });

  it("引用已失效（组件被删 / 版本不存在）时标记不可用，但保留引用本身", () => {
    const gone = resolveFavorite({ kind: "component", id: "chartforge.does-not-exist", version: 1 });
    expect(gone).toMatchObject({ available: false });
    expect(gone!.name).toContain("chartforge.does-not-exist");

    // 版本不匹配同样算失效：v1 存在、v99 不存在
    expect(resolveFavorite({ kind: "component", id: "chartforge.kpi", version: 99 })).toMatchObject({
      available: false,
    });
  });

  it("resolveFavorites 保序且逐个给结果", () => {
    const list = toggleFavorite(toggleFavorite([], kpi), { kind: "component", id: "gone", version: 1 });
    const resolved = resolveFavorites(list);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toMatchObject({ available: true });
    expect(resolved[1]).toMatchObject({ available: false });
  });
});

describe("收藏引用与真实注册表对齐（防假引用）", () => {
  it("内置组件 / 区块 / 布局的 id 都能被解析", () => {
    for (const definition of componentRegistry.list()) {
      expect(resolveFavorite({ kind: "component", id: definition.id, version: definition.version })).toMatchObject({
        available: true,
      });
    }
    for (const block of builtInBlocks()) {
      expect(resolveFavorite({ kind: "block", id: block.id, version: block.version })).toMatchObject({ available: true });
    }
    for (const entry of LAYOUT_BACKGROUND_ENTRIES) {
      expect(resolveFavorite({ kind: "layout", id: entry.id })).toMatchObject({ available: true });
    }
  });
});
