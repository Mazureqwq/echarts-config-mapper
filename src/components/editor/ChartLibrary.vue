<template>
  <aside class="library">
    <div class="lib-head">
      <span class="lib-title">图表类型</span>
      <span class="lib-count">{{ CHART_TYPES.length }}</span>
    </div>

    <div class="lib-list">
      <button
        v-for="type in CHART_TYPES"
        :key="type"
        class="lib-item"
        :class="{ active: type === store.type }"
        :title="`${CHART_META[type].label} · ${CHART_META[type].hint}`"
        @click="store.selectType(type)"
      >
        <span class="lib-icon"><Icon :name="type" :size="17" /></span>
        <span class="lib-text">
          <span class="lib-name">{{ CHART_META[type].label }}</span>
          <span class="lib-hint">{{ CHART_META[type].hint }}</span>
        </span>
        <span class="lib-en">{{ CHART_META[type].labelEn }}</span>
      </button>
    </div>

    <div class="lib-foot">
      <p class="foot-title">预览尺寸</p>
      <div class="preset-row">
        <button
          v-for="preset in PRESETS"
          :key="preset.label"
          class="preset"
          :class="{ active: preset.w === store.size.w && preset.h === store.size.h }"
          @click="store.setSize(preset.w, preset.h)"
        >
          {{ preset.label }}
        </button>
      </div>
      <div class="size-row">
        <input class="size-input" type="number" :value="store.size.w" @change="onSize('w', $event)" />
        <span class="size-x">×</span>
        <input class="size-input" type="number" :value="store.size.h" @change="onSize('h', $event)" />
      </div>
      <p class="foot-title">预览背景</p>
      <div class="preset-row">
        <button
          v-for="bg in BACKDROPS"
          :key="bg.value"
          class="preset"
          :class="{ active: store.backdrop === bg.value }"
          :title="bg.hint"
          @click="store.setBackdrop(bg.value)"
        >
          {{ bg.label }}
        </button>
      </div>
      <p class="foot-note">背景只影响预览，不会写进复制出去的 JSON。</p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import Icon from "@/components/ui/Icon.vue";
import { CHART_META, CHART_TYPES } from "@/config/editor";
import { useWorkspaceStore, type PreviewBackdrop } from "@/stores/workspace";

const store = useWorkspaceStore();

const PRESETS = [
  { label: "宽屏 16:9", w: 960, h: 540 },
  { label: "方形", w: 640, h: 640 },
  { label: "长条", w: 1000, h: 420 },
];

const BACKDROPS: Array<{ label: string; value: PreviewBackdrop; hint: string }> = [
  { label: "深色", value: "dark", hint: "深色画布，适合大屏" },
  { label: "浅色", value: "light", hint: "白色画布，适合报告与文档" },
  { label: "网格", value: "grid", hint: "网格底纹，便于看对齐" },
];

function onSize(axis: "w" | "h", event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  if (axis === "w") store.setSize(value, store.size.h);
  else store.setSize(store.size.w, value);
}
</script>

<style scoped>
.library {
  display: flex;
  flex-direction: column;
  width: var(--cf-left-w);
  flex: 0 0 auto;
  background: var(--cf-bg-1);
  border-right: 1px solid var(--cf-border);
  overflow-y: auto;
}

.lib-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
}

.lib-title,
.foot-title {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--cf-text-faint);
}

.lib-count {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--cf-bg-3);
  font-size: 10px;
  color: var(--cf-text-muted);
}

.lib-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 4px 8px;
}

.lib-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 9px;
  border-radius: var(--cf-radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--cf-text-dim);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: all var(--cf-fast);
}

.lib-item:hover {
  background: var(--cf-bg-2);
  border-color: var(--cf-border);
  color: var(--cf-text);
}

.lib-item.active {
  background: var(--cf-accent-soft);
  border-color: var(--cf-accent);
  color: var(--cf-text);
}

.lib-item.active .lib-icon {
  background: var(--cf-accent);
  color: #fff;
}

.lib-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--cf-bg-3);
  color: var(--cf-cyan);
  flex: 0 0 auto;
  transition: all var(--cf-fast);
}

.lib-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.lib-name {
  font-size: 12.5px;
  color: var(--cf-text);
}

.lib-hint {
  font-size: 10.5px;
  color: var(--cf-text-faint);
}

.lib-en {
  margin-left: auto;
  font-family: var(--cf-font-mono);
  font-size: 9.5px;
  color: var(--cf-text-faint);
}

.lib-foot {
  margin-top: 14px;
  padding: 14px;
  border-top: 1px solid var(--cf-border-soft);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.preset {
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--cf-border);
  background: var(--cf-bg-2);
  color: var(--cf-text-muted);
  font-family: inherit;
  font-size: 10.5px;
  cursor: pointer;
  transition: all var(--cf-fast);
}

.preset:hover {
  border-color: var(--cf-border-strong);
  color: var(--cf-text);
}

.preset.active {
  background: var(--cf-accent-soft);
  border-color: var(--cf-accent);
  color: #c7c9ff;
}

.size-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.size-input {
  width: 100%;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border-radius: var(--cf-radius-sm);
  border: 1px solid var(--cf-border);
  background: var(--cf-bg-1);
  color: var(--cf-text-dim);
  font-family: var(--cf-font-mono);
  font-size: 11px;
  outline: none;
}

.size-input:focus {
  border-color: var(--cf-accent);
}

.size-x {
  color: var(--cf-text-faint);
  font-size: 11px;
}

.foot-note {
  margin: 0;
  font-size: 10px;
  line-height: 1.5;
  color: var(--cf-text-faint);
}
</style>
