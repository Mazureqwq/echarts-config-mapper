<script setup lang="ts">
import { computed } from "vue";
import type { ChartType, ScreenItem } from "@/core/model/types";
import { useDocumentStore } from "@/stores/documentStore";
import Icon from "@/shared/ui/Icon.vue";

defineProps<{ section: "charts" | "materials" }>();

const doc = useDocumentStore();

const DROP_MIME = "application/x-chartforge-item";

const hasChart = computed(() => doc.items.some((i) => i.kind === "chart"));

function pickChart(type: ChartType): void {
  const existing = doc.items.find((i) => i.kind === "chart");
  if (existing) doc.changeChartType(existing.id, type);
  else doc.ensureChart(type);
}

const CHART_TYPES: Array<{ type: ChartType; label: string }> = [
  { type: "line", label: "折线图" },
  { type: "bar", label: "柱状图" },
  { type: "pie", label: "饼图" },
  { type: "map", label: "地图" },
  { type: "scatter", label: "散点图" },
  { type: "radar", label: "雷达图" },
];

const BASIC_ITEMS: Array<{ kind: ScreenItem["kind"]; label: string; icon: string }> = [
  { kind: "text", label: "文本", icon: "text" },
  { kind: "image", label: "图片", icon: "image" },
  { kind: "shape", label: "形状", icon: "shape" },
];

function drag(ev: DragEvent, payload: { kind: ScreenItem["kind"]; chartType?: ChartType }): void {
  ev.dataTransfer?.setData(DROP_MIME, JSON.stringify(payload));
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "copy";
}
</script>

<template>
  <div class="elements-panel">
    <template v-if="section === 'charts'">
      <div class="elements-panel__group-title">图表</div>
      <div class="elements-panel__grid">
        <div
          v-for="c in CHART_TYPES"
          :key="c.type"
          class="elements-panel__chip"
          draggable="true"
          @dragstart="drag($event, { kind: 'chart', chartType: c.type })"
          @click="pickChart(c.type)"
        >
          <Icon name="chart" :size="18" />
          <span>{{ c.label }}</span>
        </div>
      </div>
      <div v-if="hasChart" class="elements-panel__hint">画布只能有一个图表，点击类型直接切换</div>
      <div v-else class="elements-panel__hint">按住拖到画布中放置</div>
    </template>
    <template v-else>
      <div class="elements-panel__group-title">素材</div>
      <div class="elements-panel__grid">
        <div
          v-for="b in BASIC_ITEMS"
          :key="b.kind"
          class="elements-panel__chip"
          draggable="true"
          @dragstart="drag($event, { kind: b.kind })"
        >
          <Icon :name="b.icon" :size="18" />
          <span>{{ b.label }}</span>
        </div>
      </div>
      <div class="elements-panel__hint">按住拖到画布中放置</div>
    </template>
  </div>
</template>

<style scoped>
.elements-panel {
  padding: 12px;
}
.elements-panel__group-title {
  font-size: 12px;
  font-weight: 600;
  margin: 10px 0 8px;
}
.elements-panel__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.elements-panel__chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 6px;
  border: 1px solid var(--cf-border);
  border-radius: 8px;
  cursor: grab;
  font-size: 12px;
  color: var(--cf-text-2);
  background: var(--cf-bg);
  user-select: none;
}
.elements-panel__chip:hover {
  border-color: var(--cf-primary);
  color: var(--cf-primary);
}
.elements-panel__hint {
  margin-top: 14px;
  font-size: 12px;
  color: var(--cf-text-2);
  text-align: center;
}
</style>
