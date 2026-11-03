import { makeThumbnail, THUMBNAIL_MAX_SIDE } from "@/core/storage/thumbnail";

export async function snapshotStage(source: HTMLElement, maxSide: number = THUMBNAIL_MAX_SIDE, mime: string = "image/jpeg"): Promise<string> {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-ui-only]").forEach((n) => n.remove());
  clone.style.transform = "none";
  clone.style.boxShadow = "none";

  const originals = Array.from(source.querySelectorAll("canvas"));
  const clones = Array.from(clone.querySelectorAll("canvas"));
  clones.forEach((c, i) => {
    const img = document.createElement("img");
    try {
      img.src = originals[i].toDataURL();
    } catch {
      img.src = "";
    }
    img.setAttribute("style", c.getAttribute("style") ?? "");
    img.width = c.width;
    img.height = c.height;
    c.replaceWith(img);
  });

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
      img.onerror = () => reject(new Error("缩略图渲染失败"));
      img.src = url;
    });
    const scale = maxSide / Math.max(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建画布");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (mime === "image/png") {
      return canvas.toDataURL("image/png");
    }
    return makeThumbnail(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 2 倍 PNG 导出：1920x1080 画布 -> 3840x2160 */
export async function snapshotStagePng(source: HTMLElement): Promise<string> {
  const w = source.offsetWidth || 1920;
  const h = source.offsetHeight || 1080;
  return snapshotStage(source, Math.max(w, h) * 2, "image/png");
}