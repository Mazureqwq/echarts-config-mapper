import { SCREEN_H, SCREEN_W } from "./types";

/** 计算画布在视口内的等比缩放：取宽高最小比例，任一入参非正数返回 1 */
export function computeScale(cw: number, ch: number, w = SCREEN_W, h = SCREEN_H): number {
  if (cw <= 0 || ch <= 0 || w <= 0 || h <= 0) return 1;
  return Math.min(cw / w, ch / h);
}

/** 屏幕坐标 → 画布坐标：扣除舞台原点后除以 scale */
export function toCanvasPoint(
  px: number,
  py: number,
  scale: number,
  originX: number,
  originY: number,
): { x: number; y: number } {
  return { x: (px - originX) / scale, y: (py - originY) / scale };
}
