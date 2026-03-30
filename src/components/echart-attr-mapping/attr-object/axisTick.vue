<template>
  <div :class="isOpen ? 'normal' : 'close'">
    <div @click="isOpen = !isOpen" :style="{
      fontSize: '14px', cursor: 'pointer', color: '#409eff'
    }">点击{{ isOpen ? '收起' : '展开' }}>></div>

    <div :style="{
      padding: '0 15px'
    }">
      <div>是否显示刻度:
        <ElSwitch v-model="pValue.show" />
      </div>
      <div>刻度和标签是否对其:
        <ElSwitch v-model="pValue.alignWithLabel" />
      </div>
      <div>刻度显示间隔:
        <ElInputNumber v-model="pValue.interval" />
      </div>
      <div>刻度是否朝内:
        <ElSwitch v-model="pValue.inside" />
      </div>
      <div>刻度长度:
        <ElInputNumber v-model="pValue.length" />
      </div>

      <LineStyle :value="pValue.lineStyle" @cb="(val) => (pValue.lineStyle = val)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ElSwitch, ElInputNumber } from "element-plus";
import LineStyle from "./lineStyle.vue";
import { TickConfig } from "@/components/types";

const props = defineProps<{
  value: TickConfig;
}>();

const emit = defineEmits<{
  (e: "cb", val: TickConfig): void;
}>();

const isOpen = ref<boolean>(false);

// 本地默认值
const pValue = ref<TickConfig>({
  show: true,
  alignWithLabel: false,
  interval: 0,
  inside: false,
  length: 5,
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

// 父组件 value → 同步本地
watch(
  () => props.value,
  (val) => {
    if (val) {
      Object.assign(pValue.value, val);
    }
  },
  { deep: true, immediate: true },
);

watch(
  pValue,
  (val) => {
    emit("cb", val);
  },
  { deep: true },
);
</script>

<style lang="less" scoped></style>
