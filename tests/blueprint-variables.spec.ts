import { describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useDocumentStore } from "../src/stores/documentStore";
import { blueprintUsesVariable, isValidBlueprintVariableName, renameBlueprintVariable } from "../src/core/blueprint/variables";
import type { BlueprintGraph } from "../src/core/blueprint/types";
import { filterRowsByBinding } from "../src/core/components/dataWidgets";

const graph = (nodes: BlueprintGraph["nodes"]): BlueprintGraph => ({ nodes, edges: [], variables: [] });

describe("screen blueprint variables", () => {
  it("accepts safe identifier names and rejects unsafe keys", () => {
    expect(isValidBlueprintVariableName("selectedCity_2")).toBe(true);
    expect(isValidBlueprintVariableName("2selected")).toBe(false);
    expect(isValidBlueprintVariableName("__proto__")).toBe(false);
    expect(isValidBlueprintVariableName("name-with-dash")).toBe(false);
  });

  it("renames blueprint declarations and all typed references without touching literals", () => {
    const original = graph([
      { id: "set", kind: "setVariable", name: "city", value: { source: "variable", name: "city" } },
      { id: "condition", kind: "condition", left: { source: "variable", name: "city" }, op: "eq", right: { source: "literal", value: "city" } },
      { id: "transform", kind: "fieldTransform", input: { source: "variable", name: "city" }, op: "toString", outputVariable: "city" },
      { id: "filter", kind: "datasetAction", action: "filter", datasetId: "sales", field: "city", globalVariable: "city" },
      { id: "params", kind: "datasetAction", action: "setParams", datasetId: "sales", params: { city: { source: "variable", name: "city" } } },
    ]);
    original.variables = [{ name: "city", type: "string", initialValue: "" }];
    const renamed = renameBlueprintVariable(original, "city", "selectedCity");
    expect(renamed.variables[0].name).toBe("selectedCity");
    expect(renamed.nodes).toMatchObject([
      { name: "selectedCity", value: { source: "variable", name: "selectedCity" } },
      { left: { source: "variable", name: "selectedCity" }, right: { source: "literal", value: "city" } },
      { outputVariable: "selectedCity", input: { source: "variable", name: "selectedCity" } },
      { globalVariable: "selectedCity" },
      { params: { city: { source: "variable", name: "selectedCity" } } },
    ]);
  });

  it("renames a screen variable and synchronizes node and dataset-binding references", () => {
    setActivePinia(createPinia());
    const doc = useDocumentStore();
    const screen = doc.addScreen("变量重命名测试");
    doc.updateScreenBlueprint(screen.id, {
      nodes: [{ id: "set-city", kind: "setVariable", name: "city", value: { source: "literal", value: "Oslo" } }],
      edges: [],
      variables: [{ name: "city", type: "string", initialValue: "" }],
    });
    const itemId = doc.addComponent("chartforge.data-table");
    doc.updateItemDataBinding(itemId, { datasetId: "sales", filterBy: { field: "city", globalVariable: "city" } });

    expect(doc.renameScreenBlueprintVariable(screen.id, "city", "selectedCity")).toBe(true);
    expect(doc.currentScreen?.blueprint?.variables[0].name).toBe("selectedCity");
    expect(doc.currentScreen?.blueprint?.nodes[0]).toMatchObject({ name: "selectedCity" });
    expect(doc.items.find((item) => item.id === itemId)).toMatchObject({ dataBinding: { filterBy: { globalVariable: "selectedCity" } } });
    expect(doc.renameScreenBlueprintVariable(screen.id, "selectedCity", "constructor")).toBe(false);
  });

  it("treats an incomplete filter draft as a no-op", () => {
    const rows = [{ city: "Oslo" }, { city: "Tokyo" }];
    expect(filterRowsByBinding(rows, { datasetId: "sales", filterBy: { field: "", globalVariable: "city" } }, { city: "Oslo" })).toEqual(rows);
  });

  it("detects variable references and assignment targets in declarative nodes", () => {
    expect(blueprintUsesVariable(graph([
      { id: "set", kind: "setVariable", name: "city", value: { source: "literal", value: "Oslo" } },
    ]), "city")).toBe(true);
    expect(blueprintUsesVariable(graph([
      { id: "condition", kind: "condition", left: { source: "variable", name: "city" }, op: "eq", right: { source: "literal", value: "Oslo" } },
      { id: "transform", kind: "fieldTransform", input: { source: "event", path: "row.city" }, op: "toString", outputVariable: "normalizedCity" },
      { id: "params", kind: "datasetAction", action: "setParams", datasetId: "sales", params: { city: { source: "variable", name: "city" } } },
      { id: "filter", kind: "datasetAction", action: "filter", datasetId: "sales", field: "city", globalVariable: "city" },
    ]), "city")).toBe(true);
    expect(blueprintUsesVariable(graph([
      { id: "event", kind: "componentEvent", componentId: "chartforge.data-table", componentVersion: 1, event: "rowSelect" },
    ]), "city")).toBe(false);
  });
});
