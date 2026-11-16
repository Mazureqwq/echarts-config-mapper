import { describe, expect, it } from "vitest";
import {
  DECOR_ENTRIES,
  isDecorPngEntry,
  DECOR_GROUPS,
  DECOR_GROUP_META,
  DEFAULT_DECOR_ACCENT,
  createDecorItems,
  decorSvg,
  getDecorEntry,
  isDecorId,
  listDecorEntries,
} from "../src/core/design/decorations";
import type { ImageItem } from "../src/core/model/types";

const CANVAS = { width: 1600, height: 900 };
/** 矢量条目：T18 之后目录里还混着成品 PNG 条目，走 SVG 断言的只挑矢量那条路。 */
const SVG_ENTRIES = DECOR_ENTRIES.filter((entry) => !isDecorPngEntry(entry));

describe("装饰素材目录（T17）", () => {
  it("四个分组都非空，且分组顺序稳定", () => {
    expect([...DECOR_GROUPS]).toEqual(["screen-border", "title-frame", "panel-frame", "ornament"]);
    for (const group of DECOR_GROUPS) {
      expect(listDecorEntries(group).length, `分组 ${group} 不应为空`).toBeGreaterThan(0);
    }
    expect(DECOR_GROUP_META.map((meta) => meta.id)).toEqual([...DECOR_GROUPS]);
  });

  it("条目 id 唯一、名称唯一、都有描述", () => {
    const ids = DECOR_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = DECOR_ENTRIES.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    for (const entry of DECOR_ENTRIES) {
      expect(entry.description.length).toBeGreaterThan(4);
      expect(entry.size.w).toBeGreaterThan(0);
      expect(entry.size.h).toBeGreaterThan(0);
    }
  });

  it("分组内条目数与目录自洽", () => {
    const total = DECOR_GROUPS.reduce((sum, group) => sum + listDecorEntries(group).length, 0);
    expect(total).toBe(DECOR_ENTRIES.length);
  });

  it("getDecorEntry / isDecorId 只认已登记的 id", () => {
    expect(getDecorEntry("decor-panel-glass")?.name).toBe("玻璃面板框");
    expect(getDecorEntry("decor-nope")).toBeUndefined();
    expect(isDecorId("decor-panel-glass")).toBe(true);
    expect(isDecorId("decor-nope")).toBe(false);
  });
});

describe("decorSvg 是纯函数", () => {
  it("同输入必然同输出", () => {
    for (const entry of SVG_ENTRIES) {
      expect(decorSvg(entry.id, "#29d3ff")).toBe(decorSvg(entry.id, "#29d3ff"));
    }
  });

  it("每个矢量条目都能产出合法 SVG，且 viewBox 与标称尺寸一致", () => {
    for (const entry of SVG_ENTRIES) {
      const svg = decorSvg(entry.id);
      expect(svg.startsWith("<svg"), `${entry.id} 应以 <svg 开头`).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain(`viewBox="0 0 ${entry.size.w} ${entry.size.h}"`);
      expect(svg).toContain(`width="${entry.size.w}"`);
      expect(svg).toContain(`height="${entry.size.h}"`);
    }
  });

  it("不引用任何外部资源（离线可用）", () => {
    // 唯一允许出现的 URL 是 SVG 命名空间声明本身——它是标识符，不会发起请求
    const NAMESPACE = "http://www.w3.org/2000/svg";
    for (const entry of SVG_ENTRIES) {
      const svg = decorSvg(entry.id);
      expect(svg.split(NAMESPACE).join(""), `${entry.id} 引用了外部 URL`).not.toMatch(/https?:\/\//i);
      expect(svg).not.toMatch(/<image/i);
      expect(svg).not.toMatch(/xlink:href/i);
      expect(svg).not.toMatch(/url\(\s*['"]?https?:/i);
      expect(svg.match(/xmlns=/g)?.length).toBe(1);
      expect(svg).toContain(`xmlns="${NAMESPACE}"`);
    }
  });

  it("遵守强调色，非法颜色回退默认值而不是注入进文档", () => {
    expect(decorSvg("decor-title-angled", "#ff8800")).toContain("#ff8800");
    const injected = decorSvg("decor-title-angled", '"/><script>alert(1)</script>');
    expect(injected).not.toContain("<script");
    expect(injected).toContain(DEFAULT_DECOR_ACCENT);
  });

  it("未知 id 返回空串（调用方据此拒绝插入）", () => {
    expect(decorSvg("decor-nope")).toBe("");
  });

  it("同一 SVG 内的渐变 / 图案 id 不重复（避免互相覆盖）", () => {
    for (const entry of SVG_ENTRIES) {
      const ids = [...decorSvg(entry.id).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size, `${entry.id} 存在重复 id`).toBe(ids.length);
    }
  });
});

describe("createDecorItems 落位规则", () => {
  it("大屏边框铺满画布，忽略落点", () => {
    const [item] = createDecorItems("decor-border-bracket", CANVAS, { position: { x: 100, y: 100 } });
    expect(item.frame).toEqual({ x: 0, y: 0, w: 1600, h: 900, rotate: 0 });
  });

  it("其余按标称尺寸居中", () => {
    const [item] = createDecorItems("decor-panel-glass", CANVAS);
    expect(item.frame.w).toBe(480);
    expect(item.frame.h).toBe(300);
    expect(item.frame.x).toBe(560);
    expect(item.frame.y).toBe(300);
  });

  it("给定落点时以落点为中心，并被夹在画布内", () => {
    const [near] = createDecorItems("decor-orn-rings", CANVAS, { position: { x: 300, y: 200 } });
    expect(near.frame.x).toBe(200);
    expect(near.frame.y).toBe(100);

    const [edge] = createDecorItems("decor-orn-rings", CANVAS, { position: { x: 1590, y: 890 } });
    expect(edge.frame.x + edge.frame.w).toBeLessThanOrEqual(1600);
    expect(edge.frame.y + edge.frame.h).toBeLessThanOrEqual(900);
    expect(edge.frame.x).toBeGreaterThanOrEqual(0);
  });

  it("产出图片元素，带 data URL 与填充模式", () => {
    const [item] = createDecorItems("decor-title-angled", CANVAS) as ImageItem[];
    expect(item.kind).toBe("image");
    expect(item.src.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(item.fit).toBe("fill");
    expect(item.name).toBe("斜切标题框");
  });

  it("强调色真的写进了产出的 SVG", () => {
    const [item] = createDecorItems("decor-panel-glass", CANVAS, { accent: "#ff8800" }) as ImageItem[];
    const decoded = atob(item.src.split(",")[1] ?? "");
    expect(decoded).toContain("#ff8800");
  });

  it("未知 id / 非法画布 / 非法落点都返回空数组", () => {
    expect(createDecorItems("decor-nope", CANVAS)).toEqual([]);
    expect(createDecorItems("decor-panel-glass", { width: 0, height: 100 })).toEqual([]);
    expect(createDecorItems("decor-panel-glass", { width: Number.NaN, height: 900 })).toEqual([]);
    expect(createDecorItems("decor-panel-glass", CANVAS, { position: { x: Number.NaN, y: 10 } })).toEqual([]);
  });

  it("标称尺寸大于画布时被裁到画布大小", () => {
    const [item] = createDecorItems("decor-panel-glass", { width: 200, height: 120 });
    expect(item.frame.w).toBe(200);
    expect(item.frame.h).toBe(120);
    expect(item.frame.x).toBe(0);
    expect(item.frame.y).toBe(0);
  });
});
