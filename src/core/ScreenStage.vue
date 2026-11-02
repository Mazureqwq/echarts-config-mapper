<template>
  <div class="screen-stage" :style="{ background: schema.canvas.background }">
    <Scaler :width="schema.canvas.width" :height="schema.canvas.height">
      <div
        v-for="item in renderItems"
        :key="item.id"
        class="stage-item"
        :style="itemStyle(item)"
      >
        <ScreenItemView :item="item" />
      </div>
    </Scaler>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ScreenItem, ScreenSchema } from "@/core/types";
import Scaler from "@/core/Scaler.vue";
import ScreenItemView from "@/core/ScreenItemView.vue";

const props = defineProps<{ schema: ScreenSchema }>();

/** 运行态渲染序列：过滤隐藏项后按 zIndex 升序（运行态无交互，locked 无需处理） */
const renderItems = computed<ScreenItem[]>(() =>
  props.schema.items
    .filter((item) => item.visible !== false)
    .slice()
    .sort((a, b) => a.zIndex - b.zIndex),
);

function itemStyle(item: ScreenItem): Record<string, string> {
  return {
    left: item.rect.x + "px",
    top: item.rect.y + "px",
    width: item.rect.w + "px",
    height: item.rect.h + "px",
    zIndex: String(item.zIndex),
  };
}
</script>

<style scoped>
.screen-stage {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.stage-item {
  position: absolute;
}
</style>
