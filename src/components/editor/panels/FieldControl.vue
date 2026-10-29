<template>
  <!-- 布尔 -->
  <div v-if="meta.kind === 'boolean'" class="field field-inline">
    <label class="field-label">{{ meta.label }}</label>
    <ElSwitch :model-value="Boolean(value)" size="small" @update:model-value="(v: any) => emitChange(v)" />
  </div>

  <!-- 颜色 -->
  <div v-else-if="meta.kind === 'color'" class="field field-inline">
    <label class="field-label">{{ meta.label }}</label>
    <div class="color-cell">
      <ElColorPicker
        :model-value="colorValue"
        size="small"
        show-alpha
        :predefine="PRESETS"
        @update:model-value="(v: any) => emitChange(v ?? '')"
      />
      <input class="color-hex" :value="colorValue" @change="onHexInput" />
    </div>
  </div>

  <!-- 下拉 -->
  <div v-else-if="meta.kind === 'select'" class="field field-inline">
    <label class="field-label">{{ meta.label }}</label>
    <ElSelect
      :model-value="value as any"
      size="small"
      class="field-select"
      @update:model-value="(v: any) => emitChange(v)"
    >
      <ElOption v-for="opt in meta.options ?? []" :key="String(opt.value)" :label="opt.label" :value="opt.value" />
    </ElSelect>
  </div>

  <!-- 数字 -->
  <div v-else-if="meta.kind === 'number'" class="field field-inline">
    <label class="field-label">{{ meta.label }}</label>
    <ElInputNumber
      :model-value="numericValue"
      size="small"
      :min="meta.min"
      :max="meta.max"
      :step="meta.step ?? 1"
      controls-position="right"
      class="field-number"
      @update:model-value="(v: any) => emitChange(v ?? 0)"
    />
  </div>

  <!-- 字符串 -->
  <div v-else-if="meta.kind === 'string'" class="field field-stack">
    <label class="field-label">{{ meta.label }}</label>
    <ElInput
      :model-value="(value as string)"
      size="small"
      @update:model-value="(v: string) => emitChange(v)"
    />
  </div>

  <!-- 复合（textStyle / lineStyle ...） -->
  <div v-else-if="meta.children" class="field field-group">
    <button class="group-head" @click="opened = !opened">
      <Icon name="chevron" :size="12" :class="['chev', opened ? 'is-open' : '']" />
      <span>{{ meta.label }}</span>
      <span class="group-summary">{{ summary }}</span>
    </button>
    <div v-if="opened" class="group-body">
      <FieldControl
        v-for="(child, key) in meta.children"
        :key="key"
        :meta="child"
        :value="readChild(key)"
        @update="(v: unknown) => emitChild(String(key), v)"
      />
    </div>
  </div>

  <!-- 回退 -->
  <div v-else class="field field-stack">
    <label class="field-label">{{ meta.label }}</label>
    <ElInput :model-value="String(value ?? '')" size="small" @update:model-value="(v: string) => emitChange(v)" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElColorPicker, ElInput, ElInputNumber, ElOption, ElSelect, ElSwitch } from "element-plus";
import Icon from "@/components/ui/Icon.vue";
import type { FieldMeta } from "@/types/chart";
import { getByPath } from "@/utils/object";

const props = defineProps<{
  meta: FieldMeta;
  value: unknown;
}>();

const emit = defineEmits<{
  (e: "update", value: unknown): void;
  (e: "child-update", key: string, value: unknown): void;
}>();

const opened = ref(true);
const PRESETS = ["#6366F1", "#22D3EE", "#34D399", "#FBBF24", "#F472B6", "#E6EAF2", "transparent"];

const colorValue = computed(() => {
  const raw = props.value;
  if (typeof raw === "string" && raw) return raw;
  if (raw && typeof raw === "object") return (raw as any).color ?? "transparent";
  return "transparent";
});

const numericValue = computed(() => {
  const raw = props.value;
  const parsed = typeof raw === "string" ? Number.parseFloat(raw) : Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
});

const summary = computed(() => {
  const value = props.value;
  if (!value || typeof value !== "object") return value === undefined ? "未设置" : String(value);
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${String(v)}`);
  return entries.join(" · ") || "未设置";
});

function emitChange(next: unknown): void {
  emit("update", next);
}

function emitChild(key: string, next: unknown): void {
  emit("child-update", key, next);
}

function readChild(key: string): unknown {
  if (props.value && typeof props.value === "object") {
    return getByPath(props.value, key);
  }
  return undefined;
}

function onHexInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  emitChange(target.value);
}
</script>

<style scoped>
.field {
  display: flex;
  gap: 8px;
  padding: 4px 0;
}

.field-inline {
  align-items: center;
  justify-content: space-between;
}

.field-stack {
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 11.5px;
  color: var(--cf-text-muted);
  white-space: nowrap;
}

.field-number {
  width: 110px;
}

.field-select {
  width: 130px;
}

.color-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.color-hex {
  width: 86px;
  height: 22px;
  padding: 0 6px;
  border-radius: 4px;
  border: 1px solid var(--cf-border);
  background: var(--cf-bg-1);
  color: var(--cf-text-dim);
  font-family: var(--cf-font-mono);
  font-size: 10.5px;
}

.color-hex:focus {
  outline: none;
  border-color: var(--cf-accent);
}

.field-group {
  flex-direction: column;
  gap: 0;
  border-top: 1px solid var(--cf-border-soft);
  padding-top: 6px;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  background: transparent;
  border: 0;
  color: var(--cf-text-dim);
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
  text-align: left;
}

.group-head:hover {
  color: var(--cf-text);
}

.chev {
  transition: transform var(--cf-fast);
  color: var(--cf-text-faint);
}

.chev.is-open {
  transform: rotate(90deg);
}

.group-summary {
  margin-left: auto;
  font-family: var(--cf-font-mono);
  font-size: 9.5px;
  color: var(--cf-text-faint);
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-body {
  padding: 2px 0 4px 16px;
  border-left: 1px solid var(--cf-border-soft);
  margin-left: 4px;
}
</style>
