<template>
  <div :class="isOpen ? 'normal' : 'close'">
    <div @click="isOpen = !isOpen" :style="{
      fontSize: '14px', cursor: 'pointer', color: '#409eff'
    }">点击{{ isOpen ? '收起' : '展开' }}>></div>
    <div :style="{
      padding: '0 15px'
    }">
      <div>是否显示:<ElSwitch v-model="splitArea.show"></ElSwitch>
      </div>
      <div class="">
        间隔:
        <ElInputNumber v-model="splitArea.interval" />
      </div>
      <AreaStyle :value="splitArea.areaStyle" @cb="(val) => (splitArea.areaStyle = val)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ElSwitch, ElInputNumber } from "element-plus";
import AreaStyle from "./area-style.vue";
import { SplitArea } from "@/components/types";

const props = defineProps<{
  value: SplitArea;
}>();

const emit = defineEmits<{
  (e: "cb", val: SplitArea): void;
}>();

const isOpen = ref<boolean>(false);
const splitArea = ref<SplitArea>({
  interval: 0,
  show: true,
  areaStyle: {
    color: "rgba(250,250,250,0)",
    shadowBlur: {
      shadowColor: "rgba(0, 0, 0, 0.5)",
      shadowBlur: 10,
    },
    shadowColor: "red",
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    opacity: 0.7,
  },
});

watch(
  () => props.value,
  (val) => {
    if (val) {
      splitArea.value = val;
    }
  },
  { deep: true, immediate: true },
);

watch(
  splitArea,
  (val) => {
    emit("cb", val);
  },
  { deep: true },
);
</script>

<style lang="less" scoped></style>
