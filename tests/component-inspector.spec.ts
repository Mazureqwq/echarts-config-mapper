import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
import { BUILT_IN_THEMES } from "../src/core/design/library";
import { clearComponentColorOverride } from "../src/core/components/props";
import { useDocumentStore } from "../src/stores/documentStore";
import type { ComponentItem } from "../src/core/model/types";
import ComponentInspector from "../src/workbench/components/ComponentInspector.vue";

const frame = { x: 0, y: 0, w: 520, h: 280, rotate: 0 };

describe("ComponentInspector theme-inheriting colors", () => {
  it("shows inherited theme colors without persisting them as explicit overrides", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const doc = useDocumentStore();
    doc.addScreen("Color inspector");
    doc.applyTheme("business-light");
    const item: ComponentItem = {
      id: "progress-1",
      name: "进度条组",
      kind: "component",
      componentId: "chartforge.progress-list",
      componentVersion: 1,
      frame,
      props: {},
    };
    const app = createSSRApp(ComponentInspector, { item });
    app.use(pinia);
    const html = await renderToString(app);
    const theme = BUILT_IN_THEMES.find((entry) => entry.id === "business-light")!;

    expect(html.match(/type="color"/g) ?? []).toHaveLength(2);
    expect(html).toContain(`value="${theme.tokens.border}"`);
    expect(html).toContain(`value="${theme.tokens.accent}"`);
    expect(html).toContain('aria-label="恢复轨道颜色为主题色"');
    expect(html).toContain('aria-label="恢复填充颜色为主题色"');
    expect(item.props).toEqual({});
  });

  it("shows inherited and independent map layer bindings with a clear-to-inherit action", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const item: ComponentItem = {
      id: "map-1", name: "2D 平面地图", kind: "component", componentId: "chartforge.map-scene-flat", componentVersion: 1, frame,
      props: { presentation: "flat", pitch: 0, layers: [
        { id: "flow", type: "geoFlow", name: "运输流向", visible: true, style: { color: "#32d6ff", opacity: 0.8, size: 12 }, dataBinding: { datasetId: "routes", fields: { geo: { originLongitude: "fromLng" } } } },
        { id: "points", type: "geoScatter", name: "网点", visible: true, style: { color: "#ffcc66", opacity: 1, size: 12 } },
      ] },
      dataBinding: { datasetId: "routes", fields: { category: "province", value: "sales", geo: { originLongitude: "fromLng" } } },
    };
    const app = createSSRApp(ComponentInspector, { item });
    app.use(pinia);
    const html = await renderToString(app);
    expect(html).toContain("地图图层（2）");
    expect(html).toContain("显示运输流向");
    // 容器级「共享数据绑定」随三页签移入数据页；该覆盖由 e2e/map-scene-editor.spec.ts（数据页签）承担。
    expect(html).toContain("地图皮肤");
    expect(html).toContain("区域热力+图例");
    expect(html).toContain("数据绑定 · 独立");
    expect(html).toContain("数据绑定 · 继承容器");
    expect(html).toContain("清除图层绑定并继承容器");
    expect(html).not.toContain("component-inspector__json");
  });

  it("resets by removing the color override so the screen theme can take over", () => {
    const before = { trackColor: "#123456", fillColor: "#abcdef", showValue: true };
    expect(clearComponentColorOverride(before, "trackColor")).toEqual({ fillColor: "#abcdef", showValue: true });
  });
});
