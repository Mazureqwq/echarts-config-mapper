import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DECOR_ENTRIES,
  DECOR_GROUPS,
  createDecorItems,
  decorSvg,
  isDecorPngEntry,
  listDecorEntries,
} from "../src/core/design/decorations";
import { DECOR_PNG_SIZES, decorPngDataUrl } from "../src/core/design/decorPng";
// @ts-expect-error —— 生成脚本是 .mjs，没有类型声明
import { collectAssets, renderModule } from "../scripts/sync-decor-png.mjs";
import type { ImageItem } from "../src/core/model/types";

const CANVAS = { width: 1600, height: 900 };
const PNG_ENTRIES = DECOR_ENTRIES.filter(isDecorPngEntry);
const SVG_ENTRIES = DECOR_ENTRIES.filter((entry) => !isDecorPngEntry(entry));

describe("PNG 装饰素材目录（T18）", () => {
  it("四类都配了成品 PNG 素材", () => {
    for (const group of DECOR_GROUPS) {
      const png = listDecorEntries(group).filter(isDecorPngEntry);
      expect(png.length, `分组 ${group} 缺少 PNG 素材`).toBeGreaterThan(0);
    }
  });

  it("原有 23 个矢量装饰一个都没少（用户要求保留）", () => {
    expect(SVG_ENTRIES.length).toBe(23);
    // T17 的分组分布也原样保留
    const byGroup = DECOR_GROUPS.map((group) => SVG_ENTRIES.filter((entry) => entry.group === group).length);
    expect(byGroup).toEqual([5, 5, 6, 7]);
  });

  it("PNG 条目的 asset 字段唯一、且都能取到数据 URL", () => {
    const assets = PNG_ENTRIES.map((entry) => entry.asset);
    expect(new Set(assets).size).toBe(assets.length);
    for (const entry of PNG_ENTRIES) {
      expect(entry.asset, `${entry.id} 缺少 asset`).toBeTruthy();
      expect(decorPngDataUrl(entry.asset as string), `${entry.id} 的素材取不到`).toMatch(
        /^data:image\/png;base64,/
      );
    }
  });

  it("没有多余的素材文件（每个 PNG 都被条目引用）", () => {
    const referenced = new Set(PNG_ENTRIES.map((entry) => entry.asset));
    for (const slug of Object.keys(DECOR_PNG_SIZES)) {
      expect(referenced.has(slug), `素材 ${slug} 没有任何条目引用`).toBe(true);
    }
  });

  it("标称尺寸与 PNG 原生像素尺寸一致", () => {
    for (const entry of PNG_ENTRIES) {
      const native = DECOR_PNG_SIZES[entry.asset as string];
      expect(entry.size.w, `${entry.id} 宽度与素材不符`).toBe(native.w);
      expect(entry.size.h, `${entry.id} 高度与素材不符`).toBe(native.h);
    }
  });

  it("数据 URL 解码后确实是 PNG（magic + IHDR 尺寸自洽）", () => {
    for (const entry of PNG_ENTRIES) {
      const src = decorPngDataUrl(entry.asset as string) as string;
      const bytes = Buffer.from(src.split(",")[1] ?? "", "base64");
      expect(bytes.subarray(0, 8).toString("hex"), `${entry.id} 不是 PNG`).toBe("89504e470d0a1a0a");
      // 带 alpha 通道才可能是「免抠」素材；直接查 IHDR 的颜色类型（偏移 25）
      expect(bytes[25], `${entry.id} 没有 alpha 通道`).toBe(6);
      expect(bytes.readUInt32BE(16)).toBe(entry.size.w);
      expect(bytes.readUInt32BE(20)).toBe(entry.size.h);
    }
  });

  it("decorSvg 对 PNG 条目返回空串（矢量与位图两条交付路径互不走错）", () => {
    for (const entry of PNG_ENTRIES) {
      expect(decorSvg(entry.id), `${entry.id} 不该有 SVG`).toBe("");
    }
    // 反向：矢量条目仍然有 SVG
    for (const entry of SVG_ENTRIES) expect(decorSvg(entry.id).startsWith("<svg")).toBe(true);
  });

  it("createDecorItems 对 PNG 条目产出位图元素", () => {
    const entry = PNG_ENTRIES.find((item) => item.group === "title-frame") ?? PNG_ENTRIES[0];
    const [item] = createDecorItems(entry.id, CANVAS) as ImageItem[];
    expect(item.kind).toBe("image");
    expect(item.src.startsWith("data:image/png;base64,")).toBe(true);
    expect(item.fit).toBe("fill");
    expect(item.name).toBe(entry.name);
    expect(item.frame.w).toBe(entry.size.w);
    expect(item.frame.h).toBe(entry.size.h);
  });

  it("PNG 大屏边框同样铺满画布", () => {
    const entry = PNG_ENTRIES.find((item) => item.group === "screen-border");
    const [item] = createDecorItems(entry?.id as string, CANVAS, { position: { x: 10, y: 10 } });
    expect(item.frame).toEqual({ x: 0, y: 0, w: 1600, h: 900, rotate: 0 });
  });

  it("PNG 背景框按原生尺寸居中，落点照旧被夹在画布内", () => {
    const entry = PNG_ENTRIES.find((item) => item.id === "decor-png-panel-violet");
    const [center] = createDecorItems(entry?.id as string, CANVAS);
    expect(center.frame.x).toBe(Math.round((1600 - entry!.size.w) / 2));
    const [edge] = createDecorItems(entry?.id as string, CANVAS, { position: { x: 1599, y: 899 } });
    expect(edge.frame.x + edge.frame.w).toBeLessThanOrEqual(1600);
    expect(edge.frame.y + edge.frame.h).toBeLessThanOrEqual(900);
  });

  it("PNG 素材总字节数受控（不许把几十 MB 塞进文档）", () => {
    const total = PNG_ENTRIES.reduce((sum, entry) => {
      const src = decorPngDataUrl(entry.asset as string) as string;
      return sum + Buffer.from(src.split(",")[1] ?? "", "base64").length;
    }, 0);
    expect(total).toBeGreaterThan(0);
    expect(total, "素材总量应小于 1 MB").toBeLessThan(1024 * 1024);
  });
});

describe("PNG 素材与源文件同步", () => {
  it("decorPng.ts 与 src/assets/decor-png/*.png 完全一致", () => {
    const assetDir = join(process.cwd(), "src/assets/decor-png");
    const expected = renderModule(collectAssets(assetDir));
    const actual = readFileSync(join(process.cwd(), "src/core/design/decorPng.ts"), "utf8");
    expect(actual).toBe(expected);
  });
});
