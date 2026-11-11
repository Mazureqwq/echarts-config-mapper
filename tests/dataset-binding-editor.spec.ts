import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
import DatasetBindingEditor from "../src/workbench/components/DatasetBindingEditor.vue";
import { useDocumentStore } from "../src/stores/documentStore";
import { useWorkspaceStore } from "../src/stores/workspaceStore";

describe("DatasetBindingEditor geographic mappings", () => {
  it("shows only the selected map type's explicit geo field mapping controls", async () => {
    setActivePinia(createPinia());
    const html = await renderToString(createSSRApp(DatasetBindingEditor, {
      modelValue: { datasetId: "routes", fields: { category: "keep-me" } },
      showFields: true,
      chartType: "geoFlow",
    }));
    for (const label of ["起点经度", "起点纬度", "终点经度", "终点纬度"]) expect(html).toContain(label);
    expect(html).not.toContain("分类 / X 字段");
    expect(html).toContain("变量过滤（可选）");
  });

  it("offers processed dataset columns as datalist suggestions while keeping fields editable", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const ws = useWorkspaceStore();
    ws.workspace.datasets.push({
      id: "regions", name: "区域", source: { kind: "static", data: [{ province: "广东", score: 8, ignored: true }] },
      pipeline: { select: ["province", "score"] },
    });
    const app = createSSRApp(DatasetBindingEditor, {
      modelValue: { datasetId: "regions", fields: { category: "province" } },
      showFields: true, mapScene: true,
    });
    app.use(pinia);
    const html = await renderToString(app);
    expect(html).toContain("<datalist");
    expect(html).toContain('value="province"');
    expect(html).toContain('value="score"');
    expect(html).not.toContain('value="ignored"');
    expect(html).toContain("也可手动填写");
  });

  it("offers declared primitive screen variables instead of a free-form variable name", async () => {
    setActivePinia(createPinia());
    const doc = useDocumentStore();
    const screen = doc.addScreen("变量绑定测试");
    doc.updateScreenBlueprint(screen.id, { nodes: [], edges: [], variables: [{ name: "selectedCity", type: "string", initialValue: "" }] });
    const html = await renderToString(createSSRApp(DatasetBindingEditor, {
      modelValue: { datasetId: "sales", filterBy: { field: "city", globalVariable: "selectedCity" } },
      showFields: true,
    }));
    expect(html).toContain("全局变量");
    expect(html).toContain("selectedCity（文本）");
    expect(html).toContain("<select");
    expect(html).not.toContain('placeholder="selectedCity"');
  });
});
