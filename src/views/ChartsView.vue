<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { exportJson } from "@/core/storage/workspaceRepo";
import type { ChartAsset, ChartType } from "@/core/model/types";
import { ASSET_DND_MIME } from "@/shared/dnd";
import ConfirmDialog from "@/shared/ui/ConfirmDialog.vue";
import Icon from "@/shared/ui/Icon.vue";

const router = useRouter();
const ws = useWorkspaceStore();

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  line: "折线图",
  bar: "柱状图",
  pie: "饼图",
  map: "地图",
  scatter: "散点图",
  radar: "雷达图",
};
const CATEGORIES = Object.values(CHART_TYPE_LABELS);

const search = ref("");
const categoryFilter = ref("");
const activeTag = ref<string | null>(null);

const editOpen = ref(false);
const editTarget = ref<ChartAsset | null>(null);
const editName = ref("");
const editCategory = ref("");
const editTagsText = ref("");

const confirming = ref<ChartAsset | null>(null);

onMounted(() => {
  ws.load();
});

const assets = computed<ChartAsset[]>(() => ws.assets);

const allTags = computed<string[]>(() => {
  const set = new Set<string>();
  for (const a of assets.value) {
    for (const t of a.tags ?? []) set.add(t);
  }
  return [...set];
});

const filteredAssets = computed<ChartAsset[]>(() => {
  const q = search.value.trim().toLowerCase();
  return assets.value.filter((a) => {
    if (q) {
      const haystack = [a.name, ...(a.tags ?? [])].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (categoryFilter.value === "未分类") {
      if (a.category) return false;
    } else if (categoryFilter.value && a.category !== categoryFilter.value) {
      return false;
    }
    if (activeTag.value && !(a.tags ?? []).includes(activeTag.value)) return false;
    return true;
  });
});

function typeLabel(type: ChartType): string {
  return CHART_TYPE_LABELS[type] ?? type;
}

function openEdit(asset: ChartAsset): void {
  editTarget.value = asset;
  editName.value = asset.name;
  editCategory.value = asset.category ?? "";
  editTagsText.value = (asset.tags ?? []).join("，");
  editOpen.value = true;
}

function confirmEdit(): void {
  if (!editTarget.value) return;
  const tags = editTagsText.value
    .split(/[，,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  ws.updateAssetMeta(editTarget.value.id, {
    name: editName.value.trim(),
    category: editCategory.value,
    tags,
  });
  editOpen.value = false;
}

function duplicate(id: string): void {
  ws.duplicateAsset(id);
}

function askDelete(asset: ChartAsset): void {
  confirming.value = asset;
}

function doDelete(): void {
  if (confirming.value) ws.removeAsset(confirming.value.id);
  confirming.value = null;
}

function download(name: string, json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportAsset(asset: ChartAsset): void {
  download(`${asset.name || "图表"}.chart.json`, exportJson(asset));
}

function onDragStart(ev: DragEvent, asset: ChartAsset): void {
  if (!ev.dataTransfer) return;
  ev.dataTransfer.effectAllowed = "copy";
  ev.dataTransfer.setData(ASSET_DND_MIME, asset.id);
  ev.dataTransfer.setData("text/plain", asset.name);
}

function goScreens(): void {
  router.push("/");
}
</script>

<template>
  <div class="charts">
    <header class="charts__header">
      <h1 class="charts__logo"><Icon name="chart" :size="20" /> ChartForge 图表工作台</h1>
      <nav class="charts__nav">
        <button class="charts__nav-btn" @click="goScreens">大屏库</button>
        <button class="charts__nav-btn active">图表库</button>
      </nav>
    </header>

    <main class="charts__body">
      <div v-if="assets.length > 0" class="charts__filters">
        <input v-model="search" class="charts__search" type="search" placeholder="搜索名称或标签" />
        <select v-model="categoryFilter" class="charts__select">
          <option value="">全部分类</option>
          <option value="未分类">未分类</option>
          <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
        </select>
        <div class="charts__tags">
          <button
            v-for="t in allTags"
            :key="t"
            class="charts__tag"
            :class="{ active: activeTag === t }"
            @click="activeTag = activeTag === t ? null : t"
          >
            {{ t }}
          </button>
        </div>
      </div>

      <div v-if="assets.length === 0" class="charts__empty">
        <Icon name="chart" :size="42" />
        <p>还没有图表资产，先在大屏里做一张图，再点「保存到图表库」</p>
        <button class="charts__btn charts__btn--primary" @click="goScreens">去大屏库</button>
      </div>
      <div v-else-if="filteredAssets.length === 0" class="charts__empty">
        <Icon name="chart" :size="42" />
        <p>没有符合筛选条件的图表</p>
      </div>
      <div v-else class="charts__grid">
        <div
          v-for="asset in filteredAssets"
          :key="asset.id"
          class="charts__card"
          draggable="true"
          @dragstart="onDragStart($event, asset)"
        >
          <div class="charts__thumb">
            <img v-if="asset.thumbnail" :src="asset.thumbnail" alt="" />
            <div v-else class="charts__thumb-empty">
              <Icon name="chart" :size="28" />
              <span>{{ typeLabel(asset.spec.type) }}</span>
            </div>
          </div>
          <div class="charts__card-name" :title="asset.name">{{ asset.name }}</div>
          <div class="charts__card-chips">
            <span class="charts__chip">{{ asset.category || typeLabel(asset.spec.type) }}</span>
            <span v-for="t in asset.tags ?? []" :key="t" class="charts__chip charts__chip--tag">
              {{ t }}
            </span>
          </div>
          <div class="charts__card-ops">
            <button title="编辑信息" @click="openEdit(asset)"><Icon name="settings" :size="13" /></button>
            <button title="复制" @click="duplicate(asset.id)"><Icon name="copy" :size="13" /></button>
            <button title="导出 JSON" @click="exportAsset(asset)"><Icon name="download" :size="13" /></button>
            <button title="删除" class="charts__danger" @click="askDelete(asset)">
              <Icon name="trash" :size="13" />
            </button>
          </div>
          <div class="charts__hint">拖到画布即可加入大屏</div>
        </div>
      </div>
    </main>

    <ConfirmDialog
      v-if="confirming"
      title="删除图表"
      :message="`确定删除图表资产「${confirming.name}」？大屏中已放置的图表不受影响。`"
      confirm-text="删除"
      @confirm="doDelete"
      @cancel="confirming = null"
    />

    <ConfirmDialog
      v-if="editOpen && editTarget"
      title="编辑图表信息"
      message="修改名称、分类与标签。"
      confirm-text="保存"
      @confirm="confirmEdit"
      @cancel="editOpen = false"
    >
      <div class="charts__form">
        <label class="charts__field">
          名称
          <input v-model="editName" type="text" placeholder="图表名称" />
        </label>
        <label class="charts__field">
          分类
          <select v-model="editCategory">
            <option value="">未分类</option>
            <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <label class="charts__field">
          标签
          <input v-model="editTagsText" type="text" placeholder="用逗号或空格分隔" />
        </label>
      </div>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.charts {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.charts__header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 14px 24px;
  background: var(--cf-panel);
  border-bottom: 1px solid var(--cf-border);
}
.charts__logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  margin: 0;
}
.charts__nav {
  display: flex;
  gap: 6px;
}
.charts__nav-btn {
  padding: 6px 14px;
  border: 1px solid var(--cf-border);
  border-radius: 7px;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  font-size: 13px;
}
.charts__nav-btn.active {
  background: color-mix(in srgb, var(--cf-primary) 12%, transparent);
  border-color: var(--cf-primary);
  color: var(--cf-primary);
  font-weight: 600;
}
.charts__body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
.charts__filters {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.charts__search {
  width: 220px;
  padding: 7px 10px;
  border: 1px solid var(--cf-border);
  border-radius: 7px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 13px;
}
.charts__select {
  padding: 7px 10px;
  border: 1px solid var(--cf-border);
  border-radius: 7px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 13px;
}
.charts__tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.charts__tag {
  padding: 4px 10px;
  border: 1px solid var(--cf-border);
  border-radius: 999px;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  font-size: 12px;
}
.charts__tag.active {
  background: color-mix(in srgb, var(--cf-primary) 12%, transparent);
  border-color: var(--cf-primary);
  color: var(--cf-primary);
}
.charts__empty {
  text-align: center;
  padding: 80px 0;
  color: var(--cf-text-2);
}
.charts__empty p {
  margin: 12px 0 16px;
}
.charts__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 16px;
}
.charts__card {
  background: var(--cf-panel);
  border: 1px solid var(--cf-border);
  border-radius: 10px;
  overflow: hidden;
  cursor: grab;
}
.charts__card:active {
  cursor: grabbing;
}
.charts__thumb {
  aspect-ratio: 16 / 9;
  background: var(--cf-canvas-bg);
}
.charts__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.charts__thumb-empty {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--cf-text-2);
  font-size: 12px;
}
.charts__card-name {
  padding: 10px 12px 4px;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.charts__card-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding: 0 12px;
  min-height: 8px;
}
.charts__chip {
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cf-primary) 10%, transparent);
  color: var(--cf-primary);
  font-size: 11px;
}
.charts__chip--tag {
  background: var(--cf-bg);
  color: var(--cf-text-2);
  border: 1px solid var(--cf-border);
}
.charts__card-ops {
  display: flex;
  gap: 2px;
  padding: 6px 8px 4px;
}
.charts__card-ops button {
  border: none;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  padding: 5px 8px;
  border-radius: 6px;
}
.charts__card-ops button:hover {
  background: var(--cf-bg);
  color: var(--cf-primary);
}
.charts__danger:hover {
  color: var(--cf-danger) !important;
}
.charts__hint {
  padding: 0 12px 10px;
  color: var(--cf-text-2);
  font-size: 11px;
  opacity: 0.8;
}
.charts__btn {
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
.charts__btn--primary {
  background: var(--cf-primary);
  border-color: var(--cf-primary);
  color: #fff;
}
.charts__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 8px;
}
.charts__field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: var(--cf-text-2);
}
.charts__field input,
.charts__field select {
  width: 170px;
  padding: 6px 8px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 13px;
}
</style>
