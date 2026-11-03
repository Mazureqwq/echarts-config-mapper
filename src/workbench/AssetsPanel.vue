<script setup lang="ts">
import { computed, ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDocumentStore } from "@/stores/documentStore";
import { createItem } from "@/core/model/schema";
import type { ChartAsset, ChartType } from "@/core/model/types";
import { exportJson } from "@/core/storage/workspaceRepo";
import Icon from "@/shared/ui/Icon.vue";
import ConfirmDialog from "@/shared/ui/ConfirmDialog.vue";

const ws = useWorkspaceStore();
const doc = useDocumentStore();

const search = ref("");
const menuFor = ref<ChartAsset | null>(null);
const menuPos = ref({ x: 0, y: 0 });
const renaming = ref<ChartAsset | null>(null);
const renameText = ref("");
const confirming = ref<ChartAsset | null>(null);

const DROP_MIME = "application/x-chartforge-item";

const filtered = computed<ChartAsset[]>(() =>
  ws.assets.filter((a) => a.name.toLowerCase().includes(search.value.toLowerCase()))
);

function drag(ev: DragEvent, asset: ChartAsset): void {
  ev.dataTransfer?.setData(
    DROP_MIME,
    JSON.stringify({ kind: "chart", chartType: asset.spec.type, assetId: asset.id })
  );
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "copy";
}

function insert(asset: ChartAsset): void {
  const item = createItem("chart", { x: 60, y: 60 }, JSON.parse(JSON.stringify(asset.spec)));
  item.name = asset.name;
  doc.addItem(item);
  menuFor.value = null;
}

function startRename(asset: ChartAsset): void {
  renaming.value = asset;
  renameText.value = asset.name;
  menuFor.value = null;
}

function confirmRename(): void {
  if (!renaming.value) return;
  const idx = ws.assets.findIndex((a) => a.id === renaming.value!.id);
  if (idx !== -1 && renameText.value.trim()) {
    ws.assets[idx] = { ...ws.assets[idx], name: renameText.value.trim() };
    ws.save();
  }
  renaming.value = null;
}

function askDelete(asset: ChartAsset): void {
  confirming.value = asset;
  menuFor.value = null;
}

function doDelete(): void {
  if (confirming.value) doc.removeAsset(confirming.value.id);
  confirming.value = null;
}

function download(asset: ChartAsset): void {
  const blob = new Blob([exportJson(asset)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${asset.name || "图表资产"}.chart.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  menuFor.value = null;
}

function typeLabel(type: ChartType): string {
  return { line: "折线", bar: "柱状", pie: "饼图", map: "地图", scatter: "散点", radar: "雷达" }[type] ?? type;
}
</script>

<template>
  <div class="assets-panel">
    <input v-model="search" class="assets-panel__search" placeholder="搜索资产" />
    <div class="assets-panel__grid">
      <div
        v-for="asset in filtered"
        :key="asset.id"
        class="assets-panel__card"
        draggable="true"
        @dragstart="drag($event, asset)"
        @contextmenu.prevent="menuFor = asset; menuPos = { x: $event.clientX, y: $event.clientY }"
      >
        <img v-if="asset.thumbnail" :src="asset.thumbnail" alt="" />
        <div v-else class="assets-panel__placeholder">
          <Icon name="chart" :size="22" />
        </div>
        <div class="assets-panel__name">{{ asset.name }}</div>
        <div class="assets-panel__type">{{ typeLabel(asset.spec.type) }}</div>
      </div>
    </div>
    <div v-if="filtered.length === 0" class="assets-panel__empty">
      暂无资产，在图表的「数据」面板点「保存为资产」
    </div>

    <div
      v-if="menuFor"
      class="assets-panel__menu"
      @click="menuFor = null"
    >
      <div class="assets-panel__menu-box" :style="{ left: `${menuPos.x}px`, top: `${menuPos.y}px` }" @click.stop>
        <button @click="insert(menuFor)">插入到当前屏</button>
        <button @click="startRename(menuFor)">重命名</button>
        <button @click="download(menuFor)">导出</button>
        <button class="assets-panel__danger" @click="askDelete(menuFor)">删除</button>
      </div>
    </div>

    <ConfirmDialog
      v-if="renaming"
      title="重命名资产"
      :message="`新名称：`"
      confirm-text="保存"
      @confirm="confirmRename"
      @cancel="renaming = null"
    >
      <input v-model="renameText" class="assets-panel__rename-input" />
    </ConfirmDialog>

    <ConfirmDialog
      v-if="confirming"
      title="删除资产"
      :message="`确定删除「${confirming.name}」？此操作不可撤销。`"
      confirm-text="删除"
      @confirm="doDelete"
      @cancel="confirming = null"
    />
  </div>
</template>

<style scoped>
.assets-panel {
  padding: 12px;
  position: relative;
}
.assets-panel__search {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 12px;
  margin-bottom: 10px;
}
.assets-panel__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.assets-panel__card {
  border: 1px solid var(--cf-border);
  border-radius: 8px;
  overflow: hidden;
  cursor: grab;
  background: var(--cf-bg);
  user-select: none;
}
.assets-panel__card:hover {
  border-color: var(--cf-primary);
}
.assets-panel__card img,
.assets-panel__placeholder {
  width: 100%;
  height: 72px;
  object-fit: cover;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cf-text-2);
  background: var(--cf-canvas-bg);
}
.assets-panel__name {
  padding: 6px 8px 0;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.assets-panel__type {
  padding: 2px 8px 6px;
  font-size: 11px;
  color: var(--cf-text-2);
}
.assets-panel__empty {
  padding: 20px 8px;
  text-align: center;
  color: var(--cf-text-2);
  font-size: 12px;
}
.assets-panel__menu {
  position: fixed;
  inset: 0;
  z-index: 100;
}
.assets-panel__menu-box {
  position: fixed;
  background: var(--cf-panel);
  border: 1px solid var(--cf-border);
  border-radius: 8px;
  box-shadow: var(--cf-shadow);
  padding: 4px;
  display: flex;
  flex-direction: column;
  min-width: 130px;
}
.assets-panel__menu-box button {
  text-align: left;
  border: none;
  background: transparent;
  padding: 7px 12px;
  font-size: 12px;
  color: var(--cf-text);
  cursor: pointer;
  border-radius: 5px;
}
.assets-panel__menu-box button:hover {
  background: var(--cf-bg);
}
.assets-panel__danger {
  color: var(--cf-danger) !important;
}
.assets-panel__rename-input {
  width: 100%;
  margin-top: 8px;
  padding: 6px 8px;
  border: 1px solid var(--cf-primary);
  border-radius: 5px;
  background: var(--cf-bg);
  color: var(--cf-text);
}
</style>
