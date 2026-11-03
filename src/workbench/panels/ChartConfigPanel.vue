<script setup lang="ts">
import { computed } from "vue";
import type { ChartItem } from "@/core/model/types";
import { chartRegistry } from "@/core/chart/registry";
import type { FieldConfig } from "@/core/chart/registry";
import { useDocumentStore } from "@/stores/documentStore";

const props = defineProps<{ item: ChartItem }>();
const doc = useDocumentStore();

const descriptor = computed(() => chartRegistry[props.item.spec.type]);

function getPath(path: string): unknown {
  let node: unknown = props.item.spec.option;
  for (const key of path.split(".")) {
    if (node === null || node === undefined || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

function displayValue(field: FieldConfig): unknown {
  const v = getPath(field.path);
  if (v !== undefined) return v;
  if (field.control === "switch") return false;
  if (field.control === "number") return "";
  return "";
}

function onInput(field: FieldConfig, ev: Event): void {
  const target = ev.target as HTMLInputElement | HTMLSelectElement;
  let value: unknown;
  if (field.control === "switch") {
    value = (target as HTMLInputElement).checked;
  } else if (field.control === "number") {
    const n = Number(target.value);
    if (!Number.isFinite(n)) return;
    value = n;
  } else {
    value = target.value;
  }
  doc.applyChartConfig(props.item.id, field.path, value);
}
</script>

<template>
  <div class="chart-config">
    <div v-for="group in descriptor.configGroups" :key="group.title" class="chart-config__group">
      <div class="chart-config__group-title">{{ group.title }}</div>
      <label v-for="field in group.fields" :key="field.path" class="chart-config__row">
        <span>{{ field.label }}</span>
        <input
          v-if="field.control === 'text' || field.control === 'color'"
          :type="field.control === 'color' ? 'color' : 'text'"
          :value="displayValue(field) as string"
          @change="onInput(field, $event)"
        />
        <input
          v-else-if="field.control === 'number'"
          type="number"
          :value="displayValue(field) as number"
          @change="onInput(field, $event)"
        />
        <select v-else-if="field.control === 'select'" :value="displayValue(field) as string" @change="onInput(field, $event)">
          <option v-for="opt in field.options" :key="String(opt.value)" :value="opt.value">{{ opt.label }}</option>
        </select>
        <input
          v-else
          type="checkbox"
          :checked="Boolean(displayValue(field))"
          @change="onInput(field, $event)"
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
.chart-config__group {
  margin-bottom: 14px;
}
.chart-config__group-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--cf-text);
  margin-bottom: 8px;
}
.chart-config__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--cf-text-2);
  margin-bottom: 8px;
}
.chart-config__row input,
.chart-config__row select {
  width: 150px;
  padding: 4px 6px;
  border: 1px solid var(--cf-border);
  border-radius: 4px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 12px;
}
.chart-config__row input[type="color"] {
  padding: 2px;
  height: 28px;
}
.chart-config__row input[type="checkbox"] {
  width: auto;
}
</style>
