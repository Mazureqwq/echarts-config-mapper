import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWorkspaceStore } from "../src/stores/workspaceStore";
import { useDocumentStore } from "../src/stores/documentStore";
import { createComponentItem, createScreen } from "../src/core/model/schema";
import { componentRegistry } from "../src/core/components/builtins";
import type { ComponentItem } from "../src/core/model/types";

/**
 * T14（P0-1）store 层：复制 / 粘贴样式的端到端行为。
 *
 * 这里验证的是纯函数单测覆盖不到的路径：
 * - 真实 store 的选中态与 `commit()`（历史栈）
 * - `dataBinding` 穿过完整 store 流程后不被破坏
 * - 撤销能恢复到粘贴前的样子
 */

function memStorage() {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
    _map: map,
  };
}

beforeEach(() => {
  vi.useRealTimers();
  const store = memStorage();
  vi.stubGlobal("localStorage", store);
  setActivePinia(createPinia());
});

function seedKpi(props: Record<string, unknown>, binding?: ComponentItem["dataBinding"]): { doc: ReturnType<typeof useDocumentStore>; id: string } {
  const ws = useWorkspaceStore();
  const doc = useDocumentStore();
  const screen = createScreen("样式剪贴板测试");
  ws.workspace.screens.push(screen);
  doc.currentScreenId = screen.id;
  doc.initHistory();
  const definition = componentRegistry.get("chartforge.kpi", 1)!;
  const item = createComponentItem(definition, { x: 40, y: 60, w: 300, h: 180 });
  item.id = "kpi-under-test";
  item.props = { ...item.props, ...props };
  if (binding) item.dataBinding = binding;
  screen.items.push(item);
  return { doc, id: item.id };
}

describe("documentStore.copyStyle / pasteStyle（T14 P0-1）", () => {
  it("未选中元素时给出可读提示而不是抛错", () => {
    const { doc } = seedKpi({ label: "A" });
    doc.selectedIds = [];
    expect(doc.copyStyle()).toEqual({ ok: false, message: "请先选中一个元素。" });
    expect(doc.pasteStyle()).toEqual({ ok: false, message: "样式剪贴板为空，请先复制样式。" });
  });

  it("复制后粘贴到同类元素：样式生效，dataBinding 与位置不变", () => {
    const { doc, id } = seedKpi(
      { label: "来源指标", color: "#32d6ff", format: "currency" },
      { datasetId: "ds-source", fields: { category: "province", value: "score" } },
    );
    doc.selectedIds = [id];
    expect(doc.copyStyle()).toEqual({ ok: true, message: "已复制「指标卡」的样式" });

    // 第二个 KPI，带自己的绑定与位置
    const screen = doc.currentScreen!;
    const definition = componentRegistry.get("chartforge.kpi", 1)!;
    const target = createComponentItem(definition, { x: 700, y: 500, w: 120, h: 90 });
    target.id = "kpi-target";
    target.props = { ...target.props, label: "目标指标", color: "#ff0000" };
    target.dataBinding = { datasetId: "ds-target", fields: { category: "city", value: "count" } };
    screen.items.push(target);

    doc.selectedIds = ["kpi-target"];
    expect(doc.pasteStyle()).toEqual({ ok: true, message: "已粘贴样式" });

    const pasted = doc.items.find((entry) => entry.id === "kpi-target") as ComponentItem;
    expect(pasted.props.label).toBe("来源指标");
    expect(pasted.props.color).toBe("#32d6ff");
    expect(pasted.frame).toEqual({ x: 700, y: 500, w: 120, h: 90, rotate: 0 });
    expect(pasted.dataBinding).toEqual({
      datasetId: "ds-target",
      fields: { category: "city", value: "count" },
    });
  });

  it("粘贴进历史栈，可以撤销回到原样式", () => {
    const { doc, id } = seedKpi({ label: "来源指标", color: "#32d6ff" });
    doc.selectedIds = [id];
    doc.copyStyle();

    const screen = doc.currentScreen!;
    const definition = componentRegistry.get("chartforge.kpi", 1)!;
    const target = createComponentItem(definition, { x: 700, y: 500, w: 120, h: 90 });
    target.id = "kpi-undo";
    target.props = { ...target.props, label: "撤销前", color: "#00ff00" };
    screen.items.push(target);
    doc.commit();

    doc.selectedIds = ["kpi-undo"];
    expect(doc.pasteStyle().ok).toBe(true);
    expect((doc.items.find((entry) => entry.id === "kpi-undo") as ComponentItem).props.label).toBe("来源指标");

    doc.undo();
    const restored = doc.items.find((entry) => entry.id === "kpi-undo") as ComponentItem;
    expect(restored.props.label).toBe("撤销前");
    expect(restored.props.color).toBe("#00ff00");
  });

  it("跨组件类型粘贴被拒绝，且不改动目标", () => {
    const { doc, id } = seedKpi({ label: "KPI" });
    doc.selectedIds = [id];
    doc.copyStyle();

    const screen = doc.currentScreen!;
    const definition = componentRegistry.get("chartforge.progress-list", 1)!;
    const target = createComponentItem(definition, { x: 0, y: 0, w: 200, h: 100 });
    target.id = "progress-target";
    screen.items.push(target);

    doc.selectedIds = ["progress-target"];
    const result = doc.pasteStyle();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("组件类型不一致");
    const untouched = doc.items.find((entry) => entry.id === "progress-target") as ComponentItem;
    expect(untouched.props).toEqual(target.props);
  });

  it("clearStyleClipboard 之后粘贴被拒绝", () => {
    const { doc, id } = seedKpi({ label: "A" });
    doc.selectedIds = [id];
    doc.copyStyle();
    doc.clearStyleClipboard();
    expect(doc.pasteStyle()).toEqual({ ok: false, message: "样式剪贴板为空，请先复制样式。" });
  });
});
