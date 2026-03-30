<template>
  <ElColorPicker v-model="pcolor" size="small" show-alpha :predefine="predefineColors" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { ElColorPicker } from "element-plus";

const props = defineProps<{
  value: string | undefined | null;
}>();

const emit = defineEmits<{
  (e: "cb", val: string): void;
}>();

const pcolor = ref<string>("#fff");
const predefineColors = ref<string[]>([
  "#ff4500",
  "#ff8c00",
  "#ffd700",
  "#90ee90",
  "#00ced1",
  "#1e90ff",
  "#c71585",
  "rgba(255, 69, 0, 0.68)",
  "rgb(255, 120, 0)",
  "hsv(51, 100, 98)",
  "hsva(120, 40, 94, 0.5)",
  "hsl(181, 100%, 37%)",
  "hsla(209, 100%, 56%, 0.73)",
  "#c7158577",
]);

watch(
  () => props.value,
  (val) => {
    pcolor.value = val;
  },
  { immediate: true },
);

watch(pcolor, (val) => {
  emit("cb", val);
});

onMounted(() => {
  if (props.value) {
    pcolor.value = props.value;
  }
});
</script>

<style scoped></style>
