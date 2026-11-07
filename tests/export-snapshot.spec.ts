import { describe, it, expect } from "vitest";
import { buildPackagePayload, isSafeImageSrc, toPackageScreen } from "../src/core/export/snapshot";
import { createWorkspace, createScreen, createChartAsset, createChartSpec } from "../src/core/model/schema";
import type { ChartItem, ComponentItem, ImageItem, ShapeItem, TextItem } from "../src/core/model/types";

function item<T>(kind: string, extra: Record<string, unknown>): T {
  return {
    id: `id-${kind}`,
    name: kind,
    kind,
    frame: { x: 0, y: 0, w: 100, h: 100, rotate: 0 },
    ...extra,
  } as T;
}

function seed() {
  const ws = createWorkspace();
  const screen = createScreen("销售大屏");
  const asset = createChartAsset("趋势", createChartSpec("bar"));
  ws.assets.push(asset);

  screen.items.push(
    {
      ...item<ChartItem>("chart", {}),
      spec: createChartSpec("bar"),
      sourceAssetId: asset.id,
    } as ChartItem,
    item<TextItem>("text", { text: "标题", fontSize: 24, color: "#fff", align: "left", weight: "bold" }),
    item<ImageItem>("image", { src: "data:image/png;base64,AAAA", fit: "cover" }),
    item<ImageItem>("image", { src: "javascript:alert(1)", fit: "cover", name: "坏图" }),
    { ...item<ShapeItem>("shape", { shape: "rect" }), hidden: true } as ShapeItem,
    item<ShapeItem>("shape", { shape: "rect", name: "图表位 1" }),
  );
  ws.screens.push(screen);
  return { ws, screen, asset };
}

describe("export/snapshot 快照与白名单", () => {
  it("只导出选中的大屏，并带上格式与版本", () => {
    const { ws, screen } = seed();
    ws.screens.push(createScreen("另一块"));
    const payload = buildPackagePayload(ws, [screen.id]);
    expect(payload.screens).toHaveLength(1);
    expect(payload.screens[0].name).toBe("销售大屏");
    expect(payload.format).toBe("chartforge/screen-package");
    expect(payload.schemaVersion).toBe(1);
  });

  it("隐藏项与模板占位被剔除，导出器里不留编辑期辅助物", () => {
    const { screen } = seed();
    const pack = toPackageScreen(screen, []);
    const kinds = pack.items.map((i) => i.kind);
    expect(kinds).toEqual(["chart", "text", "image"]);
  });

  it("非法图片地址被剔除并记入 warnings", () => {
    const { ws, screen } = seed();
    const payload = buildPackagePayload(ws, [screen.id]);
    expect(payload.screens[0].items.some((i) => i.kind === "image" && i.src.startsWith("javascript"))).toBe(false);
    expect(payload.warnings.join()).toContain("白名单");
  });

  it("图表 option 在导出时就已算好（运行时不重复建图逻辑）", () => {
    const { ws, screen } = seed();
    const payload = buildPackagePayload(ws, [screen.id]);
    const chart = payload.screens[0].items.find((i) => i.kind === "chart");
    expect(chart && chart.kind === "chart" && Array.isArray(chart.option.series)).toBe(true);
    expect(chart && chart.kind === "chart" && chart.alt).toContain("柱状图");
  });

  it("缩略图与图表库信息不会进产物", () => {
    const { ws, screen } = seed();
    ws.assets[0].thumbnail = "data:image/jpeg;base64,THUMB";
    const payload = buildPackagePayload(ws, [screen.id]);
    expect(JSON.stringify(payload)).not.toContain("THUMB");
  });

  it("图片白名单只放行 http(s) 与 data:image", () => {
    expect(isSafeImageSrc("https://a.test/x.png")).toBe(true);
    expect(isSafeImageSrc("data:image/png;base64,AAA")).toBe(true);
    expect(isSafeImageSrc("data:text/html;base64,AAA")).toBe(false);
    expect(isSafeImageSrc("javascript:alert(1)")).toBe(false);
    expect(isSafeImageSrc("")).toBe(false);
  });

  it("组件尚无导出渲染器时拒绝生成离线产物", () => {
    const { ws, screen } = seed();
    screen.items.push(
      item<ComponentItem>("component", {
        componentId: "chartforge.future-widget",
        componentVersion: 1,
        props: {},
      })
    );
    expect(() => buildPackagePayload(ws, [screen.id])).toThrow("无法生成离线产物");
  });

  it("保留令牌时要给出显式警告", () => {
    const { ws, screen } = seed();
    const payload = buildPackagePayload(ws, [screen.id], { keepHeaders: true });
    expect(payload.warnings.join()).toContain("令牌");
  });
});
