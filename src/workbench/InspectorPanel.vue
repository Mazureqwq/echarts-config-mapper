<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { ChartData, ChartItem, ChartType, Frame, ScreenItem } from "@/core/model/types";
import { renderChartThumbnail } from "./chartThumbnail";
import ConfirmDialog from "@/shared/ui/ConfirmDialog.vue";
import FramePanel from "./panels/FramePanel.vue";
import StylePanel from "./panels/StylePanel.vue";
import ScreenPanel from "./panels/ScreenPanel.vue";
import ChartConfigPanel from "./panels/ChartConfigPanel.vue";
import DataTablePanel from "./panels/DataTablePanel.vue";
import LiveSourcePanel from "./panels/LiveSourcePanel.vue";
import ComponentInspector from "./components/ComponentInspector.vue";
import DatasetBindingEditor from "./components/DatasetBindingEditor.vue";
import Icon from "@/shared/ui/Icon.vue";
import type { AlignMode } from "@/stores/documentStore";

const doc = useDocumentStore();
const ui = useUiStore();
const ws = useWorkspaceStore();
const router = useRouter();
const emit = defineEmits<{ (e: "collapse"): void }>();
const activeTab = ref<"config" | "data" | "interaction">("config");
const INSPECTOR_TABS = ["config", "data", "interaction"] as const;

function onInspectorTabKeydown(event: KeyboardEvent): void {
  const current = INSPECTOR_TABS.indexOf(activeTab.value);
  let next = current;
  if (event.key === "ArrowRight") next = (current + 1) % INSPECTOR_TABS.length;
  else if (event.key === "ArrowLeft") next = (current + INSPECTOR_TABS.length - 1) % INSPECTOR_TABS.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = INSPECTOR_TABS.length - 1;
  else return;
  event.preventDefault();
  activeTab.value = INSPECTOR_TABS[next];
  requestAnimationFrame(() => document.getElementById(`inspector-tab-${INSPECTOR_TABS[next]}`)?.focus());
}

/** 大屏图表是图表库资产的独立副本，这里只做「来源」回溯 */
function sourceAsset(item: ChartItem): { id: string; name: string } | null {
  if (!item.sourceAssetId) return null;
  const a = ws.assetById(item.sourceAssetId);
  return a ? { id: a.id, name: a.name } : null;
}

function openSource(item: ChartItem): void {
  const a = sourceAsset(item);
  if (a) router.push(`/charts/${a.id}`);
}

const selected = computed<ScreenItem[]>(() =>
  doc.items.filter((i) => doc.selectedIds.includes(i.id))
);
const single = computed<ScreenItem | null>(() =>
  selected.value.length === 1 ? selected.value[0] : null
);
const singleChart = computed<ChartItem | null>(() =>
  single.value && single.value.kind === "chart" ? single.value : null
);
const singleComponent = computed(() =>
  single.value?.kind === "component" ? single.value : null
);
const focusItem = computed<ChartItem | null>(() => {
  if (!ui.editingId) return null;
  const it = doc.items.find((i) => i.id === ui.editingId);
  return it && it.kind === "chart" ? it : null;
});

const ALIGN_TOOLS: Array<{ mode: AlignMode; icon: string; title: string }> = [
  { mode: "left", icon: "align-left", title: "左对齐" },
  { mode: "centerX", icon: "align-center", title: "水平居中" },
  { mode: "right", icon: "align-right", title: "右对齐" },
  { mode: "distributeH", icon: "distribute-h", title: "水平等间距" },
  { mode: "top", icon: "align-top", title: "顶对齐" },
  { mode: "centerY", icon: "align-middle", title: "垂直居中" },
  { mode: "bottom", icon: "align-bottom", title: "底对齐" },
  { mode: "distributeV", icon: "distribute-v", title: "垂直等间距" },
];

function onFrameChange(patch: Partial<Frame>): void {
  if (single.value) doc.updateItemFrame(single.value.id, patch);
}
function onChartPath(id: string, path: string, value: unknown): void {
  doc.applyChartConfig(id, path, value);
}

function onChartData(id: string, data: ChartData): void {
  doc.updateChartData(id, data);
}
const CHART_TYPE_LABELS: Array<{ type: ChartType; label: string }> = [
  { type: "line", label: "折线图" },
  { type: "bar", label: "柱状图" },
  { type: "pie", label: "饼图" },
  { type: "map", label: "区域填色地图" },
  { type: "scatter", label: "散点图" },
  { type: "radar", label: "雷达图" },
  { type: "geoScatter", label: "地理散点图" },
  { type: "geoHeatmap", label: "点热力图" },
  { type: "geoFlow", label: "OD 飞线图" },
];
const LEGACY_MAP_CHART_TYPES: readonly ChartType[] = ["map", "geoScatter", "geoHeatmap", "geoFlow"];
function chartTypeOptions(item: ChartItem): Array<{ type: ChartType; label: string }> {
  const available = CHART_TYPE_LABELS.filter((entry) => !LEGACY_MAP_CHART_TYPES.includes(entry.type));
  const current = CHART_TYPE_LABELS.find((entry) => entry.type === item.spec.type);
  return current && LEGACY_MAP_CHART_TYPES.includes(item.spec.type) ? [current, ...available] : available;
}

const pendingType = ref<ChartType | null>(null);
const typeTargetId = ref<string | null>(null);

function askChangeType(id: string, type: string): void {
  const item = doc.items.find((i) => i.id === id);
  if (!item || item.kind !== "chart" || item.spec.type === type) return;
  typeTargetId.value = id;
  pendingType.value = type as ChartType;
}

function onTypeSelect(id: string, ev: Event): void {
  const value = (ev.target as HTMLSelectElement).value;
  askChangeType(id, value);
}

function confirmChangeType(): void {
  if (typeTargetId.value && pendingType.value) {
    doc.changeChartType(typeTargetId.value, pendingType.value);
  }
  pendingType.value = null;
  typeTargetId.value = null;
}

const assetOpen = ref(false);
const assetTargetId = ref<string | null>(null);
const assetName = ref("");
const assetCategory = ref("");
const assetTagsText = ref("");

function openAssetDialog(item: ChartItem): void {
  assetTargetId.value = item.id;
  assetName.value = item.name || "未命名图表";
  assetCategory.value = CHART_TYPE_LABELS.find((c) => c.type === item.spec.type)?.label ?? "";
  assetTagsText.value = "";
  assetOpen.value = true;
}

function confirmSaveAsset(): void {
  const id = assetTargetId.value;
  if (!id) return;
  const item = doc.items.find((i) => i.id === id);
  let thumbnail = "";
  if (item && item.kind === "chart") {
    try {
      thumbnail = renderChartThumbnail(item.spec);
    } catch {
      thumbnail = "";
    }
  }
  const tags = assetTagsText.value
    .split(/[，,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  doc.saveChartAsAsset(id, {
    name: assetName.value.trim(),
    category: assetCategory.value,
    tags,
    thumbnail,
  });
  assetOpen.value = false;
  assetTargetId.value = null;
}
</script>

<template>
  <div class="inspector">
    <div class="inspector__toolbar">
      <div class="inspector__tabs" role="tablist" aria-label="属性面板" @keydown="onInspectorTabKeydown">
        <button
          v-for="tab in INSPECTOR_TABS"
          :id="`inspector-tab-${tab}`"
          :key="tab"
          class="inspector__tab"
          type="button"
          role="tab"
          :aria-label="tab === 'config' ? '配置' : tab === 'data' ? '数据' : '交互'"
          aria-controls="inspector-panel"
          :aria-selected="activeTab === tab"
          :tabindex="activeTab === tab ? 0 : -1"
          @click="activeTab = tab"
        >
          {{ tab === "config" ? "配置" : tab === "data" ? "数据" : "交互" }}
        </button>
      </div>
      <button
        class="inspector__collapse"
        type="button"
        aria-label="收起右侧属性面板"
        title="收起属性面板"
        @click="emit('collapse')"
      >
        <Icon name="close" :size="16" />
      </button>
    </div>

    <div v-if="activeTab === 'config'" id="inspector-panel" class="inspector__tab-panel" role="tabpanel" aria-labelledby="inspector-tab-config">
    <!-- 聚焦编辑 -->
    <template v-if="focusItem">
      <div class="inspector__head">
        <span>聚焦编辑：{{ focusItem.name }}</span>
        <button class="inspector__back" @click="ui.setEditing(null)">返回（Esc）</button>
      </div>
      <div class="inspector__body">
        <div v-if="focusItem.sourceAssetId" class="inspector__source">
          <template v-if="sourceAsset(focusItem)">
            <span class="inspector__source-label">来源：{{ sourceAsset(focusItem)!.name }}</span>
            <button class="cf-button cf-button--plain cf-button--small" @click="openSource(focusItem)">打开源图表</button>
          </template>
          <span v-else class="inspector__source-missing">源图表已删除，当前是独立副本</span>
        </div>
        <div class="inspector__section">
          <div class="inspector__section-title">图表</div>
          <div class="inspector__row">
            <span class="inspector__label">类型</span>
            <select
              :key="`focus-${focusItem.id}-${focusItem.spec.type}`"
              class="inspector__select cf-control cf-control--compact"
              :value="focusItem.spec.type"
              @change="onTypeSelect(focusItem.id, $event)"
            >
              <option v-for="c in chartTypeOptions(focusItem)" :key="c.type" :value="c.type">
                {{ c.label }}
              </option>
            </select>
          </div>
          <button class="cf-button cf-button--ghost inspector__wide-btn" @click="openAssetDialog(focusItem)">
            另存为图表资产
          </button>
        </div>
        <div class="inspector__section">
          <ChartConfigPanel
            :item="focusItem"
            @change-path="(path, value) => onChartPath(focusItem!.id, path, value)"
          />
        </div>
      </div>
    </template>

    <!-- 多选 -->
    <template v-else-if="selected.length > 1">
      <div class="inspector__head">已选 {{ selected.length }} 个元素</div>
      <div class="inspector__body">
        <div class="inspector__section">
          <div class="inspector__section-title">对齐分布</div>
          <div class="inspector__align-grid">
            <button
              v-for="t in ALIGN_TOOLS"
              :key="t.mode"
              class="cf-button cf-button--plain cf-button--icon"
              :title="t.title"
              @click="doc.alignDistribute(t.mode)"
            >
              <Icon :name="t.icon" :size="15" />
            </button>
          </div>
          <div class="inspector__align-grid">
            <button class="cf-button cf-button--plain cf-button--icon" title="组合 (Ctrl+G)" @click="doc.addGroup()">
              <Icon name="group" :size="15" />
            </button>
            <button class="cf-button cf-button--plain cf-button--icon" title="取消组合" @click="doc.ungroup()">
              <Icon name="close" :size="15" />
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- 单选 -->
    <template v-else-if="single">
      <div class="inspector__head">
        <span>{{ single.name || single.kind }}</span>
        <button
          v-if="single.kind === 'chart'"
          class="inspector__back"
          title="聚焦编辑"
          @click="ui.setEditing(single.id)"
        >
          聚焦编辑
        </button>
      </div>
      <div class="inspector__body">
        <div v-if="singleChart && singleChart.sourceAssetId" class="inspector__source">
          <template v-if="sourceAsset(singleChart)">
            <span class="inspector__source-label">来源：{{ sourceAsset(singleChart)!.name }}</span>
            <button class="cf-button cf-button--plain cf-button--small" @click="openSource(singleChart)">打开源图表</button>
          </template>
          <span v-else class="inspector__source-missing">源图表已删除，当前是独立副本</span>
        </div>
              <div class="inspector__section">
          <div class="inspector__section-title">位置尺寸</div>
          <FramePanel :frame="single.frame" @change="onFrameChange" />
        </div>
        <div class="inspector__section">
          <div class="inspector__section-title">属性</div>
          <StylePanel :item="single" />
        </div>
        <div v-if="singleComponent" class="inspector__section">
          <div class="inspector__section-title">组件配置</div>
          <ComponentInspector
            :item="singleComponent"
            @update:props="doc.updateComponentProps(singleComponent.id, $event)"
            @update:data-binding="doc.updateItemDataBinding(singleComponent.id, $event)"
          />
        </div>
        <template v-if="single.kind === 'chart'">
          <div class="inspector__section">
            <div class="inspector__section-title">图表</div>
            <div class="inspector__row">
              <span class="inspector__label">类型</span>
              <select
                :key="`${single.id}-${single.spec.type}`"
                class="inspector__select cf-control cf-control--compact"
                :value="single.spec.type"
                @change="onTypeSelect(single.id, $event)"
              >
                <option v-for="c in chartTypeOptions(single)" :key="c.type" :value="c.type">
                  {{ c.label }}
                </option>
              </select>
            </div>
            <button class="cf-button cf-button--ghost inspector__wide-btn" @click="openAssetDialog(single)">
              另存为图表资产
            </button>
          </div>
          <div class="inspector__section">
            <div class="inspector__section-title">图表配置</div>
            <ChartConfigPanel
              :item="single"
              @change-path="(path, value) => onChartPath(single!.id, path, value)"
            />
          </div>
        </template>
      </div>
    </template>

    <!-- 无选中 -->
    <template v-else>
      <div class="inspector__head">画布设置</div>
      <div class="inspector__body">
        <div class="inspector__section"><ScreenPanel /></div>
      </div>
    </template>
    </div>

    <div v-else-if="activeTab === 'data'" id="inspector-panel" class="inspector__tab-panel inspector__tab-panel--data" role="tabpanel" aria-labelledby="inspector-tab-data">
      <template v-if="focusItem">
        <div class="inspector__section">
          <div class="inspector__section-title">工作区数据集绑定</div>
          <DatasetBindingEditor :model-value="focusItem.dataBinding" :show-fields="true" :chart-type="focusItem.spec.type" @update:model-value="doc.updateItemDataBinding(focusItem.id, $event)" />
        </div>
        <div class="inspector__section">
          <div class="inspector__section-title">静态数据</div>
          <DataTablePanel :item="focusItem" @change-data="(data) => onChartData(focusItem!.id, data)" />
        </div>
        <div class="inspector__section">
          <div class="inspector__section-title">实时数据</div>
          <LiveSourcePanel :item="focusItem" />
        </div>
      </template>
      <template v-else-if="singleChart">
        <div class="inspector__section">
          <div class="inspector__section-title">工作区数据集绑定</div>
          <DatasetBindingEditor :model-value="singleChart.dataBinding" :show-fields="true" :chart-type="singleChart.spec.type" @update:model-value="doc.updateItemDataBinding(singleChart.id, $event)" />
          <p class="inspector__binding-hint">绑定数据集后优先使用共享数据；下方图表数据与实时源仍保留为可编辑备用配置。</p>
        </div>
        <div v-if="singleChart.sourceAssetId" class="inspector__source">
          <span v-if="sourceAsset(singleChart)" class="inspector__source-label">来源：{{ sourceAsset(singleChart)!.name }}</span>
          <span v-else class="inspector__source-missing">源图表已删除，当前是独立副本</span>
        </div>
        <div class="inspector__section">
          <div class="inspector__section-title">静态数据</div>
          <DataTablePanel :item="singleChart" @change-data="(data) => onChartData(singleChart!.id, data)" />
        </div>
        <div class="inspector__section">
          <div class="inspector__section-title">实时数据</div>
          <LiveSourcePanel :item="singleChart" />
        </div>
      </template>
      <div v-else class="inspector__empty">
        <Icon name="chart" :size="22" />
        <p>{{ single ? "当前元素暂无数据配置" : "选择图表以配置数据" }}</p>
      </div>
    </div>

    <div v-else id="inspector-panel" class="inspector__tab-panel inspector__tab-panel--data" role="tabpanel" aria-labelledby="inspector-tab-interaction">
      <div class="inspector__empty">
        <Icon name="layers" :size="22" />
        <strong>蓝图交互</strong>
        <p>组件事件与动作将在蓝图编辑器中连接；首期仅支持声明式、受控的交互流程。</p>
      </div>
    </div>

    <ConfirmDialog
      v-if="pendingType"
      title="切换图表类型"
      message="切换类型会重置当前图表的参数配置与数据，画布位置和尺寸保持不变。"
      confirm-text="切换"
      @confirm="confirmChangeType"
      @cancel="pendingType = null; typeTargetId = null"
    />

    <ConfirmDialog
      v-if="assetOpen"
      title="另存为图表资产"
      message="把这个图表另外保存一份到图表库（图表库是图表的正式产地，这里用于把大屏里的图表回收复用）。"
      confirm-text="保存"
      @confirm="confirmSaveAsset"
      @cancel="assetOpen = false"
    >
      <div class="inspector__form">
        <label class="inspector__form-row">
          名称
          <input v-model="assetName" type="text" placeholder="图表名称" class="cf-control cf-control--compact" />
        </label>
        <label class="inspector__form-row">
          分类
          <select v-model="assetCategory" class="cf-control cf-control--compact">
            <option value="">未分类</option>
            <option v-for="c in CHART_TYPE_LABELS" :key="c.type" :value="c.label">{{ c.label }}</option>
          </select>
        </label>
        <label class="inspector__form-row">
          标签
          <input v-model="assetTagsText" type="text" placeholder="用逗号或空格分隔" class="cf-control cf-control--compact" />
        </label>
      </div>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.inspector {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  color: var(--cf-text);
}
.inspector__toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 8px;
  border-bottom: 1px solid var(--cf-border);
}
.inspector__tabs {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-self: stretch;
}
.inspector__tab {
  position: relative;
  min-width: 0;
  padding: 0 6px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
.inspector__tab:hover { color: var(--cf-text); }
.inspector__tab[aria-selected="true"] {
  border-bottom-color: var(--cf-primary);
  color: var(--cf-primary);
  font-weight: 600;
}
.inspector__tab:focus-visible, .inspector__collapse:focus-visible {
  outline: 2px solid var(--cf-primary);
  outline-offset: -2px;
}
.inspector__collapse {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
}
.inspector__collapse:hover { color: var(--cf-primary); background: color-mix(in srgb, var(--cf-primary) 10%, transparent); }
.inspector__tab-panel {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.inspector__tab-panel--data { padding: 12px; }
.inspector__empty {
  display: flex;
  min-height: 180px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--cf-text-2);
  text-align: center;
}
.inspector__empty strong { color: var(--cf-text); }
.inspector__empty p { max-width: 230px; margin: 0; font-size: 12px; line-height: 1.6; }
.inspector__source {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 8px 12px 0;
  padding: 6px 10px;
  border: 1px dashed var(--cf-border);
  border-radius: 6px;
  font-size: 11px;
  color: var(--cf-text-2);
}
.inspector__source-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
}
.inspector__binding-hint {
  margin: 6px 0 0;
  color: var(--cf-text-2);
  font-size: 10px;
  line-height: 1.45;
}
.inspector__source-missing {
  color: var(--cf-text-2);
  opacity: 0.8;
}
.inspector__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--cf-border);
  font-weight: 600;
  font-size: 13px;
}
.inspector__back {
  padding: 3px 10px;
  font-size: 12px;
  border: 1px solid var(--cf-border);
  border-radius: 5px;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
}
.inspector__body {
  padding: 12px;
}
.inspector__section {
  margin-bottom: 18px;
}
.inspector__section-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--cf-text);
}
.inspector__align-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.inspector__row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--cf-text-2);
}
.inspector__label {
  flex: none;
  width: 32px;
}
.inspector__form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 8px;
}
.inspector__form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: var(--cf-text-2);
}

.inspector__select { flex: 1; }
.inspector__wide-btn { width: 100%; }
.inspector__form-row .cf-control { width: 160px; }
</style>
