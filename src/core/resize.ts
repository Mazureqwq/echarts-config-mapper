import type { Rect } from "./types";

/** 缩放手柄：四角 + 四边 */
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** 元素最小尺寸（画布坐标 px） */
export const MIN_ITEM_W = 40;
export const MIN_ITEM_H = 30;

/**
 * 按手柄方向应用缩放位移（dx/dy 为画布坐标位移）：
 * se/s/e 增 w/h；nw/n/w 移动 x/y 并反向增缩；结果钳制到最小尺寸。
 */
export function applyResize(rect: Rect, handle: ResizeHandle, dx: number, dy: number): Rect {
  let { x, y, w, h } = rect;

  if (handle.includes("e")) {
    w = Math.max(MIN_ITEM_W, w + dx);
  }
  if (handle.includes("s")) {
    h = Math.max(MIN_ITEM_H, h + dy);
  }
  if (handle.includes("w")) {
    const clampedDx = Math.min(dx, w - MIN_ITEM_W);
    x += clampedDx;
    w -= clampedDx;
  }
  if (handle.includes("n")) {
    const clampedDy = Math.min(dy, h - MIN_ITEM_H);
    y += clampedDy;
    h -= clampedDy;
  }

  return { x, y, w, h };
}
