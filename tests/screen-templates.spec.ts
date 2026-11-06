import { describe, it, expect } from "vitest";
import {
  SCREEN_TEMPLATES,
  templateSlots,
  overlapRatio,
  isPlaceholder,
  placeholdersToClear,
  PLACEHOLDER_PREFIX,
} from "../src/core/model/templates";
import type { Frame } from "../src/core/model/types";

const CANVAS = { width: 1920, height: 1080 };

function inter(a: Frame, b: Frame): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

describe("model/templates", () => {
  it("空白模板不产生槽位", () => {
    expect(templateSlots("blank", CANVAS)).toEqual([]);
  });

  it("未知模板 id 回退成空白", () => {
    expect(templateSlots("不存在的模板", CANVAS)).toEqual([]);
  });

  it("所有非空模板：槽位都在画布内、互不重叠、尺寸为正", () => {
    for (const tpl of SCREEN_TEMPLATES) {
      const slots = templateSlots(tpl.id, CANVAS);
      for (const s of slots) {
        expect(s.w).toBeGreaterThan(0);
        expect(s.h).toBeGreaterThan(0);
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.x + s.w).toBeLessThanOrEqual(CANVAS.width);
        expect(s.y + s.h).toBeLessThanOrEqual(CANVAS.height);
      }
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          expect(inter(slots[i] as Frame, slots[j] as Frame)).toBe(0);
        }
      }
    }
  });

  it("2×2 网格是四个等分槽位", () => {
    const slots = templateSlots("grid-2x2", CANVAS);
    expect(slots).toHaveLength(4);
    const ws = new Set(slots.map((s) => s.w));
    const hs = new Set(slots.map((s) => s.h));
    expect(ws.size).toBe(1);
    expect(hs.size).toBe(1);
  });

  it("1 主 2 辅：左侧一个通高槽位 + 右侧两个", () => {
    const slots = templateSlots("main-side", CANVAS);
    expect(slots).toHaveLength(3);
    // 左侧是通高主图，右侧两个辅图排在它右边
    expect(slots[0].h).toBeGreaterThan(slots[1].h);
    expect(slots[1].x).toBeGreaterThanOrEqual(slots[0].x + slots[0].w);
    expect(slots[2].x).toBe(slots[1].x);
  });

  it("三列等分与顶部横幅", () => {
    expect(templateSlots("three-cols", CANVAS)).toHaveLength(3);
    expect(templateSlots("top-banner", CANVAS)).toHaveLength(5);
  });

  it("画布太小时不会生成负尺寸槽位", () => {
    for (const tpl of SCREEN_TEMPLATES) {
      for (const s of templateSlots(tpl.id, { width: 320, height: 320 })) {
        expect(s.w).toBeGreaterThan(0);
        expect(s.h).toBeGreaterThan(0);
      }
    }
  });

  it("overlapRatio 计算与较小框的重叠比例", () => {
    const a: Frame = { x: 0, y: 0, w: 100, h: 100, rotate: 0 };
    expect(overlapRatio(a, { ...a })).toBe(1);
    expect(overlapRatio(a, { x: 200, y: 0, w: 100, h: 100, rotate: 0 })).toBe(0);
    expect(overlapRatio(a, { x: 50, y: 0, w: 100, h: 100, rotate: 0 })).toBeCloseTo(0.5);
  });

  it("只有压住占位框的图表才会清掉占位", () => {
    const ph = (x: number, y: number) => ({
      id: `p${x}${y}`,
      kind: "shape" as const,
      name: `${PLACEHOLDER_PREFIX} 1`,
      frame: { x, y, w: 200, h: 200, rotate: 0 },
    });
    const items = [ph(0, 0), ph(1000, 0)];
    expect(isPlaceholder(items[0])).toBe(true);
    expect(isPlaceholder({ kind: "shape", name: "普通矩形" })).toBe(false);

    const hit = placeholdersToClear(items, { x: 10, y: 10, w: 180, h: 180, rotate: 0 });
    expect(hit.map((i) => i.id)).toEqual(["p00"]);

    const miss = placeholdersToClear(items, { x: 600, y: 600, w: 100, h: 100, rotate: 0 });
    expect(miss).toEqual([]);
  });
});
