import { describe, it, expect } from "vitest";
import { makeThumbnail } from "../src/core/storage/thumbnail";

function fakeFactory(calls: Array<{ w: number; h: number; dw: number; dh: number }>) {
  return (w: number, h: number) => {
    const canvas = {
      width: w,
      height: h,
      getContext: () => ({
        drawImage: (_img: unknown, _x: number, _y: number, dw: number, dh: number) => {
          calls.push({ w: canvas.width, h: canvas.height, dw, dh });
        },
      }),
      toDataURL: (type?: string, quality?: number) =>
        `data:${type};base64,${quality === 0.7 ? "FAKEJPEG" : "BADQ"}`,
    };
    return canvas as unknown as HTMLCanvasElement;
  };
}

describe("storage/thumbnail", () => {
  it("横图按最长边 256 等比缩放并输出 JPEG dataURL", () => {
    const calls: Array<{ w: number; h: number; dw: number; dh: number }> = [];
    const source = { width: 800, height: 400 } as unknown as HTMLCanvasElement;
    const out = makeThumbnail(source, fakeFactory(calls));
    expect(out.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(out.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ w: 256, h: 128, dw: 256, dh: 128 });
  });

  it("竖图按最长边 256 等比缩放", () => {
    const calls: Array<{ w: number; h: number; dw: number; dh: number }> = [];
    const source = { width: 300, height: 900 } as unknown as HTMLCanvasElement;
    makeThumbnail(source, fakeFactory(calls));
    expect(calls[0]).toEqual({ w: 85, h: 256, dw: 85, dh: 256 });
  });

  it("可自定义最长边（图表卡片用 384 换清晰度）", () => {
    const calls: Array<{ w: number; h: number; dw: number; dh: number }> = [];
    const source = { width: 1280, height: 720 } as unknown as HTMLCanvasElement;
    makeThumbnail(source, fakeFactory(calls), 384);
    expect(calls[0]).toEqual({ w: 384, h: 216, dw: 384, dh: 216 });
  });

  it("图片源使用 naturalWidth/Height", () => {
    const calls: Array<{ w: number; h: number; dw: number; dh: number }> = [];
    const source = { naturalWidth: 512, naturalHeight: 512 } as unknown as HTMLImageElement;
    makeThumbnail(source, fakeFactory(calls));
    expect(calls[0]).toEqual({ w: 256, h: 256, dw: 256, dh: 256 });
  });
});
