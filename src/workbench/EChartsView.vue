<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { init as echartsInit } from "echarts/core";
import type { EChartsType } from "echarts/core";
import { registerCharts } from "@/core/chart/registerCharts";

const props = defineProps<{
  option: Record<string, unknown> | null;
  theme?: "light" | "dark";
}>();

const emit = defineEmits<{ (e: "error", message: string): void }>();

const el = ref<HTMLDivElement | null>(null);
const chart = shallowRef<EChartsType | null>(null);
const renderError = ref("");
let optionTimer: ReturnType<typeof setTimeout> | null = null;
let resizeObserver: ResizeObserver | null = null;

function render(): void {
  const c = chart.value;
  if (!c || !props.option) return;
  try {
    renderError.value = "";
    c.setOption(props.option, { notMerge: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    renderError.value = msg;
    emit("error", msg);
  }
}

function mountChart(): void {
  if (!el.value) return;
  try {
    chart.value = echartsInit(el.value, props.theme);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    renderError.value = msg;
    emit("error", msg);
    return;
  }
  render();
}

onMounted(() => {
  registerCharts();
  mountChart();
  if (el.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => chart.value?.resize());
    resizeObserver.observe(el.value);
  }
});

watch(
  () => props.option,
  () => {
    if (optionTimer !== null) clearTimeout(optionTimer);
    optionTimer = setTimeout(render, 100);
  },
  { deep: true }
);

watch(
  () => props.theme,
  () => {
    chart.value?.dispose();
    chart.value = null;
    mountChart();
  }
);

onBeforeUnmount(() => {
  if (optionTimer !== null) clearTimeout(optionTimer);
  resizeObserver?.disconnect();
  chart.value?.dispose();
  chart.value = null;
});

defineExpose({
  getChart: () => chart.value,
});
</script>

<template>
  <div class="echarts-view">
    <div ref="el" class="echarts-view__canvas" />
    <div v-if="renderError" class="echarts-view__error">图表渲染出错：{{ renderError }}</div>
  </div>
</template>

<style scoped>
.echarts-view {
  position: relative;
  width: 100%;
  height: 100%;
}
.echarts-view__canvas {
  width: 100%;
  height: 100%;
}
.echarts-view__error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  text-align: center;
  color: var(--cf-danger, #d4380d);
  background: rgba(212, 56, 13, 0.06);
  font-size: 12px;
}
</style>
