import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
import ItemView from "../src/workbench/ItemView.vue";
import type { ScreenItem } from "../src/core/model/types";

describe("ItemView registered component fallback", () => {
  it("renders an explicit placeholder for an unknown component version", async () => {
    setActivePinia(createPinia());
    const item = {
      id: "missing-1",
      name: "Unavailable widget",
      kind: "component",
      frame: { x: 0, y: 0, w: 300, h: 180, rotate: 0 },
      componentId: "vendor.missing",
      componentVersion: 7,
      props: {},
    } as unknown as ScreenItem;

    const html = await renderToString(createSSRApp(ItemView, { item }));
    expect(html).toContain("组件未注册");
    expect(html).toContain("vendor.missing@7");
  });

  it("renders a readable map binding error and never plots unmapped coordinates at the origin", async () => {
    setActivePinia(createPinia());
    const item = {
      id: "geo-error",
      name: "地理散点",
      kind: "chart",
      frame: { x: 0, y: 0, w: 300, h: 180, rotate: 0 },
      spec: { type: "geoScatter", option: {}, data: { kind: "geoScatter", rows: [] } },
      dataBinding: { datasetId: "missing-geo-dataset", fields: { geo: {} } },
    } as unknown as ScreenItem;
    const html = await renderToString(createSSRApp(ItemView, { item }));
    expect(html).toContain('class="item-view__binding-error"');
    expect(html).toContain("经度");
    expect(html).not.toContain("geoScatter");
  });
});
