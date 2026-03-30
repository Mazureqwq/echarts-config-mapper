<template>
  <div class="item-wrap" v-if="options">
    <div ref="el" class="drag-item" @click.stop="activate">

      <!-- 内容 -->
      <Container :options="options" @set-container="setContainer" :index="idx" :key="idx" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, CSSProperties } from "vue";
import Container from "./container.vue";
import emitter from "@/utils/eventBus";

defineOptions({ inheritAttrs: false });

// ===== 类型 =====
interface ChartItemOptions {
  type: string;
  width?: number;
  height?: number;
  x: number;
  y: number;
  echartOption?: any;
  isActive?: boolean;
}

// ===== props =====
const props = defineProps<{
  options: ChartItemOptions;
  idx: number;
}>();

const emit = defineEmits<{
  (e: "setOption", data: ChartItemOptions, index: number): void;
}>();

// ===== 本地状态（沿用你原来的设计）=====
const options = ref<ChartItemOptions>({
  type: props.options.type,
  width: props.options.width || 300,
  height: props.options.height || 300,
  x: 40,
  y: 80,
  echartOption: undefined,
  isActive: false
});

// ===== 初始化同步 =====
// onMounted(() => {
//   Object.assign(options.value, props.options);
// });
watch(() => props.options, (newVal) => {
  Object.assign(options.value, newVal);
}, { immediate: true, deep: true });


// function onResizeStart(e: MouseEvent) {
//   e.stopPropagation();

//   const startX = e.clientX;
//   const startY = e.clientY;

//   const startW = options.value.width || 300;
//   const startH = options.value.height || 300;

//   const move = (e: MouseEvent) => {
//     options.value.width = Math.max(200, startW + (e.clientX - startX));
//     options.value.height = Math.max(200, startH + (e.clientY - startY));
//   };

//   const up = () => {
//     emitChange();
//     document.removeEventListener("mousemove", move);
//     document.removeEventListener("mouseup", up);
//   };

//   document.addEventListener("mousemove", move);
//   document.addEventListener("mouseup", up);
// }

// ===== 统一触发更新（替代 resize 回调）=====
function emitChange() {
  emit("setOption", { ...options.value }, props.idx);
}

// // ===== Container 回调 =====
function setContainer({ width, height }: { width: number; height: number }) {
  options.value.width = width;
  options.value.height = height;
  emitChange();
}

// ===== 删除 =====
function remove() {
  emitter.emit("delItem", { idx: props.idx });
}

// ===== 激活 =====
function activate() {
  options.value.isActive = true;
}

</script>

<style scoped>
.item-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}

.drag-item {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
}

.action-btn {
  position: absolute;
  right: 0;
  z-index: 5;
  cursor: pointer;
}

span.close {
  display: inline-block;
  width: 20px;
  height: 20px;
  background: red;
}

.resize-handle {
  width: 12px;
  height: 12px;
  background: #409eff;
  position: absolute;
  right: 0;
  bottom: 0;
  cursor: se-resize;
}
</style>