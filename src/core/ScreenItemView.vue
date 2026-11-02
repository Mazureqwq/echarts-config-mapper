<template>
  <div class="screen-item-view">
    <template v-if="isChart">
      <ChartRenderer v-if="chartInstance" :chart="chartInstance" />
      <div v-else />
    </template>
    <img v-else-if="isImage" class="wv-image" :src="widgetSrc" alt="" />
    <iframe v-else-if="isIframe" class="wv-iframe" :src="widgetSrc" />
    <div v-else-if="isDatetime" class="wv-datetime">{{ displayTime }}</div>
    <div v-else class="wv-text" :style="textStyle">{{ widgetText }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import ChartRenderer from "@/components/chart/ChartRenderer.vue";
import type { ChartInstance } from "@/types/chart";
import { formatDateTime } from "./format";
import type { ScreenItem } from "./types";

const props = defineProps<{ item: ScreenItem }>();

const isChart = computed(() => props.item.type === "chart");
const isImage = computed(() => props.item.type === "image");
const isIframe = computed(() => props.item.type === "iframe");
const isDatetime = computed(() => props.item.type === "datetime");
const widgetSrc = computed(() => props.item.props?.src ?? "");
const widgetText = computed(() => props.item.props?.text ?? "");

/**
 * chart item → ChartInstance。定位字段取自 item.rect（本组件只填满父级容器，
 * 实际定位由父级处理）；item.chart 缺失时返回 null（容错渲染空 div）。
 * Task 9 落地共享 toChartInstance 后替换此实现。
 */
const chartInstance = computed<ChartInstance | null>(() => {
  const chart = props.item.chart;
  if (props.item.type !== "chart" || !chart) return null;
  return {
    id: props.item.id,
    type: chart.chartType,
    title: props.item.name,
    x: props.item.rect.x,
    y: props.item.rect.y,
    w: props.item.rect.w,
    h: props.item.rect.h,
    option: chart.option,
  };
});

const textStyle = computed(() => ({
  fontSize: (props.item.props?.fontSize ?? 24) + "px",
  color: props.item.props?.color ?? "#E6EAF2",
}));

const now = ref(new Date());
const displayTime = computed(() =>
  formatDateTime(now.value, props.item.props?.format ?? "YYYY-MM-DD HH:mm:ss"),
);
let timer: number | undefined;

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = new Date();
  }, 1000);
});

onBeforeUnmount(() => {
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
});
</script>

<style scoped>
.screen-item-view {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.wv-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.wv-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

.wv-datetime {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wv-text {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  word-break: break-all;
}
</style>
