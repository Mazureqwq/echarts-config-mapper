<script setup lang="ts">
import { computed, ref } from "vue";
import { filterComponentCatalog, getComponentCatalog } from "@/core/components/catalog";
import type { ComponentCatalogEntry, ComponentCatalogGroup } from "@/core/components/types";
import { catalogDragPayload } from "../catalogActions";
import { setActiveCanvasDragPayload } from "@/shared/dnd";

const props = withDefaults(defineProps<{ entries?: readonly ComponentCatalogEntry[] }>(), {
  entries: () => getComponentCatalog(),
});
const emit = defineEmits<{ (event: "select", entry: ComponentCatalogEntry): void }>();

const query = ref("");
const activeGroup = ref<ComponentCatalogGroup | "all">("all");

const GROUP_OPTIONS: readonly { value: ComponentCatalogGroup | "all"; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "chart", label: "图表" },
  { value: "map", label: "地图" },
  { value: "data", label: "数据" },
  { value: "decoration", label: "装饰" },
  { value: "basic", label: "基础" },
];
const GROUP_LABELS: Readonly<Record<ComponentCatalogGroup, string>> = {
  chart: "图表",
  map: "地图",
  data: "数据",
  decoration: "装饰",
  basic: "基础",
};

type PreviewKind = "line" | "bars" | "pie" | "map" | "map-25d" | "geo-scatter" | "geo-heatmap" | "geo-flow" | "radar" | "scatter" | "table" | "kpi" | "progress" | "title" | "frame" | "text" | "image" | "shape" | "generic";
const PREVIEW_VARIANTS: Readonly<Record<string, PreviewKind>> = {
  "chart-line": "line",
  "chart-bar": "bars",
  "chart-pie": "pie",
  "chart-map": "map",
  "map-scene-flat": "map",
  "map-scene-tilted": "map-25d",
  "chart-geoScatter": "geo-scatter",
  "chart-geoHeatmap": "geo-heatmap",
  "chart-geoFlow": "geo-flow",
  "chart-scatter": "scatter",
  "chart-radar": "radar",
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
  map: [55, 72, 48, 85, 61],
  "map-25d": [55, 72, 48, 85, 61],
  "geo-scatter": [60, 72, 48, 85, 61],
  "geo-heatmap": [55, 82, 48, 70, 95],
  "geo-flow": [36, 64, 84, 52, 76],
  radar: [74, 58, 88, 50, 68],
  scatter: [36, 82, 54, 72, 46],
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

function countForGroup(group: ComponentCatalogGroup | "all"): number {
  return group === "all" ? props.entries.length : props.entries.filter((entry) => entry.group === group).length;
}

function clearFilters(): void {
  query.value = "";
  activeGroup.value = "all";
}
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
  setActiveCanvasDragPayload(payload.mime, payload.data);
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
      >
        <span>{{ option.label }}</span>
        <span class="catalog-category__count" aria-hidden="true">{{ countForGroup(option.value) }}</span>
      </button>
    </div>

    <p v-if="filteredEntries.length > 0" class="catalog-result-count" aria-live="polite">{{ filteredEntries.length }} 项可添加</p>
    <div v-if="filteredEntries.length === 0" class="catalog-empty" role="status">
      <span>没有找到匹配的组件</span>
      <button v-if="query || activeGroup !== 'all'" type="button" @click="clearFilters">清除筛选</button>
    </div>
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
            <span class="catalog-card__preview" :class="['catalog-card__preview--' + previewKind(entry), { 'catalog-card__preview--tilted': entry.previewKey === 'map-scene-tilted' }]" aria-hidden="true">
              <svg v-if="previewKind(entry) === 'line'" class="preview-chart-svg" viewBox="0 0 100 64" aria-hidden="true">
                <path class="preview-chart-grid" d="M12 14H94 M12 31H94 M12 48H94" />
                <path class="preview-chart-axis" d="M12 8V54H95" />
                <path class="preview-line-area" d="M14 43 L32 32 L49 37 L68 17 L90 24 L90 53 L14 53 Z" />
                <polyline class="preview-line-main" points="14,43 32,32 49,37 68,17 90,24" />
                <polyline class="preview-line-secondary" points="14,35 32,40 49,27 68,33 90,15" />
                <circle class="preview-line-dot" cx="14" cy="43" r="2.2" />
                <circle class="preview-line-dot" cx="32" cy="32" r="2.2" />
                <circle class="preview-line-dot" cx="49" cy="37" r="2.2" />
                <circle class="preview-line-dot" cx="68" cy="17" r="2.2" />
                <circle class="preview-line-dot" cx="90" cy="24" r="2.2" />
              </svg>
              <svg v-else-if="previewKind(entry) === 'bars'" class="preview-chart-svg" viewBox="0 0 100 64" aria-hidden="true">
                <path class="preview-chart-grid" d="M12 14H94 M12 31H94 M12 48H94" />
                <path class="preview-chart-axis" d="M12 8V54H95" />
                <rect class="preview-bar-a" x="20" y="32" width="9" height="21" rx="1.5" />
                <rect class="preview-bar-b" x="30" y="23" width="9" height="30" rx="1.5" />
                <rect class="preview-bar-a" x="46" y="20" width="9" height="33" rx="1.5" />
                <rect class="preview-bar-b" x="56" y="29" width="9" height="24" rx="1.5" />
                <rect class="preview-bar-a" x="72" y="13" width="9" height="40" rx="1.5" />
                <rect class="preview-bar-b" x="82" y="25" width="9" height="28" rx="1.5" />
              </svg>
              <span v-else-if="previewKind(entry) === 'pie'" class="preview-pie" aria-hidden="true" />
              <svg v-else-if="previewKind(entry) === 'map-25d'" class="preview-chart-svg preview-map preview-map--25d" viewBox="0 0 120 80" aria-hidden="true">
                <path class="preview-map-depth preview-map-depth--4" transform="translate(4 10)" d="M13 27 L22 21 L31 24 L37 16 L47 19 L54 12 L63 18 L72 16 L77 23 L88 21 L94 28 L105 31 L100 39 L106 45 L98 51 L93 61 L83 59 L77 66 L67 61 L58 67 L49 61 L40 64 L34 57 L25 57 L22 49 L15 46 L19 38 L12 35 Z" />
                <path class="preview-map-depth preview-map-depth--3" transform="translate(3 7)" d="M13 27 L22 21 L31 24 L37 16 L47 19 L54 12 L63 18 L72 16 L77 23 L88 21 L94 28 L105 31 L100 39 L106 45 L98 51 L93 61 L83 59 L77 66 L67 61 L58 67 L49 61 L40 64 L34 57 L25 57 L22 49 L15 46 L19 38 L12 35 Z" />
                <path class="preview-map-depth preview-map-depth--2" transform="translate(2 4)" d="M13 27 L22 21 L31 24 L37 16 L47 19 L54 12 L63 18 L72 16 L77 23 L88 21 L94 28 L105 31 L100 39 L106 45 L98 51 L93 61 L83 59 L77 66 L67 61 L58 67 L49 61 L40 64 L34 57 L25 57 L22 49 L15 46 L19 38 L12 35 Z" />
                <path class="preview-map-land" d="M13 27 L22 21 L31 24 L37 16 L47 19 L54 12 L63 18 L72 16 L77 23 L88 21 L94 28 L105 31 L100 39 L106 45 L98 51 L93 61 L83 59 L77 66 L67 61 L58 67 L49 61 L40 64 L34 57 L25 57 L22 49 L15 46 L19 38 L12 35 Z" />
                <path class="preview-map-boundary" d="M30 25 L35 34 L29 43 L37 56 M46 20 L48 31 L41 40 L49 49 L43 61 M62 19 L59 30 L67 38 L60 48 L68 60 M78 23 L73 32 L82 40 L76 51 L84 59 M20 38 L35 36 L49 40 L63 37 L80 40 L101 39 M26 49 L42 48 L58 51 L76 48 L96 51" />
                <path class="preview-map-island" d="M94 64 l2 -2 2 2 -2 2z M87 69 l1.5 -1.5 1.5 1.5 -1.5 1.5z" />
                <ellipse class="preview-map-island" cx="37" cy="70" rx="3" ry="1.5" />
              </svg>
              <svg v-else-if="previewKind(entry) === 'map'" class="preview-chart-svg preview-map" viewBox="0 0 120 80" aria-hidden="true">
                <path class="preview-map-land" d="M13 27 L22 21 L31 24 L37 16 L47 19 L54 12 L63 18 L72 16 L77 23 L88 21 L94 28 L105 31 L100 39 L106 45 L98 51 L93 61 L83 59 L77 66 L67 61 L58 67 L49 61 L40 64 L34 57 L25 57 L22 49 L15 46 L19 38 L12 35 Z" />
                <path class="preview-map-boundary" d="M30 25 L35 34 L29 43 L37 56 M46 20 L48 31 L41 40 L49 49 L43 61 M62 19 L59 30 L67 38 L60 48 L68 60 M78 23 L73 32 L82 40 L76 51 L84 59 M20 38 L35 36 L49 40 L63 37 L80 40 L101 39 M26 49 L42 48 L58 51 L76 48 L96 51" />
                <path class="preview-map-island" d="M94 64 l2 -2 2 2 -2 2z M87 69 l1.5 -1.5 1.5 1.5 -1.5 1.5z" />
                <ellipse class="preview-map-island" cx="37" cy="70" rx="3" ry="1.5" />
              </svg>
              <svg v-else-if="previewKind(entry) === 'geo-scatter'" class="preview-chart-svg" viewBox="0 0 120 80" aria-hidden="true">
                <path class="preview-map-land" d="M13 27 L22 21 L31 24 L37 16 L47 19 L54 12 L63 18 L72 16 L77 23 L88 21 L94 28 L105 31 L100 39 L106 45 L98 51 L93 61 L83 59 L77 66 L67 61 L58 67 L49 61 L40 64 L34 57 L25 57 L22 49 L15 46 L19 38 L12 35 Z" />
                <circle class="preview-geo-scatter-point" cx="35" cy="37" r="3" /><circle class="preview-geo-scatter-point preview-geo-scatter-point--alt" cx="61" cy="34" r="4" /><circle class="preview-geo-scatter-point" cx="83" cy="46" r="3.2" /><circle class="preview-geo-scatter-point preview-geo-scatter-point--alt" cx="72" cy="55" r="2.5" />
              </svg>
              <svg v-else-if="previewKind(entry) === 'geo-heatmap'" class="preview-chart-svg" viewBox="0 0 120 80" aria-hidden="true">
                <path class="preview-map-land" d="M13 27 L22 21 L31 24 L37 16 L47 19 L54 12 L63 18 L72 16 L77 23 L88 21 L94 28 L105 31 L100 39 L106 45 L98 51 L93 61 L83 59 L77 66 L67 61 L58 67 L49 61 L40 64 L34 57 L25 57 L22 49 L15 46 L19 38 L12 35 Z" />
                <circle class="preview-geo-heat preview-geo-heat--low" cx="34" cy="38" r="8" /><circle class="preview-geo-heat preview-geo-heat--mid" cx="62" cy="36" r="12" /><circle class="preview-geo-heat preview-geo-heat--high" cx="82" cy="47" r="9" />
              </svg>
              <svg v-else-if="previewKind(entry) === 'geo-flow'" class="preview-chart-svg" viewBox="0 0 120 80" aria-hidden="true">
                <path class="preview-map-land" d="M13 27 L22 21 L31 24 L37 16 L47 19 L54 12 L63 18 L72 16 L77 23 L88 21 L94 28 L105 31 L100 39 L106 45 L98 51 L93 61 L83 59 L77 66 L67 61 L58 67 L49 61 L40 64 L34 57 L25 57 L22 49 L15 46 L19 38 L12 35 Z" />
                <path class="preview-geo-flow-line" d="M34 42 Q52 17 78 37" /><path class="preview-geo-flow-line preview-geo-flow-line--alt" d="M51 52 Q73 62 89 44" />
                <circle class="preview-geo-flow-node" cx="34" cy="42" r="2.5" /><circle class="preview-geo-flow-node" cx="78" cy="37" r="2.5" /><circle class="preview-geo-flow-node preview-geo-flow-node--alt" cx="51" cy="52" r="2.5" /><circle class="preview-geo-flow-node preview-geo-flow-node--alt" cx="89" cy="44" r="2.5" />
              </svg>
              <svg v-else-if="previewKind(entry) === 'radar'" class="preview-chart-svg" viewBox="0 0 100 72" aria-hidden="true">
                <polygon class="preview-radar-grid" points="50,7 88,28 74,65 26,65 12,28" />
                <polygon class="preview-radar-grid preview-radar-grid--inner" points="50,20 72,32 64,53 36,53 28,32" />
                <path class="preview-chart-grid" d="M50 7V65 M12 28L74 65 M88 28L26 65" />
                <polygon class="preview-radar-secondary" points="50,17 70,31 61,52 37,55 25,31" />
                <polygon class="preview-radar-main" points="50,12 79,29 68,49 39,60 21,32" />
              </svg>
              <svg v-else-if="previewKind(entry) === 'scatter'" class="preview-chart-svg" viewBox="0 0 100 64" aria-hidden="true">
                <path class="preview-chart-grid" d="M12 14H94 M12 31H94 M12 48H94" />
                <path class="preview-chart-axis" d="M12 8V54H95" />
                <circle class="preview-scatter-dot" cx="24" cy="41" r="4" />
                <circle class="preview-scatter-dot preview-scatter-dot--alt" cx="36" cy="29" r="3" />
                <circle class="preview-scatter-dot" cx="48" cy="37" r="5" />
                <circle class="preview-scatter-dot preview-scatter-dot--alt" cx="58" cy="21" r="3.5" />
                <circle class="preview-scatter-dot" cx="70" cy="31" r="3" />
                <circle class="preview-scatter-dot preview-scatter-dot--alt" cx="82" cy="17" r="4.5" />
                <circle class="preview-scatter-dot" cx="87" cy="43" r="2.7" />
              </svg>
              <span v-else-if="previewKind(entry) === 'table'" class="preview-table">
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
.catalog-categories button { display: inline-flex; align-items: center; gap: 5px; padding: 5px 8px; border: 1px solid var(--cf-border); border-radius: 999px; background: transparent; color: var(--cf-text-2); cursor: pointer; font: inherit; font-size: 10px; }
.catalog-categories button[aria-pressed="true"] { border-color: var(--cf-primary); background: color-mix(in srgb, var(--cf-primary) 13%, transparent); color: var(--cf-primary); }
.catalog-category__count { min-width: 12px; color: var(--cf-text-2); font-size: 9px; text-align: center; opacity: .8; }
.catalog-result-count { margin: -3px 0 0; color: var(--cf-text-2); font-size: 10px; }
.catalog-sections { display: flex; min-width: 0; flex-direction: column; gap: 13px; }
.catalog-section h3 { margin: 0 0 6px; color: var(--cf-text-2); font-size: 10px; font-weight: 700; letter-spacing: .04em; }
.catalog-grid { display: grid; grid-template-columns: 1fr; gap: 6px; }
.catalog-card { display: flex; min-width: 0; min-height: 62px; flex-direction: row; align-items: center; gap: 9px; padding: 7px; border: 1px solid var(--cf-border); border-radius: 8px; background: var(--cf-bg); color: inherit; cursor: grab; font: inherit; text-align: left; transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease; }
.catalog-card:hover { border-color: color-mix(in srgb, var(--cf-primary) 65%, var(--cf-border)); background: color-mix(in srgb, var(--cf-primary) 4%, var(--cf-bg)); }
.catalog-card:focus-visible { border-color: var(--cf-primary); outline: 2px solid color-mix(in srgb, var(--cf-primary) 42%, transparent); outline-offset: 1px; }
.catalog-card:active { cursor: grabbing; }
.catalog-card__preview { display: grid; flex: 0 0 58px; width: 58px; height: 48px; place-items: center; overflow: hidden; border: 1px solid color-mix(in srgb, var(--cf-border) 80%, transparent); border-radius: 5px; background: color-mix(in srgb, var(--cf-panel) 78%, transparent); }
.preview-bars { display: flex; width: 68%; height: 70%; align-items: flex-end; justify-content: center; gap: 5px; }
.preview-bars i { width: 8px; max-height: 100%; border-radius: 2px 2px 0 0; background: var(--cf-primary); opacity: .75; }

.preview-chart-svg { display: block; width: 100%; height: 100%; padding: 5px; box-sizing: border-box; overflow: visible; }
.preview-chart-grid { fill: none; stroke: color-mix(in srgb, var(--cf-border) 80%, transparent); stroke-width: 1; }
.preview-chart-axis { fill: none; stroke: var(--cf-text-2); stroke-width: 1.1; opacity: .55; }
.preview-line-area { fill: color-mix(in srgb, var(--cf-primary) 12%, transparent); }
.preview-line-main, .preview-line-secondary { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.preview-line-main { stroke: var(--cf-primary); stroke-width: 2.8; }
.preview-line-secondary { stroke: color-mix(in srgb, var(--cf-primary) 42%, #42c7b8); stroke-width: 2; }
.preview-line-dot { fill: var(--cf-primary); stroke: var(--cf-panel); stroke-width: 1.5; }
.preview-bar-a { fill: var(--cf-primary); }
.preview-bar-b { fill: color-mix(in srgb, var(--cf-primary) 42%, #42c7b8); }
.preview-pie { display: block; width: 36px; height: 36px; border: 2px solid var(--cf-panel); border-radius: 50%; background: conic-gradient(var(--cf-primary) 0 34%, color-mix(in srgb, var(--cf-primary) 48%, #42c7b8) 34% 59%, color-mix(in srgb, var(--cf-primary) 25%, #f0c76a) 59% 78%, color-mix(in srgb, var(--cf-primary) 12%, #7f8ca5) 78% 100%); box-shadow: 0 1px 4px color-mix(in srgb, var(--cf-text) 12%, transparent); }
.preview-map-land { fill: color-mix(in srgb, var(--cf-primary) 30%, var(--cf-panel)); stroke: var(--cf-primary); stroke-width: 1.5; stroke-linejoin: round; }
.preview-map-boundary { fill: none; stroke: var(--cf-panel); stroke-width: 1.5; stroke-linecap: round; opacity: .95; }
.preview-map-island { fill: var(--cf-primary); }
.preview-map-depth { stroke-linejoin: round; stroke-width: 1.3; }
.preview-map-depth--4 { fill: #16344d; stroke: #315b78; }
.preview-map-depth--3 { fill: #214863; stroke: #46738e; }
.preview-map-depth--2 { fill: #376985; stroke: #659ab3; }
.catalog-card__preview--tilted .preview-map--25d { filter: drop-shadow(0 0 5px #25cfff66); }
.preview-geo-scatter-point { fill: #f4c95d; stroke: #fff; stroke-width: 1.2; }
.preview-geo-scatter-point--alt { fill: #56d6c3; }
.preview-geo-heat { stroke: none; opacity: .72; }
.preview-geo-heat--low { fill: #4ecdc4; }
.preview-geo-heat--mid { fill: #f4c95d; opacity: .82; }
.preview-geo-heat--high { fill: #ff826d; opacity: .88; }
.preview-geo-flow-line { fill: none; stroke: #65d9ce; stroke-width: 2; stroke-linecap: round; }
.preview-geo-flow-line--alt { stroke: #f4c95d; stroke-dasharray: 3 2; }
.preview-geo-flow-node { fill: #fff; stroke: #65d9ce; stroke-width: 1.5; }
.preview-geo-flow-node--alt { stroke: #f4c95d; }
.preview-radar-grid { fill: color-mix(in srgb, var(--cf-primary) 4%, transparent); stroke: color-mix(in srgb, var(--cf-border) 80%, transparent); stroke-width: 1; }
.preview-radar-grid--inner { fill: none; }
.preview-radar-secondary { fill: color-mix(in srgb, #42c7b8 18%, transparent); stroke: #42c7b8; stroke-width: 1.8; }
.preview-radar-main { fill: color-mix(in srgb, var(--cf-primary) 20%, transparent); stroke: var(--cf-primary); stroke-width: 2; }
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
.catalog-card__copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 4px; }
.catalog-card__copy strong { overflow: hidden; font-size: 11px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.catalog-card__copy small { display: -webkit-box; overflow: hidden; color: var(--cf-text-2); font-size: 10px; line-height: 1.4; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.catalog-card__add { flex: 0 0 auto; align-self: center; margin-left: auto; color: var(--cf-primary); font-size: 15px; line-height: 1; }
.catalog-empty, .catalog-hint { margin: 2px 0; color: var(--cf-text-2); font-size: 10px; line-height: 1.5; }
.catalog-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 18px 7px; text-align: center; }
.catalog-empty button { padding: 5px 9px; border: 1px solid var(--cf-border); border-radius: 5px; background: transparent; color: var(--cf-primary); cursor: pointer; font: inherit; font-size: 10px; }
.catalog-empty button:hover { border-color: var(--cf-primary); background: color-mix(in srgb, var(--cf-primary) 8%, transparent); }
.catalog-hint { text-align: center; }
.catalog-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
</style>
