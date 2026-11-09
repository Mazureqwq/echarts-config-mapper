import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const workbench = read("views/WorkbenchView.vue");
const leftPanel = read("workbench/LeftPanel.vue");
const inspector = read("workbench/InspectorPanel.vue");
const topBar = read("workbench/TopBar.vue");
const canvasStage = read("workbench/CanvasStage.vue");
const shortcutsHelp = read("workbench/ShortcutsHelp.vue");
const transformHandles = read("workbench/TransformHandles.vue");
const appHeader = read("shared/ui/AppHeader.vue");
const library = read("views/LibraryView.vue");
const charts = read("views/ChartsView.vue");
const dnd = read("shared/dnd.ts");
const dragSources = [
  read("workbench/ElementsPanel.vue"),
  read("workbench/AssetsPanel.vue"),
  read("workbench/panels/AssetLibraryPanel.vue"),
  read("workbench/panels/DesignLibraryPanel.vue"),
  read("workbench/components/ComponentCatalogPanel.vue"),
  read("workbench/components/LayoutBackgroundCatalog.vue"),
  charts,
];

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

  it("exposes the workspace dataset editor from the resource rail", () => {
    expect(leftPanel).toContain('{ key: "datasets", label: "数据集"');
    expect(leftPanel).toContain('import DatasetPanel from "./panels/DatasetPanel.vue"');
    expect(leftPanel).toContain(`<DatasetPanel v-else-if="tab === 'datasets'" />`);
    const datasetPanel = read("workbench/panels/DatasetPanel.vue");
    expect(datasetPanel).toContain("ws.createDataset");
    expect(datasetPanel).toContain("ws.updateDataset");
    expect(datasetPanel).toContain("ws.removeDataset");
    expect(datasetPanel).toContain("数据预览");
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

  it("exposes accessible grid, smart-snap, and multi-selection alignment controls", () => {
    expect(canvasStage).toContain('aria-label="画布排列辅助工具"');
    expect(canvasStage).toContain('aria-label="显示对齐网格"');
    expect(canvasStage).toContain('aria-label="网格吸附开关"');
    expect(canvasStage).toContain('aria-label="网格间距"');
    expect(canvasStage).toContain("canvas-stage__grid");
    expect(canvasStage).toContain("snapThresholdForZoom(ui.zoom)");
    expect(canvasStage).toContain("snapDeltaToGrid");
    expect(canvasStage).toContain("findNearestSpacingHints");
    expect(canvasStage).toContain("Math.round(hint.distance)");
    expect(canvasStage).toContain("buildEqualSpacingCandidates");
    expect(canvasStage).toContain("arrowNudgeStep(ui.gridSnapEnabled, ui.gridSize, ev.shiftKey)");
    expect(shortcutsHelp).toContain("网格吸附开启时方向键按网格间距移动");
    expect(shortcutsHelp).toContain("关闭时方向键 1px / Shift 10px");
    expect(canvasStage).toContain("snapPlacementFrame");
    expect(canvasStage).toContain("snapPlacementPoint");
    expect(canvasStage).toContain("snapPlacementPoint(canvasPoint(ev))");
    expect(canvasStage).toContain("snapPlacementFrame(item.frame)");
    expect(canvasStage).toContain('aria-label="智能参考线吸附开关"');
    expect(transformHandles).toContain("snapResizeFrameToGrid");
    expect(transformHandles).toContain("ui.gridSnapEnabled");
    expect(transformHandles).toContain("ui.gridSize");
    expect(canvasStage).toContain(':aria-label="t.title"');
    expect(canvasStage).toContain('v-for="t in ALIGN_TOOLS"');
  });

  it("previews snapped drop placement while dragging local canvas assets", () => {
    expect(canvasStage).toContain('@dragover.prevent="onStageDragOver"');
    expect(canvasStage).toContain('<Teleport to=".canvas-stage">');
    expect(canvasStage).toContain("max-height: calc(100% - 24px)");
    expect(canvasStage).toContain('@dragleave="onStageDragLeave"');
    expect(canvasStage).toContain("dragPlacementPreview(active.mime, active.data, canvasPoint(ev))");
    expect(canvasStage).toContain("canvas-stage__drop-preview");
    expect(canvasStage).toContain("guides.value = preview.guides");
    expect(dnd).toContain("getActiveCanvasDragPayload");
    for (const source of dragSources) expect(source).toContain("setActiveCanvasDragPayload");
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
