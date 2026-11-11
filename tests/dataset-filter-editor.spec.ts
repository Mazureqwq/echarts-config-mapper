import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
import DatasetPanel from "../src/workbench/panels/DatasetPanel.vue";
import { useWorkspaceStore } from "../src/stores/workspaceStore";

describe("dataset filter editor", () => {
  it("renders saved pipeline conditions as controlled field/operator/value rows", async () => {
    setActivePinia(createPinia());
    const ws = useWorkspaceStore();
    ws.workspace.datasets.push({
      id: "sales-filter-test",
      name: "销售数据",
      source: { kind: "static", data: [{ city: "香港", amount: 12 }] },
      pipeline: { filter: [{ field: "amount", op: "gt", value: "10" }, { field: "city", op: "eq", value: "香港" }] },
    });

    const html = await renderToString(createSSRApp(DatasetPanel));
    expect(html).toContain("数据集行过滤");
    expect(html).toContain("多个条件按列表顺序以 AND 组合");
    expect(html).toContain("大于");
    expect(html).toContain("等于");
    expect(html).toContain('value="amount"');
    expect(html).toContain('value="香港"');
    expect(html).not.toContain("JSON 数组");
  });
});
