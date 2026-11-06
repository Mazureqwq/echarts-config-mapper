<script setup lang="ts">
import { computed, ref } from "vue";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import type { ChartItem, ChartType, Frame, ScreenItem } from "@/core/model/types";
import { renderChartThumbnail } from "./chartThumbnail";
import ConfirmDialog from "@/shared/ui/ConfirmDialog.vue";
import FramePanel from "./panels/FramePanel.vue";
import StylePanel from "./panels/StylePanel.vue";
import ScreenPanel from "./panels/ScreenPanel.vue";
import ChartConfigPanel from "./panels/ChartConfigPanel.vue";
import DataTablePanel from "./panels/DataTablePanel.vue";
import Icon from "@/shared/ui/Icon.vue";
import type { AlignMode } from "@/stores/documentStore";

const doc = useDocumentStore();
const ui = useUiStore();

const selected = computed<ScreenItem[]>(() =>
  doc.items.filter((i) => doc.selectedIds.includes(i.id))
);
const single = computed<ScreenItem | null>(() =>
  selected.value.length === 1 ? selected.value[0] : null
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
const CHART_TYPE_LABELS: Array<{ type: ChartType; label: string }> = [
  { type: "line", label: "折线图" },
  { type: "bar", label: "柱状图" },
  { type: "pie", label: "饼图" },
  { type: "map", label: "地图" },
  { type: "scatter", label: "散点图" },
  { type: "radar", label: "雷达图" },
];

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
    <!-- 聚焦编辑 -->
    <template v-if="focusItem">
      <div class="inspector__head">
        <span>聚焦编辑：{{ focusItem.name }}</span>
        <button class="inspector__back" @click="ui.setEditing(null)">返回（Esc）</button>
      </div>
      <div class="inspector__body">
        <div class="inspector__section">
          <div class="inspector__section-title">图表</div>
          <div class="inspector__row">
            <span class="inspector__label">类型</span>
            <select
              :key="`focus-${focusItem.id}-${focusItem.spec.type}`"
              class="inspector__select"
              :value="focusItem.spec.type"
              @change="onTypeSelect(focusItem.id, $event)"
            >
              <option v-for="c in CHART_TYPE_LABELS" :key="c.type" :value="c.type">
                {{ c.label }}
              </option>
            </select>
          </div>
          <button class="inspector__wide-btn" @click="openAssetDialog(focusItem)">
            保存到图表库
          </button>
        </div>
        <div class="inspector__section"><ChartConfigPanel :item="focusItem" /></div>
        <div class="inspector__section"><DataTablePanel :item="focusItem" /></div>
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
              class="inspector__icon-btn"
              :title="t.title"
              @click="doc.alignDistribute(t.mode)"
            >
              <Icon :name="t.icon" :size="15" />
            </button>
          </div>
          <div class="inspector__align-grid">
            <button class="inspector__icon-btn" title="组合 (Ctrl+G)" @click="doc.addGroup()">
              <Icon name="group" :size="15" />
            </button>
            <button class="inspector__icon-btn" title="取消组合" @click="doc.ungroup()">
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
        <div class="inspector__section">
          <div class="inspector__section-title">位置尺寸</div>
          <FramePanel :frame="single.frame" @change="onFrameChange" />
        </div>
        <div class="inspector__section">
          <div class="inspector__section-title">属性</div>
          <StylePanel :item="single" />
        </div>
        <template v-if="single.kind === 'chart'">
          <div class="inspector__section">
            <div class="inspector__section-title">图表</div>
            <div class="inspector__row">
              <span class="inspector__label">类型</span>
              <select
                :key="`${single.id}-${single.spec.type}`"
                class="inspector__select"
                :value="single.spec.type"
                @change="onTypeSelect(single.id, $event)"
              >
                <option v-for="c in CHART_TYPE_LABELS" :key="c.type" :value="c.type">
                  {{ c.label }}
                </option>
              </select>
            </div>
            <button class="inspector__wide-btn" @click="openAssetDialog(single)">
              保存到图表库
            </button>
          </div>
          <div class="inspector__section">
            <div class="inspector__section-title">图表配置</div>
            <ChartConfigPanel :item="single" />
          </div>
          <div class="inspector__section">
            <DataTablePanel :item="single" />
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
      title="保存到图表库"
      message="保存为可复用的图表资产，之后可在大屏中拖入副本。"
      confirm-text="保存"
      @confirm="confirmSaveAsset"
      @cancel="assetOpen = false"
    >
      <div class="inspector__form">
        <label class="inspector__form-row">
          名称
          <input v-model="assetName" type="text" placeholder="图表名称" />
        </label>
        <label class="inspector__form-row">
          分类
          <select v-model="assetCategory">
            <option value="">未分类</option>
            <option v-for="c in CHART_TYPE_LABELS" :key="c.type" :value="c.label">{{ c.label }}</option>
          </select>
        </label>
        <label class="inspector__form-row">
          标签
          <input v-model="assetTagsText" type="text" placeholder="用逗号或空格分隔" />
        </label>
      </div>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.inspector {
  display: flex;
  flex-direction: column;
  height: 100%;
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
  flex: 1;
  overflow-y: auto;
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
.inspector__icon-btn {
  width: 32px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
}
.inspector__icon-btn:hover {
  color: var(--cf-primary);
  border-color: var(--cf-primary);
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
.inspector__select {
  flex: 1;
  padding: 5px 8px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 12px;
}
.inspector__wide-btn {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--cf-primary);
  border-radius: 6px;
  background: color-mix(in srgb, var(--cf-primary) 10%, transparent);
  color: var(--cf-primary);
  font-size: 12px;
  cursor: pointer;
}
.inspector__wide-btn:hover {
  background: color-mix(in srgb, var(--cf-primary) 18%, transparent);
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
.inspector__form-row input,
.inspector__form-row select {
  width: 160px;
  padding: 5px 8px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 12px;
}
</style>
