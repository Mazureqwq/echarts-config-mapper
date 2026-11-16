/**
 * T16（P1-4）：我的收藏。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────
 * DataV 7.0 设计库调研（`docs/superpowers/specs/2026-11-15-datav-7-design-library-reference.md`）
 * 与缺口对齐稿（`…-gap-alignment.md` §3.4）把「我的收藏」列为 ChartForge 的 P1 缺口：
 * 组件库/区块/布局资产都是**平铺**的，用得熟的少数几个每次都要重新翻找。
 *
 * ── 设计约束 ────────────────────────────────────────────────────────────
 * 1. **只存引用，不复制内容**（缺口稿明确边界）：收藏项是
 *    `{ kind, id, version? }`，绝不把组件定义 / 区块 items / 布局几何塞进去。
 *    否则内置内容一升级，收藏里就留着一份永远不更新的陈旧副本。
 * 2. **引用必须可解析**：`resolveFavorite` 把引用还原成可展示条目；
 *    解析不到时返回 `available: false` 而不是静默丢弃——用户要能看到
 *    「这条已失效」并自己决定移除，否则收藏会凭空消失。
 * 3. **不可变更新 + 稳定去重键**：`favoriteKey` 是唯一身份，
 *    `toggleFavorite` 返回新数组，判等不依赖对象身份（跨会话读回来是新对象）。
 * 4. **脏数据清洗前置**：`normalizeFavorites` 在加载时丢弃未知 kind / 缺 id /
 *    重复条目，避免坏数据一路带到 UI。
 */

/** 可收藏的资源类别。刻意只做这三类：它们都已存在于内置资源表里。 */
export const FAVORITE_KINDS = Object.freeze(["component", "block", "layout"] as const);
export type FavoriteKind = (typeof FAVORITE_KINDS)[number];

export interface FavoriteRef {
  readonly kind: FavoriteKind;
  readonly id: string;
  /** 仅组件/区块有版本；缺省表示「不绑定版本」。 */
  readonly version?: number;
}

function isKind(value: unknown): value is FavoriteKind {
  return typeof value === "string" && (FAVORITE_KINDS as readonly string[]).includes(value);
}

/**
 * 收藏项的唯一身份。
 *
 * 版本参与身份：组件升级后 v1 与 v2 是两个可分别收藏的对象，
 * 不会被一次 toggle 误删另一个。
 */
export function favoriteKey(ref: FavoriteRef): string {
  return ref.version === undefined ? `${ref.kind}:${ref.id}` : `${ref.kind}:${ref.id}@${ref.version}`;
}

/** 加入 / 移除（已收藏则移除）。返回新数组，不修改入参。 */
export function toggleFavorite(list: readonly FavoriteRef[], ref: FavoriteRef): FavoriteRef[] {
  const key = favoriteKey(ref);
  const exists = list.some((entry) => favoriteKey(entry) === key);
  if (exists) return list.filter((entry) => favoriteKey(entry) !== key);
  return [...list, { kind: ref.kind, id: ref.id, ...(ref.version === undefined ? {} : { version: ref.version }) }];
}

export function isFavorite(list: readonly FavoriteRef[], ref: FavoriteRef): boolean {
  const key = favoriteKey(ref);
  return list.some((entry) => favoriteKey(entry) === key);
}

/**
 * 从持久化数据里清洗收藏列表。
 *
 * - 未知 kind、缺 id、非对象条目：丢弃
 * - 重复引用：保留首次出现的位置
 * - `version` 非正整数：视为缺省（不当成 0，否则 `@0` 会变成一个永远解析不到的假引用）
 */
export function normalizeFavorites(raw: unknown): FavoriteRef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const output: FavoriteRef[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (!isKind(record.kind)) continue;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) continue;
    const version =
      typeof record.version === "number" && Number.isInteger(record.version) && record.version > 0
        ? record.version
        : undefined;
    const ref: FavoriteRef = { kind: record.kind, id, ...(version === undefined ? {} : { version }) };
    const key = favoriteKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(ref);
  }
  return output;
}

/*
 * 注意：本模块**不得** import 组件注册表 / 内置区块表 / 布局资产表，也不得
 * 从这个方向 re-export 解析层的类型。
 *
 * 原因：`model/schema.ts` 需要 `normalizeFavorites`，而解析实现要 import
 * 内置区块表（`design/library.ts`），后者在模块顶层就调用 `createItem()`，
 * 又回到 `schema.ts`。一旦在这条链上出现任何运行时（或未被擦除的类型）导入，
 * 就会形成 `schema → favorites → library → schema` 的循环，
 * 模块初始化时直接 TDZ 崩溃：
 *   `Cannot access 'DEFAULT_FRAME' before initialization`
 * 因此纯逻辑（本文件）与「查表解析」（`favoriteCatalog.ts`）必须分层，
 * 且方向只能是 favoriteCatalog → favorites。
 */
