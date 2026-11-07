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

function isSvgSource(src: string): boolean {
  if (/^data:image\/svg\+xml/i.test(src)) return true;
  try {
    return new URL(src, document.baseURI).pathname.toLowerCase().endsWith(".svg");
  } catch {
    return false;
  }
}

/** Load only raster bytes that can safely be drawn to a fresh canvas. */
async function loadSafeRaster(src: string): Promise<HTMLImageElement | null> {
  try {
    if (!src || isSvgSource(src)) return null;
    let dataUrl = src;
    if (!/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(src)) {
      const url = new URL(src, document.baseURI);
      const sameOrigin = url.origin === window.location.origin || (url.protocol === "file:" && window.location.protocol === "file:");
      const response = await fetch(url.href, {
        mode: sameOrigin ? "same-origin" : "cors",
        credentials: sameOrigin ? "same-origin" : "omit",
      });
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!/^image\/(png|jpeg|gif|webp|avif)$/i.test(blob.type)) return null;
      dataUrl = await blobToDataUrl(blob);
    }

    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("image load failed"));
      image.src = dataUrl;
    });
    return image;
  } catch {
    return null;
  }
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string): void {
  ctx.fillStyle = "#f1f3f6";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#d8dde5";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
  ctx.fillStyle = "#626b78";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2, Math.max(0, w - 12));
}

function drawImageFit(ctx: CanvasRenderingContext2D, image: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, fit: string): void {
  const iw = image.width;
  const ih = image.height;
  if (!iw || !ih || !w || !h) return;
  if (fit === "contain") {
    const scale = Math.min(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    return;
  }
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function drawTextItem(ctx: CanvasRenderingContext2D, node: Element, text: string, w: number): void {
  const style = window.getComputedStyle(node);
  const fontSize = Number.parseFloat(style.fontSize) || 16;
  const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.4;
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  ctx.fillStyle = style.color || "#222";
  ctx.textAlign = (style.textAlign === "start" ? "left" : style.textAlign === "end" ? "right" : style.textAlign) as CanvasTextAlign;
  ctx.textBaseline = "top";
  const align = ctx.textAlign;
  const x = align === "center" ? w / 2 : align === "right" ? w : 0;
  let y = 0;
  const maxWidth = Math.max(1, w);

  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const char of Array.from(paragraph)) {
      const candidate = line + char;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        ctx.fillText(line, x, y, maxWidth);
        y += lineHeight;
        line = char;
      } else line = candidate;
    }
    ctx.fillText(line, x, y, maxWidth);
    y += lineHeight;
  }
}

function safeCanvasDataUrl(canvas: HTMLCanvasElement): boolean {
  try {
    canvas.toDataURL("image/png");
    return true;
  } catch {
    return false;
  }
}

/**
 * Last-resort export that never rasterizes foreignObject HTML. It paints safe canvas layers,
 * text, and shapes directly; inaccessible image resources become placeholders.
 */
async function renderSafeCanvasFallback(source: HTMLElement, maxSide: number, mime: string): Promise<StageSnapshot> {
  const w = source.offsetWidth || 1920;
  const h = source.offsetHeight || 1080;
  const scale = maxSide / Math.max(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建导出画布");
  ctx.scale(scale, scale);
  let omittedResources = 0;

  const bg = source.querySelector<HTMLElement>(".canvas-stage__bg");
  const bgStyle = bg ? window.getComputedStyle(bg) : null;
  const bgColor = bgStyle?.backgroundColor;
  ctx.fillStyle = bgColor && bgColor !== "rgba(0, 0, 0, 0)" ? bgColor : "#ffffff";
  ctx.fillRect(0, 0, w, h);

  const backgroundImage = bgStyle?.backgroundImage ?? "none";
  const urls = cssUrls(backgroundImage);
  if (urls.length) {
    const image = await loadSafeRaster(urls[0]);
    if (image) drawImageFit(ctx, image, 0, 0, w, h, "cover");
    else omittedResources++;
    omittedResources += Math.max(0, urls.length - 1);
  } else if (backgroundImage.includes("gradient")) {
    const colors = backgroundImage.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) ?? [];
    if (colors.length >= 2) {
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      colors.forEach((color, index) => gradient.addColorStop(index / (colors.length - 1), color));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }
  }

  const items = Array.from(source.querySelectorAll<HTMLElement>("[data-item-id]"));
  for (const item of items) {
    const itemStyle = window.getComputedStyle(item);
    if (itemStyle.display === "none" || itemStyle.visibility === "hidden") continue;
    const x = Number.parseFloat(itemStyle.left) || item.offsetLeft;
    const y = Number.parseFloat(itemStyle.top) || item.offsetTop;
    const iw = item.offsetWidth;
    const ih = item.offsetHeight;
    if (!iw || !ih) continue;

    ctx.save();
    ctx.globalAlpha = Number.parseFloat(itemStyle.opacity) || 1;
    ctx.translate(x + iw / 2, y + ih / 2);
    const matrix = /^matrix\(([^)]+)\)$/.exec(itemStyle.transform);
    if (matrix) {
      const values = matrix[1].split(",").map(Number);
      if (Number.isFinite(values[0]) && Number.isFinite(values[1])) ctx.rotate(Math.atan2(values[1], values[0]));
    }
    ctx.translate(-iw / 2, -ih / 2);

    const chartCanvases = Array.from(item.querySelectorAll("canvas"));
    if (chartCanvases.length) {
      if (chartCanvases.every(safeCanvasDataUrl)) {
        for (const chartCanvas of chartCanvases) ctx.drawImage(chartCanvas, 0, 0, iw, ih);
      } else {
        drawPlaceholder(ctx, 0, 0, iw, ih, "跨域图表内容已替换");
        omittedResources++;
      }
      ctx.restore();
      continue;
    }

    const itemImage = item.querySelector<HTMLImageElement>("img");
    if (itemImage) {
      const safeImage = await loadSafeRaster(itemImage.getAttribute("src") ?? itemImage.src);
      if (safeImage) {
        const fit = window.getComputedStyle(itemImage).objectFit;
        drawImageFit(ctx, safeImage, 0, 0, iw, ih, fit);
      } else {
        drawPlaceholder(ctx, 0, 0, iw, ih, "跨域图片已替换");
        omittedResources++;
      }
      ctx.restore();
      continue;
    }

    const content = Array.from(item.children).find((node) => !node.hasAttribute("data-ui-only"));
    const text = content?.textContent?.trim();
    if (content && text) {
      drawTextItem(ctx, content, text, iw);
    } else if (content) {
      const shapeStyle = window.getComputedStyle(content);
      const fill = shapeStyle.backgroundColor;
      if (fill && fill !== "rgba(0, 0, 0, 0)") {
        ctx.fillStyle = fill;
        if (shapeStyle.borderRadius.includes("50%")) {
          ctx.beginPath();
          ctx.ellipse(iw / 2, ih / 2, iw / 2, ih / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(0, 0, iw, ih);
      }
      const borderWidth = Number.parseFloat(shapeStyle.borderTopWidth) || 0;
      if (borderWidth > 0 && shapeStyle.borderTopStyle !== "none") {
        ctx.strokeStyle = shapeStyle.borderTopColor;
        ctx.lineWidth = borderWidth;
        ctx.strokeRect(borderWidth / 2, borderWidth / 2, iw - borderWidth, ih - borderWidth);
      }
    }
    ctx.restore();
  }

  const dataUrl = mime === "image/png" ? canvas.toDataURL("image/png") : makeThumbnail(canvas);
  return { dataUrl, omittedResources };
}

/** Inline the live cascade: a serialized foreignObject does not inherit the app stylesheets. */
function inlineComputedStyles(source: HTMLElement, clone: HTMLElement): void {
  const originals: Element[] = [source, ...Array.from(source.querySelectorAll("*"))];
  const clones: Element[] = [clone, ...Array.from(clone.querySelectorAll("*"))];
  for (let index = 0; index < Math.min(originals.length, clones.length); index++) {
    const computed = window.getComputedStyle(originals[index]);
    const target = clones[index] as HTMLElement | SVGElement;
    for (let propertyIndex = 0; propertyIndex < computed.length; propertyIndex++) {
      const property = computed.item(propertyIndex);
      if (property) {
        target.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
      }
    }
  }
}

async function renderStageSnapshot(
  source: HTMLElement,
  maxSide: number,
  mime: string,
  stripAllImages = false
): Promise<StageSnapshot> {
  const clone = source.cloneNode(true) as HTMLElement;
  inlineComputedStyles(source, clone);
  clone.querySelectorAll("[data-ui-only]").forEach((n) => n.remove());
  clone.style.transform = "none";
  clone.style.boxShadow = "none";

  if (stripAllImages) return renderSafeCanvasFallback(source, maxSide, mime);

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
        // Retry using a direct safe canvas painter; do not rasterize a foreignObject for the fallback.
        if (!stripAllImages) return renderStageSnapshot(source, maxSide, mime, true);
        return renderSafeCanvasFallback(source, maxSide, mime);
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