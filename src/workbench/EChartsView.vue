<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { init as echartsInit } from "echarts/core";
import type { EChartsType } from "echarts/core";
import { registerCharts } from "@/core/chart/registerCharts";

const props = defineProps<{
  option: Record<string, unknown> | null;
  theme?: "light" | "dark";
}>();

const emit = defineEmits<{ (e: "error", message: string): void; (e: "roam", payload: { center: [number, number]; zoom: number }): void; (e: "chartEvent", payload: { type: "click" | "dblclick"; name: string | null; value: number | null; componentType: string; seriesType: string }): void }>();

const el = ref<HTMLDivElement | null>(null);
const chart = shallowRef<EChartsType | null>(null);
const renderError = ref("");
let optionTimer: ReturnType<typeof setTimeout> | null = null;
let resizeObserver: ResizeObserver | null = null;

function syncGeoLayerCamera(): void {
  const instance = chart.value;
  if (!instance) return;
  const option = instance.getOption() as { geo?: Array<Record<string, unknown>> };
  const geos = option.geo;
  if (!Array.isArray(geos) || geos.length < 2) return;
  const topIndex = geos.length - 1;
  const topGeo = geos[topIndex];
  const center = topGeo?.center;
  const zoom = topGeo?.zoom;
  if (!Array.isArray(center) || typeof zoom !== "number") return;
  const syncedGeo = geos.map((geo, index) => ({ ...geo, center: [...center], zoom, ...(index < topIndex ? { roam: false } : {}) }));
  instance.setOption({ geo: syncedGeo }, { notMerge: false, lazyUpdate: true, silent: true });
}

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
  chart.value.on("georoam", syncGeoLayerCamera);
  chart.value.on("georoam", () => {
    const instance = chart.value;
    if (!instance) return;
    const option = instance.getOption() as { geo?: Array<Record<string, unknown>> | Record<string, unknown> };
    const geos = option.geo;
    const geo = Array.isArray(geos) ? geos[geos.length - 1] : geos;
    if (!geo || !Array.isArray(geo.center) || typeof geo.zoom !== "number") return;
    emit("roam", { center: [...geo.center] as [number, number], zoom: geo.zoom });
  });
  const forwardChartEvent = (type: "click" | "dblclick") => (raw: unknown) => {
    const params = (raw ?? {}) as Record<string, unknown>;
    emit("chartEvent", {
      type,
      name: typeof params.name === "string" ? params.name : null,
      value: typeof params.value === "number" ? params.value : null,
      componentType: typeof params.componentType === "string" ? params.componentType : "",
      seriesType: typeof params.seriesType === "string" ? params.seriesType : "",
    });
  };
  chart.value.on("click", forwardChartEvent("click"));
  chart.value.on("dblclick", forwardChartEvent("dblclick"));
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
