<script setup lang="ts">
import { computed } from "vue";
import type { ComponentRenderProps, CornerFrameVariant } from "@/core/components/types";
import { sanitizeHexColor } from "@/core/components/props";

const props = withDefaults(defineProps<ComponentRenderProps & {
  variant?: CornerFrameVariant;
  color?: string;
  thickness?: number;
  inset?: number;
}>(), {
  variant: "corner",
  color: "",
  thickness: 2,
  inset: 8,
});

const ALLOWED_VARIANTS: readonly CornerFrameVariant[] = ["corner", "outline", "double"];
const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
const variant = computed<CornerFrameVariant>(() =>
  ALLOWED_VARIANTS.includes(props.variant) ? props.variant : "corner"
);
const frameStyle = computed(() => ({
  "--corner-color": sanitizeHexColor(props.color) ?? "var(--cf-primary, #5b8cff)",
  "--corner-thickness": `${boundedNumber(props.thickness, 2, 1, 8)}px`,
  "--corner-inset": `${boundedNumber(props.inset, 8, 0, 32)}px`,
}));

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}
</script>

<template>
  <div class="corner-frame" :class="`corner-frame--${variant}`" :style="frameStyle" aria-hidden="true">
    <template v-if="variant === 'corner'">
      <span
        v-for="corner in CORNERS"
        :key="corner"
        class="corner-frame__corner"
        :class="`corner-frame__corner--${corner}`"
      />
    </template>
  </div>
</template>

<style scoped>
.corner-frame { position: relative; box-sizing: border-box; width: 100%; height: 100%; pointer-events: none; }
.corner-frame__corner { position: absolute; box-sizing: border-box; width: 22px; height: 22px; border-color: var(--corner-color); border-style: solid; }
.corner-frame__corner--top-left { top: var(--corner-inset); left: var(--corner-inset); border-width: var(--corner-thickness) 0 0 var(--corner-thickness); }
.corner-frame__corner--top-right { top: var(--corner-inset); right: var(--corner-inset); border-width: var(--corner-thickness) var(--corner-thickness) 0 0; }
.corner-frame__corner--bottom-left { bottom: var(--corner-inset); left: var(--corner-inset); border-width: 0 0 var(--corner-thickness) var(--corner-thickness); }
.corner-frame__corner--bottom-right { right: var(--corner-inset); bottom: var(--corner-inset); border-width: 0 var(--corner-thickness) var(--corner-thickness) 0; }
.corner-frame--outline::before, .corner-frame--double::before, .corner-frame--double::after { position: absolute; box-sizing: border-box; border: var(--corner-thickness) solid var(--corner-color); content: ""; }
.corner-frame--outline::before, .corner-frame--double::before { inset: var(--corner-inset); }
.corner-frame--double::after { inset: calc(var(--corner-inset) + 8px); border-width: 1px; }
</style>
