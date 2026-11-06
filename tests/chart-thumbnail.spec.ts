import { describe, it, expect } from "vitest";
import { thumbnailOption, THUMBNAIL_BACKGROUND, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT } from "../src/workbench/chartThumbnail";
import { createChartSpec } from "../src/core/model/schema";

describe("workbench/chartThumbnail", () => {
  it("缩略图尺寸与图表库卡片一致（16:9，避免 object-fit 裁切）", () => {
    expect(THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT).toBeCloseTo(16 / 9, 5);
  });

  it("缩略图 option 关闭动画：否则首帧抓到的是动画起点，柱子高度为 0", () => {
    const opt = thumbnailOption(createChartSpec("bar"));
    expect(opt.animation).toBe(false);
    expect(Array.isArray(opt.series)).toBe(true);
    expect((opt.series as unknown[]).length).toBeGreaterThan(0);
  });

  it("缩略图带不透明底色：JPEG 无 alpha 通道，透明画布会被压成黑底", () => {
    const opt = thumbnailOption(createChartSpec("line"));
    expect(opt.backgroundColor).toBe(THUMBNAIL_BACKGROUND);
  });

  it("用户配置里的 animation 不会把静态缩略图重新打开", () => {
    const spec = createChartSpec("pie");
    spec.option = { animation: true, animationDuration: 1500 };
    const opt = thumbnailOption(spec);
    expect(opt.animation).toBe(false);
  });
});
