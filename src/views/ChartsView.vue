<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { exportJson } from "@/core/storage/workspaceRepo";
import type { ChartAsset, ChartType } from "@/core/model/types";
import { ASSET_DND_MIME, setActiveCanvasDragPayload } from "@/shared/dnd";
import { THUMBNAIL_VERSION } from "@/core/storage/thumbnail";
import ConfirmDialog from "@/shared/ui/ConfirmDialog.vue";
import Icon from "@/shared/ui/Icon.vue";
import AppHeader from "@/shared/ui/AppHeader.vue";
import CollectionFilterBar from "@/shared/ui/CollectionFilterBar.vue";
import EmptyState from "@/shared/ui/EmptyState.vue";
import CollectionCardFrame from "@/shared/ui/CollectionCardFrame.vue";

const router = useRouter();
const ws = useWorkspaceStore();

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  line: "折线图",
  bar: "柱状图",
  pie: "饼图",
  map: "区域填色地图",
  scatter: "散点图",
  radar: "雷达图",
  geoScatter: "地理散点图",
  geoHeatmap: "点热力图",
  geoFlow: "OD 飞线图",
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
  const step = async (): Promise<void> => {
    const asset = stale[i++];
    if (!asset) return;
    try {
      // 动态加载 ECharts（它是最重的依赖）：先让列表画出来，再补缩略图
      const { renderChartThumbnail } = await import("@/workbench/chartThumbnail");
      const next = renderChartThumbnail(asset.spec);
      if (next && (asset.thumbnailVersion !== THUMBNAIL_VERSION || next !== asset.thumbnail)) {
        ws.setAssetThumbnail(asset.id, next);
      }
    } catch {
      /* 单张渲染失败就保持原图 */
    }
    setTimeout(() => void step(), 30);
  };
  setTimeout(() => void step(), 60);
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

function goScreens(): void {
  router.push("/screens");
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
  setActiveCanvasDragPayload(ASSET_DND_MIME, asset.id);
}

</script>

<template>
  <div class="charts cf-page">
    <AppHeader active="charts">
      <template #actions>
        <div class="charts__actions">
        <button class="cf-button cf-button--primary" @click="openCreate">
          <Icon name="plus" :size="14" /> 新建图表
        </button>
      </div>
      </template>
    </AppHeader>

    <main class="charts__body cf-page__content" aria-label="图表资源库">
      <section class="cf-page__heading" aria-labelledby="charts-page-title">
        <div class="cf-page__eyebrow">ChartForge · 可复用资源</div>
        <h2 id="charts-page-title" class="cf-page__title">图表库</h2>
        <p class="cf-page__description">创建并整理图表资产，之后可复用到多个大屏中。</p>
      </section>
      <CollectionFilterBar
        v-if="assets.length > 0"
        v-model:search="search"
        v-model:category="categoryFilter"
        v-model:active-tag="activeTag"
        :categories="CATEGORIES"
        :tags="allTags"
      >
        <template #leading>
          <label class="charts__check" title="全选当前筛选结果">
            <input
              type="checkbox"
              :checked="allFilteredSelected"
              @change="toggleSelectAll"
            />
            <span>全选</span>
          </label>
        </template>
      </CollectionFilterBar>

      <div v-if="selectedCount > 0" class="charts__batch">
        <span class="charts__batch-count">已选 {{ selectedCount }} 项</span>
        <label class="charts__batch-field">
          分类
          <select v-model="batchCategory" class="cf-control cf-control--compact">
            <option value="">未分类</option>
            <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <button class="cf-button" @click="applyBatchCategory">应用分类</button>
        <button class="cf-button cf-button--danger" @click="batchDeleteOpen = true">批量删除</button>
        <button class="cf-button cf-button--ghost" @click="clearSelection">取消选择</button>
      </div>

      <EmptyState v-if="assets.length === 0" title="图表库还是空的。流程是「先做图表，再拼大屏」：">
        <ol class="empty-state__steps">
          <li>
            <strong>第 1 步 · 新建图表</strong>
            选类型、改参数、填数据，保存后这里会生成带缩略图的卡片。
          </li>
          <li>
            <strong>第 2 步 · 拼进大屏</strong>
            打开「大屏库」新建大屏，把卡片拖到画布上组装。
          </li>
        </ol>
        <template #actions>
          <button class="cf-button cf-button--primary" @click="openCreate">
            <Icon name="plus" :size="14" /> 新建第一张图表
          </button>
          <button class="cf-button" @click="goScreens">去大屏库看看</button>
        </template>
      </EmptyState>
      <EmptyState v-else-if="filteredAssets.length === 0" title="没有符合筛选条件的图表" />
      <div v-else class="charts__grid cf-collection-grid">
        <CollectionCardFrame
          v-for="asset in filteredAssets"
          :key="asset.id"
          :title="asset.name"
          :thumbnail="asset.thumbnail"
          draggable
          @open="openEditor(asset)"
          @dragstart="onDragStart($event, asset)"
        >
          <template #selection>
            <label class="collection-card__checkbox" title="选择">
              <input
                type="checkbox"
                :checked="isSelected(asset.id)"
                @change="toggleSelect(asset.id)"
              />
            </label>
          </template>
          <template #thumbnail-placeholder>
            <Icon name="chart" :size="28" />
            <span>{{ typeLabel(asset.spec.type) }}</span>
          </template>
          <template #metadata>
            <span class="collection-card__chip">{{ asset.category || typeLabel(asset.spec.type) }}</span>
            <span v-for="t in asset.tags ?? []" :key="t" class="collection-card__chip collection-card__chip--tag">
              {{ t }}
            </span>
          </template>
          <template #actions>
            <button class="cf-button cf-button--plain cf-button--icon" title="编辑图表" @click="openEditor(asset)"><Icon name="chart" :size="13" /></button>
            <button class="cf-button cf-button--plain cf-button--icon" title="编辑信息" @click="openEdit(asset)"><Icon name="settings" :size="13" /></button>
            <button class="cf-button cf-button--plain cf-button--icon" title="复制" @click="duplicate(asset.id)"><Icon name="copy" :size="13" /></button>
            <button class="cf-button cf-button--plain cf-button--icon" title="导出 JSON" @click="exportAsset(asset)"><Icon name="download" :size="13" /></button>
            <button class="cf-button cf-button--plain cf-button--icon cf-button--danger" title="删除" @click="askDelete(asset)">
              <Icon name="trash" :size="13" />
            </button>
          </template>
          <template #footer>
            <div class="charts__hint">点卡片编辑；拖到大屏画布即可加入</div>
          </template>
        </CollectionCardFrame>
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
          <input v-model="createName" type="text" placeholder="图表名称" class="cf-control" />
        </label>
        <label class="charts__field">
          类型
          <select v-model="createType" class="cf-control">
            <option v-for="(label, type) in CHART_TYPE_LABELS" :key="type" :value="type">
              {{ label }}
            </option>
          </select>
        </label>
        <label class="charts__field">
          宽度（px）
          <input v-model.number="createWidth" type="number" min="120" max="7680" step="1" class="cf-control" />
        </label>
        <label class="charts__field">
          高度（px）
          <input v-model.number="createHeight" type="number" min="80" max="7680" step="1" class="cf-control" />
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
          <input v-model="editName" type="text" placeholder="图表名称" class="cf-control" />
        </label>
        <label class="charts__field">
          分类
          <select v-model="editCategory" class="cf-control">
            <option value="">未分类</option>
            <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <label class="charts__field">
          标签
          <input v-model="editTagsText" type="text" placeholder="用逗号或空格分隔" class="cf-control" />
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
.charts__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  white-space: nowrap;
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
.charts__hint {
  color: var(--cf-text-2);
  font-size: 11px;
  opacity: 0.8;
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

.charts__field .cf-control { width: 170px; }
</style>
