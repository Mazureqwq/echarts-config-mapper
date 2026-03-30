<template>
  <div>
    <div>
      阴影模糊颜色:
      <MyColorPicker :value="pValue.shadowColor" @cb="(val) => (pValue.shadowColor = val)" />
    </div>
    <div>
      阴影模糊大小:
      <ElInputNumber v-model="pValue.shadowBlur" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ElInputNumber } from "element-plus";
import MyColorPicker from "./../ui-status/MyColorPick.vue";
import { ShadowBlur } from "@/components/types";

const props = defineProps<{
  value: ShadowBlur | undefined;
}>();

const emit = defineEmits<{
  (e: "cb", val: ShadowBlur): void;
}>();

const pValue = ref<ShadowBlur>({
  shadowColor: "rgba(0, 0, 0, 0.5)",
  shadowBlur: 10,
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

<style lang="less" scoped></style>
