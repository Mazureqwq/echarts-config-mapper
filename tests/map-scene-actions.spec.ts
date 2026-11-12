import { describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { deepMergeProps } from "../src/core/components/props";
import { useDocumentStore } from "../src/stores/documentStore";
import { RUNTIME_CODE } from "../src/core/export/runtime";

describe("blueprint setProps deep merge", () => {
  it("merges nested view patches without dropping sibling keys or mutating the base", () => {
    const base = { presentation: "flat", view: { center: [104.1, 35.5], zoom: 1.05, showLabels: true }, layers: [{ id: "a" }] };
    const merged = deepMergeProps(base, { view: { zoom: 6 } });
    expect(merged.view).toEqual({ center: [104.1, 35.5], zoom: 6, showLabels: true });
    expect(merged.layers).toEqual([{ id: "a" }]);
    expect(base.view.zoom).toBe(1.05);
    expect(deepMergeProps({ tags: [1, 2] }, { tags: [3] }).tags).toEqual([3]);
    const proto = deepMergeProps({}, JSON.parse('{"__proto__": { "polluted": true }}')) as Record<string, unknown>;
    expect(proto.polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("applyBlueprintProps deep-merges nested view into map component items", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const doc = useDocumentStore();
    doc.addScreen("actions");
    const screen = doc.currentScreen!;
    screen.items.push({
      id: "map-1", name: "地图", kind: "component", componentId: "chartforge.map-scene-flat", componentVersion: 1,
      frame: { x: 0, y: 0, w: 100, h: 100, rotate: 0 },
      props: {
        presentation: "flat", pitch: 0,
        view: { center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8, dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622" },
        layers: [],
      },
    });
    doc.applyBlueprintProps("chartforge.map-scene-flat", 1, { view: { zoom: 6 } });
    const item = screen.items[0] as unknown as { props: { view: { zoom: number; center: number[] } } };
    expect(item.props.view.zoom).toBe(6);
    expect(item.props.view.center).toEqual([104.114129, 35.550339]);
  });

  it("offline runtime setProps path uses the recursive safeMerge", () => {
    expect(RUNTIME_CODE).toContain("out[key] = safeMerge(current, incoming);");
    expect(RUNTIME_CODE).toContain('node.action === "setProps"');
  });

  it("offline runtime wires region events and drill into the blueprint runner", () => {
    expect(RUNTIME_CODE).toContain('chart.on("click", function (params) { cfEmitRegionEvent("regionClick", params); });');
    expect(RUNTIME_CODE).toContain('chart.on("dblclick", function (params) { cfEmitRegionEvent("regionDblclick", params); cfStartDrill(params.name); });');
    expect(RUNTIME_CODE).toContain('runBlueprint(item, screen, "regionUpdrill"');
    expect(RUNTIME_CODE).toContain('function cfStartDrill(regionName)');
    expect(RUNTIME_CODE).toContain('doc.addEventListener("keydown", cfEscHandler, true);');
  });
});
