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

  it("resets by removing the color override so the screen theme can take over", () => {
    const before = { trackColor: "#123456", fillColor: "#abcdef", showValue: true };
    expect(clearComponentColorOverride(before, "trackColor")).toEqual({ fillColor: "#abcdef", showValue: true });
  });
});
