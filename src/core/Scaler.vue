<template>
  <div ref="outerEl" class="scaler-outer">
    <div class="scaler-inner" :style="innerStyle">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref } from "vue";
import { SCREEN_STAGE_KEY, computeScale, toCanvasPoint } from "@/core/scaler";
import type { ScreenStageContext } from "@/core/scaler";
import { SCREEN_H, SCREEN_W } from "@/core/types";

const props = withDefaults(defineProps<{ width?: number; height?: number }>(), {
  width: SCREEN_W,
  height: SCREEN_H,
});

const outerEl = ref<HTMLElement | null>(null);
const scale = ref(1);
const originX = ref(0);
const originY = ref(0);
let observer: ResizeObserver | null = null;

/** 画布固定 px 尺寸；transform 平移量即舞台原点（缩放后画布左上角的屏幕坐标） */
const innerStyle = computed(() => ({
  width: props.width + "px",
  height: props.height + "px",
  transform:
    "translate(" + originX.value + "px, " + originY.value + "px) scale(" + scale.value + ")",
}));

function measure(): void {
  const el = outerEl.value;
  if (!el) return;
  const s = computeScale(el.clientWidth, el.clientHeight, props.width, props.height);
  scale.value = s;
  originX.value = el.clientWidth / 2 - (props.width * s) / 2;
  originY.value = el.clientHeight / 2 - (props.height * s) / 2;
}

onMounted(() => {
  measure();
  observer = new ResizeObserver(() => measure());
  if (outerEl.value) observer.observe(outerEl.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

function toCanvas(event: PointerEvent): { x: number; y: number } {
  return toCanvasPoint(event.clientX, event.clientY, scale.value, originX.value, originY.value);
}

const context: ScreenStageContext = { scale, originX, originY, toCanvas };

provide(SCREEN_STAGE_KEY, context);
</script>

<style scoped>
.scaler-outer {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.scaler-inner {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
}
</style>
