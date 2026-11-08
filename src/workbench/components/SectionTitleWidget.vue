<script setup lang="ts">
import { computed } from "vue";
import type { ComponentRenderProps, SectionTitleVariant } from "@/core/components/types";
import { sanitizeHexColor } from "@/core/components/props";

const props = withDefaults(defineProps<ComponentRenderProps & {
  title?: string;
  subtitle?: string;
  variant?: SectionTitleVariant;
  accentColor?: string;
}>(), {
  title: "分区标题",
  subtitle: "",
  variant: "underline",
  accentColor: "",
});

const ALLOWED_VARIANTS: readonly SectionTitleVariant[] = ["underline", "bar", "bracket"];
const variant = computed<SectionTitleVariant>(() =>
  ALLOWED_VARIANTS.includes(props.variant) ? props.variant : "underline"
);
const titleText = computed(() => safeText(props.title) || "分区标题");
const subtitleText = computed(() => safeText(props.subtitle));
const accent = computed(() => sanitizeHexColor(props.accentColor) ?? "var(--cf-primary, #5b8cff)");

function safeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}
</script>

<template>
  <header class="section-title" :class="`section-title--${variant}`" :style="{ '--section-title-accent': accent }">
    <span class="section-title__mark" aria-hidden="true" />
    <div class="section-title__body">
      <h2 class="section-title__title">{{ titleText }}</h2>
      <p v-if="subtitleText" class="section-title__subtitle">{{ subtitleText }}</p>
    </div>
  </header>
</template>

<style scoped>
.section-title { position: relative; display: flex; box-sizing: border-box; align-items: center; width: 100%; height: 100%; overflow: hidden; padding: 10px 18px; color: var(--cf-text, #e8edf7); font-family: system-ui, sans-serif; }
.section-title__body { min-width: 0; }
.section-title__title { overflow: hidden; margin: 0; color: inherit; font-size: 18px; font-weight: 650; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.section-title__subtitle { overflow: hidden; margin: 4px 0 0; color: var(--cf-text-2, #a4afbf); font-size: 11px; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
.section-title__mark { display: none; }
.section-title--underline { border-bottom: 1px solid var(--cf-border, #344054); }
.section-title--underline .section-title__mark { position: absolute; bottom: 0; left: 18px; display: block; width: 56px; height: 2px; background: var(--section-title-accent); }
.section-title--bar .section-title__mark { display: block; flex: 0 0 3px; align-self: stretch; margin-right: 12px; background: var(--section-title-accent); }
.section-title--bracket::before, .section-title--bracket::after { position: absolute; width: 14px; height: 14px; border-color: var(--section-title-accent); border-style: solid; content: ""; pointer-events: none; }
.section-title--bracket::before { top: 5px; left: 5px; border-width: 2px 0 0 2px; }
.section-title--bracket::after { right: 5px; bottom: 5px; border-width: 0 2px 2px 0; }
</style>
