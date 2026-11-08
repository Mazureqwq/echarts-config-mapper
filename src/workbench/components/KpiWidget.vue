<script setup lang="ts">
import type { ComponentRenderProps } from "@/core/components/types";
import { aggregateKpi, formatWidgetValue } from "@/core/components/dataWidgets";

const props = withDefaults(defineProps<ComponentRenderProps & {
  valueField: string;
  label: string;
  format: "number" | "currency" | "percent";
  aggregation: "first" | "sum" | "average";
}>(), { valueField: "value", label: "指标", format: "number", aggregation: "sum" });

const value = () => aggregateKpi(props.rows, props.valueField, props.aggregation);
const displayValue = () => formatWidgetValue(value(), props.format);
</script>

<template>
  <div class="kpi-widget" :class="{ 'kpi-widget--stale': snapshot.status === 'stale' }">
    <p class="kpi-widget__label">{{ label }}</p>
    <strong class="kpi-widget__value">{{ displayValue() }}</strong>
    <p v-if="snapshot.status === 'loading'" class="kpi-widget__status" role="status">正在加载数据…</p>
    <p v-else-if="snapshot.status === 'error'" class="kpi-widget__status kpi-widget__status--error" role="status">{{ snapshot.error || "数据加载失败" }}</p>
    <p v-else-if="snapshot.status === 'stale'" class="kpi-widget__status kpi-widget__status--stale" role="status">数据过期，显示最近一次成功值</p>
    <p v-else-if="snapshot.status === 'idle'" class="kpi-widget__status" role="status">尚未绑定或加载数据</p>
  </div>
</template>

<style scoped>
.kpi-widget { display: flex; width: 100%; height: 100%; box-sizing: border-box; flex-direction: column; justify-content: center; gap: 8px; padding: 18px; border: 1px solid var(--cf-border, #344054); border-radius: 8px; background: var(--cf-panel, #202a39); color: var(--cf-text, #e8edf7); font-family: system-ui, sans-serif; }
.kpi-widget__label { margin: 0; color: var(--cf-text-2, #a4afbf); font-size: 13px; }
.kpi-widget__value { overflow: hidden; font-size: clamp(22px, 7vw, 42px); line-height: 1.1; text-overflow: ellipsis; white-space: nowrap; }
.kpi-widget__status { margin: 0; color: var(--cf-text-2, #a4afbf); font-size: 10px; }
.kpi-widget__status--error, .kpi-widget__status--stale { color: #ffb45e; }
</style>
