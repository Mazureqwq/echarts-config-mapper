<script setup lang="ts">
import { computed, ref } from "vue";
import { componentRegistry } from "@/core/components/builtins";
import type { ComponentProp } from "@/core/components/types";
import type { ComponentItem, DatasetBinding } from "@/core/model/types";
import DatasetBindingEditor from "./DatasetBindingEditor.vue";

const props = defineProps<{ item: ComponentItem }>();
const emit = defineEmits<{
  (event: "update:props", value: Record<string, unknown>): void;
  (event: "update:data-binding", value: DatasetBinding | undefined): void;
}>();
const definition = computed(() => componentRegistry.get(props.item.componentId, props.item.componentVersion));
const error = ref("");

function valueText(prop: ComponentProp): string {
  return JSON.stringify(props.item.props[prop.key] ?? prop.defaultValue, null, 2);
}
function updateProp(prop: ComponentProp, event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
  let value: unknown;
  try {
    if (prop.type === "boolean") value = (target as HTMLInputElement).checked;
    else if (prop.type === "number") {
      const parsed = Number(target.value);
      if (!Number.isFinite(parsed)) throw new Error("请输入有效数字");
      value = parsed;
    } else if (prop.type === "select") {
      if (!prop.options?.includes(target.value)) throw new Error("请选择允许的选项");
      value = target.value;
    } else if (prop.type === "json") value = JSON.parse(target.value) as unknown;
    else value = target.value;
    error.value = "";
    emit("update:props", { ...props.item.props, [prop.key]: value });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "配置格式错误";
  }
}
</script>

<template>
  <div class="component-inspector">
    <template v-if="definition">
      <label v-for="prop in definition.props" :key="prop.key" class="component-inspector__field">
        {{ prop.label }}
        <input v-if="prop.type === 'string'" class="cf-control cf-control--compact" type="text" :value="String(item.props[prop.key] ?? prop.defaultValue ?? '')" @input="updateProp(prop, $event)" />
        <input v-else-if="prop.type === 'number'" class="cf-control cf-control--compact" type="number" :value="Number(item.props[prop.key] ?? prop.defaultValue ?? 0)" @input="updateProp(prop, $event)" />
        <input v-else-if="prop.type === 'boolean'" type="checkbox" :checked="Boolean(item.props[prop.key] ?? prop.defaultValue)" @change="updateProp(prop, $event)" />
        <select v-else-if="prop.type === 'select'" class="cf-control cf-control--compact" :value="String(item.props[prop.key] ?? prop.defaultValue ?? '')" @change="updateProp(prop, $event)">
          <option v-for="option in prop.options ?? []" :key="option" :value="option">{{ option }}</option>
        </select>
        <textarea v-else class="cf-control cf-control--compact component-inspector__json" spellcheck="false" :value="valueText(prop)" @change="updateProp(prop, $event)" />
      </label>
      <div v-if="error" class="component-inspector__error" role="alert">{{ error }}</div>
      <div class="component-inspector__section">数据绑定</div>
      <DatasetBindingEditor :model-value="item.dataBinding" @update:model-value="emit('update:data-binding', $event)" />
    </template>
    <p v-else class="component-inspector__missing">此组件版本未注册，配置保持只读。</p>
  </div>
</template>

<style scoped>
.component-inspector { display: flex; flex-direction: column; gap: 9px; }
.component-inspector__field { display: flex; flex-direction: column; gap: 4px; color: var(--cf-text-2); font-size: 10px; }
.component-inspector__field .cf-control { width: 100%; min-width: 0; }
.component-inspector__json { min-height: 110px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; }
.component-inspector__section { margin-top: 6px; border-top: 1px solid var(--cf-border); padding-top: 9px; color: var(--cf-text); font-size: 11px; font-weight: 600; }
.component-inspector__error { color: var(--cf-danger); font-size: 10px; }
.component-inspector__missing { color: var(--cf-text-2); font-size: 11px; }
</style>
