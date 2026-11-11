import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import { componentRegistry } from "../src/core/components/builtins";
import { getComponentCatalog } from "../src/core/components/catalog";
import { DESIGN_DND_MIME } from "../src/shared/dnd";
import { catalogDragPayload, insertCatalogEntry } from "../src/workbench/catalogActions";
import ComponentCatalogPanel from "../src/workbench/components/ComponentCatalogPanel.vue";
import DesignLibraryPanel from "../src/workbench/panels/DesignLibraryPanel.vue";

describe("component catalog actions", () => {
  const entries = getComponentCatalog();
  const chart = entries.find((entry) => entry.source === "chart")!;
  const component = entries.find((entry) => entry.source === "component")!;
  const basic = entries.find((entry) => entry.source === "basic")!;

  it("routes a chart selection through exactly one chart action", () => {
    const actions = { addChart: vi.fn(), addComponent: vi.fn(), addBasic: vi.fn() };
    insertCatalogEntry(chart, actions);
    expect(actions.addChart).toHaveBeenCalledOnce();
    expect(actions.addChart).toHaveBeenCalledWith("line");
    expect(actions.addComponent).not.toHaveBeenCalled();
    expect(actions.addBasic).not.toHaveBeenCalled();
  });

  it("routes map presets as registered scene components using the design MIME", () => {
    for (const id of ["chartforge.map-scene-flat", "chartforge.map-scene-tilted"]) {
      const preset = entries.find((entry) => entry.source === "component" && entry.componentId === id)!;
      const actions = { addChart: vi.fn(), addComponent: vi.fn(), addBasic: vi.fn() };
      insertCatalogEntry(preset, actions);
      expect(actions.addComponent).toHaveBeenCalledOnce();
      expect(actions.addComponent).toHaveBeenCalledWith(id, 1);
      expect(actions.addChart).not.toHaveBeenCalled();
      expect(catalogDragPayload(preset)).toEqual({
        mime: DESIGN_DND_MIME,
        data: JSON.stringify({ kind: "component", id, version: 1 }),
      });
    }
  });

  it("routes a registered component by exact id and version", () => {
    const actions = { addChart: vi.fn(), addComponent: vi.fn(), addBasic: vi.fn() };
    insertCatalogEntry(component, actions);
    expect(actions.addComponent).toHaveBeenCalledOnce();
    expect(actions.addComponent).toHaveBeenCalledWith("chartforge.data-table", 1);
    expect(actions.addChart).not.toHaveBeenCalled();
    expect(actions.addBasic).not.toHaveBeenCalled();
  });

  it("routes a basic item through its existing creation flow", () => {
    const actions = { addChart: vi.fn(), addComponent: vi.fn(), addBasic: vi.fn() };
    insertCatalogEntry(basic, actions);
    expect(actions.addBasic).toHaveBeenCalledOnce();
    expect(actions.addBasic).toHaveBeenCalledWith("text");
    expect(actions.addChart).not.toHaveBeenCalled();
    expect(actions.addComponent).not.toHaveBeenCalled();
  });

  it("serializes chart and basic drags using the existing canvas item MIME", () => {
    expect(catalogDragPayload(chart)).toEqual({
      mime: "application/x-chartforge-item",
      data: JSON.stringify({ kind: "chart", chartType: "line" }),
    });
    expect(catalogDragPayload(basic)).toEqual({
      mime: "application/x-chartforge-item",
      data: JSON.stringify({ kind: "text" }),
    });
  });

  it("serializes registered-component drags using the design MIME and exact version", () => {
    const payload = catalogDragPayload(component);
    expect(payload.mime).toBe(DESIGN_DND_MIME);
    expect(JSON.parse(payload.data)).toEqual({
      kind: "component",
      id: "chartforge.data-table",
      version: 1,
    });
  });
});

describe("ComponentCatalogPanel", () => {
  it("renders semantic search and category controls with grouped local preview cards", async () => {
    const html = await renderToString(createSSRApp(ComponentCatalogPanel, { entries: getComponentCatalog() }));
    expect(html).toContain('type="search"');
    expect(html).toContain('aria-label="搜索组件"');
    expect(html).toContain('role="group" aria-label="组件分类"');
    for (const label of ["全部", "图表", "地图", "数据", "装饰", "基础"]) expect(html).toContain(label);
    expect(html).toContain("catalog-card__preview");
    for (const variant of ["line", "bars", "pie", "map", "radar", "scatter"]) {
      expect(html).toContain(`catalog-card__preview--${variant}`);
    }
    for (const mark of ["preview-line-main", "preview-map-land", "preview-radar-main", "preview-scatter-dot"]) {
      expect(html).toContain(mark);
    }
    expect(html).toContain("catalog-category__count");
    expect(html).toContain(`${getComponentCatalog().length} 项可添加`);
    expect(html).toContain("折线图可视化图表。");
  });

  it("renders only 2D and vector-extruded 2.5D map scene presets under the map category", async () => {
    const entries = getComponentCatalog().filter((entry) => entry.group === "map");
    const html = await renderToString(createSSRApp(ComponentCatalogPanel, { entries }));
    expect(html).toContain("地图");
    expect(html).toContain("2D 平面地图");
    expect(html).toContain("2.5D 立体地图");
    expect(entries.every((entry) => entry.source === "component")).toBe(true);
    expect(html).not.toContain("区域填色地图可视化图表");
    expect(html).not.toContain("OD 飞线图可视化图表");
  });


  it("renders fixed local SVG previews for flat and tilted map scene presets", async () => {
    const entries = getComponentCatalog().filter((entry) => entry.group === "map");
    const html = await renderToString(createSSRApp(ComponentCatalogPanel, { entries }));
    expect(html.match(/preview-map-land/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("catalog-card__preview--tilted");
    expect(html).toContain("preview-map-boundary");
    expect(html).toContain("preview-map-depth--4");
    expect(html).not.toContain("geoScatter可视化图表。");
  });

  it("renders hostile-looking labels as escaped text rather than markup", async () => {
    const chart = getComponentCatalog().find((entry) => entry.source === "chart")!;
    const hostile = {
      ...chart,
      name: '<img src=x onerror="window.__pwned=true">',
      description: "<script>window.__pwned=true</script>",
    };
    const html = await renderToString(createSSRApp(ComponentCatalogPanel, { entries: [hostile] }));
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain("<script>");
  });

  it("announces an accessible empty state when no catalog entries match", async () => {
    const html = await renderToString(createSSRApp(ComponentCatalogPanel, { entries: [] }));
    expect(html).toContain('role="status"');
    expect(html).toContain("没有找到匹配的组件");
  });
});

describe("DesignLibraryPanel component entry point", () => {
  it("keeps themes, reusable blocks and local images without duplicating registered components", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const app = createSSRApp(DesignLibraryPanel);
    app.use(pinia);
    const html = await renderToString(app);
    expect(html).toContain("主题");
    expect(html).toContain("可复用区块");
    expect(html).toContain("本地图片素材");
    expect(html).not.toContain("注册组件");
    expect(html).not.toContain("chartforge.data-table");
    expect(componentRegistry.get("chartforge.data-table", 1)).toBeDefined();
  });
});
