import { makeThumbnail, THUMBNAIL_MAX_SIDE } from "@/core/storage/thumbnail";

export interface StageSnapshot {
  dataUrl: string;
  /** Number of tainted chart canvases / inaccessible external images replaced with placeholders. */
  omittedResources: number;
}

function placeholderDataUrl(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160" viewBox="0 0 480 160"><rect width="480" height="160" rx="12" fill="#f1f3f6"/><text x="240" y="82" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="18" fill="#626b78">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function isLocalImageSource(src: string): boolean {
  if (/^(data:|blob:)/i.test(src)) return true;
  try {
    const url = new URL(src, document.baseURI);
    return url.origin === window.location.origin || (url.protocol === "file:" && window.location.protocol === "file:");
  } catch {
    return false;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("图片读取失败")));
    reader.onerror = () => reject(reader.error ?? new Error("图片读取失败"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Inline cross-origin images when the remote server allows CORS.
 * If it doesn't, use an inlined placeholder so one external image cannot taint the full export.
 */
async function makeImageExportSafe(image: HTMLImageElement): Promise<boolean> {
  const src = image.currentSrc || image.src;
  if (!src || isLocalImageSource(src)) return false;

  try {
    const response = await fetch(src, { mode: "cors", credentials: "omit" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error("响应不是图片");
    image.src = await blobToDataUrl(blob);
    return false;
  } catch {
    image.src = placeholderDataUrl("跨域图片未开放导出，已替换");
    return true;
  }
}

async function renderStageSnapshot(
  source: HTMLElement,
  maxSide: number,
  mime: string
): Promise<StageSnapshot> {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-ui-only]").forEach((n) => n.remove());
  clone.style.transform = "none";
  clone.style.boxShadow = "none";

  let omittedResources = 0;
  const originals = Array.from(source.querySelectorAll("canvas"));
  const clones = Array.from(clone.querySelectorAll("canvas"));
  clones.forEach((canvas, index) => {
    const img = document.createElement("img");
    img.setAttribute("style", canvas.getAttribute("style") ?? "");
    img.width = canvas.width;
    img.height = canvas.height;
    try {
      const original = originals[index];
      if (!original) throw new Error("画布图层缺失");
      img.src = original.toDataURL();
    } catch {
      // A chart can itself be tainted by a third-party image/symbol. Replace that layer, not the whole export.
      img.src = placeholderDataUrl("图表含跨域内容，已替换");
      omittedResources++;
    }
    canvas.replaceWith(img);
  });

  for (const image of Array.from(clone.querySelectorAll("img"))) {
    if (await makeImageExportSafe(image)) omittedResources++;
  }

  const w = source.offsetWidth || 1920;
  const h = source.offsetHeight || 1080;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml">${new XMLSerializer().serializeToString(clone)}</div>` +
    `</foreignObject></svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("画布截图渲染失败"));
      img.src = url;
    });
    const scale = maxSide / Math.max(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建导出画布");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    try {
      const dataUrl = mime === "image/png" ? canvas.toDataURL("image/png") : makeThumbnail(canvas);
      return { dataUrl, omittedResources };
    } catch (error) {
      if (error instanceof DOMException && error.name === "SecurityError") {
        throw new Error("仍有跨域图片无法安全导出。请改用本地上传图片，或让图片服务器开放 CORS 后重试。");
      }
      throw error;
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Save a compact JPEG thumbnail. */
export async function snapshotStage(
  source: HTMLElement,
  maxSide: number = THUMBNAIL_MAX_SIDE,
  mime: string = "image/jpeg"
): Promise<string> {
  return (await renderStageSnapshot(source, maxSide, mime)).dataUrl;
}

/**
 * Export the current screen at 2x resolution. A 1920x1080 stage becomes 3840x2160.
 * Cross-origin resources without CORS are represented by clear placeholders rather than failing the export.
 */
export async function snapshotStagePng(source: HTMLElement): Promise<StageSnapshot> {
  const w = source.offsetWidth || 1920;
  const h = source.offsetHeight || 1080;
  return renderStageSnapshot(source, Math.max(w, h) * 2, "image/png");
}
