import { describe, it, expect } from "vitest";
import { hitTest, boxSelect } from "../src/core/geometry/hit";
import { resizeFrame, rotateFrame } from "../src/core/geometry/transform";
import { snapDelta } from "../src/core/geometry/snap";
import type { SnapCandidate } from "../src/core/geometry/snap";
import type { ChartItem, Frame } from "../src/core/model/types";

function item(frame: Partial<Frame>): ChartItem {
  return {
    id: "i1",
    kind: "chart",
    name: "图表",
    frame: { x: 0, y: 0, w: 100, h: 100, rotate: 0, ...frame },
    spec: { type: "line", option: {}, data: { kind: "category", categories: [], series: [] } },
  };
}

describe("geometry/hit", () => {
  it("未旋转矩形命中判定", () => {
    const it = item({});
    expect(hitTest(it, { x: 50, y: 50 })).toBe(true);
    expect(hitTest(it, { x: 150, y: 50 })).toBe(false);
  });

  it("rotate=30° 时按旋转矩形判定", () => {
    const it = item({ rotate: 30 });
    expect(hitTest(it, { x: 50, y: 50 })).toBe(true);
    // 右侧中部点旋转后仍在局部矩形内
    expect(hitTest(it, { x: 50 + 40 * Math.cos(Math.PI / 6), y: 50 + 40 * Math.sin(Math.PI / 6) })).toBe(true);
    // 未旋转时落在矩形内的角点，旋转 30° 后应在外部
    expect(hitTest(it, { x: 99, y: 99 })).toBe(false);
  });

  it("boxSelect 选出与框相交的元素", () => {
    const a = item({ x: 10, y: 10, w: 50, h: 50 });
    const b = item({ x: 300, y: 300, w: 50, h: 50 });
    const c = item({ x: 180, y: 40, w: 50, h: 50 });
    const selected = boxSelect([a, b, c], { x: 0, y: 0, w: 200, h: 100 });
    expect(selected).toHaveLength(2);
    const selected2 = boxSelect([a, b, c], { x: 0, y: 0, w: 100, h: 100 });
    expect(selected2).toHaveLength(1);
  });
});

describe("geometry/transform", () => {
  it("8 向 resize 各方向生效", () => {
    const f: Frame = { x: 100, y: 100, w: 200, h: 100, rotate: 0 };
    expect(resizeFrame(f, "e", 30, 0)).toEqual({ ...f, w: 230 });
    expect(resizeFrame(f, "w", 30, 0)).toEqual({ ...f, x: 130, w: 170 });
    expect(resizeFrame(f, "s", 0, 30)).toEqual({ ...f, h: 130 });
    expect(resizeFrame(f, "n", 0, 30)).toEqual({ ...f, y: 130, h: 70 });
    expect(resizeFrame(f, "se", 30, 30)).toEqual({ ...f, w: 230, h: 130 });
    expect(resizeFrame(f, "nw", 30, 30)).toEqual({ ...f, x: 130, y: 130, w: 170, h: 70 });
  });

  it("最小尺寸夹紧", () => {
    const f: Frame = { x: 0, y: 0, w: 50, h: 50, rotate: 0 };
    const out = resizeFrame(f, "se", -1000, -1000);
    expect(out.w).toBe(8);
    expect(out.h).toBe(8);
  });

  it("Shift 等比缩放四角保持宽高比", () => {
    const f: Frame = { x: 0, y: 0, w: 200, h: 100, rotate: 0 };
    const out = resizeFrame(f, "se", 100, 0, { keepAspect: true });
    expect(out.w).toBe(300);
    expect(out.h).toBe(150);
    const out2 = resizeFrame(f, "nw", 50, 0, { keepAspect: true });
    expect(out2.w).toBe(150);
    expect(out2.h).toBe(75);
    expect(out2.x).toBe(50);
    expect(out2.y).toBe(25);
  });

  it("rotateFrame 吸附 15° 与归一化", () => {
    const f: Frame = { x: 0, y: 0, w: 100, h: 100, rotate: 0 };
    const out = rotateFrame(f, { x: 50, y: 50 }, 23, { snap: true });
    expect(out.rotate).toBe(30);
    expect(out.x).toBe(0);
    expect(rotateFrame(f, { x: 50, y: 50 }, 380).rotate).toBe(20);
    const orbit = rotateFrame(f, { x: 0, y: 0 }, 90);
    expect(orbit.rotate).toBe(90);
    expect(orbit.x).toBe(-100);
    expect(orbit.y).toBe(0);
  });
});

describe("geometry/snap", () => {
  it("阈值内吸附并对齐到参照线", () => {
    const candidates: SnapCandidate[] = [
      { axis: "x", moving: 100, static: 105 },
    ];
    const out = snapDelta({ dx: 3, dy: 0 }, candidates);
    expect(out.dx).toBe(5);
    expect(out.dy).toBe(0);
    expect(out.guides).toEqual([{ axis: "x", position: 105 }]);
  });

  it("超出阈值不吸附", () => {
    const out = snapDelta({ dx: 3, dy: 0 }, [{ axis: "x", moving: 100, static: 200 }]);
    expect(out.dx).toBe(3);
    expect(out.guides).toEqual([]);
  });

  it("同轴取最小修正，阈值默认 6", () => {
    const out = snapDelta({ dx: 0, dy: 0 }, [
      { axis: "x", moving: 100, static: 106 },
      { axis: "x", moving: 50, static: 52 },
    ]);
    expect(out.dx).toBe(2);
    expect(out.guides).toEqual([{ axis: "x", position: 52 }]);
  });
});
