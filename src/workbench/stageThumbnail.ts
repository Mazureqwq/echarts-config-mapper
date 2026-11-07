import { makeThumbnail, THUMBNAIL_MAX_SIDE } from "@/core/storage/thumbnail";

export interface StageSnapshot {
  dataUrl: string;
  /** Number of image/chart resources substituted with safe placeholders. */
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
 * Inlining CORS-readable images prevents later SVG/Canvas export from depending on remote origins.
 * If the source denies CORS, replace that image in the export clone with an explanatory placeholder.
 */
async function makeImageExportSafe(image: HTMLImageElement, stripAllImages: boolean): Promise<boolean> {
  // Do not let a srcset/picture candidate silently restore the remote URL after setting a safe src.
  image.removeAttribute("srcset");
  image.removeAttribute("sizes");
  if (stripAllImages) {
    image.src = placeholderDataUrl("图片已替换以保证导出");
    return true;
  }

  const rawSrc = image.getAttribute("src")?.trim();
  if (!rawSrc) return false;
  let src: string;
  try {
    src = new URL(rawSrc, document.baseURI).href;
  } catch {
    image.src = placeholderDataUrl("无效图片已替换");
    return true;
  }
  if (isLocalImageSource(src)) return false;

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

function cssUrls(value: string): string[] {
  return Array.from(value.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi), (match) => match[1].trim());
}

/** Remove external CSS image references from the cloned stage before serializing it. */
function sanitizeBackgroundImages(source: HTMLElement, clone: HTMLElement, stripAllImages: boolean): number {
  const sourceChildren = Array.from(source.querySelectorAll("*")).filter((node) => !node.closest("[data-ui-only]"));
  const cloneChildren = Array.from(clone.querySelectorAll("*"));
  const originals: Element[] = [source, ...sourceChildren];
  const clones: Element[] = [clone, ...cloneChildren];
  let omitted = 0;

  for (let i = 0; i < Math.min(originals.length, clones.length); i++) {
    const backgroundImage = window.getComputedStyle(originals[i]).backgroundImage;
    const urls = cssUrls(backgroundImage);
    if (!urls.length) continue;
    if (stripAllImages || urls.some((url) => !isLocalImageSource(url))) {
      (clones[i] as HTMLElement | SVGElement).style.backgroundImage = "none";
      omitted += urls.length;
    }
  }
  return omitted;
}

function sanitizeSvgImages(clone: HTMLElement, stripAllImages: boolean): number {
  let omitted = 0;
  for (const image of Array.from(clone.querySelectorAll("image"))) {
    const href = image.getAttribute("href") ?? image.getAttribute("xlink:href") ?? "";
    if (stripAllImages || (href && !isLocalImageSource(href))) {
      image.setAttribute("href", placeholderDataUrl("图片已替换以保证导出"));
      image.removeAttribute("xlink:href");
      omitted++;
    }
  }
  return omitted;
}

function isSecurityError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name?: unknown }).name === "SecurityError";
}

async function renderStageSnapshot(
  source: HTMLElement,
  maxSide: number,
  mime: string,
  stripAllImages = false
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
    if (stripAllImages) {
      img.src = placeholderDataUrl("图表图片已替换以保证导出");
    } else {
      try {
        const original = originals[index];
        if (!original) throw new Error("画布图层缺失");
        img.src = original.toDataURL();
      } catch {
        // A chart can itself be tainted by a third-party image/symbol. Replace only that chart layer.
        img.src = placeholderDataUrl("图表含跨域内容，已替换");
        omittedResources++;
      }
    }
    canvas.replaceWith(img);
  });

  for (const sourceNode of Array.from(clone.querySelectorAll("source"))) {
    sourceNode.removeAttribute("srcset");
    sourceNode.removeAttribute("src");
  }
  for (const image of Array.from(clone.querySelectorAll("img"))) {
    if (await makeImageExportSafe(image, stripAllImages)) omittedResources++;
  }
  omittedResources += sanitizeBackgroundImages(source, clone, stripAllImages);
  omittedResources += sanitizeSvgImages(clone, stripAllImages);

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
      if (isSecurityError(error)) {
        // Last-resort retry: remove every raster/background image. A tainted resource must not block the whole screen.
        if (!stripAllImages) return renderStageSnapshot(source, maxSide, mime, true);
        throw new Error("浏览器仍检测到无法读取的跨域资源。请将素材下载后本地上传，再重新导出。");
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

/** Export the current screen at 2x resolution (e.g. 1920x1080 -> 3840x2160). */
export async function snapshotStagePng(source: HTMLElement): Promise<StageSnapshot> {
  const w = source.offsetWidth || 1920;
  const h = source.offsetHeight || 1080;
  return renderStageSnapshot(source, Math.max(w, h) * 2, "image/png");
}