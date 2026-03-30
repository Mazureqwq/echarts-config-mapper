<template>
  <span>
    <ElSwitch v-model="pvalue" active-color="#13ce66" inactive-color="#ff4949" @change="change" />
  </span>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { ElSwitch } from "element-plus";

const props = defineProps<{
  value: boolean | undefined | null;
}>();

const emit = defineEmits<{
  (e: "cb", val: boolean): void;
}>();

const pvalue = ref<boolean>(false);

watch(
  () => props.value,
  (val) => {
    pvalue.value = val;
    console.log("Switch value changed:", val);
  },
  { immediate: true, deep: true },
);

onMounted(() => {
  pvalue.value = props.value;
});

const change = (val: boolean) => {
  emit("cb", val);
};
</script>

<style scoped></style>
