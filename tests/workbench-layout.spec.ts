import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const workbench = read("views/WorkbenchView.vue");
const leftPanel = read("workbench/LeftPanel.vue");
const inspector = read("workbench/InspectorPanel.vue");
const topBar = read("workbench/TopBar.vue");
const appHeader = read("shared/ui/AppHeader.vue");
const library = read("views/LibraryView.vue");
const charts = read("views/ChartsView.vue");

describe("DataV-inspired workbench layout", () => {
  it("keeps named tool, canvas and inspector regions around a central stage", () => {
    expect(workbench).toContain('aria-label="左侧资源面板"');
    expect(workbench).toContain('aria-label="画布工作区"');
    expect(workbench).toContain('aria-label="右侧属性面板"');
    expect(workbench.indexOf('aria-label="左侧资源面板"')).toBeLessThan(
      workbench.indexOf('aria-label="画布工作区"')
    );
    expect(workbench.indexOf('aria-label="画布工作区"')).toBeLessThan(
      workbench.indexOf('aria-label="右侧属性面板"')
    );
  });

  it("offers an accessible vertical resource rail and collapsible panel", () => {
    expect(leftPanel).toContain('role="tablist"');
    expect(leftPanel).toContain('aria-label="工作区资源"');
    expect(leftPanel).toContain('role="tab"');
    expect(leftPanel).toContain('aria-controls=');
    expect(leftPanel).toContain('aria-label="收起左侧资源面板"');
    expect(workbench).toContain('aria-label="展开左侧资源面板"');
    expect(inspector).toContain('aria-label="收起右侧属性面板"');
    expect(workbench).toContain('aria-label="展开右侧属性面板"');
    expect(leftPanel).toContain("onRailKeydown");
    expect(leftPanel).toContain("ArrowDown");
    expect(leftPanel).toContain("left-panel__rail");
    expect(leftPanel).toContain("left-panel__content");
  });

  it("separates configuration, data and interaction while retaining existing editors", () => {
    expect(inspector).toContain('role="tablist"');
    expect(inspector).toContain('aria-label="属性面板"');
    expect(inspector).toContain(`:aria-label="tab === 'config' ? '配置' : tab === 'data' ? '数据' : '交互'"`);
    expect(inspector).toContain(`tab === "config" ? "配置" : tab === "data" ? "数据" : "交互"`);
    expect(inspector).toContain('role="tabpanel"');
    expect(inspector).toContain("ChartConfigPanel");
    expect(inspector).toContain("DataTablePanel");
    expect(inspector).toContain("LiveSourcePanel");
    expect(inspector).toContain("蓝图交互");
    expect(inspector).toContain("onInspectorTabKeydown");
    expect(inspector).toContain("ArrowRight");
  });

  it("uses a named editor toolbar and responsive panel widths", () => {
    expect(topBar).toContain('role="toolbar"');
    expect(topBar).toContain('aria-label="编辑器工具栏"');
    expect(workbench).toContain("@media (max-width: 900px)");
    expect(workbench).toContain("workbench__side--collapsed");
    expect(workbench).toContain('window.matchMedia("(max-width: 680px)")');
    expect(workbench).toContain("collapsePanelsOnCompactViewport");
  });

  it("shares application navigation and page-shell tokens across resource pages", () => {
    expect(appHeader).toContain('aria-label="ChartForge 主导航"');
    expect(library).toContain('class="library cf-page"');
    expect(library).toContain('class="library__body cf-page__content"');
    expect(charts).toContain('class="charts cf-page"');
    expect(charts).toContain('class="charts__body cf-page__content"');
    expect(library).toContain('class="cf-page__title">大屏应用</h2>');
    expect(charts).toContain('class="cf-page__title">图表库</h2>');
  });
});
