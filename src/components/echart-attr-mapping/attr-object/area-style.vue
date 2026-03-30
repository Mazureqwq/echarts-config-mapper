<template>
  <div>
    <div class="item">
      区域颜色:
      <MyColorPicker
        :value="pValue.color"
        @cb="(val) => (pValue.color = val)" />
    </div>

    <div class="item">
      阴影颜色:
      <MyColorPicker
        :value="pValue.shadowColor"
        @cb="(val) => (pValue.shadowColor = val)" />
    </div>

    <div class="item">
      水平偏移:
      <ElInputNumber v-model="pValue.shadowOffsetX" />
    </div>

    <div class="item">
      垂直偏移:
      <ElInputNumber v-model="pValue.shadowOffsetY" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ElInputNumber } from "element-plus";
import MyColorPicker from "./../ui-status/MyColorPick.vue";
import { ShadowStyle } from "@/components/types";

const props = defineProps<{
  value: ShadowStyle;
}>();

const emit = defineEmits<{
  (e: "cb", val: ShadowStyle): void;
}>();

const pValue = ref<ShadowStyle>({
  color: "rgba(250,250,250,0)",
  shadowColor: "rgba(0, 0, 0, 0.5)",
  shadowBlur: {
    shadowColor: "rgba(0, 0, 0, 0.5)",
    shadowBlur: 10,
  },
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  opacity: 0.7,
});

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

<style lang="less" scoped>
.item {
  margin: 8px 0;
}
</style>
