/**
 * T16：收藏引用的解析层。
 *
 * 与 `favorites.ts` 分开是**架构约束，不是风格偏好**：
 * 本模块要 import 组件注册表、内置区块表与布局资产表，而它们（经 `schema.ts`）
 * 又依赖 `normalizeFavorites`。若把解析实现塞进 `favorites.ts`，
 * 就会形成 `schema → favorites → library → schema` 的循环依赖，
 * 模块初始化时抛 `Cannot access 'DEFAULT_FRAME' before initialization`。
 */

import { componentRegistry } from "../components/builtins";
import { builtInBlocks } from "./library";
import { LAYOUT_BACKGROUND_ENTRIES } from "./layoutBackgrounds";
import { getDecorEntry } from "./decorations";
import type { FavoriteKind, FavoriteRef } from "./favorites";

/** 收藏项解析后的展示数据。 */
export interface ResolvedFavorite {
  readonly ref: FavoriteRef;
  readonly kind: FavoriteKind;
  readonly name: string;
  readonly description: string;
  /** 引用是否还能在本版本的内置资源表里找到。 */
  readonly available: boolean;
}

/**
 * 把引用还原成可展示条目。
 *
 * 解析失败**不返回 null**：返回 `available: false` 且 name 回落到 id，
 * 这样 UI 能显示一条「已失效」并让用户自己移除。
 */
export function resolveFavorite(ref: FavoriteRef): ResolvedFavorite {
  if (ref.kind === "component") {
    const definition = componentRegistry
      .list()
      .find(
        (entry) =>
          entry.id === ref.id && (ref.version === undefined || entry.version === ref.version),
      );
    if (definition) {
      return {
        ref,
        kind: "component",
        name: definition.name,
        description: definition.catalog?.description ?? "内置组件",
        available: true,
      };
    }
    return { ref, kind: "component", name: ref.id, description: "该组件已不在当前版本中", available: false };
  }

  if (ref.kind === "block") {
    const block = builtInBlocks().find(
      (entry) => entry.id === ref.id && (ref.version === undefined || entry.version === ref.version),
    );
    if (block) {
      return { ref, kind: "block", name: block.name, description: block.description, available: true };
    }
    return { ref, kind: "block", name: ref.id, description: "该区块已不在当前版本中", available: false };
  }

  if (ref.kind === "decor") {
    const decor = getDecorEntry(ref.id);
    if (decor) {
      return { ref, kind: "decor", name: decor.name, description: decor.description, available: true };
    }
    return { ref, kind: "decor", name: ref.id, description: "该装饰素材已不在当前版本中", available: false };
  }

  const layout = LAYOUT_BACKGROUND_ENTRIES.find((entry) => entry.id === ref.id);
  if (layout) {
    return { ref, kind: "layout", name: layout.name, description: layout.description, available: true };
  }
  return { ref, kind: "layout", name: ref.id, description: "该布局资产已不在当前版本中", available: false };
}

export function resolveFavorites(list: readonly FavoriteRef[]): ResolvedFavorite[] {
  return list.map((ref) => resolveFavorite(ref));
}

/** 收藏项的类别名，用于 UI 分组标题与无障碍标签。 */
export const FAVORITE_KIND_LABELS: Readonly<Record<FavoriteKind, string>> = Object.freeze({
  component: "组件",
  block: "区块",
  layout: "布局资产",
  decor: "装饰素材",
});
