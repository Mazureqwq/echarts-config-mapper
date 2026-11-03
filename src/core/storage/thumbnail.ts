export type ThumbnailSource = HTMLImageElement | HTMLCanvasElement;
export type CanvasFactory = (w: number, h: number) => HTMLCanvasElement;

export const THUMBNAIL_MAX_SIDE = 256;
export const THUMBNAIL_QUALITY = 0.7;

const defaultFactory: CanvasFactory = (w, h) => {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
};

export function makeThumbnail(
  source: ThumbnailSource,
  createCanvas: CanvasFactory = defaultFactory
): string {
  const srcW = "naturalWidth" in source ? source.naturalWidth : source.width;
  const srcH = "naturalHeight" in source ? source.naturalHeight : source.height;
  const scale = THUMBNAIL_MAX_SIDE / Math.max(srcW, srcH, 1);
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  }
  return canvas.toDataURL("image/jpeg", THUMBNAIL_QUALITY);
}
