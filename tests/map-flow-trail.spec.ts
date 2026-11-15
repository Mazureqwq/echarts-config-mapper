import { describe, expect, it } from "vitest";
import {
  flowTrailFade,
  flowTrailGeometry,
  flowTrailHeadRadius,
  flowTrailPhase,
  flowTrailTravelled,
  flowTrailWidth,
  parseFlowColor,
  rgba,
} from "../src/core/components/mapFlowTrail";

describe("mapFlowTrail (T13-a：OD 飞线流动拖尾)", () => {
  describe("flowTrailFade：周期两端淡入 / 淡出", () => {
    it("在周期起点与终点完全透明，回绕跳变不可见", () => {
      expect(flowTrailFade(0)).toBe(0);
      expect(flowTrailFade(1)).toBe(0);
    });

    it("在周期中段完全不透明", () => {
      expect(flowTrailFade(0.5)).toBe(1);
      expect(flowTrailFade(0.3)).toBe(1);
    });

    it("两端单调上升 / 下降", () => {
      const ramp = [0, 0.02, 0.04, 0.06, 0.08, 0.1].map(flowTrailFade);
      for (let i = 1; i < ramp.length; i++) expect(ramp[i]).toBeGreaterThanOrEqual(ramp[i - 1]);
      expect(ramp[0]).toBe(0);
      expect(ramp[ramp.length - 1]).toBe(1);
      const tail = [0.9, 0.92, 0.95, 0.98, 1].map(flowTrailFade);
      for (let i = 1; i < tail.length; i++) expect(tail[i]).toBeLessThanOrEqual(tail[i - 1]);
      expect(tail[tail.length - 1]).toBe(0);
    });
  });

  describe("flowTrailPhase：归一化相位", () => {
    it("相位落在 [0, 1) 区间", () => {
      expect(flowTrailPhase(0, 200)).toBe(0);
      expect(flowTrailPhase(100, 200)).toBeCloseTo(0.5, 5);
      expect(flowTrailPhase(200, 200)).toBe(0);
      expect(flowTrailPhase(250, 200)).toBeCloseTo(0.25, 5);
    });

    it("周期非法（<= 0）时退回 0，不产生 NaN", () => {
      expect(flowTrailPhase(120, 0)).toBe(0);
      expect(Number.isNaN(flowTrailPhase(120, 0))).toBe(false);
    });
  });

  describe("flowTrailTravelled：恒定像素速度推进", () => {
    it("按 px/s 线性累加", () => {
      expect(flowTrailTravelled(0, 170, 1000)).toBe(0);
      expect(flowTrailTravelled(1000, 170, 1000)).toBeCloseTo(170, 5);
      expect(flowTrailTravelled(2000, 170, 1000)).toBeCloseTo(340, 5);
    });

    it("超过一个周期后回绕", () => {
      // 1000ms 走 170px，周期 200px ⇒ 剩余 170px 回绕到 0 后继续
      expect(flowTrailTravelled(1000, 170, 200)).toBeCloseTo(170, 5);
      expect(flowTrailTravelled(2000, 170, 200)).toBeCloseTo(140, 5);
    });

    it("周期非法时不推进", () => {
      expect(flowTrailTravelled(5000, 170, 0)).toBe(0);
    });
  });

  describe("flowTrailGeometry：彗星几何", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };

    it("光点沿航线方向推进", () => {
      const g = flowTrailGeometry(from, to, 40, 20);
      expect(g.headX).toBeCloseTo(40, 5);
      expect(g.headY).toBeCloseTo(0, 5);
      expect(g.finished).toBe(false);
    });

    it("拖尾固定在光点后方 trailLength 像素", () => {
      const g = flowTrailGeometry(from, to, 40, 20);
      expect(g.tailX).toBeCloseTo(20, 5);
      expect(g.tailY).toBeCloseTo(0, 5);
    });

    it("刚出发时拖尾退化为 [0, s)，不会越过起点", () => {
      const g = flowTrailGeometry(from, to, 5, 20);
      expect(g.headX).toBeCloseTo(5, 5);
      expect(g.tailX).toBeCloseTo(0, 5);
    });

    it("越过终点后标记 finished（会被跳过，不画到航线外）", () => {
      const g = flowTrailGeometry(from, to, 120, 20);
      expect(g.finished).toBe(true);
    });

    it("零长度航线不产生 NaN", () => {
      const g = flowTrailGeometry({ x: 7, y: 9 }, { x: 7, y: 9 }, 10, 20);
      expect(g.headX).toBe(7);
      expect(g.headY).toBe(9);
      expect(g.finished).toBe(true);
    });

    it("45° 斜线沿对角方向推进（非轴对齐）", () => {
      const g = flowTrailGeometry({ x: 0, y: 0 }, { x: 30, y: 40 }, 25, 10);
      // 单位向量 (0.6, 0.8) ⇒ 25px 后落在 (15, 20)
      expect(g.headX).toBeCloseTo(15, 5);
      expect(g.headY).toBeCloseTo(20, 5);
      expect(g.tailX).toBeCloseTo(9, 5);
      expect(g.tailY).toBeCloseTo(12, 5);
    });
  });

  describe("可见性尺度：彗星必须肉眼可见", () => {
    it("拖尾宽度至少 2px，并随底稿宽度放大", () => {
      expect(flowTrailWidth(1)).toBe(2);
      expect(flowTrailWidth(2)).toBe(4);
      expect(flowTrailWidth(5)).toBe(10);
    });

    it("流光头辉光半径不小于 FLOW_HEAD_LENGTH/2，并随线宽放大", () => {
      // FLOW_HEAD_LENGTH = 18 ⇒ 最小半径 9px（保证白热核心有可见面积）
      expect(flowTrailHeadRadius(1)).toBe(9);
      expect(flowTrailHeadRadius(2)).toBe(9);
      expect(flowTrailHeadRadius(4)).toBe(12);
    });

    it("一条 200px 的航线在默认速度下约 1.2s 走完一圈", () => {
      const travel = 200;
      const speed = 170;
      const oneCycle = (travel / speed) * 1000;
      expect(Math.round(oneCycle)).toBeGreaterThan(500);
      expect(Math.round(oneCycle)).toBeLessThan(2000);
    });
  });

  describe("颜色解析", () => {
    it("支持 #rrggbb / #rgb / rgb()", () => {
      expect(parseFlowColor("#32d6ff")).toEqual({ r: 0x32, g: 0xd6, b: 0xff });
      expect(parseFlowColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
      expect(parseFlowColor("rgb(1, 2, 3)")).toEqual({ r: 1, g: 2, b: 3 });
    });

    it("非法颜色退回白色，不抛错", () => {
      expect(parseFlowColor("not-a-color")).toEqual({ r: 255, g: 255, b: 255 });
      expect(parseFlowColor("")).toEqual({ r: 255, g: 255, b: 255 });
    });

    it("alpha 被夹到 [0, 1]", () => {
      expect(rgba({ r: 1, g: 2, b: 3 }, 1.7)).toBe("rgba(1, 2, 3, 1)");
      expect(rgba({ r: 1, g: 2, b: 3 }, -0.5)).toBe("rgba(1, 2, 3, 0)");
      expect(rgba({ r: 1, g: 2, b: 3 }, 0.25)).toBe("rgba(1, 2, 3, 0.25)");
    });
  });
});
