import { describe, expect, it } from "vitest";
import { createItem } from "../src/core/model/schema";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { createPinia, setActivePinia } from "pinia";
import LayersPanel from "../src/workbench/LayersPanel.vue";
import { useDocumentStore } from "../src/stores/documentStore";
import type { ScreenItem } from "../src/core/model/types";
import { buildLayerTree } from "../src/workbench/layersTree";

function item(id: string, groupId?: string): ScreenItem {
  const layer = createItem("text");
  layer.id = id;
  layer.name = id;
  if (groupId) layer.groupId = groupId;
  return layer;
}

describe("layer tree", () => {
  it("groups existing groupIds under virtual nodes and preserves stack order", () => {
    const layers = [item("bottom"), item("group-back", "g1"), item("middle"), item("group-front", "g1"), item("other-group", "g2")];
    const tree = buildLayerTree(layers);
    expect(tree.map((node) => node.type === "group" ? `group:${node.groupId}` : `item:${node.item.id}`)).toEqual([
      "group:g2", "group:g1", "item:middle", "item:bottom",
    ]);
    expect(tree[1]).toMatchObject({ type: "group", items: [{ id: "group-front" }, { id: "group-back" }] });
    expect(layers.map((layer) => layer.id)).toEqual(["bottom", "group-back", "middle", "group-front", "other-group"]);
  });

  it("renders collapsible group parents and selects grouped children together", async () => {
    setActivePinia(createPinia());
    const doc = useDocumentStore();
    const screen = doc.addScreen("图层树测试");
    const back = item("back", "group-1");
    const front = item("front", "group-1");
    screen.items.push(back, front);
    doc.selectedIds = [back.id, front.id];

    const html = await renderToString(createSSRApp(LayersPanel));
    expect(html).toContain('role="tree" aria-label="图层树"');
    expect(html).toContain('aria-label="组合，2 个图层"');
    expect(html).toContain('aria-level="2"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("组合（2）");
  });

  it("keeps ungrouped objects as independent tree items", () => {
    expect(buildLayerTree([item("one"), item("two")])).toMatchObject([
      { type: "item", item: { id: "two" } },
      { type: "item", item: { id: "one" } },
    ]);
  });
});
