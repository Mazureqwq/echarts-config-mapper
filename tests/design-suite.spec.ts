import { describe, expect, it } from "vitest";
import {
  BUILT_IN_SUITES,
  COMPONENT_COLOR_KEYS,
  DEFAULT_SUITE_ID,
  applySuiteToComponentProps,
  applySuiteToScreen,
  getSuite,
  isSuiteId,
  suiteForScreen,
  suitePalette,
} from "../src/core/design/suites";
import { MAP_QUICK_STYLES } from "../src/core/components/mapQuickStyles";
import { componentRegistry } from "../src/core/components/builtins";
import type { Screen } from "../src/core/model/types";

/**
 * Task 15（P1-3）：可视化套件（Design Suite）。
 *
 * 对齐稿的设计要求：套件是「风格约束维度」，把主题 token + 地图快速样式
 * + 组件默认样式绑成一个整体。**只影响新建元素与显式套用，绝不静默改写存量。**
 */

function blankScreen(overrides: Partial<Screen> = {}): Screen {
  return {
    id: "s1",
    name: "测试屏",
    canvas: { width: 1920, height: 1080, background: { kind: "color", color: "#12161d" } },
    items: [],
    updatedAt: 0,
    ...overrides,
  };
}

describe("套件注册表", () => {
  it("内置 6 套，与地图快速样式一一对应（复用而非另造概念）", () => {
    expect(BUILT_IN_SUITES).toHaveLength(6);
    expect(BUILT_IN_SUITES.map((s) => s.id)).toEqual(MAP_QUICK_STYLES.map((s) => s.id));
  });

  it("每套都有可读名、说明与完整的落地令牌", () => {
    for (const suite of BUILT_IN_SUITES) {
      expect(suite.name.trim()).not.toBe("");
      expect(suite.description.trim()).not.toBe("");
      expect(suite.mapStyleId).toBe(suite.id);
      expect(suite.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(suite.canvas).toMatch(/^#[0-9a-f]{6}$/i);
      expect(suite.palette.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("getSuite / isSuiteId 对未知 id 安全", () => {
    expect(getSuite("deep-sea")?.name).toBe("深海蓝");
    expect(getSuite("nope")).toBeUndefined();
    expect(getSuite(undefined)).toBeUndefined();
    expect(isSuiteId("jade")).toBe(true);
    expect(isSuiteId("nope")).toBe(false);
    expect(isSuiteId(42)).toBe(false);
    expect(DEFAULT_SUITE_ID).toBe("deep-sea");
  });

  it("suitePalette 派生自套件色带且首项为强调色", () => {
    const palette = suitePalette("jade");
    expect(palette.length).toBeGreaterThanOrEqual(4);
    expect(palette.every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
    expect(palette[0]).toBe(getSuite("jade")!.accent);
  });
});

describe("套件只影响新建元素（不静默改写存量）", () => {
  it("applySuiteToScreen 只设置套件 id 与画布背景，不动任何已有元素", () => {
    const text = {
      id: "t1", name: "标题", kind: "text" as const,
      frame: { x: 10, y: 10, w: 200, h: 40, rotate: 0 },
      text: "原标题", fontSize: 24, color: "#ffffff", align: "left" as const, weight: "normal" as const,
    };
    const screen = blankScreen({ items: [text] });
    const before = JSON.stringify(screen.items);

    const result = applySuiteToScreen(screen, "jade");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.screen.suiteId).toBe("jade");
    expect(result.screen.canvas.background).toEqual({ kind: "color", color: getSuite("jade")!.canvas });
    // 存量元素一个字节都不能变
    expect(JSON.stringify(result.screen.items)).toBe(before);
  });

  it("applySuiteToScreen 不修改传入的 screen（返回新对象）", () => {
    const screen = blankScreen();
    const before = JSON.stringify(screen);
    applySuiteToScreen(screen, "neon");
    expect(JSON.stringify(screen)).toBe(before);
  });

  it("未知套件 id 返回 ok:false 与可读原因", () => {
    const result = applySuiteToScreen(blankScreen(), "not-a-suite");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("未知");
  });

  it("suiteForScreen 对未设置 / 非法 suiteId 回退默认套件", () => {
    expect(suiteForScreen(blankScreen()).id).toBe(DEFAULT_SUITE_ID);
    expect(suiteForScreen(blankScreen({ suiteId: "jade" })).id).toBe("jade");
    expect(suiteForScreen(blankScreen({ suiteId: "bogus" })).id).toBe(DEFAULT_SUITE_ID);
    expect(suiteForScreen(null).id).toBe(DEFAULT_SUITE_ID);
  });
});

describe("新建元素的套件默认值", () => {
  it("为新组件提供套件化的默认 props（标题栏用套件强调色）", () => {
    const props = applySuiteToComponentProps("chartforge.section-title", {}, "jade");
    expect(props.accentColor).toBe(getSuite("jade")!.accent);
  });

  it("已有显式值不被套件默认值覆盖", () => {
    const props = applySuiteToComponentProps("chartforge.section-title", { accentColor: "#ff0000" }, "jade");
    expect(props.accentColor).toBe("#ff0000");
  });

  it("不向没有该 props 的组件注入幽灵键（KPI 无颜色 props）", () => {
    const props = applySuiteToComponentProps("chartforge.kpi", { label: "x" }, "jade");
    expect(props).toEqual({ label: "x" });
    expect("color" in props).toBe(false);
  });

  it("颜色 props 白名单必须真实存在于组件注册表（防假接线）", () => {
    expect(Object.keys(COMPONENT_COLOR_KEYS).length).toBeGreaterThan(0);
    for (const [componentId, keys] of Object.entries(COMPONENT_COLOR_KEYS)) {
      const entry = componentRegistry.list().find((definition) => definition.id === componentId);
      expect(entry, `注册表里找不到 ${componentId}`).toBeTruthy();
      const declared = new Set(entry!.props.filter((prop) => prop.type === "color").map((prop) => prop.key));
      for (const key of keys) {
        expect(declared.has(key), `${componentId} 未声明 color 类型 prop: ${key}`).toBe(true);
      }
    }
  });

  it("未知组件 / 未知套件时原样返回入参内容", () => {
    expect(applySuiteToComponentProps("chartforge.unknown", { a: 1 }, "jade")).toEqual({ a: 1 });
    expect(applySuiteToComponentProps("chartforge.kpi", { a: 1 }, "nope")).toEqual({ a: 1 });
  });

  it("不修改传入的 props 对象", () => {
    const props = { label: "x" };
    applySuiteToComponentProps("chartforge.kpi", props, "jade");
    expect(props).toEqual({ label: "x" });
  });

  it("地图组件拿到套件的 quickStyle（新建地图即符合套件观感）", () => {
    const props = applySuiteToComponentProps("chartforge.map-scene-flat", { presentation: "flat" }, "sandstone");
    const quickStyle = props.quickStyle as { id: string; tokens: { background: string } };
    expect(quickStyle.id).toBe("sandstone");
    expect(quickStyle.tokens.background).toBe(getSuite("sandstone")!.canvas);
  });
});
