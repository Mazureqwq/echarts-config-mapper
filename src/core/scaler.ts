import type { Ref } from "vue";
import { SCREEN_H, SCREEN_W } from "./types";

/** 计算画布在视口内的等比缩放：取宽高最小比例，任一入参非正数返回 1 */
export function computeScale(cw: number, ch: number, w = SCREEN_W, h = SCREEN_H): number {
  if (cw <= 0 || ch <= 0 || w <= 0 || h <= 0) return 1;
  return Math.min(cw / w, ch / h);
}

/** 屏幕坐标 → 画布坐标：扣除容器视口偏移与舞台原点后除以 scale（容器在视口原点时 rectLeft/rectTop 可省略） */
export function toCanvasPoint(
  px: number,
  py: number,
  scale: number,
  originX: number,
  originY: number,
  rectLeft = 0,
  rectTop = 0,
): { x: number; y: number } {
  return { x: (px - rectLeft - originX) / scale, y: (py - rectTop - originY) / scale };
}

/** Scaler 提供的舞台上下文：画布交互据此换算屏幕坐标 → 画布坐标 */
export interface ScreenStageContext {
  scale: Ref<number>;
  originX: Ref<number>;
  originY: Ref<number>;
  toCanvas(event: { clientX: number; clientY: number }): { x: number; y: number };
}

/** provide/inject 键（Scaler 提供，设计器画布注入） */
export const SCREEN_STAGE_KEY = "screenStage";
