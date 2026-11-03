<script setup lang="ts">
import type { ScreenItem } from "@/core/model/types";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

defineProps<{
  selected: ScreenItem[];
  marquee: Rect | null;
}>();
</script>

<template>
  <div class="selection-overlay">
    <div
      v-for="item in selected"
      :key="item.id"
      class="selection-overlay__outline"
      :style="{
        left: `${item.frame.x - 1}px`,
        top: `${item.frame.y - 1}px`,
        width: `${item.frame.w + 2}px`,
        height: `${item.frame.h + 2}px`,
        transform: `rotate(${item.frame.rotate}deg)`,
        transformOrigin: 'center center',
      }"
    />
    <div
      v-if="marquee"
      class="selection-overlay__marquee"
      :style="{
        left: `${marquee.x}px`,
        top: `${marquee.y}px`,
        width: `${marquee.w}px`,
        height: `${marquee.h}px`,
      }"
    />
  </div>
</template>

<style scoped>
.selection-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.selection-overlay__outline {
  position: absolute;
  border: 1.5px solid var(--cf-primary, #4f6ef7);
}
.selection-overlay__marquee {
  position: absolute;
  border: 1px dashed var(--cf-primary, #4f6ef7);
  background: rgba(79, 110, 247, 0.12);
}
</style>
