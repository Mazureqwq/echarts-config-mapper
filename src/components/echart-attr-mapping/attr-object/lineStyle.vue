<template>
  <div :class="isOpen ? 'normal' : 'close'">
    <div @click="isOpen = !isOpen" :style="{
      fontSize: '14px', cursor: 'pointer', color: '#409eff'
    }">点击{{ isOpen ? '收起' : '展开' }}>></div>

    <div :style="{
      padding: '0 15px'
    }">
      <div>
        线条颜色:
        <MyColorPicker :value="pValue.color" @cb="(val) => (pValue.color = val)" />
      </div>
      <div>
        线条宽度：
        <ElInputNumber v-model="pValue.width" />
      </div>
      <div>
        轴线类型：
        <ElSelect v-model="pValue.type" placeholder="请选择">
          <ElOption label="实线" value="solid" />
          <ElOption label="粗虚线" value="dashed" />
          <ElOption label="细虚线" value="dotted" />
        </ElSelect>
      </div>

      <div>
        阴影颜色:
        <MyColorPicker :value="pValue.shadowColor" @cb="(val) => (pValue.shadowColor = val)" />
      </div>

      <ShadowBlur :value="pValue.shadowBlur" @cb="(val) => (pValue.shadowBlur = val)" />

      <div>
        水平偏移:
        <ElInputNumber v-model="pValue.shadowOffsetX" />
      </div>
      <div>
        垂直偏移:
        <ElInputNumber v-model="pValue.shadowOffsetY" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ElInputNumber, ElSelect, ElOption } from "element-plus";
import MyColorPicker from "./../ui-status/MyColorPick.vue";
import ShadowBlur from "./shadowBlur.vue";
import { LineStyle } from "@/components/types";

const props = defineProps<{
  value: LineStyle;
}>();

const emit = defineEmits<{
  (e: "cb", val: LineStyle): void;
}>();

const isOpen = ref<boolean>(false);

// 本地默认配置
const pValue = ref<LineStyle>({
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

// 本地变化 → 通知父组件
watch(
  pValue,
  (val) => {
    emit("cb", val);
  },
  { deep: true },
);
</script>

<style lang="less" scoped></style>
