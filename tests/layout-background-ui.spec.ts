import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LAYOUT_BACKGROUND_ENTRIES } from "../src/core/design/layoutBackgrounds";
import { DESIGN_DND_MIME } from "../src/shared/dnd";
import { insertLayoutBackgroundEntry, layoutBackgroundDragPayload, parseLayoutBackgroundDragPayload } from "../src/workbench/layoutBackgroundActions";
import LayoutBackgroundCatalog from "../src/workbench/components/LayoutBackgroundCatalog.vue";
import DesignLibraryPanel from "../src/workbench/panels/DesignLibraryPanel.vue";

beforeEach(() => setActivePinia(createPinia()));

describe("layout background actions", () => {
  it("serializes only allow-listed layout and asset payloads", () => {
    expect(layoutBackgroundDragPayload(LAYOUT_BACKGROUND_ENTRIES[0])).toEqual({
      mime: DESIGN_DND_MIME,
      data: JSON.stringify({ kind: "layout-background", id: "monitor-main-side" }),
    });
    expect(layoutBackgroundDragPayload(LAYOUT_BACKGROUND_ENTRIES[2])).toEqual({
      mime: DESIGN_DND_MIME,
      data: JSON.stringify({ kind: "layout-asset", id: "monitor-panel-frame" }),
    });
    expect(layoutBackgroundDragPayload({ id: "monitor-main-side", kind: "asset", name: "<script>" })).toBeNull();
    expect(layoutBackgroundDragPayload({ id: "unknown", kind: "layout" })).toBeNull();
    expect(layoutBackgroundDragPayload(null)).toBeNull();
  });

  it("rejects malformed, extended, unknown and mismatched payloads", () => {
    expect(parseLayoutBackgroundDragPayload("not json")).toBeNull();
    expect(parseLayoutBackgroundDragPayload("{}" )).toBeNull();
    expect(parseLayoutBackgroundDragPayload(JSON.stringify({ kind: "layout-background", id: "unknown" }))).toBeNull();
    expect(parseLayoutBackgroundDragPayload(JSON.stringify({ kind: "layout-asset", id: "monitor-grid-2x2" }))).toBeNull();
    expect(parseLayoutBackgroundDragPayload(JSON.stringify({ kind: "layout-asset", id: "monitor-panel-frame", html: "<script>" }))).toBeNull();
    expect(parseLayoutBackgroundDragPayload(JSON.stringify({ kind: "layout-background", id: "monitor-grid-2x2" }))).toEqual({
      kind: "layout-background",
      id: "monitor-grid-2x2",
    });
  });

  it("routes clicks to exactly one safe store action", () => {
    const actions = { insertLayoutBackground: vi.fn(() => ["layout-id"]), insertLayoutAsset: vi.fn(() => ["asset-id"]) };
    expect(insertLayoutBackgroundEntry(LAYOUT_BACKGROUND_ENTRIES[0], actions)).toEqual(["layout-id"]);
    expect(actions.insertLayoutBackground).toHaveBeenCalledExactlyOnceWith("monitor-main-side");
    expect(actions.insertLayoutAsset).not.toHaveBeenCalled();

    const point = { x: 350, y: 260 };
    expect(insertLayoutBackgroundEntry(LAYOUT_BACKGROUND_ENTRIES[2], actions, point)).toEqual(["asset-id"]);
    expect(actions.insertLayoutAsset).toHaveBeenCalledExactlyOnceWith("monitor-panel-frame", point);
    expect(insertLayoutBackgroundEntry({ id: "monitor-main-side", kind: "asset" }, actions)).toEqual([]);
    expect(actions.insertLayoutBackground).toHaveBeenCalledOnce();
  });
});

describe("LayoutBackgroundCatalog", () => {
  it("renders layout, background preset and original SVG asset cards with accessible buttons", async () => {
    const html = await renderToString(createSSRApp(LayoutBackgroundCatalog));
    expect(html).toContain("布局底板");
    expect(html).toContain("背景素材");
    expect(html).toContain("画布背景");
    expect(html).toContain("深海网格");
    expect(html).toContain("极光流线");
    expect(html).toContain("海岸晨雾");
    expect(html).toContain("雷达扫描环");
    expect(html).toContain("蜂巢数据网");
    for (const entry of LAYOUT_BACKGROUND_ENTRIES) {
      expect(html).toContain(`插入 ${entry.name}`);
      expect(html).toContain(`data-preview=\"${entry.previewKey}\"`);
      expect(html).toContain(entry.description);
    }
    expect((html.match(/class=\"layout-background-card/g) ?? []).length).toBe(18);
    expect((html.match(/class=\"background-preset-card/g) ?? []).length).toBe(8);
    expect((html.match(/type=\"button\"/g) ?? []).length).toBe(26);
    expect(html).not.toMatch(/https?:\/\//i);
  });

  it("uses Vue text nodes and renders only the fixed local allow-list", async () => {
    const html = await renderToString(createSSRApp(LayoutBackgroundCatalog));
    expect(html).not.toMatch(/<script|<img src=/i);
    expect(html).toContain("信息面板框");
    expect(html).toContain("主辅分栏");
    expect(html).toContain("角标装饰条");
    expect(html).toContain("轨道环装饰");
    expect(html).toContain("数据波形");
    expect(html).toContain("状态指示点");
    expect(html).toContain("数据脉冲路径");
  });
});

describe("DesignLibraryPanel integration", () => {
  it("retains existing themes, reusable blocks and local images beside new catalog", async () => {
    const app = createSSRApp(DesignLibraryPanel);
    app.use(createPinia());
    const html = await renderToString(app);
    expect(html).toContain("主题");
    expect(html).toContain("可复用区块");
    expect(html).toContain("本地图片素材");
    expect(html).toContain("布局底板");
    expect(html).toContain("背景素材");
    expect(html).toContain("标题与信息面板");
    expect(html).toContain("KPI 指标组");
  });
});
