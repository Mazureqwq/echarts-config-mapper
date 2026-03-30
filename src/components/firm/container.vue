<script setup lang="tsx">
import { ref, watch, onMounted, nextTick, shallowRef, inject, Ref, markRaw } from "vue";
import { useElementSize } from "@vueuse/core";

// 类型定义
interface ChartOptions {
  type: string;
  width?: number;
  height?: number;
  echartOption?: any;
}

const props = defineProps<{
  options: ChartOptions;
  idx?: number;
  index: number;
}>();

// 图表实例 ref
const echartRef = ref<any>(null);

const chartContainer = ref<HTMLElement | null>(null);

const { width, height } = useElementSize(chartContainer);
watch(
  [width, height],
  (val) => {
    if (echartRef.value) {
      echartRef.value.resize?.();
    }
  },
  { deep: true, immediate: true },
);

// 当前配置
const curOption = ref<any>({});

// 动态加载图表类型配置
const loadChartConfig = async () => {
  const { type } = props.options;
  if (!type) return;
  // 赋值当前配置
  curOption.value = props.options.echartOption || module.default.echartOption;
};

// 初始化
onMounted(() => {
  loadChartConfig();
});

// 监听 options 变化
watch(
  () => props.options,
  async (val) => {
    if (!val) return;
    // 重新加载配置
    loadChartConfig();

    await nextTick();
    if (echartRef.value) {
      echartRef.value.resize?.();
    }
  },
  { deep: true },
);

const modules_tools = import.meta.glob('../../tools/charts/**/index.ts')

// 动态加载图表组件
const EchartComponent = shallowRef<any>(null);
watch(
  () => props.options.type,
  async (type) => {
    if (type) {
      const path = `../../tools/charts/${type}/index.ts`;
      if (!modules_tools[path]) {
        throw new Error(`组件不存在: ${path}`);
      }
      const module = await modules_tools[path]();
      EchartComponent.value = markRaw(module.default);
    }
  },
  { immediate: true },
);
</script>

<template>
  <div ref="chartContainer" :style="{
    width: '100%',
    height: '100%',
  }">
    <component v-if="EchartComponent" :is="EchartComponent" ref="echartRef" :type-options="curOption.echartOption"
      :index="index" />
  </div>
</template>
