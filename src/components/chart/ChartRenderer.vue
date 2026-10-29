<template>
  <div ref="host" class="chart-renderer" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import echarts, { type EChartsInstance } from "@/config/echarts";
import type { ChartInstance } from "@/types/chart";
import { registerChart, unregisterChart } from "@/utils/echartsRegistry";

const props = defineProps<{ chart: ChartInstance }>();

const host = ref<HTMLDivElement | null>(null);
const instance = shallowRef<EChartsInstance | null>(null);
let observer: ResizeObserver | null = null;
let mapReady: Promise<void> | null = null;

/** 地图类型才需要注册 china 地图数据，按需懒加载 */
function ensureMap(): Promise<void> {
  if (!mapReady) {
    mapReady = import("@/assets/geo/china.json").then((mod: any) => {
      echarts.registerMap("china", (mod.default ?? mod) as any);
    });
  }
  return mapReady;
}

async function render(option: unknown): Promise<void> {
  if (!instance.value) return;
  if (props.chart.type === "map") await ensureMap();
  instance.value.setOption(option as any, true);
}

onMounted(async () => {
  if (!host.value) return;
  if (props.chart.type === "map") await ensureMap();
  instance.value = echarts.init(host.value, undefined, { renderer: "canvas" });
  registerChart(props.chart.id, instance.value);
  await render(props.chart.option);

  observer = new ResizeObserver(() => instance.value?.resize());
  observer.observe(host.value);
});

watch(
  () => props.chart.option,
  (option) => void render(option),
  { deep: true },
);

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  unregisterChart(props.chart.id);
  instance.value?.dispose();
  instance.value = null;
});
</script>

<style scoped>
.chart-renderer {
  width: 100%;
  height: 100%;
}
</style>
