<template>
  <aside class="inspector">
    <div v-if="!item" class="inspector-empty">选中画布中的元素后在此编辑属性</div>

    <template v-else>
      <div class="inspector-section">
        <div class="section-title">基础</div>
        <div class="field-row">
          <span class="field-label">名称</span>
          <el-input :model-value="item.name" @change="onName" />
        </div>
        <div class="grid-2">
          <div class="field">
            <span class="field-label">X</span>
            <el-input-number
              :model-value="item.rect.x"
              :step="1"
              @update:model-value="onRectX"
              @change="commitChange"
            />
          </div>
          <div class="field">
            <span class="field-label">Y</span>
            <el-input-number
              :model-value="item.rect.y"
              :step="1"
              @update:model-value="onRectY"
              @change="commitChange"
            />
          </div>
          <div class="field">
            <span class="field-label">宽</span>
            <el-input-number
              :model-value="item.rect.w"
              :min="40"
              :step="1"
              @update:model-value="onRectW"
              @change="commitChange"
            />
          </div>
          <div class="field">
            <span class="field-label">高</span>
            <el-input-number
              :model-value="item.rect.h"
              :min="30"
              :step="1"
              @update:model-value="onRectH"
              @change="commitChange"
            />
          </div>
        </div>
      </div>

      <div v-if="isChart" class="inspector-chart">
        <el-tabs v-model="chartTab" class="chart-tabs">
          <el-tab-pane label="属性" name="attr">
            <AttrPanel v-if="chartInstance" :chart="chartInstance" />
          </el-tab-pane>
          <el-tab-pane label="数据" name="data">
            <DataPanel v-if="chartInstance" :chart="chartInstance" />
          </el-tab-pane>
          <el-tab-pane label="JSON" name="json">
            <JsonPanel v-if="chartInstance" :chart="chartInstance" />
          </el-tab-pane>
          <el-tab-pane label="数据源" name="source">
            <DataSourceEditor :item="item" />
          </el-tab-pane>
        </el-tabs>
      </div>

      <div v-else class="inspector-section">
        <div class="section-title">组件属性</div>
        <template v-if="isText">
          <div class="field-row">
            <span class="field-label">文本</span>
            <el-input
              :model-value="item.props?.text"
              type="textarea"
              :rows="3"
              @update:model-value="onText"
              @change="commitChange"
            />
          </div>
          <div class="field-row">
            <span class="field-label">字号</span>
            <el-input-number
              :model-value="item.props?.fontSize ?? 24"
              :min="10"
              :max="200"
              @update:model-value="onFontSize"
              @change="commitChange"
            />
          </div>
          <div class="field-row">
            <span class="field-label">颜色</span>
            <el-color-picker :model-value="item.props?.color" @update:model-value="onColor" @change="commitChange" />
          </div>
        </template>
        <template v-else-if="isImageOrIframe">
          <div class="field-row">
            <span class="field-label">地址</span>
            <el-input
              :model-value="item.props?.src"
              placeholder="https://example.com/pic.png"
              @change="onSrc"
            />
          </div>
        </template>
        <template v-else-if="isDatetime">
          <div class="field-row">
            <span class="field-label">格式</span>
            <el-input
              :model-value="item.props?.format"
              placeholder="YYYY-MM-DD HH:mm:ss"
              @change="onFormat"
            />
          </div>
        </template>
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AttrPanel from "@/components/editor/panels/AttrPanel.vue";
import DataPanel from "@/components/editor/panels/DataPanel.vue";
import JsonPanel from "@/components/editor/panels/JsonPanel.vue";
import DataSourceEditor from "@/components/designer/DataSourceEditor.vue";
import { provideOptionEditor } from "@/composables/useOptionEditor";
import { toChartInstance } from "@/core/item";
import type { ScreenItem } from "@/core/types";
import { useDesignerStore } from "@/stores/designer";
import { getByPath, setByPath } from "@/utils/object";

const designer = useDesignerStore();

/** 当前选中元素（无选中为 null） */
const item = computed<ScreenItem | null>(() => {
  if (!designer.schema || !designer.selectedId) return null;
  return designer.schema.items.find((entry) => entry.id === designer.selectedId) ?? null;
});

const isChart = computed(() => item.value?.type === "chart");
const isText = computed(() => item.value?.type === "text");
const isImageOrIframe = computed(() => item.value?.type === "image" || item.value?.type === "iframe");
const isDatetime = computed(() => item.value?.type === "datetime");

/** chart 元素 → ChartInstance（面板复用编辑器的属性/数据/JSON 面板） */
const chartInstance = computed(() => {
  const current = item.value;
  if (!current || current.type !== "chart") return null;
  return toChartInstance(current);
});

const chartTab = ref("attr");

/** 面板解耦上下文：图表面板读写选中元素的 option（连续修改不记历史） */
provideOptionEditor({
  read: (path, fallback) => getByPath(item.value?.chart?.option, path, fallback),
  update: (path, value) => {
    const current = item.value;
    if (!current?.chart) return;
    designer.setChartOption(current.id, setByPath(current.chart.option, path, value), false);
  },
  replace: (option, record) => {
    const current = item.value;
    if (!current?.chart) return;
    designer.setChartOption(current.id, option, record);
  },
  commit: () => designer.commit(),
});

function onName(value: string): void {
  const current = item.value;
  if (!current) return;
  const name = value.trim();
  if (!name || name === current.name) return;
  designer.renameItem(current.id, name);
  designer.commit();
}

/** 连续输入只改值（touch），change 统一 commit 记历史 */
function onRectX(value: number | undefined): void {
  if (value === undefined || !item.value) return;
  designer.updateRect(item.value.id, { x: value }, false);
}

function onRectY(value: number | undefined): void {
  if (value === undefined || !item.value) return;
  designer.updateRect(item.value.id, { y: value }, false);
}

function onRectW(value: number | undefined): void {
  if (value === undefined || !item.value) return;
  designer.updateRect(item.value.id, { w: value }, false);
}

function onRectH(value: number | undefined): void {
  if (value === undefined || !item.value) return;
  designer.updateRect(item.value.id, { h: value }, false);
}

function commitChange(): void {
  designer.commit();
}

function onText(text: string): void {
  if (!item.value) return;
  designer.setProps(item.value.id, { text });
}

function onFontSize(value: number | undefined): void {
  if (!item.value) return;
  designer.setProps(item.value.id, { fontSize: value ?? 12 });
}

function onColor(color: string | null): void {
  if (!item.value || !color) return;
  designer.setProps(item.value.id, { color });
}

function onSrc(value: string): void {
  const current = item.value;
  if (!current) return;
  designer.setProps(current.id, { src: value.trim() });
  designer.commit();
}

function onFormat(value: string): void {
  const current = item.value;
  if (!current) return;
  designer.setProps(current.id, { format: value.trim() });
  designer.commit();
}
</script>

<style scoped>
.inspector {
  height: 100%;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.inspector-empty {
  margin: 16px 12px;
  font-size: 11.5px;
  line-height: 1.8;
  color: var(--cf-text-faint);
}

.inspector-section {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-bottom: 1px solid var(--cf-border);
}

.section-title {
  font-size: 12px;
  color: var(--cf-text-dim);
}

.field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.field-row .field-label {
  flex: 0 0 40px;
}

.field-label {
  font-size: 11.5px;
  color: var(--cf-text-dim);
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.field {
  display: flex;
  align-items: center;
  gap: 6px;
}

.field .field-label {
  flex: 0 0 20px;
}

.field :deep(.el-input-number) {
  flex: 1 1 auto;
  width: 100%;
}

.inspector-chart {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.chart-tabs {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}

.chart-tabs :deep(.el-tabs__content) {
  flex: 1 1 auto;
  overflow: auto;
}
</style>
