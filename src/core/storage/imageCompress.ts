export const IMAGE_MAX_SIDE = 2048;
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const JPEG_QUALITY_LADDER = [0.85, 0.7, 0.55, 0.4] as const;

export function targetSize(
  w: number,
  h: number,
  maxSide: number = IMAGE_MAX_SIDE
): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(w, h, 1));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

export interface EncodeOptions {
  maxSide?: number;
  maxBytes?: number;
  createCanvas?: (w: number, h: number) => HTMLCanvasElement;
}

function defaultCreateCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

export function encodeJpeg(
  source: { width: number; height: number } | HTMLImageElement | HTMLCanvasElement,
  opts?: EncodeOptions
): string {
  const { width, height } =
    "naturalWidth" in source ? { width: source.naturalWidth, height: source.naturalHeight } : source;
  const size = targetSize(width, height, opts?.maxSide);
  const maxBytes = opts?.maxBytes ?? IMAGE_MAX_BYTES;
  const createCanvas = opts?.createCanvas ?? defaultCreateCanvas;
  const canvas = createCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d");
  ctx?.drawImage(source as CanvasImageSource, 0, 0, size.width, size.height);
  let out = "";
  for (const quality of JPEG_QUALITY_LADDER) {
    out = canvas.toDataURL("image/jpeg", quality);
    if (out.length <= maxBytes) return out;
  }
  return out;
}

export async function compressImageFile(file: File, opts?: EncodeOptions): Promise<string> {
  const bitmap = await createImageBitmap(file);
  return encodeJpeg(bitmap, opts);
}
