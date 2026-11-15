<script setup lang="ts">
/**
 * 快速样式缩略图：真实省界矢量 + 每套预设**各自独立的观感**。
 *
 * 参考图里六张缩略图不是同一张图换配色，而是六种处理：
 * 深海蓝是分级设色 + 东侧柔光；山地绿洲 / 暖沙金是卫星地形观感；
 * 靛蓝等高线是低饱和靛面 + 等高线纹理；霓虹紫蓝是近黑面 + 国界外轮廓辉光；
 * 素雅宣纸是浅色宣纸底图。
 *
 * 全程离线：不依赖瓦片、不发网络请求，地理数据来自已在包内的 china.json。
 */
import { computed } from "vue";
import type { MapQuickStyle } from "@/core/components/mapQuickStyles";
import {
  buildArtworkIds,
  buildBackgroundFill,
  buildProvinceFill,
  buildStrokeColor,
  buildStrokeWidth,
} from "@/core/components/mapQuickStyleArtwork";
import { CHINA_PREVIEW_REGIONS, CHINA_PREVIEW_VIEWBOX } from "@/assets/geo/chinaPreview";

const props = defineProps<{ style: MapQuickStyle }>();

const preset = computed(() => props.style);

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

const regions = computed(() => CHINA_PREVIEW_REGIONS.map((region) => ({
  name: region.name,
  d: region.d,
  holes: region.holes,
  fill: buildProvinceFill(preset.value, {
    name: region.name,
    lng: region.cp[0],
    lat: region.cp[1],
    size: region.size,
  }, NORMALIZED.get(region.name) ?? 0),
})));

const ids = computed(() => buildArtworkIds(preset.value));
const background = computed(() => buildBackgroundFill(preset.value));
const stroke = computed(() => buildStrokeColor(preset.value));
const strokeWidth = computed(() => buildStrokeWidth(preset.value));

const viewBox = computed(() => `0 0 ${CHINA_PREVIEW_VIEWBOX.width} ${CHINA_PREVIEW_VIEWBOX.height}`);
/** 东侧柔光（深海蓝观感）：参考图里东部沿海有一片高亮。 */
const sheen = computed(() => ({
  cx: CHINA_PREVIEW_VIEWBOX.width * 0.68,
  cy: CHINA_PREVIEW_VIEWBOX.height * 0.44,
  r: CHINA_PREVIEW_VIEWBOX.width * 0.3,
}));
</script>

<template>
  <svg
    class="map-quick-style-thumb__map"
    :viewBox="viewBox"
    role="img"
    :aria-label="`${preset.name}预览`"
  >
    <defs>
      <!-- 背景：海面 / 底图由外向内的柔和渐变 -->
      <radialGradient :id="`cf-thumb-bg-${preset.id}`" cx="50%" cy="42%" r="78%">
        <stop offset="0%" :stop-color="background" stop-opacity="1" />
        <stop offset="100%" :stop-color="background" stop-opacity="0.72" />
      </radialGradient>

      <!-- 卫星地形观感：细密颗粒，只作用在陆地范围内（海面保持干净的深色） -->
      <filter :id="ids.terrain" x="-12%" y="-12%" width="124%" height="124%">
        <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="3" seed="7" result="noise" />
        <feColorMatrix in="noise" type="saturate" values="0" result="gray" />
        <feComponentTransfer in="gray" result="grain">
          <feFuncA type="linear" slope="0.28" intercept="0" />
        </feComponentTransfer>
        <feComposite in="grain" in2="SourceAlpha" operator="in" result="texture" />
        <feBlend in="SourceGraphic" in2="texture" mode="overlay" />
      </filter>

      <!-- 等高线观感：平滑噪声按离散档位量化，得到等高带状纹理（并裁到陆地内） -->
      <filter :id="ids.contour" x="-12%" y="-12%" width="124%" height="124%">
        <feTurbulence type="fractalNoise" baseFrequency="0.016 0.024" numOctaves="2" seed="11" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="0.5" result="smooth" />
        <feColorMatrix in="smooth" type="saturate" values="0" result="gray" />
        <feComponentTransfer in="gray" result="bands">
          <feFuncR type="discrete" tableValues="0 0.12 0.25 0.38 0.5 0.62 0.75 0.88 1" />
          <feFuncG type="discrete" tableValues="0 0.12 0.25 0.38 0.5 0.62 0.75 0.88 1" />
          <feFuncB type="discrete" tableValues="0 0.12 0.25 0.38 0.5 0.62 0.75 0.88 1" />
        </feComponentTransfer>
        <feComposite in="bands" in2="SourceAlpha" operator="in" result="clipped" />
        <feBlend in="SourceGraphic" in2="clipped" mode="screen" />
      </filter>

      <!-- 霓虹观感：先膨胀再模糊，相邻省份自然并成一条会发光的外轮廓 -->
      <filter :id="ids.glow" x="-25%" y="-25%" width="150%" height="150%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="0.9" result="spread" />
        <feGaussianBlur in="spread" stdDeviation="1.5" result="blurred" />
        <feFlood :flood-color="preset.tokens.border.color" flood-opacity="0.95" result="tint" />
        <feComposite in="tint" in2="blurred" operator="in" result="lit" />
        <feMerge>
          <feMergeNode in="lit" />
          <feMergeNode in="lit" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <!-- 宣纸观感：纸面颗粒 -->
      <filter :id="ids.paper" x="-6%" y="-6%" width="112%" height="112%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="grain" />
        <feColorMatrix in="grain" type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.16" intercept="0" />
        </feComponentTransfer>
        <feBlend in="SourceGraphic" mode="multiply" />
      </filter>

      <!-- 深海蓝观感：东侧柔光 -->
      <radialGradient :id="`cf-thumb-sheen-${preset.id}`" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.26" />
        <stop offset="45%" stop-color="#ffffff" stop-opacity="0.11" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- 底图 -->
    <rect class="map-quick-style-thumb__bg" x="0" y="0" :width="CHINA_PREVIEW_VIEWBOX.width" :height="CHINA_PREVIEW_VIEWBOX.height" :fill="`url(#cf-thumb-bg-${preset.id})`" />

    <!-- 国土地形：真实省界矢量 -->
    <g
      class="map-quick-style-thumb__land"
      :filter="ids.terrain ? `url(#${ids.terrain})` : ids.paper ? `url(#${ids.paper})` : undefined"
    >
      <path
        v-for="region in regions"
        :key="region.name"
        :d="region.holes ? region.d + region.holes : region.d"
        :fill="region.fill"
        :fill-rule="region.holes ? 'evenodd' : 'nonzero'"
        :stroke="stroke"
        :stroke-width="strokeWidth"
        vector-effect="non-scaling-stroke"
      />
    </g>

    <!-- 靛蓝等高线观感：等高带纹理覆盖在国土地形上 -->
    <g v-if="ids.contour" class="map-quick-style-thumb__contour" :filter="`url(#${ids.contour})`" opacity="0.42">
      <path
        v-for="region in regions"
        :key="`contour-${region.name}`"
        :d="region.holes ? region.d + region.holes : region.d"
        :fill="region.fill"
        :fill-rule="region.holes ? 'evenodd' : 'nonzero'"
      />
    </g>

    <!-- 霓虹紫蓝观感：外轮廓辉光（相邻省份并成一条发光国界） -->
    <g v-if="ids.glow" class="map-quick-style-thumb__glow" :filter="`url(#${ids.glow})`">
      <path
        v-for="region in regions"
        :key="`glow-${region.name}`"
        :d="region.holes ? region.d + region.holes : region.d"
        :fill="region.fill"
        :fill-rule="region.holes ? 'evenodd' : 'nonzero'"
      />
    </g>

    <!-- 深海蓝观感：东侧柔光 -->
    <ellipse
      v-if="preset.artwork === 'glow-choropleth'"
      class="map-quick-style-thumb__sheen"
      :cx="sheen.cx"
      :cy="sheen.cy"
      :rx="sheen.r"
      :ry="sheen.r * 0.72"
      :fill="`url(#cf-thumb-sheen-${preset.id})`"
    />
  </svg>
</template>

<style scoped>
.map-quick-style-thumb__map { display: block; width: 100%; height: 100%; }
</style>
