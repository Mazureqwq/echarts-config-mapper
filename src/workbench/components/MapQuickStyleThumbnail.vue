<script setup lang="ts">
/**
 * 快速样式缩略图：用真实省界矢量按预设色带上色渲染。
 *
 * 与参考图一致——每张缩略图都是一幅真实的中国地图剪影，
 * 而不是抽象色卡，所见即所得。全程离线，不依赖瓦片或网络。
 */
import { computed } from "vue";
import type { MapQuickStyle } from "@/core/components/mapQuickStyles";
import { CHINA_PREVIEW_REGIONS, CHINA_PREVIEW_VIEWBOX } from "@/assets/geo/chinaPreview";

const props = defineProps<{ style: MapQuickStyle }>();

/** 省规模标度 → 0..1 归一化位置（对数压缩，避免特大省独占色带高端）。 */
const NORMALIZED = (() => {
  const sizes = CHINA_PREVIEW_REGIONS.map((region) => Math.max(1, region.size));
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  const lo = Math.log(min);
  const span = Math.log(max) - lo || 1;
  const out = new Map<string, number>();
  CHINA_PREVIEW_REGIONS.forEach((region, index) => {
    out.set(region.name, (Math.log(Math.max(1, sizes[index]!)) - lo) / span);
  });
  return out;
})();

function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const pa = parse(a);
  const pb = parse(b);
  const mixed = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.min(1, Math.max(0, t))));
  return "#" + mixed.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** 按预设色带为单省着色（三段渐变 min → mid → max）。 */
function fillFor(name: string): string {
  const fill = props.style.tokens.fill;
  const t = NORMALIZED.get(name) ?? 0;
  return t <= 0.5 ? mixHex(fill.min, fill.mid, t * 2) : mixHex(fill.mid, fill.max, (t - 0.5) * 2);
}

const regions = computed(() => CHINA_PREVIEW_REGIONS.map((region) => ({
  name: region.name,
  d: region.d,
  holes: region.holes,
  fill: fillFor(region.name),
})));

const viewBox = computed(() => `0 0 ${CHINA_PREVIEW_VIEWBOX.width} ${CHINA_PREVIEW_VIEWBOX.height}`);
</script>

<template>
  <svg
    class="map-quick-style-thumb__map"
    :viewBox="viewBox"
    :style="{ background: style.tokens.background }"
    role="img"
    :aria-label="`${style.name}预览`"
  >
    <path
      v-for="region in regions"
      :key="region.name"
      :d="region.holes ? region.d + region.holes : region.d"
      :fill="region.fill"
      :fill-rule="region.holes ? 'evenodd' : 'nonzero'"
      :stroke="style.tokens.border.color"
      :stroke-width="style.tokens.border.width * 0.35"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>

<style scoped>
.map-quick-style-thumb__map { display: block; width: 100%; height: 100%; }
</style>
