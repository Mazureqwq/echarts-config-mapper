<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { exportJson } from "@/core/storage/workspaceRepo";
import type { ChartAsset, ChartType } from "@/core/model/types";
import { ASSET_DND_MIME } from "@/shared/dnd";
import { renderChartThumbnail } from "@/workbench/chartThumbnail";
import { THUMBNAIL_VERSION } from "@/core/storage/thumbnail";
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

// ---- 批量操作 ----
const selectedIds = ref<string[]>([]);
const selectedSet = computed(() => new Set(selectedIds.value));
const selectedCount = computed(() => selectedIds.value.length);
const batchCategory = ref("");
const batchDeleteOpen = ref(false);

function isSelected(id: string): boolean {
  return selectedSet.value.has(id);
}

function toggleSelect(id: string): void {
  selectedIds.value = isSelected(id)
    ? selectedIds.value.filter((x) => x !== id)
    : [...selectedIds.value, id];
}

function clearSelection(): void {
  selectedIds.value = [];
  batchCategory.value = "";
}

const allFilteredSelected = computed(
  () =>
    filteredAssets.value.length > 0 &&
    filteredAssets.value.every((a) => selectedSet.value.has(a.id))
);

function toggleSelectAll(): void {
  selectedIds.value = allFilteredSelected.value ? [] : filteredAssets.value.map((a) => a.id);
}

/** 选中项被删除后可能残留在选择集里，同步剔除 */
function pruneSelection(): void {
  const alive = new Set(ws.assets.map((a) => a.id));
  selectedIds.value = selectedIds.value.filter((id) => alive.has(id));
}

function applyBatchCategory(): void {
  if (!selectedIds.value.length) return;
  ws.setAssetsCategory(selectedIds.value, batchCategory.value);
  batchCategory.value = "";
}

function confirmBatchDelete(): void {
  ws.removeAssets(selectedIds.value);
  batchDeleteOpen.value = false;
  clearSelection();
}

const createOpen = ref(false);
const createName = ref("");
const createType = ref<ChartType>("line");
const createWidth = ref(640);
const createHeight = ref(400);

/**
 * 旧缩略图一次性重算：缩略图算法升级后，历史卡片的图可能和图表对不上。
 * 逐个渲染（每个之间让出一帧），失败就跳过，绝不影响列表本身。
 */
function migrateThumbnails(): void {
  const stale = ws.assets.filter((a) => a.thumbnailVersion !== THUMBNAIL_VERSION);
  if (!stale.length) return;
  let i = 0;
  const step = (): void => {
    const asset = stale[i++];
    if (!asset) return;
    try {
      const next = renderChartThumbnail(asset.spec);
      if (next && (asset.thumbnailVersion !== THUMBNAIL_VERSION || next !== asset.thumbnail)) {
        ws.setAssetThumbnail(asset.id, next);
      }
    } catch {
      /* 单张渲染失败就保持原图 */
    }
    setTimeout(step, 30);
  };
  setTimeout(step, 60);
}

onMounted(() => {
  ws.load();
  migrateThumbnails();
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

function openCreate(): void {
  createName.value = `图表${ws.assets.length + 1}`;
  createType.value = "line";
  createWidth.value = 640;
  createHeight.value = 400;
  createOpen.value = true;
}

function confirmCreate(): void {
  const id = ws.createAsset(createType.value, createName.value, {
    w: Math.max(120, Math.round(createWidth.value || 640)),
    h: Math.max(80, Math.round(createHeight.value || 400)),
  });
  createOpen.value = false;
  router.push(`/charts/${id}`);
}

function openEditor(asset: ChartAsset): void {
  router.push(`/charts/${asset.id}`);
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
  pruneSelection();
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
  router.push("/screens");
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
      <div class="charts__actions">
        <button class="charts__btn charts__btn--primary" @click="openCreate">
          <Icon name="plus" :size="14" /> 新建图表
        </button>
      </div>
    </header>

    <main class="charts__body">
      <div v-if="assets.length > 0" class="charts__filters">
        <label class="charts__check" title="全选当前筛选结果">
          <input
            type="checkbox"
            :checked="allFilteredSelected"
            @change="toggleSelectAll"
          />
          <span>全选</span>
        </label>
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

      <div v-if="selectedCount > 0" class="charts__batch">
        <span class="charts__batch-count">已选 {{ selectedCount }} 项</span>
        <label class="charts__batch-field">
          分类
          <select v-model="batchCategory" class="charts__select">
            <option value="">未分类</option>
            <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <button class="charts__btn" @click="applyBatchCategory">应用分类</button>
        <button class="charts__btn charts__btn--danger" @click="batchDeleteOpen = true">批量删除</button>
        <button class="charts__btn charts__btn--ghost" @click="clearSelection">取消选择</button>
      </div>

      <div v-if="assets.length === 0" class="charts__empty">
        <Icon name="chart" :size="42" />
        <p class="charts__empty-title">图表库还是空的。流程是「先做图表，再拼大屏」：</p>
        <ol class="charts__steps">
          <li>
            <strong>第 1 步 · 新建图表</strong>
            选类型、改参数、填数据，保存后这里会生成带缩略图的卡片。
          </li>
          <li>
            <strong>第 2 步 · 拼进大屏</strong>
            打开「大屏库」新建大屏，把卡片拖到画布上组装。
          </li>
        </ol>
        <div class="charts__empty-ops">
          <button class="charts__btn charts__btn--primary" @click="openCreate">
            <Icon name="plus" :size="14" /> 新建第一张图表
          </button>
          <button class="charts__btn" @click="goScreens">去大屏库看看</button>
        </div>
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
          <label class="charts__pick" title="选择" @click.stop>
            <input
              type="checkbox"
              :checked="isSelected(asset.id)"
              @change="toggleSelect(asset.id)"
            />
          </label>
          <div class="charts__thumb" title="点击编辑图表" @click="openEditor(asset)">
            <img v-if="asset.thumbnail" :src="asset.thumbnail" alt="" />
            <div v-else class="charts__thumb-empty">
              <Icon name="chart" :size="28" />
              <span>{{ typeLabel(asset.spec.type) }}</span>
            </div>
          </div>
          <div class="charts__card-name" :title="asset.name" @click="openEditor(asset)">
            {{ asset.name }}
          </div>
          <div class="charts__card-chips">
            <span class="charts__chip">{{ asset.category || typeLabel(asset.spec.type) }}</span>
            <span v-for="t in asset.tags ?? []" :key="t" class="charts__chip charts__chip--tag">
              {{ t }}
            </span>
          </div>
          <div class="charts__card-ops">
            <button title="编辑图表" @click="openEditor(asset)"><Icon name="chart" :size="13" /></button>
            <button title="编辑信息" @click="openEdit(asset)"><Icon name="settings" :size="13" /></button>
            <button title="复制" @click="duplicate(asset.id)"><Icon name="copy" :size="13" /></button>
            <button title="导出 JSON" @click="exportAsset(asset)"><Icon name="download" :size="13" /></button>
            <button title="删除" class="charts__danger" @click="askDelete(asset)">
              <Icon name="trash" :size="13" />
            </button>
          </div>
          <div class="charts__hint">点卡片编辑；拖到大屏画布即可加入</div>
        </div>
      </div>
    </main>

    <ConfirmDialog
      v-if="batchDeleteOpen"
      title="批量删除图表"
      :message="`确定删除选中的 ${selectedCount} 张图表？大屏中已放置的图表是独立副本，不受影响。`"
      confirm-text="删除"
      @confirm="confirmBatchDelete"
      @cancel="batchDeleteOpen = false"
    />

    <ConfirmDialog
      v-if="confirming"
      title="删除图表"
      :message="`确定删除图表资产「${confirming.name}」？大屏中已放置的图表不受影响。`"
      confirm-text="删除"
      @confirm="doDelete"
      @cancel="confirming = null"
    />

    <ConfirmDialog
      v-if="createOpen"
      title="新建图表"
      message="选择图表类型并设置默认尺寸，创建后进入图表编辑。"
      confirm-text="创建并编辑"
      @confirm="confirmCreate"
      @cancel="createOpen = false"
    >
      <div class="charts__form">
        <label class="charts__field">
          名称
          <input v-model="createName" type="text" placeholder="图表名称" />
        </label>
        <label class="charts__field">
          类型
          <select v-model="createType">
            <option v-for="(label, type) in CHART_TYPE_LABELS" :key="type" :value="type">
              {{ label }}
            </option>
          </select>
        </label>
        <label class="charts__field">
          宽度（px）
          <input v-model.number="createWidth" type="number" min="120" max="7680" step="1" />
        </label>
        <label class="charts__field">
          高度（px）
          <input v-model.number="createHeight" type="number" min="80" max="7680" step="1" />
        </label>
        <div class="charts__form-note">
          该尺寸为拖入大屏时的默认大小：{{ Math.max(120, createWidth || 640) }} ×
          {{ Math.max(80, createHeight || 400) }} px
        </div>
      </div>
    </ConfirmDialog>

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
.charts__actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.charts__body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
.charts__form-note {
  color: var(--cf-text-2);
  font-size: 12px;
  text-align: right;
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
.charts__empty-title {
  font-size: 14px;
  color: var(--cf-text);
}
.charts__steps {
  list-style: none;
  margin: 0 auto 20px;
  padding: 0;
  max-width: 520px;
  display: grid;
  gap: 10px;
  text-align: left;
}
.charts__steps li {
  background: var(--cf-panel);
  border: 1px solid var(--cf-border);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  line-height: 1.6;
}
.charts__steps strong {
  display: block;
  color: var(--cf-text);
  font-size: 13px;
  margin-bottom: 2px;
}
.charts__empty-ops {
  display: flex;
  gap: 8px;
  justify-content: center;
}
.charts__check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--cf-text-2);
  cursor: pointer;
  user-select: none;
}
.charts__batch {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 12px;
  margin-bottom: 12px;
  border: 1px solid var(--cf-primary);
  border-radius: 8px;
  background: color-mix(in srgb, var(--cf-primary) 8%, transparent);
  font-size: 12px;
}
.charts__batch-count {
  font-weight: 600;
  color: var(--cf-primary);
}
.charts__batch-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--cf-text-2);
}
.charts__btn--danger {
  border-color: var(--cf-danger);
  color: var(--cf-danger);
}
.charts__btn--danger:hover {
  background: color-mix(in srgb, var(--cf-danger) 12%, transparent);
}
.charts__btn--ghost {
  background: transparent;
  color: var(--cf-text-2);
}
.charts__pick {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--cf-panel) 85%, transparent);
  border: 1px solid var(--cf-border);
  cursor: pointer;
}
.charts__pick input {
  margin: 0;
  cursor: pointer;
}
.charts__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 16px;
}
.charts__card {
  position: relative;
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
