<script setup lang="ts">
/**
 * 地图「快速样式」选择器。
 *
 * 视觉参照参考图：深色下拉面板 + 标题「快速样式」+ 右侧收起箭头，
 * 面板内是 3 列 × 2 行的六张地图缩略图，当前选中项带浅色描边与高亮底色。
 */
import { computed, ref } from "vue";
import { MAP_QUICK_STYLES, type MapQuickStyle } from "@/core/components/mapQuickStyles";
import MapQuickStyleThumbnail from "./MapQuickStyleThumbnail.vue";

const props = defineProps<{ activeId: string | undefined }>();
const emit = defineEmits<{ (event: "select", id: string): void }>();

const open = ref(false);

const active = computed<MapQuickStyle | undefined>(() =>
  MAP_QUICK_STYLES.find((preset) => preset.id === props.activeId));

function toggle(): void { open.value = !open.value; }
function select(id: string): void {
  emit("select", id);
  open.value = false;
}
</script>

<template>
  <div class="map-quick-style">
    <button
      type="button"
      class="map-quick-style__trigger"
      :aria-expanded="open"
      aria-haspopup="true"
      data-testid="map-quick-style-trigger"
      @click="toggle"
    >
      <span class="map-quick-style__trigger-label">快速样式</span>
      <span class="map-quick-style__trigger-current">{{ active?.name ?? "未选择" }}</span>
      <span class="map-quick-style__chevron" :class="{ 'map-quick-style__chevron--open': open }" aria-hidden="true">▾</span>
    </button>
    <div v-if="open" class="map-quick-style__panel" data-testid="map-quick-style-panel">
      <button
        v-for="preset in MAP_QUICK_STYLES"
        :key="preset.id"
        type="button"
        class="map-quick-style__item"
        :class="{ 'map-quick-style__item--active': preset.id === activeId }"
        :aria-pressed="preset.id === activeId"
        :title="preset.description"
        :data-style-id="preset.id"
        @click="select(preset.id)"
      >
        <span class="map-quick-style__thumb">
          <MapQuickStyleThumbnail :style="preset" />
        </span>
        <span class="map-quick-style__name">{{ preset.name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.map-quick-style { display: flex; flex-direction: column; gap: 6px; }
.map-quick-style__trigger {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 6px 8px; border: 1px solid var(--cf-border); border-radius: 5px;
  background: var(--cf-panel); color: var(--cf-text); font-size: 11px; cursor: pointer; text-align: left;
}
.map-quick-style__trigger:hover { border-color: var(--cf-primary); }
.map-quick-style__trigger-label { font-weight: 650; }
.map-quick-style__trigger-current { flex: 1; min-width: 0; overflow: hidden; color: var(--cf-text-2); text-overflow: ellipsis; white-space: nowrap; }
.map-quick-style__chevron { color: var(--cf-text-2); font-size: 10px; transition: transform .15s ease; }
.map-quick-style__chevron--open { transform: rotate(180deg); }
.map-quick-style__panel {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px;
  padding: 8px; border: 1px solid var(--cf-border); border-radius: 6px;
  background: color-mix(in srgb, var(--cf-panel) 92%, transparent);
}
.map-quick-style__item {
  display: flex; flex-direction: column; gap: 4px; padding: 4px;
  border: 1px solid transparent; border-radius: 5px; background: transparent;
  color: var(--cf-text-2); font-size: 9px; cursor: pointer;
}
.map-quick-style__item:hover { border-color: color-mix(in srgb, var(--cf-primary) 45%, transparent); }
.map-quick-style__item--active {
  border-color: var(--cf-primary);
  background: color-mix(in srgb, var(--cf-primary) 16%, transparent);
  color: var(--cf-text);
}
.map-quick-style__thumb {
  display: block; width: 100%; aspect-ratio: 160 / 109; overflow: hidden;
  border: 1px solid var(--cf-border); border-radius: 4px; background: #081622;
}
.map-quick-style__name { overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
</style>
