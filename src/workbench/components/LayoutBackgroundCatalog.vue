<script setup lang="ts">
import { computed } from "vue";
import { LAYOUT_BACKGROUND_ENTRIES, type LayoutBackgroundEntry } from "@/core/design/layoutBackgrounds";
import { BUILT_IN_BACKGROUND_PRESETS } from "@/core/design/backgroundPresets";
import { layoutBackgroundDragPayload } from "@/workbench/layoutBackgroundActions";
import { setActiveCanvasDragPayload } from "@/shared/dnd";

const emit = defineEmits<{ select: [entry: LayoutBackgroundEntry]; applyBackground: [presetId: string] }>();
const layouts = computed(() => LAYOUT_BACKGROUND_ENTRIES.filter((entry) => entry.kind === "layout"));
const assets = computed(() => LAYOUT_BACKGROUND_ENTRIES.filter((entry) => entry.kind === "asset"));

function startDrag(event: DragEvent, entry: LayoutBackgroundEntry): void {
  if (!event.dataTransfer) return;
  const payload = layoutBackgroundDragPayload(entry);
  if (!payload) return;
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(payload.mime, payload.data);
  setActiveCanvasDragPayload(payload.mime, payload.data);
  event.dataTransfer.setData("text/plain", entry.id);
}
</script>

<template>
  <div class="layout-background-catalog">
    <section class="library-section" aria-labelledby="layout-background-layouts-heading">
      <header class="section-head">
        <div><h3 id="layout-background-layouts-heading">布局底板</h3><p>整屏背景分区；不移动现有图表</p></div>
      </header>
      <button
        v-for="entry in layouts"
        :key="entry.id"
        class="layout-background-card"
        type="button"
        draggable="true"
        :aria-label="`插入 ${entry.name}`"
        @click="emit('select', entry)"
        @dragstart="startDrag($event, entry)"
      >
        <span class="layout-background-preview" :data-preview="entry.previewKey" aria-hidden="true">
          <template v-if="entry.previewKey === 'monitor-main-side'">
            <i class="preview-panel preview-panel--main" /><i class="preview-panel" /><i class="preview-panel" />
            <b class="preview-title" />
          </template>
          <template v-else>
            <i v-for="index in 4" :key="index" class="preview-panel" />
          </template>
        </span>
        <span class="layout-background-copy"><strong>{{ entry.name }}</strong><small>{{ entry.description }}</small></span>
        <span class="insert-mark" aria-hidden="true">＋</span>
      </button>
    </section>

    <section class="library-section" aria-labelledby="layout-background-presets-heading">
      <header class="section-head">
        <div><h3 id="layout-background-presets-heading">画布背景</h3><p>原创内置 SVG · 点击即可应用，离线可用</p></div>
      </header>
      <div class="background-preset-grid">
        <button
          v-for="preset in BUILT_IN_BACKGROUND_PRESETS"
          :key="preset.id"
          class="background-preset-card"
          type="button"
          :aria-label="`应用背景 ${preset.name}`"
          @click="emit('applyBackground', preset.id)"
        >
          <span class="background-preset-preview" :style="{ background: preset.preview }" aria-hidden="true" />
          <span class="background-preset-copy"><strong>{{ preset.name }}</strong><small>{{ preset.description }}</small></span>
        </button>
      </div>
    </section>

    <section class="library-section" aria-labelledby="layout-background-assets-heading">
      <header class="section-head">
        <div><h3 id="layout-background-assets-heading">背景素材与装饰</h3><p>点击居中添加，或拖到画布指定位置</p></div>
      </header>
      <button
        v-for="entry in assets"
        :key="entry.id"
        class="layout-background-card"
        type="button"
        draggable="true"
        :aria-label="`插入 ${entry.name}`"
        @click="emit('select', entry)"
        @dragstart="startDrag($event, entry)"
      >
        <span class="layout-background-preview" :data-preview="entry.previewKey" aria-hidden="true">
          <i v-if="entry.previewKey === 'monitor-panel-frame'" class="preview-panel preview-panel--asset" />
          <b v-else-if="entry.previewKey === 'monitor-title-band'" class="preview-title preview-title--asset" />
          <i v-else class="preview-corner" />
        </span>
        <span class="layout-background-copy"><strong>{{ entry.name }}</strong><small>{{ entry.description }}</small></span>
        <span class="insert-mark" aria-hidden="true">＋</span>
      </button>
    </section>
  </div>
</template>

<style scoped>
.layout-background-catalog { display: flex; flex-direction: column; gap: 18px; }
.library-section { min-width: 0; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.section-head h3 { margin: 0; color: var(--cf-text); font-size: 12px; font-weight: 700; }
.section-head p { margin: 3px 0 0; color: var(--cf-text-2); font-size: 10px; line-height: 1.45; }
.layout-background-card { display: flex; width: 100%; align-items: center; gap: 8px; margin-top: 6px; padding: 7px; border: 1px solid var(--cf-border); border-radius: 7px; background: var(--cf-panel); color: var(--cf-text); text-align: left; cursor: pointer; }
.layout-background-card:hover, .layout-background-card:focus-visible { border-color: var(--cf-primary); outline-color: var(--cf-primary); }
.layout-background-preview { position: relative; display: grid; width: 66px; height: 42px; flex: 0 0 66px; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 3px; overflow: hidden; padding: 4px; border: 1px solid #214258; border-radius: 4px; background: #12161d; }
.layout-background-preview[data-preview="monitor-main-side"] { grid-template-columns: 1.25fr 1fr; }
.layout-background-preview[data-preview="monitor-grid-2x2"] { grid-template-columns: 1fr 1fr; }
.layout-background-preview[data-preview="monitor-panel-frame"], .layout-background-preview[data-preview="monitor-title-band"], .layout-background-preview[data-preview="monitor-corner-accent"] { display: block; }
.preview-panel { display: block; min-width: 0; min-height: 0; border: 1px solid #29d3ff; border-radius: 2px; background: #0d2234; opacity: .88; }
.preview-panel--main { grid-row: 1 / span 2; }
.preview-title { position: absolute; top: 5px; left: 7px; width: 52%; height: 3px; background: #29d3ff; }
.preview-title--asset { top: 11px; left: 8px; width: 48px; height: 5px; box-shadow: 0 5px 0 -1px #214258; }
.preview-panel--asset { position: absolute; inset: 5px 8px; border-radius: 4px; }
.preview-corner { position: absolute; inset: 7px 10px; border: 1px solid #29d3ff; border-radius: 2px; clip-path: polygon(0 0, 25% 0, 25% 8%, 8% 8%, 8% 25%, 0 25%, 0 0, 100% 0, 100% 25%, 92% 25%, 92% 8%, 75% 8%, 75% 0); }
.layout-background-preview[data-preview="monitor-ring-orbit"] .preview-corner { inset: 8px 23px; border-radius: 50%; border-style: dashed; box-shadow: 0 0 0 5px rgba(41,211,255,.12), inset 0 0 0 5px rgba(41,211,255,.08); }
.layout-background-preview[data-preview="monitor-header-strip"] .preview-corner { inset: 14px 7px; height: 11px; border: 0; border-top: 2px solid #29d3ff; border-bottom: 1px solid rgba(41,211,255,.5); border-radius: 0; clip-path: polygon(0 0, 76% 0, 82% 45%, 100% 45%, 100% 100%, 24% 100%, 18% 55%, 0 55%); background: linear-gradient(90deg, rgba(41,211,255,.55), transparent); }
.layout-background-preview[data-preview="monitor-data-wave"] .preview-corner { inset: 12px 6px; border: 0; border-top: 2px solid #29d3ff; border-radius: 50%; transform: skewY(-10deg); }
.layout-background-preview[data-preview="monitor-dot-field"] .preview-corner { inset: 8px; border: 0; border-radius: 0; background: radial-gradient(circle, #29d3ff 1px, transparent 2px) 0 0 / 7px 7px; clip-path: none; }
.layout-background-preview[data-preview="monitor-bracket-frame"] .preview-corner { inset: 6px 9px; border: 2px solid #29d3ff; border-radius: 0; clip-path: polygon(0 0, 32% 0, 32% 7%, 8% 7%, 8% 28%, 0 28%, 0 0, 100% 0, 100% 28%, 92% 28%, 92% 7%, 68% 7%, 68% 0, 100% 0, 100% 100%, 68% 100%, 68% 93%, 92% 93%, 92% 72%, 100% 72%, 100% 100%, 0 100%, 0 72%, 8% 72%, 8% 93%, 32% 93%, 32% 100%, 0 100%); }
.layout-background-preview[data-preview="monitor-radar-sweep"] .preview-corner { inset: 7px 22px; border-radius: 50%; border-style: dashed; background: conic-gradient(from 215deg, rgba(41,211,255,.5), transparent 68%); box-shadow: 0 0 0 4px rgba(41,211,255,.1); }
.layout-background-preview[data-preview="monitor-hex-mesh"] .preview-corner { inset: 7px; border: 0; border-radius: 0; clip-path: none; background: repeating-linear-gradient(60deg, transparent 0 8px, rgba(41,211,255,.28) 8px 9px, transparent 9px 18px), repeating-linear-gradient(-60deg, transparent 0 8px, rgba(41,211,255,.22) 8px 9px, transparent 9px 18px); }
.layout-background-preview[data-preview="monitor-signal-bars"] .preview-corner { inset: 14px 6px; border: 0; border-top: 2px solid #29d3ff; border-bottom: 2px solid rgba(41,211,255,.35); border-radius: 45%; transform: skewY(-8deg); }
.layout-background-preview[data-preview="monitor-energy-divider"] .preview-corner { inset: 20px 6px; height: 0; border: 0; border-top: 2px solid #29d3ff; border-radius: 0; clip-path: none; box-shadow: 0 0 5px rgba(41,211,255,.65); }
.layout-background-preview[data-preview="monitor-energy-divider"] .preview-corner::after { position: absolute; top: -4px; left: 48%; width: 6px; height: 6px; border: 1px solid #29d3ff; background: #12161d; content: ""; transform: rotate(45deg); }
.layout-background-preview[data-preview="monitor-vertical-lights"] .preview-corner { inset: 5px 29px; width: 6px; border: 0; border-radius: 0; clip-path: none; background: repeating-linear-gradient(180deg, #29d3ff 0 2px, transparent 2px 5px); box-shadow: 0 0 7px rgba(41,211,255,.6); }
.layout-background-preview[data-preview="monitor-corner-nodes"] .preview-corner { inset: 6px 9px; border: 2px solid #29d3ff; border-radius: 0; clip-path: polygon(0 0, 28% 0, 28% 8%, 8% 8%, 8% 28%, 0 28%, 0 0, 100% 0, 100% 28%, 92% 28%, 92% 8%, 72% 8%, 72% 0, 100% 0, 100% 100%, 72% 100%, 72% 92%, 92% 92%, 92% 72%, 100% 72%, 100% 100%, 0 100%, 0 72%, 8% 72%, 8% 92%, 28% 92%, 28% 100%, 0 100%); }
.layout-background-preview[data-preview="monitor-status-dots"] .preview-corner { inset: 8px 6px; border: 0; border-radius: 0; clip-path: none; background: radial-gradient(circle, #29d3ff 1px, transparent 2px) 0 0 / 7px 7px; }
.layout-background-preview[data-preview="monitor-data-path"] .preview-corner { inset: 16px 6px; border: 0; border-top: 2px solid #29d3ff; border-radius: 50%; transform: skewY(-13deg); box-shadow: 0 -5px 0 -4px rgba(41,211,255,.6), 0 5px 0 -4px rgba(41,211,255,.42); }
.background-preset-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.background-preset-card { min-width: 0; padding: 6px; border: 1px solid var(--cf-border); border-radius: 7px; background: var(--cf-panel); color: var(--cf-text); text-align: left; cursor: pointer; }
.background-preset-card:hover, .background-preset-card:focus-visible { border-color: var(--cf-primary); outline-color: var(--cf-primary); }
.background-preset-preview { display: block; height: 40px; border-radius: 4px; border: 1px solid rgba(255,255,255,.12); }
.background-preset-copy { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; }
.background-preset-copy strong { font-size: 10px; }
.background-preset-copy small { min-height: 25px; color: var(--cf-text-2); font-size: 9px; line-height: 1.35; }
.layout-background-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }
.layout-background-copy strong { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.layout-background-copy small { display: -webkit-box; overflow: hidden; color: var(--cf-text-2); font-size: 9px; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.insert-mark { color: var(--cf-primary); font-size: 16px; }
</style>
