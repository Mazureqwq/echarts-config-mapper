<template>
  <ElSelect v-model="value" placeholder="请选择一个属性配置" @change="change">
    <ElOption v-for="item in options" :key="item.value" :label="item.label" :value="item.value" />
  </ElSelect>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { ElSelect, ElOption } from "element-plus";
import { OptionItem } from "@/components/types";

const emit = defineEmits(['setOption']);
const props = defineProps<{
  options: OptionItem[];
  val: string | number | undefined;
  setOption: (val: string | number) => void;
}>();

const value = ref<string | number>("");

const change = (val: string | number) => {
  props.setOption(val);
};

watch(
  () => props.val,
  (val) => {
    value.value = val;
  },
);

onMounted(() => {
  value.value = props.val;
});
</script>

<style scoped></style>
