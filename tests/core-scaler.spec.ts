import { describe, expect, test } from "vitest";
import { computeScale, toCanvasPoint } from "../src/core/scaler";
import { SCREEN_H, SCREEN_W } from "../src/core/types";

describe("computeScale", () => {
  test("960×540 视口对 1920×1080 画布缩放 0.5", () => {
    expect(computeScale(960, 540)).toBe(0.5);
  });

  test("视口尺寸非正数时返回 1", () => {
    expect(computeScale(0, 540)).toBe(1);
    expect(computeScale(960, -1)).toBe(1);
  });

  test("自定义画布尺寸参与计算", () => {
    expect(computeScale(960, 540, SCREEN_W, SCREEN_H)).toBe(0.5);
  });
});

describe("toCanvasPoint", () => {
  test("屏幕坐标按 scale 换算回画布坐标", () => {
    expect(toCanvasPoint(100, 100, 0.5, 0, 0)).toEqual({ x: 200, y: 200 });
  });

  test("含舞台偏移 origin 的换算", () => {
    expect(toCanvasPoint(1100, 650, 0.5, 100, 50)).toEqual({ x: 2000, y: 1200 });
  });

  test("容器不在视口原点时扣除容器偏移", () => {
    // 视口点 (340,148) = 容器偏移 (240,48) + 舞台内偏移 (100,50) + 画布点 0,100
    expect(toCanvasPoint(340, 148, 0.5, 100, 50, 240, 48)).toEqual({ x: 0, y: 100 });
  });

  test("显式传入零偏移与省略参数等价", () => {
    expect(toCanvasPoint(1100, 650, 0.5, 100, 50, 0, 0)).toEqual({ x: 2000, y: 1200 });
  });
});
