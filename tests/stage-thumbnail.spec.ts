import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");
const source = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("screen PNG export safety and affordance", () => {
  it("inlines CORS-readable images and replaces inaccessible image sources", () => {
    const code = source("workbench/stageThumbnail.ts");
    expect(code).toContain('fetch(src, { mode: "cors", credentials: "omit" })');
    expect(code).toContain("跨域图片未开放导出，已替换");
    expect(code).toContain("sanitizeBackgroundImages");
    expect(code).toContain("sanitizeSvgImages");
  });

  it("retries a tainted export after stripping all image resources", () => {
    const code = source("workbench/stageThumbnail.ts");
    expect(code).toContain('if (!stripAllImages) return renderStageSnapshot(source, maxSide, mime, true)');
    expect(code).toContain("renderSafeCanvasFallback");
    expect(code).toContain("图表含跨域内容，已替换");
  });

  it("renders library thumbnails from live canvases without foreignObject", () => {
    const code = source("workbench/stageThumbnail.ts");
    const start = code.indexOf("export async function snapshotStage(");
    const end = code.indexOf("/** Export the current screen", start);
    expect(code.slice(start, end)).toContain("renderSafeCanvasFallback(source, maxSide, mime)");
  });

  it("inlines computed layout styles before serializing the stage clone", () => {
    const code = source("workbench/stageThumbnail.ts");
    expect(code).toContain("function inlineComputedStyles(source: HTMLElement, clone: HTMLElement)");
    expect(code).toContain("window.getComputedStyle(originals[index])");
    expect(code).toContain("target.style.setProperty(property, computed.getPropertyValue(property)");
    expect(code.indexOf("inlineComputedStyles(source, clone)")).toBeLessThan(
      code.indexOf('clone.querySelectorAll("[data-ui-only]")')
    );
  });

  it("refreshes the saved preview after chart components paint when opening a screen", () => {
    const code = source("views/WorkbenchView.vue");
    expect(code).toContain("import { computed, nextTick,");
    expect(code).toContain("async function refreshThumbnailAfterRender()");
    expect(code).toContain("requestAnimationFrame(() => requestAnimationFrame(() => resolve()))");
    expect(code.match(/void refreshThumbnailAfterRender\(\)/g)?.length).toBe(2);
  });

  it("labels the action clearly and reports substituted resources", () => {
    const code = source("workbench/TopBar.vue");
    expect(code).toContain("导出大屏 PNG");
    expect(code).toContain("2 倍分辨率");
    expect(code).toContain("已替换为提示图");
  });
});