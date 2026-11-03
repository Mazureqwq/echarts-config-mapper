<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDocumentStore } from "@/stores/documentStore";
import { exportJson } from "@/core/storage/workspaceRepo";
import { ImportError } from "@/core/model/errors";
import type { ChartAsset, Screen } from "@/core/model/types";
import ConfirmDialog from "@/shared/ui/ConfirmDialog.vue";
import Icon from "@/shared/ui/Icon.vue";

const router = useRouter();
const ws = useWorkspaceStore();
const doc = useDocumentStore();

const tab = ref<"screens" | "assets">("screens");
const importMode = ref<"merge" | "replace">("merge");
const importOpen = ref(false);
const importText = ref("");
const importError = ref("");
const confirmingScreen = ref<Screen | null>(null);

onMounted(() => {
  ws.load();
});

const screens = computed<Screen[]>(() => ws.screens);
const assets = computed<ChartAsset[]>(() => ws.assets);

function openWorkbench(id: string): void {
  router.push(`/workbench/${id}`);
}

function createScreen(): void {
  const s = doc.addScreen(`大屏${ws.screens.length + 1}`);
  doc.initHistory();
  openWorkbench(s.id);
}

function duplicate(id: string): void {
  ws.duplicateScreen(id);
}

function askDelete(screen: Screen): void {
  confirmingScreen.value = screen;
}

function doDelete(): void {
  if (confirmingScreen.value) doc.removeScreen(confirmingScreen.value.id);
  confirmingScreen.value = null;
}

function download(name: string, json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportScreen(screen: Screen): void {
  download(`${screen.name || "大屏"}.screen.json`, exportJson(screen));
}

function exportAsset(asset: ChartAsset): void {
  download(`${asset.name || "图表资产"}.chart.json`, exportJson(asset));
}

function exportWorkspace(): void {
  download("chartforge-workspace.json", ws.exportAll());
}

function openImport(): void {
  importOpen.value = true;
  importError.value = "";
  importText.value = "";
}

function pickFile(ev: Event): void {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    importText.value = String(reader.result ?? "");
  };
  reader.readAsText(file);
  input.value = "";
}

function doImport(): void {
  try {
    ws.importFrom(importText.value, importMode.value);
    importOpen.value = false;
    importError.value = "";
  } catch (e) {
    importError.value =
      e instanceof ImportError ? e.message : `导入失败：${e instanceof Error ? e.message : String(e)}`;
  }
}
</script>

<template>
  <div class="library">
    <header class="library__header">
      <h1 class="library__logo"><Icon name="chart" :size="20" /> 快捷大屏</h1>
      <div class="library__tabs">
        <button :class="{ active: tab === 'screens' }" @click="tab = 'screens'">大屏</button>
        <button :class="{ active: tab === 'assets' }" @click="tab = 'assets'">图表资产</button>
      </div>
      <div class="library__actions">
        <button class="library__btn library__btn--primary" @click="createScreen">
          <Icon name="plus" :size="14" /> 新建大屏
        </button>
        <button class="library__btn" @click="openImport"><Icon name="upload" :size="14" /> 导入</button>
        <button class="library__btn" @click="exportWorkspace"><Icon name="download" :size="14" /> 导出全部</button>
      </div>
    </header>

    <main class="library__body">
      <!-- 大屏 -->
      <template v-if="tab === 'screens'">
        <div v-if="screens.length === 0" class="library__empty">
          <Icon name="chart" :size="42" />
          <p>还没有大屏，点击「新建大屏」开始搭建</p>
        </div>
        <div v-else class="library__grid">
          <div v-for="screen in screens" :key="screen.id" class="library__card">
            <div class="library__thumb" @click="openWorkbench(screen.id)">
              <img v-if="screen.thumbnail" :src="screen.thumbnail" alt="" />
              <div v-else class="library__thumb-empty">1920 × 1080</div>
            </div>
            <div class="library__card-name">{{ screen.name }}</div>
            <div class="library__card-ops">
              <button title="打开" @click="openWorkbench(screen.id)"><Icon name="play" :size="13" /></button>
              <button title="复制" @click="duplicate(screen.id)"><Icon name="copy" :size="13" /></button>
              <button title="导出" @click="exportScreen(screen)"><Icon name="download" :size="13" /></button>
              <button title="删除" class="library__danger" @click="askDelete(screen)"><Icon name="trash" :size="13" /></button>
            </div>
          </div>
        </div>
      </template>

      <!-- 资产 -->
      <template v-else>
        <div v-if="assets.length === 0" class="library__empty">
          <Icon name="layers" :size="42" />
          <p>暂无图表资产，可在工作台图表的「数据」面板保存</p>
        </div>
        <div v-else class="library__grid">
          <div v-for="asset in assets" :key="asset.id" class="library__card">
            <div class="library__thumb">
              <img v-if="asset.thumbnail" :src="asset.thumbnail" alt="" />
              <div v-else class="library__thumb-empty">图表</div>
            </div>
            <div class="library__card-name">{{ asset.name }}</div>
            <div class="library__card-ops">
              <button title="导出" @click="exportAsset(asset)"><Icon name="download" :size="13" /></button>
              <button title="删除" class="library__danger" @click="doc.removeAsset(asset.id)"><Icon name="trash" :size="13" /></button>
            </div>
          </div>
        </div>
      </template>
    </main>

    <ConfirmDialog
      v-if="confirmingScreen"
      title="删除大屏"
      :message="`确定删除「${confirmingScreen.name}」？此操作不可撤销。`"
      confirm-text="删除"
      @confirm="doDelete"
      @cancel="confirmingScreen = null"
    />

    <ConfirmDialog
      v-if="importOpen"
      title="导入工作区"
      message="选择 JSON 文件并指定导入方式：合并（保留现有内容）或替换（覆盖全部）。"
      confirm-text="导入"
      @confirm="doImport"
      @cancel="importOpen = false"
    >
      <div class="library__import">
        <input type="file" accept="application/json" @change="pickFile" />
        <label><input v-model="importMode" type="radio" value="merge" /> 合并</label>
        <label><input v-model="importMode" type="radio" value="replace" /> 替换</label>
        <div v-if="importError" class="library__import-error">{{ importError }}</div>
      </div>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.library {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.library__header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 14px 24px;
  background: var(--cf-panel);
  border-bottom: 1px solid var(--cf-border);
}
.library__logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  margin: 0;
}
.library__tabs {
  display: flex;
  gap: 4px;
}
.library__tabs button {
  border: none;
  background: transparent;
  padding: 7px 16px;
  border-radius: 7px;
  cursor: pointer;
  color: var(--cf-text-2);
  font-size: 14px;
}
.library__tabs button.active {
  background: color-mix(in srgb, var(--cf-primary) 12%, transparent);
  color: var(--cf-primary);
  font-weight: 600;
}
.library__actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.library__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid var(--cf-border);
  border-radius: 7px;
  background: transparent;
  color: var(--cf-text);
  cursor: pointer;
  font-size: 13px;
}
.library__btn--primary {
  background: var(--cf-primary);
  border-color: var(--cf-primary);
  color: #fff;
}
.library__body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
.library__empty {
  text-align: center;
  padding: 80px 0;
  color: var(--cf-text-2);
}
.library__empty p {
  margin-top: 12px;
}
.library__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 16px;
}
.library__card {
  background: var(--cf-panel);
  border: 1px solid var(--cf-border);
  border-radius: 10px;
  overflow: hidden;
}
.library__thumb {
  aspect-ratio: 16 / 9;
  cursor: pointer;
  background: var(--cf-canvas-bg);
}
.library__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.library__thumb-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cf-text-2);
  font-size: 12px;
}
.library__card-name {
  padding: 10px 12px 4px;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.library__card-ops {
  display: flex;
  gap: 2px;
  padding: 6px 8px 10px;
}
.library__card-ops button {
  border: none;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  padding: 5px 8px;
  border-radius: 6px;
}
.library__card-ops button:hover {
  background: var(--cf-bg);
  color: var(--cf-primary);
}
.library__danger:hover {
  color: var(--cf-danger) !important;
}
.library__import {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.library__import label {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.library__import-error {
  color: var(--cf-danger);
  font-size: 12px;
}
</style>
