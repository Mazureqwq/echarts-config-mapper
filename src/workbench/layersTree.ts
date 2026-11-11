import type { ScreenItem } from "@/core/model/types";

export type LayerTreeNode =
  | { type: "item"; key: string; item: ScreenItem }
  | { type: "group"; key: string; groupId: string; items: ScreenItem[] };

/** Group existing groupId members under a virtual tree node while keeping stack order. */
export function buildLayerTree(items: readonly ScreenItem[]): LayerTreeNode[] {
  const topToBottom = [...items].reverse();
  const nodes: LayerTreeNode[] = [];
  const groups = new Map<string, Extract<LayerTreeNode, { type: "group" }>>();

  for (const item of topToBottom) {
    if (!item.groupId) {
      nodes.push({ type: "item", key: `item:${item.id}`, item });
      continue;
    }
    let group = groups.get(item.groupId);
    if (!group) {
      group = { type: "group", key: `group:${item.groupId}`, groupId: item.groupId, items: [] };
      groups.set(item.groupId, group);
      nodes.push(group);
    }
    group.items.push(item);
  }
  return nodes;
}
