import { describe, expect, it } from "vitest";
import { applyResize, MIN_ITEM_H, MIN_ITEM_W } from "../src/core/resize";
import type { Rect } from "../src/core/types";

const base: Rect = { x: 100, y: 80, w: 200, h: 150 };

describe("applyResize", () => {
  it("se 手柄只增宽高", () => {
    expect(applyResize(base, "se", 50, 40)).toEqual({ x: 100, y: 80, w: 250, h: 190 });
  });

  it("nw 手柄移动起点并反向缩放", () => {
    expect(applyResize(base, "nw", 30, 20)).toEqual({ x: 130, y: 100, w: 170, h: 130 });
  });

  it("w 手柄钳制到最小宽度", () => {
    const narrow: Rect = { x: 100, y: 80, w: 50, h: 150 };
    const rect = applyResize(narrow, "w", 100, 0);
    expect(rect.x).toBe(110);
    expect(rect.w).toBe(MIN_ITEM_W);
  });

  it("e 手柄仅改宽度且不受 dy 影响", () => {
    expect(applyResize(base, "e", -50, 999)).toEqual({ x: 100, y: 80, w: 150, h: 150 });
  });

  it("s 手柄仅改高度并钳制到最小高度", () => {
    const rect = applyResize(base, "s", 0, -500);
    expect(rect.h).toBe(MIN_ITEM_H);
    expect(rect.x).toBe(100);
    expect(rect.w).toBe(200);
  });
});
