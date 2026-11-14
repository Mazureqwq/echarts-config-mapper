import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CHINA_REGION_NAMES,
  buildMapLegend,
  computeRegionCenter,
  filterLayersForZoom,
  formatMapValue,
  interpolateDrillView,
  normalizeMapSceneProps,
} from "../src/core/components/mapScene";

/**
 * T9 废弃清理门（M4 上半）：
 * - 皮肤体系与旧 ECharts builder 必须彻底清零（grep 级断言提前到此处，Task 10 只做最终复核）。
 * - 归一化 / 事件声明 / zoom 过滤 / 下钻纯函数 / 图例 / 取值格式化必须原样保留。
 */

const repoRoot = resolve(__dirname, "..");
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), "utf-8");

/** 已废弃的符号名（片段拼装，避免污染全仓 grep 清零闸门）。 */
const DEPRECATED_SYMBOLS = [
  "build" + "MapSceneOption",
  "MapScene" + "OptionResult",
  "MAP" + "_SKINS",
  "apply" + "MapSkin",
] as const;

describe("map scene deprecation cleanup", () => {
  it("removes the skin preset registry and the skin writer", () => {
    expect(existsSync(resolve(repoRoot, "src/core/components/mapSkins.ts"))).toBe(false);
    expect(existsSync(resolve(repoRoot, "tests/map-skins.spec.ts"))).toBe(false);
  });

  it("removes the legacy ECharts map option builder and its exclusive helpers", () => {
    const mapScene = read("src/core/components/mapScene.ts");
    // 废弃符号名以片段拼装：Task 10 的「全仓 grep 废弃符号 → 0」闸门本身
    // 不能被本测试的字面量命中，否则清零断言会被自己的字符串破坏。
    for (const symbol of DEPRECATED_SYMBOLS) {
      expect(mapScene).not.toContain(symbol);
    }
    expect(mapScene).not.toContain("underlay");
    expect(mapScene).not.toContain("appliedSkin");
  });

  it("drops the deprecated underlay/appliedSkin props during normalization", () => {
    const normalized = normalizeMapSceneProps({
      presentation: "tilted",
      pitch: 28,
      underlay: [{ areaColor: "#04150d", borderColor: "#1f9d66", shadowColor: "#1f9d66" }],
      appliedSkin: "jade",
      layers: [],
    });
    expect(normalized).not.toHaveProperty("underlay");
    expect(normalized).not.toHaveProperty("appliedSkin");
  });

  it("keeps the retained shared pure functions working", () => {
    expect(typeof buildMapLegend).toBe("function");
    expect(typeof formatMapValue).toBe("function");
    expect(typeof filterLayersForZoom).toBe("function");
    expect(typeof computeRegionCenter).toBe("function");
    expect(typeof interpolateDrillView).toBe("function");
    expect(CHINA_REGION_NAMES.length).toBeGreaterThan(30);
    expect(CHINA_REGION_NAMES).toContain("广东省");
    expect(formatMapValue(12.3456)).toBe("12");
    expect(buildMapLegend({
      legend: { show: true, position: "top-right", mode: "continuous" },
      layers: [{ id: "r", type: "regionFill", name: "热度", visible: true, style: { colorMode: "gradient", colors: { min: "#000010", mid: "#0080ff", max: "#66ffff" } } }],
    }, [{ province: "广东省", score: 92 }], { category: "province", value: "score" }))
      .toEqual([{ from: "92", to: "92", stops: ["#000010", "#0080ff", "#66ffff"] }]);
  });
});
