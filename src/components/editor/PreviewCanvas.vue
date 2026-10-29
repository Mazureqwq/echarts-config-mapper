<template>
  <section class="preview">
    <header class="preview-bar">
      <div class="left">
        <span class="chip">{{ CHART_META[store.type].labelEn }}</span>
        <span class="name">{{ CHART_META[store.type].label }}</span>
        <span class="meta">{{ store.size.w }} × {{ store.size.h }}</span>
      </div>
      <div class="right">
        <span class="live-dot" />
        <span class="live-text">实时预览</span>
      </div>
    </header>

    <div class="canvas-wrap" :class="`bg-${store.backdrop}`">
      <div class="canvas" :style="canvasStyle">
        <ChartRenderer :chart="store.current" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ChartRenderer from "@/components/chart/ChartRenderer.vue";
import { CHART_META } from "@/config/editor";
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();

const canvasStyle = computed(() => ({
  width: `${store.size.w}px`,
  height: `${store.size.h}px`,
}));
</script>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  background: var(--cf-stage);
}

.preview-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  padding: 0 14px;
  border-bottom: 1px solid var(--cf-border);
  background: var(--cf-bg-1);
  flex: 0 0 auto;
}

.preview-bar .left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chip {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--cf-accent-soft);
  color: #b9bbff;
  font-size: 10px;
  font-family: var(--cf-font-mono);
}

.name {
  font-size: 12.5px;
  color: var(--cf-text);
}

.meta {
  font-family: var(--cf-font-mono);
  font-size: 10.5px;
  color: var(--cf-text-faint);
}

.right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cf-success);
  box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.16);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

.live-text {
  font-size: 10.5px;
  color: var(--cf-text-faint);
}

.canvas-wrap {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  overflow: auto;
}

.canvas-wrap.bg-dark {
  background: #0b1017;
}

.canvas-wrap.bg-light {
  background: #eef1f6;
}

.canvas-wrap.bg-grid {
  background-color: #0b1017;
  background-image: linear-gradient(rgba(99, 102, 241, 0.09) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99, 102, 241, 0.09) 1px, transparent 1px);
  background-size: 32px 32px;
}

.canvas {
  flex: 0 0 auto;
  border-radius: var(--cf-radius);
  border: 1px solid var(--cf-border);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  background: transparent;
}

/* 浅色预览时，图表容器底色跟着变白，避免深色标题看不见 */
.canvas-wrap.bg-light .canvas {
  background: #ffffff;
  border-color: #dbe1ea;
  box-shadow: 0 18px 40px rgba(23, 32, 48, 0.14);
}

.canvas-wrap.bg-grid .canvas {
  background: #0e1420;
}
</style>
