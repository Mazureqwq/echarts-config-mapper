<template>
  <div :class="isOpen ? 'normal' : 'close'">
    <div @click="isOpen = !isOpen" :style="{
      fontSize: '14px', cursor: 'pointer', color: '#409eff'
    }">点击{{ isOpen ? '收起' : '展开' }}>></div>
    <div></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
// import MyColorPicker from "./../ui-status/MyColorPick.vue";
import { ConfigValue } from "@/components/types";

const props = defineProps<{
  value: ConfigValue;
}>();

const emit = defineEmits<{
  (e: "cb", val: ConfigValue): void;
}>();

// 响应式数据
const isOpen = ref<boolean>(false);
const pValue = ref<ConfigValue>({});

watch(
  () => props.value,
  (val) => {
    if (val) pValue.value = val;
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

// 生命周期
onMounted(() => {
  console.log(123, props.value);
});
</script>

<style lang="less" scoped></style>
