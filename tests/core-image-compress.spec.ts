import { describe, it, expect, vi } from "vitest";
import { targetSize, encodeJpeg } from "../src/core/storage/imageCompress";

type Call = { w: number; h: number; quality: number };
function fakeFactory(calls: Call[], sizes: number[]) {
  return (w: number, h: number) => {
    let i = 0;
    const canvas = {
      width: w,
      height: h,
      getContext: () => ({ drawImage: vi.fn() }),
      toDataURL: (type?: string, quality?: number) => {
        calls.push({ w: canvas.width, h: canvas.height, quality: quality ?? 0 });
        return `data:${type};base64,` + "A".repeat(sizes[Math.min(i++, sizes.length - 1)]);
      },
    };
    return canvas as unknown as HTMLCanvasElement;
  };
}

describe("storage/imageCompress", () => {
  it("targetSize 长边 2048 等比缩小且不放大", () => {
    expect(targetSize(4096, 2048)).toEqual({ width: 2048, height: 1024 });
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(targetSize(300, 900)).toEqual({ width: 300, height: 900 });
  });

  it("encodeJpeg 绘制一次输出 JPEG dataURL", () => {
    const calls: Call[] = [];
    const out = encodeJpeg({ width: 4096, height: 2048 } as HTMLCanvasElement, {
      createCanvas: fakeFactory(calls, [100, 100, 100, 100]),
    });
    expect(out.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ w: 2048, h: 1024, quality: 0.85 });
  });

  it("encodeJpeg 超过 maxBytes 时按质量阶梯降质直到达标", () => {
    const calls: Call[] = [];
    const maxBytes = 500;
    const out = encodeJpeg({ width: 2048, height: 1024 } as HTMLCanvasElement, {
      maxBytes,
      createCanvas: fakeFactory(calls, [3000, 1200, 400]),
    });
    expect(out.length).toBeLessThanOrEqual(maxBytes);
    expect(calls.map((c) => c.quality)).toEqual([0.85, 0.7, 0.55]);
  });

  it("encodeJpeg 全部阶梯仍超限时返回最低质量结果", () => {
    const calls: Call[] = [];
    const out = encodeJpeg({ width: 2048, height: 1024 } as HTMLCanvasElement, {
      maxBytes: 10,
      createCanvas: fakeFactory(calls, [3000, 3000, 3000, 3000]),
    });
    expect(calls.map((c) => c.quality)).toEqual([0.85, 0.7, 0.55, 0.4]);
    expect(out.length).toBeGreaterThan(10);
  });
});
