<template>
  <aside class="inspector">
    <header class="insp-head">
      <div class="insp-title">
        <span class="dot" />
        <span class="title-text">{{ meta.label }}</span>
        <span class="chip">{{ meta.labelEn }}</span>
      </div>
      <div class="insp-meta">
        <span class="meta-text">{{ chart.w }} × {{ chart.h }}</span>
        <span class="meta-hint">{{ meta.hint }}</span>
      </div>
    </header>

    <nav class="tabs">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="tab"
        :class="{ active: tab.key === activeTab }"
        @click="activeTab = tab.key"
      >
        <Icon :name="tab.icon" :size="13" />
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <div class="insp-body">
      <AttrPanel v-if="activeTab === 'attrs'" :chart="chart" />
      <DataPanel v-else-if="activeTab === 'data'" :chart="chart" />
      <JsonPanel v-else :chart="chart" />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AttrPanel from "@/components/editor/panels/AttrPanel.vue";
import DataPanel from "@/components/editor/panels/DataPanel.vue";
import JsonPanel from "@/components/editor/panels/JsonPanel.vue";
import Icon from "@/components/ui/Icon.vue";
import { CHART_META } from "@/config/editor";
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();
type TabKey = "attrs" | "data" | "json";

const TABS = [
  { key: "attrs" as const, label: "属性", icon: "sliders" },
  { key: "data" as const, label: "数据", icon: "table" },
  { key: "json" as const, label: "JSON", icon: "code" },
];

const readHashTab = (): TabKey => {
  const key = window.location.hash.replace("#", "").replace("tab=", "") as TabKey;
  return key === "data" || key === "json" ? key : "attrs";
};

const activeTab = ref<TabKey>(readHashTab());
const chart = computed(() => store.current);
const meta = computed(() => CHART_META[store.type]);

/** 支持 #tab=data|json 深链接 */
function syncTabFromHash(): void {
  activeTab.value = readHashTab();
}

onMounted(() => window.addEventListener("hashchange", syncTabFromHash));
onBeforeUnmount(() => window.removeEventListener("hashchange", syncTabFromHash));
</script>

<style scoped>
.inspector {
  display: flex;
  flex-direction: column;
  width: var(--cf-right-w);
  flex: 0 0 auto;
  background: var(--cf-bg-1);
  border-left: 1px solid var(--cf-border);
  min-height: 0;
}

.insp-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--cf-border-soft);
}

.insp-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cf-accent);
  box-shadow: 0 0 0 3px var(--cf-accent-soft);
  flex: 0 0 auto;
}

.title-text {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--cf-text);
}

.chip {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--cf-bg-3);
  color: var(--cf-text-muted);
  font-family: var(--cf-font-mono);
  font-size: 10px;
}

.insp-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 15px;
}

.meta-text {
  font-family: var(--cf-font-mono);
  font-size: 10.5px;
  color: var(--cf-text-muted);
}

.meta-hint {
  font-size: 10.5px;
  color: var(--cf-text-faint);
}

.tabs {
  display: flex;
  gap: 2px;
  padding: 8px 12px 0;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--cf-text-faint);
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
  transition: all var(--cf-fast);
}

.tab:hover {
  color: var(--cf-text-dim);
}

.tab.active {
  color: var(--cf-text);
  border-bottom-color: var(--cf-accent);
}

.insp-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 auto;
  padding: 10px 14px 14px;
  overflow: hidden;
}
</style>
