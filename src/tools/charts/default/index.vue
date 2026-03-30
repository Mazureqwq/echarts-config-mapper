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

// Props
const props = defineProps<{
  typeOptions: EchartConfig;
  index?: number;
}>();

// 实例 & DOM ref
const echartRef = ref<HTMLElement | null>(null);
let echartEl: echarts.ECharts | null = null;

// 初始化图表
onMounted(() => {
  if (!echartRef.value) return;

  echartEl = echarts.init(echartRef.value);
  echartEl.setOption(props.typeOptions);
  eventBus();
});

// 监听配置变化 → 更新图表
watch(
  () => props.typeOptions,
  (val) => {
    if (echartEl && val) {
      echartEl.setOption(val);
    }
  },
  { deep: true, immediate: true },
);

// 对外方法：resize
const resize = () => {
  echartEl?.resize();
};

// 对外方法：重置配置
const resetOption = (option: EchartConfig) => {
  echartEl?.setOption(option);
};

// 点击事件：发送 bus
const eventBus = () => {
  emitter.emit("setOptionItem", {
    index: props.index,
    option: props.typeOptions,
  });
};

// 暴露方法给父组件（如 resize / resetOption）
defineExpose({
  resize,
  resetOption,
});
</script>

<style scoped>
/* 如需样式可写在这里 */
</style>
