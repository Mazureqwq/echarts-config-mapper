export type ThumbnailSource = HTMLImageElement | HTMLCanvasElement;
export type CanvasFactory = (w: number, h: number) => HTMLCanvasElement;

export const THUMBNAIL_MAX_SIDE = 256;
/**
 * 缩略图生成算法版本：v2 起关闭 ECharts 动画、加不透明底色、按 16:9 生成。
 * 版本不一致的旧缩略图会在打开图表/图表库时自动重算，避免留下「和图表不一样」的旧图。
 */
export const THUMBNAIL_VERSION = 2;
export const THUMBNAIL_QUALITY = 0.7;

const defaultFactory: CanvasFactory = (w, h) => {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
};

export function makeThumbnail(
  source: ThumbnailSource,
  createCanvas: CanvasFactory = defaultFactory,
  maxSide: number = THUMBNAIL_MAX_SIDE
): string {
  const srcW = "naturalWidth" in source ? source.naturalWidth : source.width;
  const srcH = "naturalHeight" in source ? source.naturalHeight : source.height;
  const scale = maxSide / Math.max(srcW, srcH, 1);
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  }
  return canvas.toDataURL("image/jpeg", THUMBNAIL_QUALITY);
}
