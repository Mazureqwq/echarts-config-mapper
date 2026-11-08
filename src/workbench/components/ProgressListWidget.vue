<script setup lang="ts">
import { computed } from "vue";
import type { ComponentRenderProps } from "@/core/components/types";
import { buildProgressRows } from "@/core/components/dataWidgets";
import { sanitizeHexColor } from "@/core/components/props";

const props = withDefaults(defineProps<ComponentRenderProps & {
  labelField: string;
  valueField: string;
  maxValue: number;
  showValue: boolean;
  trackColor: string;
  fillColor: string;
}>(), {
  labelField: "name",
  valueField: "value",
  maxValue: 100,
  showValue: true,
  trackColor: "",
  fillColor: "",
});

const progressRows = computed(() => buildProgressRows(props.rows, props.labelField, props.valueField, props.maxValue));
const trackColor = computed(() => sanitizeHexColor(props.trackColor) ?? "var(--cf-border, #344054)");
const fillColor = computed(() => sanitizeHexColor(props.fillColor) ?? "var(--cf-primary, #5b8cff)");

function formatValue(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}
</script>

<template>
  <div class="progress-list-widget">
    <ul v-if="progressRows.length" class="progress-list-widget__list">
      <li v-for="(row, index) in progressRows" :key="`${row.label}-${index}`" class="progress-list-widget__row">
        <div class="progress-list-widget__heading">
          <span class="progress-list-widget__label">{{ row.label }}</span>
          <span v-if="showValue" class="progress-list-widget__value">{{ formatValue(row.value) }}</span>
        </div>
        <div
          class="progress-list-widget__track"
          role="progressbar"
          :aria-label="row.label"
          :aria-valuemin="0"
          :aria-valuemax="100"
          :aria-valuenow="row.percent"
          :style="{ backgroundColor: trackColor }"
        >
          <span class="progress-list-widget__fill" :style="{ width: `${row.percent}%`, backgroundColor: fillColor }" />
        </div>
      </li>
    </ul>
    <p v-else class="progress-list-widget__empty" role="status">暂无可展示的数据</p>
  </div>
</template>

<style scoped>
.progress-list-widget { box-sizing: border-box; width: 100%; height: 100%; overflow: auto; padding: 16px; color: var(--cf-text, #e8edf7); font-family: system-ui, sans-serif; }
.progress-list-widget__list { display: flex; flex-direction: column; gap: 15px; margin: 0; padding: 0; list-style: none; }
.progress-list-widget__row { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.progress-list-widget__heading { display: flex; min-width: 0; justify-content: space-between; gap: 10px; color: var(--cf-text-2, #a4afbf); font-size: 12px; }
.progress-list-widget__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.progress-list-widget__value { flex: 0 0 auto; color: var(--cf-text, #e8edf7); font-variant-numeric: tabular-nums; }
.progress-list-widget__track { height: 9px; overflow: hidden; border-radius: 999px; }
.progress-list-widget__fill { display: block; height: 100%; border-radius: inherit; transition: width 160ms ease; }
.progress-list-widget__empty { margin: 0; color: var(--cf-text-2, #a4afbf); font-size: 12px; }
</style>
