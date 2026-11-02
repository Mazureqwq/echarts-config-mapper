<template>
  <aside class="palette">
    <el-tabs v-model="activeTab" class="palette-tabs">
      <el-tab-pane label="组件" name="widgets">
        <div class="palette-group">
          <div
            v-for="chartType in CHART_TYPES"
            :key="chartType"
            class="palette-item"
            draggable="true"
            @dragstart="onDragChart($event, chartType)"
          >
            <span class="palette-name">{{ CHART_META[chartType].label }}</span>
            <span class="palette-hint">{{ CHART_META[chartType].hint }}</span>
          </div>
        </div>
        <div class="palette-group">
          <div
            v-for="widget in WIDGETS"
            :key="widget.type"
            class="palette-item"
            draggable="true"
            @dragstart="onDragWidget($event, widget.type)"
          >
            <span class="palette-name">{{ widget.label }}</span>
            <span class="palette-hint">{{ widget.hint }}</span>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="图表资产" name="assets">
        <div v-if="assetsStore.assets.length === 0" class="palette-empty">
          图表库还没有资产，先到图表编辑器「存为资产」
        </div>
        <div class="palette-group">
          <div
            v-for="asset in assetsStore.assets"
            :key="asset.id"
            class="palette-item"
            draggable="true"
            @dragstart="onDragAsset($event, asset.id)"
          >
            <span class="palette-name">{{ asset.name }}</span>
            <span class="palette-hint">{{ asset.category }} · {{ asset.chartType }}</span>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </aside>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { CHART_META, CHART_TYPES } from "@/config/editor";
import type { WidgetType } from "@/core/types";
import type { ChartType } from "@/types/chart";
import { useAssetsStore } from "@/stores/assets";

const WIDGETS: Array<{ type: WidgetType; label: string; hint: string }> = [
  { type: "text", label: "文本", hint: "标题与说明" },
  { type: "image", label: "图片", hint: "图片资源" },
  { type: "datetime", label: "时间", hint: "实时时钟" },
  { type: "iframe", label: "网页", hint: "嵌入页面" },
];

const assetsStore = useAssetsStore();
const activeTab = ref("widgets");

function write(event: DragEvent, payload: unknown): void {
  event.dataTransfer?.setData("cf/palette", JSON.stringify(payload));
}

function onDragChart(event: DragEvent, type: ChartType): void {
  write(event, { kind: "chart-default", type });
}

function onDragWidget(event: DragEvent, type: WidgetType): void {
  write(event, { kind: "widget", type });
}

function onDragAsset(event: DragEvent, assetId: string): void {
  write(event, { kind: "chart-asset", assetId });
}
</script>

<style scoped>
.palette {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.palette-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.palette-tabs :deep(.el-tabs__content) {
  flex: 1 1 auto;
  overflow: auto;
  padding: 0 10px 12px;
}

.palette-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.palette-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--cf-border);
  border-radius: var(--cf-radius-sm);
  background: var(--cf-bg-2);
  cursor: grab;
  transition: border-color var(--cf-fast) ease;
}

.palette-item:hover {
  border-color: var(--cf-accent);
}

.palette-item:active {
  cursor: grabbing;
}

.palette-name {
  font-size: 12.5px;
  color: var(--cf-text);
}

.palette-hint {
  font-size: 10.5px;
  color: var(--cf-text-faint);
}

.palette-empty {
  margin: 12px 2px;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--cf-text-dim);
}
</style>
