#!/usr/bin/env node
/**
 * T18：把 `src/assets/decor-png/*.png` 编译成 `src/core/design/decorPng.ts`。
 *
 * ── 为什么要把 PNG 内联成 base64 ─────────────────────────────────────────
 * 画布元素（`ImageItem`）的 `src` 会被原样写进文档 JSON、写进导出产物。
 * 如果这里放的是 `/decor-png/x.png` 这种根相对 URL，导出的单文件产物
 * 离开本站就取不到图了。Data URL 是唯一能让「编辑态 / 导出态」一致的形态，
 * 也和既有的 23 个矢量装饰（`decorSvg()` 同样产出 data URL）保持同一套契约。
 *
 * 代价是这些字节会进主包。素材总量约 450 KB（base64 后约 600 KB），
 * 换来的是装饰零外链、可离线、导出即用。
 *
 * ── 用法 ────────────────────────────────────────────────────────────────
 *   node scripts/sync-decor-png.mjs           # 重写 decorPng.ts
 *   node scripts/sync-decor-png.mjs --check   # 只校验，不通过则退出码 1
 *
 * 无第三方依赖：只用 node:fs。加了新 PNG 后跑一次即可。
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const assetDir = join(root, "src/assets/decor-png");
const outFile = join(root, "src/core/design/decorPng.ts");

/** 只认这几个 ASCII slug，防止文件名里的杂字符混进 TS 标识符注释。 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function collectAssets(dir = assetDir) {
  const files = readdirSync(dir)
    .filter((name) => extname(name).toLowerCase() === ".png")
    .sort();
  const assets = [];
  for (const file of files) {
    const slug = basename(file, extname(file));
    if (!SLUG_RE.test(slug)) throw new Error(`素材文件名不合法（只允许小写字母/数字/连字符）：${file}`);
    const bytes = readFileSync(join(dir, file));
    // PNG magic：89 50 4E 47 0D 0A 1A 0A
    const magic = bytes.subarray(0, 8).toString("hex");
    if (magic !== "89504e470d0a1a0a") throw new Error(`不是合法 PNG：${file}`);
    // IHDR 宽高（大端，偏移 16..24）
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    assets.push({ slug, file, width, height, bytes: bytes.length, base64: bytes.toString("base64") });
  }
  return assets;
}

export function renderModule(assets) {
  const lines = [];
  lines.push("/**");
  lines.push(" * ⚠️ 本文件由 `scripts/sync-decor-png.mjs` 自动生成，请勿手改。");
  lines.push(" *");
  lines.push(" * 内置 PNG 装饰素材（T18）：原始文件在 `src/assets/decor-png/`，");
  lines.push(" * 这里把它们内联成数据 URL，供画布元素与缩略图共用同一份字节。");
  lines.push(" * 素材来源与许可见 `src/assets/decor-png/README.md`。");
  lines.push(" */");
  lines.push("");
  lines.push("/** 素材 slug → 数据 URL。slug 与 `DECOR_ENTRIES` 的 `asset` 字段一一对应。 */");
  lines.push("export const DECOR_PNG_ASSETS: Readonly<Record<string, string>> = Object.freeze({");
  for (const a of assets) {
    lines.push(`  ${JSON.stringify(a.slug)}: "data:image/png;base64,${a.base64}",`);
  }
  lines.push("});");
  lines.push("");
  lines.push("/** 素材的原生像素尺寸，供测试与缩略图宽高比使用。 */");
  lines.push("export const DECOR_PNG_SIZES: Readonly<Record<string, { readonly w: number; readonly h: number }>> =");
  lines.push("  Object.freeze({");
  for (const a of assets) lines.push(`    ${JSON.stringify(a.slug)}: Object.freeze({ w: ${a.width}, h: ${a.height} }),`);
  lines.push("  });");
  lines.push("");
  lines.push("export function decorPngDataUrl(slug: string): string | undefined {");
  lines.push("  return Object.prototype.hasOwnProperty.call(DECOR_PNG_ASSETS, slug) ? DECOR_PNG_ASSETS[slug] : undefined;");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const assets = collectAssets();
  if (assets.length === 0) throw new Error(`没有找到任何 PNG：${assetDir}`);
  const next = renderModule(assets);
  const check = process.argv.includes("--check");
  let prev = "";
  try {
    prev = readFileSync(outFile, "utf8");
  } catch {
    prev = "";
  }
  if (check) {
    if (prev !== next) {
      console.error("✗ decorPng.ts 与素材文件不一致，请运行 node scripts/sync-decor-png.mjs");
      process.exit(1);
    }
    console.log(`✓ decorPng.ts 与 ${assets.length} 个素材一致`);
  } else {
    writeFileSync(outFile, next, "utf8");
    const total = assets.reduce((sum, a) => sum + a.bytes, 0);
    for (const a of assets) console.log(`  ${a.slug.padEnd(16)} ${a.width}×${a.height}  ${(a.bytes / 1024).toFixed(1)} KB`);
    console.log(`✓ 写入 ${outFile}（${assets.length} 个素材，${(total / 1024).toFixed(1)} KB）`);
  }
}
