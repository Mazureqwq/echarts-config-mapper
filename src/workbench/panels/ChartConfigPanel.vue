<script setup lang="ts">
import { computed, ref } from "vue";
import type { ChartItem } from "@/core/model/types";
import { chartRegistry } from "@/core/chart/registry";
import type { FieldConfig } from "@/core/chart/registry";

const props = defineProps<{ item: ChartItem }>();
const emit = defineEmits<{ (e: "changePath", path: string, value: unknown): void }>();

const descriptor = computed(() => chartRegistry[props.item.spec.type]);
const query = ref("");
const filteredGroups = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  return descriptor.value.configGroups
    .map((group) => {
      const matchesGroup = !!needle && group.title.toLocaleLowerCase().includes(needle);
      const fields = !needle || matchesGroup
        ? group.fields
        : group.fields.filter((field) => `${field.label} ${field.path}`.toLocaleLowerCase().includes(needle));
      return { ...group, fields };
    })
    .filter((group) => group.fields.length > 0);
});

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
  emit("changePath", field.path, value);
}
</script>

<template>
  <div class="chart-config">
    <div class="chart-config__search">
      <input
        v-model="query"
        class="cf-control cf-control--compact"
        type="search"
        aria-label="搜索图表配置项"
        placeholder="搜索配置项名称或字段…"
      />
      <button v-if="query" type="button" aria-label="清除配置项搜索" @click="query = ''">清除</button>
    </div>
    <div v-for="group in filteredGroups" :key="group.title" class="chart-config__group">
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
    <div v-if="filteredGroups.length === 0" class="chart-config__empty">没有匹配的配置项</div>
  </div>
</template>

<style scoped>
.chart-config__search {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}
.chart-config__search input {
  flex: 1;
  min-width: 0;
}
.chart-config__search button {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: var(--cf-primary);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}
.chart-config__empty {
  padding: 16px 8px;
  color: var(--cf-text-2);
  text-align: center;
  font-size: 12px;
}
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
