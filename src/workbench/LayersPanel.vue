<script setup lang="ts">
import { computed, ref } from "vue";
import { useDocumentStore } from "@/stores/documentStore";
import type { ScreenItem } from "@/core/model/types";
import Icon from "@/shared/ui/Icon.vue";

const doc = useDocumentStore();

const editingId = ref<string | null>(null);
const editingName = ref("");
const dragId = ref<string | null>(null);

const rows = computed<ScreenItem[]>(() => [...doc.items].reverse());

const KIND_ICON: Record<string, string> = {
  chart: "chart",
  text: "text",
  image: "image",
  shape: "shape",
};

function onSelect(ev: MouseEvent, item: ScreenItem): void {
  if (ev.shiftKey) {
    doc.selectedIds = doc.selectedIds.includes(item.id)
      ? doc.selectedIds.filter((id) => id !== item.id)
      : [...doc.selectedIds, item.id];
  } else {
    doc.selectedIds = [item.id];
  }
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
  const displayIdx = rows.value.findIndex((r) => r.id === target.id);
  const canvasIdx = doc.items.length - 1 - displayIdx;
  doc.reorderItem(id, canvasIdx);
}
</script>

<template>
  <div class="layers-panel">
    <div class="layers-panel__title">图层</div>
    <div
      v-for="item in rows"
      :key="item.id"
      class="layers-panel__row"
      :class="{ 'layers-panel__row--active': doc.selectedIds.includes(item.id) }"
      draggable="true"
      @click="onSelect($event, item)"
      @dragstart="onRowDragStart($event, item)"
      @dragover.prevent
      @drop="onRowDrop($event, item)"
    >
      <Icon :name="KIND_ICON[item.kind] ?? 'shape'" :size="14" />
      <input
        v-if="editingId === item.id"
        v-model="editingName"
        class="layers-panel__rename"
        @blur="confirmRename(item)"
        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        @click.stop
      />
      <span v-else class="layers-panel__name" @dblclick.stop="startRename(item)">
        {{ item.name || item.kind }}
      </span>
      <button class="layers-panel__btn" title="置顶" @click.stop="layerOp('top', item)">⤒</button>
      <button class="layers-panel__btn" title="上移一层" @click.stop="layerOp('up', item)">↑</button>
      <button class="layers-panel__btn" title="下移一层" @click.stop="layerOp('down', item)">↓</button>
      <button class="layers-panel__btn" title="置底" @click.stop="layerOp('bottom', item)">⤓</button>
      <button class="layers-panel__btn" :title="item.hidden ? '显示' : '隐藏'" @click.stop="toggleHidden(item)">
        <Icon :name="item.hidden ? 'eye-off' : 'eye'" :size="13" />
      </button>
      <button class="layers-panel__btn" :title="item.locked ? '解锁' : '锁定'" @click.stop="toggleLock(item)">
        <Icon :name="item.locked ? 'lock' : 'unlock'" :size="13" />
      </button>
    </div>
    <div v-if="rows.length === 0" class="layers-panel__empty">暂无图层</div>
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
.layers-panel__row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--cf-border);
  color: var(--cf-text);
}
.layers-panel__row--active {
  background: color-mix(in srgb, var(--cf-primary) 12%, transparent);
}
.layers-panel__name {
  flex: 1;
  overflow: hidden;
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
.layers-panel__btn {
  border: none;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  padding: 2px;
}
.layers-panel__btn:hover {
  color: var(--cf-primary);
}
.layers-panel__empty {
  padding: 16px;
  text-align: center;
  color: var(--cf-text-2);
}
</style>
