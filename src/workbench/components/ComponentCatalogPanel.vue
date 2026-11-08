<script setup lang="ts">
import { computed, ref } from "vue";
import { filterComponentCatalog, getComponentCatalog } from "@/core/components/catalog";
import type { ComponentCatalogEntry, ComponentCatalogGroup } from "@/core/components/types";
import { catalogDragPayload } from "../catalogActions";

const props = withDefaults(defineProps<{ entries?: readonly ComponentCatalogEntry[] }>(), {
  entries: () => getComponentCatalog(),
});
const emit = defineEmits<{ (event: "select", entry: ComponentCatalogEntry): void }>();

const query = ref("");
const activeGroup = ref<ComponentCatalogGroup | "all">("all");

const GROUP_OPTIONS: readonly { value: ComponentCatalogGroup | "all"; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "chart", label: "图表" },
  { value: "data", label: "数据" },
  { value: "decoration", label: "装饰" },
  { value: "basic", label: "基础" },
];
const GROUP_LABELS: Readonly<Record<ComponentCatalogGroup, string>> = {
  chart: "图表",
  data: "数据",
  decoration: "装饰",
  basic: "基础",
};

type PreviewKind = "line" | "bars" | "pie" | "table" | "kpi" | "progress" | "title" | "frame" | "text" | "image" | "shape" | "generic";
const PREVIEW_VARIANTS: Readonly<Record<string, PreviewKind>> = {
  "chart-line": "line",
  "chart-bar": "bars",
  "chart-pie": "pie",
  "chart-map": "generic",
  "chart-scatter": "line",
  "chart-radar": "generic",
  "data-table": "table",
  kpi: "kpi",
  "progress-list": "progress",
  "section-title": "title",
  title: "title",
  "corner-frame": "frame",
  frame: "frame",
  "basic-text": "text",
  "basic-image": "image",
  "basic-shape": "shape",
  generic: "generic",
};
const PREVIEW_BARS: Readonly<Record<PreviewKind, readonly number[]>> = {
  line: [42, 70, 51, 88, 62],
  bars: [55, 82, 48, 70, 95],
  pie: [72, 44, 90, 58, 78],
  table: [70, 70, 70, 70, 70],
  kpi: [46, 46, 46, 46, 46],
  progress: [36, 64, 84, 52, 76],
  title: [48, 48, 48, 48, 48],
  frame: [70, 70, 70, 70, 70],
  text: [56, 56, 56, 56, 56],
  image: [66, 66, 66, 66, 66],
  shape: [65, 65, 65, 65, 65],
  generic: [38, 62, 48, 80, 56],
};

const filteredEntries = computed(() => filterComponentCatalog(props.entries, query.value, activeGroup.value));
const visibleGroups = computed(() => {
  const groups = activeGroup.value === "all"
    ? (GROUP_OPTIONS.filter((option) => option.value !== "all").map((option) => option.value) as ComponentCatalogGroup[])
    : [activeGroup.value];
  return groups.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    entries: filteredEntries.value.filter((entry) => entry.group === group),
  })).filter((section) => section.entries.length > 0);
});

function previewKind(entry: ComponentCatalogEntry): PreviewKind {
  return PREVIEW_VARIANTS[entry.previewKey] ?? "generic";
}

function onDragStart(event: DragEvent, entry: ComponentCatalogEntry): void {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) return;
  const payload = catalogDragPayload(entry);
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(payload.mime, payload.data);
}
</script>

<template>
  <div class="component-catalog">
    <label class="catalog-search">
      <span class="catalog-sr-only">搜索组件</span>
      <input v-model="query" type="search" aria-label="搜索组件" placeholder="搜索名称、用途或标签" />
    </label>

    <div class="catalog-categories" role="group" aria-label="组件分类">
      <button
        v-for="option in GROUP_OPTIONS"
        :key="option.value"
        type="button"
        :aria-pressed="activeGroup === option.value"
        @click="activeGroup = option.value"
      >{{ option.label }}</button>
    </div>

    <p v-if="filteredEntries.length === 0" class="catalog-empty" role="status">没有找到匹配的组件</p>
    <div v-else class="catalog-sections">
      <section v-for="section in visibleGroups" :key="section.group" class="catalog-section">
        <h3>{{ section.label }}</h3>
        <div class="catalog-grid">
          <button
            v-for="entry in section.entries"
            :key="entry.key"
            class="catalog-card"
            type="button"
            draggable="true"
            :aria-label="`添加 ${entry.name}`"
            @click="emit('select', entry)"
            @dragstart="onDragStart($event, entry)"
          >
            <span class="catalog-card__preview" :class="`catalog-card__preview--${previewKind(entry)}`" aria-hidden="true">
              <span v-if="previewKind(entry) === 'table'" class="preview-table">
                <i v-for="row in 3" :key="row"><b /><b /><b /></i>
              </span>
              <span v-else-if="previewKind(entry) === 'kpi'" class="preview-kpi"><b>128</b><i>指标</i></span>
              <span v-else-if="previewKind(entry) === 'title'" class="preview-title"><b /><i /></span>
              <span v-else-if="previewKind(entry) === 'frame'" class="preview-frame"><i /><b /></span>
              <span v-else-if="previewKind(entry) === 'text'" class="preview-text"><i /><i /><i /></span>
              <span v-else-if="previewKind(entry) === 'image'" class="preview-image"><i /></span>
              <span v-else-if="previewKind(entry) === 'shape'" class="preview-shape"><i /><b /></span>
              <span v-else class="preview-bars"><i v-for="(height, index) in PREVIEW_BARS[previewKind(entry)]" :key="index" :style="{ height: `${height}%` }" /></span>
            </span>
            <span class="catalog-card__copy">
              <strong>{{ entry.name }}</strong>
              <small>{{ entry.description }}</small>
            </span>
            <span class="catalog-card__add" aria-hidden="true">＋</span>
          </button>
        </div>
      </section>
    </div>
    <p class="catalog-hint">单击添加，或拖动卡片到画布指定位置。</p>
  </div>
</template>

<style scoped>
.component-catalog { display: flex; min-width: 0; flex-direction: column; gap: 10px; padding: 10px; color: var(--cf-text); }
.catalog-search input { box-sizing: border-box; width: 100%; min-height: 34px; padding: 6px 9px; border: 1px solid var(--cf-border); border-radius: 6px; background: var(--cf-bg); color: var(--cf-text); font: inherit; font-size: 11px; }
.catalog-search input:focus { outline: 2px solid color-mix(in srgb, var(--cf-primary) 45%, transparent); outline-offset: 1px; }
.catalog-categories { display: flex; flex-wrap: wrap; gap: 5px; }
.catalog-categories button { padding: 5px 8px; border: 1px solid var(--cf-border); border-radius: 999px; background: transparent; color: var(--cf-text-2); cursor: pointer; font: inherit; font-size: 10px; }
.catalog-categories button[aria-pressed="true"] { border-color: var(--cf-primary); background: color-mix(in srgb, var(--cf-primary) 13%, transparent); color: var(--cf-primary); }
.catalog-sections { display: flex; min-width: 0; flex-direction: column; gap: 13px; }
.catalog-section h3 { margin: 0 0 6px; color: var(--cf-text-2); font-size: 10px; font-weight: 700; letter-spacing: .04em; }
.catalog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.catalog-card { display: flex; min-width: 0; flex-direction: column; gap: 6px; padding: 7px; border: 1px solid var(--cf-border); border-radius: 7px; background: var(--cf-bg); color: inherit; cursor: grab; font: inherit; text-align: left; }
.catalog-card:hover, .catalog-card:focus-visible { border-color: var(--cf-primary); outline: none; }
.catalog-card:active { cursor: grabbing; }
.catalog-card__preview { display: grid; height: 54px; place-items: center; overflow: hidden; border: 1px solid color-mix(in srgb, var(--cf-border) 80%, transparent); border-radius: 4px; background: color-mix(in srgb, var(--cf-panel) 78%, transparent); }
.preview-bars { display: flex; width: 68%; height: 70%; align-items: flex-end; justify-content: center; gap: 5px; }
.preview-bars i { width: 8px; max-height: 100%; border-radius: 2px 2px 0 0; background: var(--cf-primary); opacity: .75; }
.catalog-card__preview--line .preview-bars i { border-radius: 999px; }
.catalog-card__preview--pie .preview-bars i:nth-child(odd) { opacity: .42; }
.preview-table { display: flex; width: 76%; flex-direction: column; gap: 4px; }
.preview-table i { display: flex; height: 5px; gap: 4px; }
.preview-table b { flex: 1; border-radius: 2px; background: color-mix(in srgb, var(--cf-primary) 43%, var(--cf-border)); }
.preview-table i:first-child b { background: var(--cf-primary); opacity: .68; }
.preview-kpi { display: flex; flex-direction: column; align-items: center; color: var(--cf-primary); }
.preview-kpi b { font-size: 15px; line-height: 1.1; }
.preview-kpi i { margin-top: 3px; color: var(--cf-text-2); font-size: 7px; font-style: normal; }
.preview-title { display: flex; width: 72%; flex-direction: column; gap: 5px; }
.preview-title b { height: 5px; width: 58%; background: var(--cf-primary); }
.preview-title i { height: 2px; width: 100%; background: var(--cf-border); }
.preview-frame { display: flex; width: 45%; height: 50%; align-items: flex-end; justify-content: flex-start; border: 1px solid var(--cf-primary); border-right: 0; border-bottom: 0; }
.preview-frame i { width: 7px; height: 7px; border: 1px solid var(--cf-primary); border-top: 0; border-left: 0; }
.preview-frame b { align-self: flex-start; width: 7px; height: 7px; border: 1px solid var(--cf-primary); border-right: 0; border-bottom: 0; }
.preview-text { display: flex; width: 70%; flex-direction: column; gap: 5px; }
.preview-text i { height: 3px; border-radius: 4px; background: var(--cf-text-2); opacity: .7; }
.preview-text i:last-child { width: 60%; }
.preview-image { display: grid; width: 36px; height: 30px; place-items: center; border: 1px solid var(--cf-primary); border-radius: 3px; }
.preview-image i { width: 20px; height: 12px; border-radius: 50% 50% 2px 2px; background: color-mix(in srgb, var(--cf-primary) 35%, transparent); }
.preview-shape { display: flex; align-items: center; gap: 9px; }
.preview-shape i, .preview-shape b { display: block; width: 18px; height: 18px; border: 2px solid var(--cf-primary); }
.preview-shape i { border-radius: 50%; }
.preview-shape b { border-radius: 3px; background: color-mix(in srgb, var(--cf-primary) 20%, transparent); }
.catalog-card__copy { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.catalog-card__copy strong { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.catalog-card__copy small { min-height: 25px; color: var(--cf-text-2); font-size: 9px; line-height: 1.4; }
.catalog-card__add { align-self: flex-end; color: var(--cf-primary); font-size: 13px; line-height: 1; }
.catalog-empty, .catalog-hint { margin: 2px 0; color: var(--cf-text-2); font-size: 10px; line-height: 1.5; }
.catalog-empty { padding: 14px 7px; text-align: center; }
.catalog-hint { text-align: center; }
.catalog-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
</style>
