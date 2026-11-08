<script setup lang="ts">
import { computed, ref } from "vue";
import ElementsPanel from "./ElementsPanel.vue";
import LayersPanel from "./LayersPanel.vue";
import DatasetPanel from "./panels/DatasetPanel.vue";
import AssetLibraryPanel from "./panels/AssetLibraryPanel.vue";
import DesignLibraryPanel from "./panels/DesignLibraryPanel.vue";
import Icon from "@/shared/ui/Icon.vue";

const emit = defineEmits<{ (e: "collapse"): void }>();
const tab = ref<"charts" | "datasets" | "assets" | "materials" | "design" | "layers">("charts");

const TABS = [
  { key: "charts", label: "组件", icon: "chart" },
  { key: "datasets", label: "数据集", icon: "package" },
  { key: "assets", label: "图表库", icon: "package" },
  { key: "materials", label: "素材", icon: "image" },
  { key: "design", label: "设计库", icon: "layers" },
  { key: "layers", label: "图层", icon: "layers" },
] as const;

const activeLabel = computed(() => TABS.find((entry) => entry.key === tab.value)?.label ?? "组件");

function onRailKeydown(event: KeyboardEvent, current: (typeof TABS)[number]["key"]): void {
  const currentIndex = TABS.findIndex((entry) => entry.key === current);
  let nextIndex = currentIndex;
  if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % TABS.length;
  else if (event.key === "ArrowUp") nextIndex = (currentIndex + TABS.length - 1) % TABS.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = TABS.length - 1;
  else return;
  event.preventDefault();
  const next = TABS[nextIndex];
  tab.value = next.key;
  requestAnimationFrame(() => document.getElementById(`left-panel-tab-${next.key}`)?.focus());
}
</script>

<template>
  <div class="left-panel">
    <nav class="left-panel__rail" role="tablist" aria-label="工作区资源" aria-orientation="vertical">
      <button
        v-for="entry in TABS"
        :id="`left-panel-tab-${entry.key}`"
        :key="entry.key"
        class="left-panel__tab"
        :class="{ 'left-panel__tab--active': tab === entry.key }"
        type="button"
        role="tab"
        :aria-label="entry.label"
        :title="entry.label"
        :aria-selected="tab === entry.key"
        aria-controls="left-panel-panel"
        :tabindex="tab === entry.key ? 0 : -1"
        @keydown="onRailKeydown($event, entry.key)"
        @click="tab = entry.key"
      >
        <Icon :name="entry.icon" :size="18" />
        <span>{{ entry.label }}</span>
      </button>
    </nav>

    <section
      class="left-panel__content"
      id="left-panel-panel"
      role="tabpanel"
      tabindex="0"
      :aria-labelledby="`left-panel-tab-${tab}`"
      :aria-label="activeLabel"
    >
      <header class="left-panel__head">
        <h2>{{ activeLabel }}</h2>
        <button
          class="left-panel__collapse"
          type="button"
          aria-label="收起左侧资源面板"
          title="收起面板"
          @click="emit('collapse')"
        >
          <Icon name="close" :size="16" />
        </button>
      </header>
      <div class="left-panel__body">
        <ElementsPanel v-if="tab === 'charts'" section="charts" />
        <DatasetPanel v-else-if="tab === 'datasets'" />
        <AssetLibraryPanel v-else-if="tab === 'assets'" />
        <ElementsPanel v-else-if="tab === 'materials'" section="materials" />
        <DesignLibraryPanel v-else-if="tab === 'design'" />
        <LayersPanel v-else />
      </div>
    </section>
  </div>
</template>

<style scoped>
.left-panel {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  color: var(--cf-text);
}
.left-panel__rail {
  display: flex;
  flex: 0 0 48px;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 8px 4px;
  border-right: 1px solid var(--cf-border);
  background: color-mix(in srgb, var(--cf-panel) 86%, #000 14%);
}
.left-panel__tab {
  display: flex;
  min-height: 56px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 2px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  line-height: 1.1;
  white-space: nowrap;
}
.left-panel__tab:hover {
  color: var(--cf-text);
  background: color-mix(in srgb, var(--cf-primary) 9%, transparent);
}
.left-panel__tab--active {
  border-color: color-mix(in srgb, var(--cf-primary) 28%, transparent);
  background: color-mix(in srgb, var(--cf-primary) 15%, transparent);
  color: var(--cf-primary);
}
.left-panel__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.left-panel__head {
  display: flex;
  flex: 0 0 44px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px 0 14px;
  border-bottom: 1px solid var(--cf-border);
}
.left-panel__head h2 {
  overflow: hidden;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.left-panel__collapse {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
}
.left-panel__collapse:hover {
  background: color-mix(in srgb, var(--cf-primary) 10%, transparent);
  color: var(--cf-primary);
}
.left-panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
@media (max-width: 900px) {
  .left-panel__rail { flex-basis: 44px; }
  .left-panel__tab { min-height: 52px; font-size: 9px; }
}
</style>
