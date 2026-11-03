<script setup lang="ts">
import { computed } from "vue";
import type { CSSProperties } from "vue";
import type { ScreenItem } from "@/core/model/types";
import { buildOption } from "@/core/chart/optionBuilder";
import { themeMode } from "@/shared/theme";
import EChartsView from "./EChartsView.vue";

const props = defineProps<{ item: ScreenItem }>();

const boxStyle = computed<CSSProperties>(() => {
  const f = props.item.frame;
  const style: CSSProperties = {
    position: "absolute",
    left: `${f.x}px`,
    top: `${f.y}px`,
    width: `${f.w}px`,
    height: `${f.h}px`,
    transform: `rotate(${f.rotate}deg)`,
    transformOrigin: "center center",
  };
  if (props.item.opacity !== undefined) style.opacity = String(props.item.opacity);
  if (props.item.hidden) style.display = "none";
  return style;
});

const textStyle = computed<CSSProperties>(() => {
  const it = props.item;
  if (it.kind !== "text") return {};
  return {
    fontSize: `${it.fontSize}px`,
    color: it.color,
    textAlign: it.align,
    fontWeight: it.weight,
    lineHeight: it.lineHeight !== undefined ? String(it.lineHeight) : "1.4",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    width: "100%",
    height: "100%",
    overflow: "hidden",
  };
});

const imageStyle = computed<CSSProperties>(() => {
  const it = props.item;
  if (it.kind !== "image") return {};
  return {
    width: "100%",
    height: "100%",
    objectFit: it.fit,
    display: "block",
  };
});

const shapeStyle = computed<CSSProperties>(() => {
  const it = props.item;
  if (it.kind !== "shape") return {};
  const style: CSSProperties = {
    width: "100%",
    height: "100%",
    background: it.fill ?? "transparent",
  };
  if (it.stroke) {
    style.border = `${it.strokeWidth ?? 1}px solid ${it.stroke}`;
  }
  if (it.shape === "ellipse") {
    style.borderRadius = "50%";
  } else if (it.shape === "rect" && it.radius) {
    style.borderRadius = `${it.radius}px`;
  } else if (it.shape === "line") {
    style.background = it.stroke ?? it.fill ?? "#333";
    style.height = `${it.strokeWidth ?? 2}px`;
    style.marginTop = `calc(50% - ${(it.strokeWidth ?? 2) / 2}px)`;
  }
  return style;
});

const chartOption = computed<Record<string, unknown> | null>(() => {
  const it = props.item;
  return it.kind === "chart" ? buildOption(it.spec) : null;
});
</script>

<template>
  <div class="item-view" :style="boxStyle" :data-item-id="item.id">
    <template v-if="item.kind === 'text'">
      <div :style="textStyle">{{ item.text }}</div>
    </template>
    <template v-else-if="item.kind === 'image'">
      <img v-if="item.src" :src="item.src" :style="imageStyle" alt="" draggable="false" />
      <div v-else class="item-view__img-empty">图片</div>
    </template>
    <template v-else-if="item.kind === 'shape'">
      <div :style="shapeStyle" />
    </template>
    <template v-else>
      <EChartsView v-if="chartOption" :option="chartOption" :theme="themeMode" />
    </template>
  </div>
</template>

<style scoped>
.item-view__img-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--cf-border);
  color: var(--cf-text-2);
  font-size: 12px;
}
</style>
