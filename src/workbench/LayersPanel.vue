<script setup lang="ts">
import { computed, ref } from "vue";
import { useDocumentStore } from "@/stores/documentStore";
import type { ScreenItem } from "@/core/model/types";
import Icon from "@/shared/ui/Icon.vue";
import { buildLayerTree } from "./layersTree";

const doc = useDocumentStore();

const editingId = ref<string | null>(null);
const editingName = ref("");
const dragId = ref<string | null>(null);

type LayerDisplayRow =
  | { type: "group"; key: string; groupId: string; items: ScreenItem[] }
  | { type: "item"; key: string; item: ScreenItem; depth: 0 | 1 };
const collapsedGroups = ref<string[]>([]);
const rows = computed<LayerDisplayRow[]>(() => {
  const result: LayerDisplayRow[] = [];
  for (const node of buildLayerTree(doc.items)) {
    if (node.type === "item") {
      result.push({ ...node, depth: 0 });
      continue;
    }
    result.push(node);
    if (!collapsedGroups.value.includes(node.groupId)) {
      for (const item of node.items) result.push({ type: "item", key: `item:${item.id}`, item, depth: 1 });
    }
  }
  return result;
});

const KIND_ICON: Record<string, string> = {
  chart: "chart",
  text: "text",
  image: "image",
  shape: "shape",
};

function selectIds(ev: MouseEvent | KeyboardEvent, ids: string[]): void {
  const uniqueIds = [...new Set(ids)];
  if (ev.shiftKey) {
    const allSelected = uniqueIds.every((id) => doc.selectedIds.includes(id));
    doc.selectedIds = allSelected
      ? doc.selectedIds.filter((id) => !uniqueIds.includes(id))
      : [...new Set([...doc.selectedIds, ...uniqueIds])];
  } else {
    doc.selectedIds = uniqueIds;
  }
}

function onSelect(ev: MouseEvent | KeyboardEvent, item: ScreenItem): void {
  const ids = item.groupId
    ? doc.items.filter((candidate) => candidate.groupId === item.groupId).map((candidate) => candidate.id)
    : [item.id];
  selectIds(ev, ids);
}

function onSelectGroup(ev: MouseEvent | KeyboardEvent, group: Extract<LayerDisplayRow, { type: "group" }>): void {
  selectIds(ev, group.items.map((item) => item.id));
}

function groupSelected(group: Extract<LayerDisplayRow, { type: "group" }>): boolean {
  return group.items.length > 0 && group.items.every((item) => doc.selectedIds.includes(item.id));
}

function toggleGroup(groupId: string): void {
  collapsedGroups.value = collapsedGroups.value.includes(groupId)
    ? collapsedGroups.value.filter((id) => id !== groupId)
    : [...collapsedGroups.value, groupId];
}

function startRename(item: ScreenItem): void {
  editingId.value = item.id;
  editingName.value = item.name;
}

function confirmRename(item: ScreenItem): void {
  if (editingId.value !== item.id) return;
  doc.updateItemProps(item.id, { name: editingName.value || item.name });
  editingId.value = null;
}

function toggleHidden(item: ScreenItem): void {
  doc.updateItemProps(item.id, { hidden: !item.hidden });
}

function layerOp(op: "top" | "up" | "down" | "bottom", item: ScreenItem): void {
  if (op === "top") doc.bringToFront(item.id);
  else if (op === "bottom") doc.sendToBack(item.id);
  else if (op === "up") doc.bringForward(item.id);
  else doc.sendBackward(item.id);
}

function toggleLock(item: ScreenItem): void {
  doc.updateItemProps(item.id, { locked: !item.locked });
}

function onDelete(item: ScreenItem): void {
  doc.removeItems([item.id]);
}

function onRowDragStart(ev: DragEvent, item: ScreenItem): void {
  dragId.value = item.id;
  ev.dataTransfer?.setData("text/plain", item.id);
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
}

function onRowDrop(ev: DragEvent, target: ScreenItem): void {
  ev.preventDefault();
  const id = dragId.value;
  dragId.value = null;
  if (!id || id === target.id) return;
  const targetIndex = doc.items.findIndex((item) => item.id === target.id);
  if (targetIndex < 0) return;
  doc.reorderItem(id, targetIndex);
}
</script>

<template>
  <div class="layers-panel" role="tree" aria-label="图层树">
    <div class="layers-panel__title">图层</div>
    <template v-for="row in rows" :key="row.key">
      <div
        v-if="row.type === 'group'"
        class="layers-panel__group"
        :class="{ 'layers-panel__group--active': groupSelected(row) }"
        role="treeitem"
        tabindex="0"
        aria-level="1"
        :aria-expanded="!collapsedGroups.includes(row.groupId)"
        :aria-selected="groupSelected(row)"
        :aria-label="`组合，${row.items.length} 个图层`"
        @click="onSelectGroup($event, row)"
        @keydown.enter.prevent="onSelectGroup($event, row)"
        @keydown.space.prevent="onSelectGroup($event, row)"
      >
        <button class="layers-panel__expand" type="button" :aria-label="collapsedGroups.includes(row.groupId) ? '展开组合' : '收起组合'" @click.stop="toggleGroup(row.groupId)">{{ collapsedGroups.includes(row.groupId) ? '▸' : '▾' }}</button>
        <Icon name="group" :size="14" />
        <span>组合（{{ row.items.length }}）</span>
      </div>
      <div
        v-else
        class="layers-panel__row"
        :class="{ 'layers-panel__row--active': doc.selectedIds.includes(row.item.id), 'layers-panel__row--child': row.depth === 1 }"
        role="treeitem"
        tabindex="0"
        :aria-level="row.depth + 1"
        :aria-selected="doc.selectedIds.includes(row.item.id)"
        :draggable="true"
        @click="onSelect($event, row.item)"
        @keydown.enter.prevent="onSelect($event, row.item)"
        @keydown.space.prevent="onSelect($event, row.item)"
        @dragstart="onRowDragStart($event, row.item)"
        @dragover.prevent
        @drop="onRowDrop($event, row.item)"
      >
        <div class="layers-panel__identity">
          <Icon :name="KIND_ICON[row.item.kind] ?? 'shape'" :size="14" />
          <input
            v-if="editingId === row.item.id"
            v-model="editingName"
            class="layers-panel__rename"
            :aria-label="`重命名图层 ${row.item.name || row.item.kind}`"
            @blur="confirmRename(row.item)"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
            @click.stop
          />
          <span v-else class="layers-panel__name" @dblclick.stop="startRename(row.item)">
            {{ row.item.name || row.item.kind }}
          </span>
        </div>
        <div class="layers-panel__actions">
          <button type="button" class="cf-button cf-button--plain cf-button--small layers-panel__btn" aria-label="置顶" title="置顶" @click.stop="layerOp('top', row.item)">⤒</button>
        <button type="button" class="cf-button cf-button--plain cf-button--small layers-panel__btn" aria-label="上移一层" title="上移一层" @click.stop="layerOp('up', row.item)">↑</button>
        <button type="button" class="cf-button cf-button--plain cf-button--small layers-panel__btn" aria-label="下移一层" title="下移一层" @click.stop="layerOp('down', row.item)">↓</button>
        <button type="button" class="cf-button cf-button--plain cf-button--small layers-panel__btn" aria-label="置底" title="置底" @click.stop="layerOp('bottom', row.item)">⤓</button>
        <button type="button" class="cf-button cf-button--plain cf-button--small layers-panel__btn" :aria-label="row.item.hidden ? '显示图层' : '隐藏图层'" :title="row.item.hidden ? '显示' : '隐藏'" @click.stop="toggleHidden(row.item)">
          <Icon :name="row.item.hidden ? 'eye-off' : 'eye'" :size="13" />
        </button>
        <button type="button" class="cf-button cf-button--plain cf-button--small layers-panel__btn" :aria-label="row.item.locked ? '解锁图层' : '锁定图层'" :title="row.item.locked ? '解锁' : '锁定'" @click.stop="toggleLock(row.item)">
          <Icon :name="row.item.locked ? 'lock' : 'unlock'" :size="13" />
        </button>
        <button
          type="button"
          class="cf-button cf-button--plain cf-button--small cf-button--danger layers-panel__btn layers-panel__danger"
          aria-label="删除图层"
          title="删除"
          :disabled="row.item.locked"
          @click.stop="onDelete(row.item)"
        >
          <Icon name="trash" :size="13" />
        </button>
        </div>
      </div>
    </template>
    <div v-if="!rows.length" class="layers-panel__empty">暂无图层</div>
  </div>
</template>

<style scoped>
.layers-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: 13px;
}
.layers-panel__title {
  padding: 10px 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--cf-border);
}
.layers-panel__row, .layers-panel__group {
  display: flex;
  min-height: 32px;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  cursor: pointer;
  border-bottom: 1px solid var(--cf-border);
  color: var(--cf-text);
}
.layers-panel__row { min-width: 0; flex-direction: column; align-items: stretch; gap: 4px; padding-block: 6px; }
.layers-panel__group { font-size: 11px; font-weight: 600; }
.layers-panel__group--active { background: color-mix(in srgb, var(--cf-primary) 12%, transparent); }
.layers-panel__row--child { padding-left: 24px; }
.layers-panel__row--active {
  background: color-mix(in srgb, var(--cf-primary) 12%, transparent);
}
.layers-panel__expand {
  display: grid;
  width: 18px;
  height: 20px;
  flex: 0 0 18px;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
}
.layers-panel__identity { display: flex; min-width: 0; align-items: center; gap: 6px; }
.layers-panel__identity > :first-child { flex: 0 0 14px; }
.layers-panel__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--cf-text);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.layers-panel__rename {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  padding: 2px 4px;
  border: 1px solid var(--cf-primary);
  border-radius: 4px;
  background: var(--cf-panel);
  color: var(--cf-text);
}
.layers-panel__actions { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
.layers-panel__actions .layers-panel__btn { width: 100%; min-width: 0; height: 24px; justify-content: center; padding-inline: 0; }
.layers-panel__danger:hover:not(:disabled) {
  color: var(--cf-danger);
}
.layers-panel__empty {
  padding: 16px;
  text-align: center;
  color: var(--cf-text-2);
}
</style>
