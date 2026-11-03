<script setup lang="ts">
import { ref } from "vue";
import ElementsPanel from "./ElementsPanel.vue";
import AssetsPanel from "./AssetsPanel.vue";
import LayersPanel from "./LayersPanel.vue";

const tab = ref<"elements" | "assets" | "layers">("elements");

const TABS = [
  { key: "elements", label: "元素" },
  { key: "assets", label: "资产" },
  { key: "layers", label: "图层" },
] as const;
</script>

<template>
  <div class="left-panel">
    <div class="left-panel__tabs">
      <button
        v-for="t in TABS"
        :key="t.key"
        class="left-panel__tab"
        :class="{ 'left-panel__tab--active': tab === t.key }"
        @click="tab = t.key"
      >
        {{ t.label }}
      </button>
    </div>
    <div class="left-panel__body">
      <ElementsPanel v-if="tab === 'elements'" />
      <AssetsPanel v-else-if="tab === 'assets'" />
      <LayersPanel v-else />
    </div>
  </div>
</template>

<style scoped>
.left-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.left-panel__tabs {
  display: flex;
  border-bottom: 1px solid var(--cf-border);
}
.left-panel__tab {
  flex: 1;
  padding: 10px 0;
  border: none;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  font-size: 13px;
  border-bottom: 2px solid transparent;
}
.left-panel__tab--active {
  color: var(--cf-primary);
  border-bottom-color: var(--cf-primary);
  font-weight: 600;
}
.left-panel__body {
  flex: 1;
  overflow-y: auto;
}
</style>
