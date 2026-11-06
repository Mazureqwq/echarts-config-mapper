<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { buildOption } from "@/core/chart/optionBuilder";
import { History } from "@/core/history/history";
import type { ChartData, ChartItem, ChartSpec, ChartType } from "@/core/model/types";
import { renderChartThumbnail } from "@/workbench/chartThumbnail";
import ChartConfigPanel from "@/workbench/panels/ChartConfigPanel.vue";
import DataTablePanel from "@/workbench/panels/DataTablePanel.vue";
import EChartsView from "@/workbench/EChartsView.vue";
import ConfirmDialog from "@/shared/ui/ConfirmDialog.vue";
import Icon from "@/shared/ui/Icon.vue";

const props = defineProps<{ id: string }>();
const router = useRouter();
const ws = useWorkspaceStore();

const CHART_TYPE_LABELS: Array<{ type: ChartType; label: string }> = [
  { type: "line", label: "折线图" },
  { type: "bar", label: "柱状图" },
  { type: "pie", label: "饼图" },
  { type: "map", label: "地图" },
  { type: "scatter", label: "散点图" },
  { type: "radar", label: "雷达图" },
];

const renderError = ref("");
const pendingType = ref<ChartType | null>(null);

const history = markRaw(
  new History<ChartSpec>({ limit: 80, clone: (v) => JSON.parse(JSON.stringify(v)) as ChartSpec })
);
const canUndo = ref(false);
const canRedo = ref(false);

function syncHistoryFlags(): void {
  canUndo.value = history.canUndo;
  canRedo.value = history.canRedo;
}

/** 记录一次可撤销的改动 */
function snapshot(): void {
  const a = asset.value;
  if (!a) return;
  history.push(a.spec);
  syncHistoryFlags();
}

function undo(): void {
  const prev = history.undo();
  if (prev) ws.replaceAssetSpec(props.id, prev);
  syncHistoryFlags();
}

function redo(): void {
  const next = history.redo();
  if (next) ws.replaceAssetSpec(props.id, next);
  syncHistoryFlags();
}

// ---- 缩略图：改动后防抖回写图表库 ----
let thumbTimer: ReturnType<typeof setTimeout> | null = null;

function refreshThumbnail(): void {
  const a = asset.value;
  if (!a) return;
  try {
    ws.setAssetThumbnail(a.id, renderChartThumbnail(a.spec));
  } catch {
    /* 缩略图失败不影响编辑 */
  }
}

function scheduleThumbnail(): void {
  if (thumbTimer !== null) clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    thumbTimer = null;
    refreshThumbnail();
  }, 800);
}

function onKeyDown(ev: KeyboardEvent): void {
  const ctrl = ev.ctrlKey || ev.metaKey;
  if (!ctrl) return;
  const key = ev.key.toLowerCase();
  if (key === "z" && !ev.shiftKey) {
    ev.preventDefault();
    undo();
  } else if (key === "y" || (key === "z" && ev.shiftKey)) {
    ev.preventDefault();
    redo();
  }
}

onMounted(() => {
  ws.load();
  const a = asset.value;
  if (a) {
    history.clear();
    history.push(a.spec);
    syncHistoryFlags();
    if (!a.thumbnail) refreshThumbnail();
  }
  window.addEventListener("keydown", onKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeyDown);
  if (thumbTimer !== null) clearTimeout(thumbTimer);
});

// 任何改动（updatedAt 变化）都会触发缩略图防抖刷新
watch(
  () => asset.value?.updatedAt,
  () => scheduleThumbnail()
);

const asset = computed(() => ws.assets.find((a) => a.id === props.id) ?? null);

/** 供配置面板复用的图表项视图（只读 spec，写操作走 ws 方法） */
const item = computed<ChartItem | null>(() => {
  const a = asset.value;
  if (!a) return null;
  const size = a.defaultSize ?? { w: 640, h: 400 };
  return {
    id: a.id,
    name: a.name,
    kind: "chart",
    frame: { x: 0, y: 0, w: size.w, h: size.h, rotate: 0 },
    spec: a.spec,
  };
});

const option = computed<Record<string, unknown> | null>(() => {
  const a = asset.value;
  if (!a) return null;
  try {
    return buildOption(a.spec);
  } catch (e) {
    renderError.value = e instanceof Error ? e.message : String(e);
    return null;
  }
});

const stageStyle = computed<{ width: string; aspectRatio: string }>(() => {
  const size = asset.value?.defaultSize ?? { w: 640, h: 400 };
  return { width: "100%", aspectRatio: `${size.w} / ${size.h}` };
});

function onRename(ev: Event): void {
  const value = (ev.target as HTMLInputElement).value;
  ws.updateAssetMeta(props.id, { name: value });
}

function onSize(dim: "w" | "h", ev: Event): void {
  const a = asset.value;
  if (!a) return;
  const n = Number((ev.target as HTMLInputElement).value);
  if (!Number.isFinite(n) || n <= 0) return;
  const size = a.defaultSize ?? { w: 640, h: 400 };
  ws.updateAssetSize(props.id, {
    w: dim === "w" ? n : size.w,
    h: dim === "h" ? n : size.h,
  });
}

function onTypeChange(ev: Event): void {
  const value = (ev.target as HTMLSelectElement).value as ChartType;
  if (!asset.value || value === asset.value.spec.type) return;
  pendingType.value = value;
}

function confirmType(): void {
  if (pendingType.value) {
    ws.updateAssetType(props.id, pendingType.value);
    snapshot();
  }
  pendingType.value = null;
}

function onPath(path: string, value: unknown): void {
  ws.applyAssetConfig(props.id, path, value);
  snapshot();
}

function onData(data: ChartData): void {
  ws.updateAssetData(props.id, data);
  snapshot();
}

function goBack(): void {
  router.push("/charts");
}

function goScreens(): void {
  router.push("/screens");
}
</script>

<template>
  <div class="chart-edit">
    <header class="chart-edit__header">
      <button class="chart-edit__back" title="返回图表库" @click="goBack">
        <Icon name="menu" :size="16" />
      </button>
      <input
        class="chart-edit__name"
        :value="asset?.name ?? ''"
        placeholder="图表名称"
        @change="onRename"
      />
      <select class="chart-edit__select" :value="asset?.spec.type" @change="onTypeChange">
        <option v-for="c in CHART_TYPE_LABELS" :key="c.type" :value="c.type">{{ c.label }}</option>
      </select>
      <span class="chart-edit__size">
        尺寸
        <input
          type="number"
          min="120"
          max="7680"
          :value="asset?.defaultSize?.w ?? 640"
          @change="onSize('w', $event)"
        />
        ×
        <input
          type="number"
          min="80"
          max="7680"
          :value="asset?.defaultSize?.h ?? 400"
          @change="onSize('h', $event)"
        />
      </span>
      <span class="chart-edit__history">
        <button
          class="chart-edit__icon-btn"
          :disabled="!canUndo"
          title="撤销 (Ctrl+Z)"
          @click="undo"
        >
          <Icon name="undo" :size="15" />
        </button>
        <button
          class="chart-edit__icon-btn"
          :disabled="!canRedo"
          title="重做 (Ctrl+Y)"
          @click="redo"
        >
          <Icon name="redo" :size="15" />
        </button>
      </span>
      <span class="chart-edit__saved">已自动保存</span>
      <div class="chart-edit__actions">
        <button class="chart-edit__btn" @click="goScreens">
          <Icon name="layers" :size="15" /> 大屏库
        </button>
      </div>
    </header>

    <div v-if="!asset" class="chart-edit__empty">
      <Icon name="chart" :size="42" />
      <p>没有找到这个图表资产</p>
      <button class="chart-edit__btn" @click="goBack">返回图表库</button>
    </div>

    <div v-else class="chart-edit__body">
      <section class="chart-edit__stage-wrap">
        <div class="chart-edit__stage" :style="stageStyle">
          <EChartsView :option="option" @error="(m) => (renderError = m)" />
        </div>
        <div v-if="renderError" class="chart-edit__error">{{ renderError }}</div>
      </section>

      <aside class="chart-edit__panel">
        <div class="chart-edit__panel-sec">
          <div class="chart-edit__panel-title">图表配置</div>
          <ChartConfigPanel v-if="item" :item="item" @change-path="onPath" />
        </div>
        <div class="chart-edit__panel-sec">
          <DataTablePanel v-if="item" :item="item" @change-data="onData" />
        </div>
      </aside>
    </div>

    <ConfirmDialog
      v-if="pendingType"
      title="切换图表类型"
      message="切换类型会重置该图表的参数配置与数据，名称、尺寸与元信息保留。"
      confirm-text="切换"
      @confirm="confirmType"
      @cancel="pendingType = null"
    />
  </div>
</template>

<style scoped>
.chart-edit {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--cf-bg);
}
.chart-edit__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: var(--cf-panel);
  border-bottom: 1px solid var(--cf-border);
  flex-shrink: 0;
}
.chart-edit__back {
  border: none;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 4px;
}
.chart-edit__name {
  width: 200px;
  padding: 6px 10px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 13px;
}
.chart-edit__select {
  padding: 6px 8px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 13px;
}
.chart-edit__size {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--cf-text-2);
}
.chart-edit__size input {
  width: 68px;
  padding: 5px 6px;
  border: 1px solid var(--cf-border);
  border-radius: 5px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 12px;
}
.chart-edit__history {
  display: inline-flex;
  gap: 4px;
}
.chart-edit__icon-btn {
  width: 30px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
}
.chart-edit__icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.chart-edit__icon-btn:not(:disabled):hover {
  color: var(--cf-primary);
  border-color: var(--cf-primary);
}
.chart-edit__saved {
  font-size: 12px;
  color: var(--cf-text-2);
}
.chart-edit__actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.chart-edit__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid var(--cf-border);
  border-radius: 7px;
  background: transparent;
  color: var(--cf-text);
  cursor: pointer;
  font-size: 13px;
}
.chart-edit__body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.chart-edit__stage-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  gap: 12px;
  min-width: 0;
  overflow: auto;
}
.chart-edit__stage {
  max-width: 100%;
  max-height: 100%;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  display: flex;
}
.chart-edit__stage :deep(> div) {
  width: 100%;
  height: 100%;
}
.chart-edit__error {
  color: var(--cf-danger);
  font-size: 12px;
}
.chart-edit__panel {
  width: 320px;
  flex: none;
  border-left: 1px solid var(--cf-border);
  background: var(--cf-panel);
  overflow-y: auto;
  padding: 14px;
}
.chart-edit__panel-sec {
  margin-bottom: 18px;
}
.chart-edit__panel-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
}
.chart-edit__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--cf-text-2);
}
</style>
