/**
 * T17：装饰素材的拖拽载荷。
 *
 * 复用 `layoutBackgroundActions.ts` 的做法：只允许白名单内的
 * `{ kind: "decor", id }` 两字段载荷通过，其余一律拒绝——
 * 拖拽数据来自 DOM，属于不可信输入。
 */

import { isDecorId, listDecorEntries } from "@/core/design/decorations";
import { DESIGN_DND_MIME } from "@/shared/dnd";

export interface DecorDropPayload {
  readonly kind: "decor";
  readonly id: string;
}

export function decorDragPayload(entry: unknown): { mime: typeof DESIGN_DND_MIME; data: string } | null {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
  const id = (entry as { id?: unknown }).id;
  if (typeof id !== "string" || !isDecorId(id)) return null;
  return { mime: DESIGN_DND_MIME, data: JSON.stringify({ kind: "decor", id }) };
}

export function parseDecorDragPayload(raw: string): DecorDropPayload | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const payload = value as { kind?: unknown; id?: unknown };
  // 严格两字段：多带字段说明不是本模块发出的载荷
  if (Object.keys(value).length !== 2) return null;
  if (payload.kind !== "decor" || typeof payload.id !== "string") return null;
  return listDecorEntries().some((entry) => entry.id === payload.id) ? { kind: "decor", id: payload.id } : null;
}
