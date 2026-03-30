<template>
  <div :class="isOpen ? 'normal' : 'close'">
    <div @click="isOpen = !isOpen" :style="{
      fontSize: '14px', cursor: 'pointer', color: '#409eff'
    }">点击{{ isOpen ? '收起' : '展开' }}>></div>

    <div>是否显示轴线:
      <ElSwitch v-model="axisLine.show" />
    </div>
    <div>XY轴同在0刻度:
      <ElSwitch v-model="axisLine.onZero" />
    </div>
    <div>pointer
      轴线两边的箭头:
      <ElSelect v-model="axisLine.symbol" placeholder="请选择">
        <ElOption label="不显示" value="none" />
        <ElOption label="箭头" value="arrow" />
      </ElSelect>
    </div>
    <div>箭头偏移:
      <ElInputNumber v-model="axisLine.symbolOffset" />
    </div>

    <LineStyle :value="axisLine.lineStyle" :cb="(val) => (axisLine.lineStyle = val)" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ElSwitch, ElSelect, ElOption, ElInputNumber } from "element-plus";
import LineStyle from "./lineStyle.vue";
import { AxisLine } from "@/components/types";

const props = defineProps<{
  value: AxisLine;
  // cb: (val: AxisLine) => void;
}>();
const emit = defineEmits<{
  (e: "cb", val: AxisLine): void;
}>();

const isOpen = ref<boolean>(false);

// 本地默认配置
const axisLine = ref<AxisLine>({
  show: true,
  onZero: true,
  symbol: "none",
  symbolSize: [10, 15],
  symbolOffset: 0,
  lineStyle: {
    color: "#333",
    width: 1,
    type: "solid",
    shadowColor: "rgba(0,0,0,0)",
    shadowBlur: {
      shadowColor: "rgba(0, 0, 0, 0.5)",
      shadowBlur: 10,
    },
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  },
});

watch(
  () => props.value,
  (val) => {
    if (val) {
      // if (val)
      Object.assign(axisLine.value, val);
      // console.log("axisLine.value", axisLine.value);

    }
  },
  { deep: true, immediate: true },
);

watch(
  axisLine.value,
  (val) => {
    emit('cb', val);
  },
  { deep: true },
);
</script>

<style lang="less" scoped></style>
