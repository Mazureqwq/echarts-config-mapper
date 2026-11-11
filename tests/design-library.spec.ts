import { describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { BUILT_IN_BLOCKS, BUILT_IN_THEMES, applyThemeChartPalette, applyThemeToScreen, instantiateComponentBlock } from "../src/core/design/library";
import { createDesignAsset, addDesignAssetToWorkspace, normalizeDesignAssets, sanitizeSvg, MAX_DESIGN_ASSET_BYTES, MAX_DESIGN_ASSETS_TOTAL_BYTES } from "../src/core/design/assets";
import { createChartSpec, createScreen, createWorkspace, normalizeWorkspace } from "../src/core/model/schema";
import { buildPackagePayload } from "../src/core/export/snapshot";
import type { DesignAsset, ScreenItem } from "../src/core/model/types";
import { useDocumentStore } from "../src/stores/documentStore";
import { useWorkspaceStore } from "../src/stores/workspaceStore";

function rasterDataUrl(bytes: number): string {
  const payloadLength = Math.ceil(bytes / 3) * 4;
  return `data:image/png;base64,${"A".repeat(payloadLength)}`;
}
function svgAsset(id: string): DesignAsset {
  const result = createDesignAsset({ id, name: `${id}.svg`, mime: "image/svg+xml", content: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="#09f"/></svg>' });
  if (!result.ok) throw new Error(result.error);
  return result.asset;
}

const makeText = (id: string, x: number): ScreenItem => ({
  id, name: `item-${id}`, kind: "text", frame: { x, y: 30, w: 220, h: 50, rotate: 0 },
  text: "Design", fontSize: 28, color: "#ffffff", align: "left", weight: "bold",
});

describe("design library, themes and bounded local assets", () => {
  it("ships the two required themes with usable canvas, panel, text and chart defaults", () => {
    expect(BUILT_IN_THEMES.map((theme) => theme.id)).toEqual(["monitor-dark", "business-light"]);
    expect(BUILT_IN_THEMES.find((theme) => theme.id === "monitor-dark")?.tokens.canvas).toBe("#12161d");
    for (const theme of BUILT_IN_THEMES) {
      expect(theme.tokens.canvas).toMatch(/^#/);
      expect(theme.tokens.panel).toBeTruthy();
      expect(theme.tokens.text).toBeTruthy();
      expect(theme.tokens.accent).toBeTruthy();
      expect(theme.tokens.chartPalette.length).toBeGreaterThan(2);
    }
  });

  it("applies a theme to a screen without changing item geometry or explicit item styles", () => {
    const screen = createScreen("Theme");
    const item = makeText("title", 72);
    screen.items.push(item);
    const theme = BUILT_IN_THEMES.find((entry) => entry.id === "business-light")!;
    applyThemeToScreen(screen, theme);
    expect(screen.themeId).toBe("business-light");
    expect(screen.canvas.background).toEqual({ kind: "color", color: theme.tokens.canvas });
    expect(screen.items[0]?.frame).toEqual(item.frame);
    expect(screen.items[0]).toMatchObject({ kind: "text", color: "#ffffff" });
  });

  it("inserts built-in blocks with fresh item IDs and offset frames without mutating definitions", () => {
    expect(BUILT_IN_BLOCKS.map((block) => block.id)).toEqual(["title-panel", "kpi-group"]);
    const block = BUILT_IN_BLOCKS[0]!;
    const first = instantiateComponentBlock(block, { x: 40, y: 25 }, (index) => `new-${index + 1}`);
    const second = instantiateComponentBlock(block, { x: 80, y: 50 }, (index) => `copy-${index}-${Math.random()}`);
    expect(first.map((item) => item.id)).toEqual(block.items.map((_, index) => `new-${index + 1}`));
    expect(new Set(second.map((item) => item.id)).size).toBe(block.items.length);
    expect(first[0]?.frame.x).toBe(block.items[0]!.frame.x + 40);
    expect(block.items[0]?.id).not.toBe(first[0]?.id);
    expect(block.items[0]?.frame.x).not.toBe(first[0]?.frame.x);
  });

  it("removes active SVG markup, event attributes, foreignObject, external links and CSS url references", () => {
    const cleaned = sanitizeSvg(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><foreignObject><div>bad</div></foreignObject><image href="https://evil.example/a.png"/><use xlink:href="#local"/><rect onclick='evil()' style="fill:url(https://evil.example/a.svg#x);stroke:#000"/><style>@import url(https://evil.example/x.css); .a{fill:url('data:image/svg+xml,bad')}</style></svg>`);
    expect(cleaned).toContain("<svg");
    expect(cleaned).toContain('xlink:href="#local"');
    expect(cleaned).not.toMatch(/<script|foreignObject|onload|onclick|https:\/\/evil|url\s*\(|@import/i);
  });

  it("rejects unsupported and oversized assets without changing workspace state", () => {
    const workspace = createWorkspace();
    const unsupported = createDesignAsset({ id: "bad", name: "bad.jpg", mime: "image/jpeg" as never, dataUrl: "data:image/jpeg;base64,AAAA" });
    expect(unsupported.ok).toBe(false);
    const oversized = createDesignAsset({ id: "big", name: "big.png", mime: "image/png", dataUrl: rasterDataUrl(MAX_DESIGN_ASSET_BYTES + 1) });
    expect(oversized.ok).toBe(false);
    expect(workspace.designAssets).toEqual([]);
    expect(MAX_DESIGN_ASSETS_TOTAL_BYTES).toBe(20 * 1024 * 1024);
  });

  it("rejects invalid assets through the workspace action without mutating library state", async () => {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();
    const result = await store.addDesignAsset({ id: "bad", name: "bad.jpg", mime: "image/jpeg", dataUrl: "data:image/jpeg;base64,AAAA" });
    expect(result.ok).toBe(false);
    expect(store.workspace.designAssets).toEqual([]);
  });

  it("enforces the workspace total quota atomically and ignores untrusted stored byte counts", () => {
    const workspace = createWorkspace();
    const first = createDesignAsset({ id: "large-a", name: "a.png", mime: "image/png", dataUrl: rasterDataUrl(1_950_000) });
    const second = createDesignAsset({ id: "large-b", name: "b.png", mime: "image/png", dataUrl: rasterDataUrl(1_950_000) });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    const tooMuch: DesignAsset[] = Array.from({ length: 10 }, (_, index) => ({ ...first.asset, id: `used-${index}`, bytes: 0 }));
    workspace.designAssets = tooMuch;
    const result = addDesignAssetToWorkspace(workspace, second.asset);
    expect(result.ok).toBe(false);
    expect(workspace.designAssets).toHaveLength(10);
  });

  it("normalizes persisted design assets through the sanitizer and applies default [] to legacy workspaces", () => {
    const workspace = normalizeWorkspace({ version: 2, assets: [], screens: [], datasets: [], settings: {}, designAssets: [
      { id: "unsafe", name: "unsafe.svg", mime: "image/svg+xml", dataUrl: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" onload="run()"><script>run()</script><rect/></svg>')}`, bytes: 1 },
    ] });
    expect(workspace.designAssets).toHaveLength(1);
    const decoded = atob(workspace.designAssets[0]!.dataUrl.split(",")[1]!);
    expect(decoded).not.toMatch(/script|onload/i);
    expect(workspace.designAssets[0]!.bytes).toBeGreaterThan(1);
    expect(normalizeWorkspace({ version: 2 }).designAssets).toEqual([]);
    expect(normalizeDesignAssets([{ id: "bad", name: "x.svg", mime: "image/svg+xml", dataUrl: "garbage", bytes: 1 }])).toEqual([]);
  });

  it("does not override a chart spec color explicitly chosen by the user", () => {
    const spec = createChartSpec("bar");
    spec.option = { color: ["#123456"] };
    expect(applyThemeChartPalette(spec, ["#abcdef"]).option.color).toEqual(["#123456"]);
  });

  it("inserts reusable blocks through the document flow without replacing existing items", () => {
    vi.useFakeTimers();
    try {
      setActivePinia(createPinia());
      const doc = useDocumentStore();
      const screen = doc.addScreen("Block insertion");
      const existing = makeText("existing", 100);
      doc.addItem(existing);
      const firstIds = doc.insertBlock("title-panel", { x: 960, y: 540 });
      expect(firstIds).toHaveLength(BUILT_IN_BLOCKS[0]!.items.length);
      expect(screen.items.some((item) => item.id === existing.id)).toBe(true);
      const secondIds = doc.insertBlock("title-panel", { x: 960, y: 540 });
      expect(screen.items).toHaveLength(1 + BUILT_IN_BLOCKS[0]!.items.length * 2);
      expect(new Set([...firstIds, ...secondIds]).size).toBe(firstIds.length + secondIds.length);
    } finally {
      vi.useRealTimers();
    }
  });

  it("inserts an image by local asset ID through the document creation flow", () => {
    vi.useFakeTimers();
    try {
      setActivePinia(createPinia());
      const ws = useWorkspaceStore();
      const asset = svgAsset("canvas-asset");
      ws.workspace.designAssets.push(asset);
      const doc = useDocumentStore();
      const screen = doc.addScreen("Asset placement");
      const id = doc.addDesignAssetImage(asset.id, { x: 320, y: 240 });
      expect(screen.items.find((item) => item.id === id)).toMatchObject({
        kind: "image", sourceDesignAssetId: asset.id, src: asset.dataUrl,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("packages only design assets referenced by selected exported screens", () => {
    const workspace = createWorkspace();
    const used = svgAsset("used");
    const unused = svgAsset("unused");
    workspace.designAssets.push(used, unused);
    const screen = createScreen("Exported");
    screen.items.push({ ...createImageItem(used), id: "used-item" });
    const other = createScreen("Not exported");
    other.items.push({ ...createImageItem(unused), id: "unused-item" });
    workspace.screens.push(screen, other);
    const payload = buildPackagePayload(workspace, [screen.id]);
    expect(payload.designAssets?.map((asset) => asset.id)).toEqual(["used"]);
    expect(payload.screens).toHaveLength(1);
    expect(payload.screens[0]?.items[0]).toMatchObject({ kind: "image", src: used.dataUrl, sourceDesignAssetId: "used" });
  });
});

function createImageItem(asset: DesignAsset): ScreenItem {
  return { id: `image-${asset.id}`, name: asset.name, kind: "image", frame: { x: 0, y: 0, w: 100, h: 100, rotate: 0 }, src: asset.dataUrl, fit: "contain", sourceDesignAssetId: asset.id };
}
