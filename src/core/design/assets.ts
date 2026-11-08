import type { DesignAsset, DesignAssetMime, Workspace } from "@/core/model/types";
import { IMAGE_MAX_SIDE, targetSize } from "@/core/storage/imageCompress";

export const MAX_DESIGN_ASSET_BYTES = 2 * 1024 * 1024;
export const MAX_DESIGN_ASSETS_TOTAL_BYTES = 20 * 1024 * 1024;
export const DESIGN_ASSET_MIMES: readonly DesignAssetMime[] = ["image/svg+xml", "image/png", "image/webp"];

export type DesignAssetInput = {
  id?: string;
  name: string;
  mime: string;
  content?: string;
  dataUrl?: string;
};

export type DesignAssetResult =
  | { ok: true; asset: DesignAsset }
  | { ok: false; error: string };

function uuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `design-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const hasB = index + 1 < bytes.length;
    const hasC = index + 2 < bytes.length;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    output += alphabet[a >> 2];
    output += alphabet[((a & 3) << 4) | (b >> 4)];
    output += hasB ? alphabet[((b & 15) << 2) | (c >> 6)] : "=";
    output += hasC ? alphabet[c & 63] : "=";
  }
  return output;
}

function base64ToBytes(value: string): Uint8Array | null {
  const input = value.trim();
  if (!input || input.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input)) return null;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const padding = input.endsWith("==") ? 2 : input.endsWith("=") ? 1 : 0;
  const output = new Uint8Array((input.length / 4) * 3 - padding);
  let offset = 0;
  for (let index = 0; index < input.length; index += 4) {
    const a = alphabet.indexOf(input[index] ?? "");
    const b = alphabet.indexOf(input[index + 1] ?? "");
    const c = input[index + 2] === "=" ? 0 : alphabet.indexOf(input[index + 2] ?? "");
    const d = input[index + 3] === "=" ? 0 : alphabet.indexOf(input[index + 3] ?? "");
    if (a < 0 || b < 0 || c < 0 || d < 0) return null;
    if (offset < output.length) output[offset++] = (a << 2) | (b >> 4);
    if (offset < output.length) output[offset++] = ((b & 15) << 4) | (c >> 2);
    if (offset < output.length) output[offset++] = ((c & 3) << 6) | d;
  }
  return output;
}

function dataUrlParts(dataUrl: string): { mime: string; payload: string } | null {
  const match = /^data:(image\/(?:svg\+xml|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  return match ? { mime: match[1]!.toLowerCase(), payload: match[2]! } : null;
}

function randomSafeName(name: string): string {
  const cleaned = String(name ?? "").replace(/[\/\\\u0000-\u001f<>]/g, "").trim().slice(0, 120);
  return cleaned || "未命名素材";
}

/**
 * Conservative SVG sanitizer for offline assets. It permits only local fragment references in
 * href/src and strips executable or externally resolving markup and styles before storage.
 */
export function sanitizeSvg(source: string): string {
  let svg = String(source ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  svg = svg
    .replace(/<(?:script|foreignObject|iframe|object|embed|audio|video|link)\b[^>]*>[\s\S]*?<\/(?:script|foreignObject|iframe|object|embed|audio|video|link)\s*>/gi, "")
    .replace(/<(?:script|foreignObject|iframe|object|embed|audio|video|link)\b[^>]*\/?>/gi, "");
  svg = svg.replace(/\s+xml:base\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  svg = svg.replace(/\s+on[a-z0-9_:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  svg = svg.replace(/\s+(?:xlink:)?(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, (attribute, doubleQuoted: string, singleQuoted: string, unquoted: string) => {
    const value = (doubleQuoted ?? singleQuoted ?? unquoted ?? "").trim();
    return /^#[a-zA-Z_][\w:.-]*$/.test(value) ? attribute : "";
  });
  svg = svg.replace(/\burl\s*\((?:[^()]|\([^()]*\))*\)/gi, "none");
  svg = svg.replace(/@import\b[^;]*(?:;|$)/gi, "");
  if (!/<svg\b/i.test(svg) || !/<\/svg\s*>/i.test(svg)) return "";
  return svg.trim();
}

function makeAsset(input: DesignAssetInput): DesignAssetResult {
  if (!DESIGN_ASSET_MIMES.includes(input.mime as DesignAssetMime)) {
    return { ok: false, error: "不支持此素材格式；请使用 SVG、PNG 或 WebP。" };
  }
  const mime = input.mime as DesignAssetMime;
  let dataUrl: string;
  let bytes: number;
  if (mime === "image/svg+xml") {
    let source = input.content;
    if (source === undefined && input.dataUrl) {
      const parts = dataUrlParts(input.dataUrl);
      if (!parts || parts.mime !== mime) return { ok: false, error: "SVG 素材数据无效。" };
      const decoded = base64ToBytes(parts.payload);
      if (!decoded) return { ok: false, error: "SVG 素材编码无效。" };
      source = new TextDecoder().decode(decoded);
    }
    if (source === undefined) return { ok: false, error: "SVG 素材内容为空。" };
    const sanitized = sanitizeSvg(source);
    if (!sanitized) return { ok: false, error: "SVG 文件无效，未找到完整的 SVG 根元素。" };
    const encoded = new TextEncoder().encode(sanitized);
    bytes = encoded.byteLength;
    dataUrl = `data:image/svg+xml;base64,${bytesToBase64(encoded)}`;
  } else {
    const parts = input.dataUrl ? dataUrlParts(input.dataUrl) : null;
    if (!parts || parts.mime !== mime) return { ok: false, error: "图片素材数据无效或格式与内容不匹配。" };
    const decoded = base64ToBytes(parts.payload);
    if (!decoded) return { ok: false, error: "图片素材编码无效。" };
    bytes = decoded.byteLength;
    dataUrl = `data:${mime};base64,${parts.payload}`;
  }
  if (bytes > MAX_DESIGN_ASSET_BYTES) {
    return { ok: false, error: `单个素材不得超过 2 MiB（当前约 ${(bytes / 1024 / 1024).toFixed(2)} MiB）。` };
  }
  return {
    ok: true,
    asset: { id: input.id?.trim() || uuid(), name: randomSafeName(input.name), mime, dataUrl, bytes },
  };
}

export function createDesignAsset(input: DesignAssetInput): DesignAssetResult {
  return makeAsset(input);
}

export function normalizeDesignAssets(raw: unknown): DesignAsset[] {
  if (!Array.isArray(raw)) return [];
  const assets: DesignAsset[] = [];
  const ids = new Set<string>();
  let totalBytes = 0;
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.id !== "string" || !candidate.id.trim() || ids.has(candidate.id)) continue;
    const result = makeAsset({
      id: candidate.id,
      name: typeof candidate.name === "string" ? candidate.name : "未命名素材",
      mime: typeof candidate.mime === "string" ? candidate.mime : "",
      dataUrl: typeof candidate.dataUrl === "string" ? candidate.dataUrl : "",
    });
    if (!result.ok || totalBytes + result.asset.bytes > MAX_DESIGN_ASSETS_TOTAL_BYTES) continue;
    assets.push(result.asset);
    ids.add(result.asset.id);
    totalBytes += result.asset.bytes;
  }
  return assets;
}

export function addDesignAssetToWorkspace(workspace: Workspace, asset: DesignAsset): DesignAssetResult {
  const assets = Array.isArray(workspace.designAssets) ? workspace.designAssets : [];
  const safeNewAsset = normalizeDesignAssets([asset])[0];
  if (!safeNewAsset) return { ok: false, error: "素材数据无效或超过 2 MiB，未保存。" };
  if (assets.some((entry) => entry.id === safeNewAsset.id)) return { ok: false, error: "此素材已存在。" };
  const checkedAssets = normalizeDesignAssets(assets);
  if (checkedAssets.length !== assets.length) {
    return { ok: false, error: "工作区素材数据无效，请重新导入或移除损坏素材。" };
  }
  const used = getDesignAssetTotalBytes(checkedAssets);
  if (used + safeNewAsset.bytes > MAX_DESIGN_ASSETS_TOTAL_BYTES) {
    return { ok: false, error: "工作区素材总量不得超过 20 MiB；请先删除不需要的素材。" };
  }
  workspace.designAssets.push(safeNewAsset);
  return { ok: true, asset: safeNewAsset };
}

export function getDesignAssetTotalBytes(assets: readonly DesignAsset[]): number {
  return assets.reduce((total, asset) => total + Math.max(0, Number(asset.bytes) || 0), 0);
}

function dataUrlByteLength(dataUrl: string): number {
  const parts = dataUrlParts(dataUrl);
  const bytes = parts ? base64ToBytes(parts.payload) : null;
  return bytes?.byteLength ?? Number.POSITIVE_INFINITY;
}

/** Canvas encoder for local PNG/WebP uploads. Reuses the existing side-length policy. */
export async function compressDesignImageFile(file: File): Promise<{ mime: "image/png" | "image/webp"; dataUrl: string }> {
  const fileType = file.type || (/\.webp$/i.test(file.name) ? "image/webp" : /\.png$/i.test(file.name) ? "image/png" : "");
  if (fileType !== "image/png" && fileType !== "image/webp") {
    throw new Error("只支持 PNG 或 WebP 图片素材。");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const size = targetSize(bitmap.width, bitmap.height, IMAGE_MAX_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法读取图片画布。");
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    for (const quality of [0.92, 0.84, 0.74, 0.64, 0.54, 0.44]) {
      const dataUrl = canvas.toDataURL("image/webp", quality);
      const mime = dataUrl.startsWith("data:image/webp;") ? "image/webp" : dataUrl.startsWith("data:image/png;") ? "image/png" : null;
      if (mime && dataUrlByteLength(dataUrl) <= MAX_DESIGN_ASSET_BYTES) return { mime, dataUrl };
    }
    const png = canvas.toDataURL("image/png");
    if (png.startsWith("data:image/png;") && dataUrlByteLength(png) <= MAX_DESIGN_ASSET_BYTES) return { mime: "image/png", dataUrl: png };
    throw new Error("图片压缩后仍超过 2 MiB，请缩小图片后重试。");
  } finally {
    bitmap.close();
  }
}
