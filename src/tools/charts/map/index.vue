<template>
  <div @click="eventBus" style="height: 100%; width: 100%" ref="echartRef" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, getCurrentInstance } from "vue";
import * as echarts from "echarts";
import emitter from "@/utils/eventBus";

// 类型定义
interface EchartConfig {
  [key: string]: any;
}

// Props 类型声明
const props = defineProps<{
  typeOptions: EchartConfig;
  index?: number;
}>();

// DOM 引用 & 图表实例
const echartRef = ref<HTMLElement | null>(null);
let echartEl: echarts.ECharts | null = null;

// 初始化图表（地图专用）
onMounted(async () => {
  if (!echartRef.value) return;

  // 注册中国地图
  const mapType = await import("./mapdata/china.json");
  echarts.registerMap("china", (mapType.default as any) || mapType);

  // 初始化 echart
  echartEl = echarts.init(echartRef.value);
  echartEl.setOption(props.typeOptions);

  // 初始化发送事件
  eventBus();
});

// 深度监听配置变化
watch(
  () => props.typeOptions,
  (val) => {
    if (echartEl && val) {
      echartEl.setOption(val);
    }
  },
  { deep: true, immediate: true },
);

// 对外暴露方法
const resize = () => {
  echartEl?.resize();
};

const resetOption = (option: EchartConfig) => {
  echartEl?.setOption(option);
};

// 点击事件
const eventBus = () => {
  emitter.emit("setOptionItem", {
    index: props.index,
    option: props.typeOptions,
  });
};

// 暴露给父组件调用（resize / resetOption）
defineExpose({
  resize,
  resetOption,
});
</script>

<style scoped>
/* 自定义样式 */
</style>
