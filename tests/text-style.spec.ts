import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
import { BUILT_IN_BACKGROUND_PRESETS, getBuiltInBackgroundPreset } from "../src/core/design/backgroundPresets";
import { createItem, createScreen, createWorkspace, normalizeWorkspace } from "../src/core/model/schema";
import type { TextItem } from "../src/core/model/types";
import { isSafeImageSrc, buildPackagePayload } from "../src/core/export/snapshot";
import { createLayoutAssetItems } from "../src/core/design/layoutBackgrounds";
import ItemView from "../src/workbench/ItemView.vue";
import StylePanel from "../src/workbench/panels/StylePanel.vue";

const textItem = (): TextItem => ({
  ...(createItem("text", { x: 10, y: 20, w: 360, h: 90 }) as TextItem),
  id: "styled-text",
  text: "实时运营概览",
  fontFamily: "Microsoft YaHei",
  fontSize: 30,
  color: "#e9f7ff",
  align: "center",
  weight: "600",
  fontStyle: "italic",
  verticalAlign: "middle",
  lineHeight: 1.5,
  letterSpacing: 2,
  overflow: "ellipsis",
  lineClamp: 3,
  backgroundColor: "#10263b",
  padding: 10,
  radius: 8,
  borderColor: "#29d3ff",
  borderWidth: 1,
  shadow: { color: "#29d3ff", blur: 8, offsetX: 0, offsetY: 2 },
});

describe("DataV-inspired local typography and background presets", () => {
  it("exposes typography, alignment, overflow, box and shadow controls in the text inspector", async () => {
    const app = createSSRApp(StylePanel, { item: textItem() });
    app.use(createPinia());
    const html = await renderToString(app);
    for (const label of ["字体", "字体样式", "字重", "垂直对齐", "高级文字样式", "溢出处理", "背景色", "文字阴影", "模糊半径", "阴影偏移"]) {
      expect(html).toContain(label);
    }
  });

  it("renders styled text with safe CSS-backed options", async () => {
    setActivePinia(createPinia());
    const html = await renderToString(createSSRApp(ItemView, { item: textItem() }));
    expect(html).toContain("实时运营概览");
    expect(html).toContain("font-family:Microsoft YaHei");
    expect(html).toContain("font-style:italic");
    expect(html).toContain("text-shadow:0px 2px 8px #29d3ff");
    expect(html).toContain("background-color:#10263b");
    expect(html).toContain("webkit-line-clamp:3");
  });

  it("normalizes supported text options and carries them into offline payloads", () => {
    const workspace = createWorkspace();
    const screen = createScreen("Text style export");
    screen.items.push(textItem());
    workspace.screens.push(screen);
    const normalized = normalizeWorkspace(workspace);
    const normalizedText = normalized.screens[0]?.items[0];
    expect(normalizedText).toMatchObject({ kind: "text", fontFamily: "Microsoft YaHei", weight: "600", verticalAlign: "middle", overflow: "ellipsis", lineClamp: 3 });
    const payload = buildPackagePayload(workspace, [screen.id]);
    expect(payload.screens[0]?.items[0]).toMatchObject({ fontFamily: "Microsoft YaHei", fontStyle: "italic", backgroundColor: "#10263b", shadow: { blur: 8, offsetY: 2 } });
  });

  it("creates self-contained original SVG decoration assets that remain exportable offline", () => {
    const ids = [
      "monitor-ring-orbit", "monitor-header-strip", "monitor-data-wave", "monitor-dot-field", "monitor-bracket-frame",
      "monitor-radar-sweep", "monitor-hex-mesh", "monitor-signal-bars", "monitor-energy-divider",
      "monitor-vertical-lights", "monitor-corner-nodes", "monitor-status-dots", "monitor-data-path",
    ];
    const workspace = createWorkspace();
    const screen = createScreen("Original SVG decorations");
    for (const id of ids) {
      const [asset] = createLayoutAssetItems(id, screen.canvas);
      expect(asset?.kind).toBe("image");
      if (asset?.kind !== "image") continue;
      expect(asset.src).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(isSafeImageSrc(asset.src)).toBe(true);
      screen.items.push(asset);
    }
    workspace.screens.push(screen);
    const payload = buildPackagePayload(workspace, [screen.id]);
    expect(payload.screens[0]?.items).toHaveLength(ids.length);
    expect(JSON.stringify(payload)).not.toMatch(/https?:\/\//i);
  });

  it("provides only self-contained local SVG canvas backgrounds", () => {
    expect(BUILT_IN_BACKGROUND_PRESETS).toHaveLength(8);
    for (const preset of BUILT_IN_BACKGROUND_PRESETS) {
      const background = getBuiltInBackgroundPreset(preset.id);
      expect(background?.kind).toBe("image");
      if (background?.kind !== "image") continue;
      expect(background.src).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(isSafeImageSrc(background.src)).toBe(true);
      expect(preset.dataUrl).not.toMatch(/https?:\/\//i);
    }
  });
});
