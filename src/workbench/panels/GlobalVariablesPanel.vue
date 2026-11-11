<script setup lang="ts">
import { computed, ref } from "vue";
import type { BlueprintGraph, BlueprintVariable, BlueprintVariableType } from "@/core/blueprint/types";
import { blueprintUsesVariable, isValidBlueprintVariableName } from "@/core/blueprint/variables";
import { useDocumentStore } from "@/stores/documentStore";

const emit = defineEmits<{ (event: "rename", oldName: string, newName: string): void }>();
const doc = useDocumentStore();
const screen = computed(() => doc.currentScreen);
const emptyGraph: BlueprintGraph = { nodes: [], edges: [], variables: [] };
const graph = computed(() => screen.value?.blueprint ?? emptyGraph);
const variables = computed(() => graph.value.variables);
const newName = ref("");
const suggestedName = computed(() => {
  let index = 1;
  while (variables.value.some((variable) => variable.name === `variable${index}`)) index += 1;
  return `variable${index}`;
});
const newType = ref<BlueprintVariableType>("string");
const error = ref("");
const typeLabels: Record<BlueprintVariableType, string> = { string: "文本", number: "数字", boolean: "布尔", object: "对象" };

function defaultValue(type: BlueprintVariableType): unknown {
  if (type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "object") return {};
  return "";
}

function saveVariables(nextVariables: BlueprintVariable[]): void {
  const current = screen.value;
  if (!current) return;
  doc.updateScreenBlueprint(current.id, { ...graph.value, variables: nextVariables });
}

function addVariable(): void {
  const name = newName.value.trim() || suggestedName.value;
  if (!screen.value) { error.value = "请先打开一个大屏。"; return; }
  if (variables.value.length >= 100) { error.value = "每个大屏最多声明 100 个全局变量。"; return; }
  if (!isValidBlueprintVariableName(name)) { error.value = "变量名需以字母或下划线开头，仅包含字母、数字和下划线（最多 64 位）。"; return; }
  if (variables.value.some((variable) => variable.name === name)) { error.value = "变量名已存在。"; return; }
  saveVariables([...variables.value, { name, type: newType.value, initialValue: defaultValue(newType.value) }]);
  newName.value = "";
  error.value = "";
}

function renameVariable(oldName: string, event: Event): void {
  const nextName = (event.target as HTMLInputElement).value.trim();
  if (!screen.value || nextName === oldName) return;
  if (!isValidBlueprintVariableName(nextName)) { error.value = "变量名需以字母或下划线开头，仅包含字母、数字和下划线（最多 64 位）。"; return; }
  if (variables.value.some((variable) => variable.name === nextName)) { error.value = "变量名已存在。"; return; }
  if (!doc.renameScreenBlueprintVariable(screen.value.id, oldName, nextName)) { error.value = "变量重命名失败，请检查蓝图配置。"; return; }
  emit("rename", oldName, nextName);
  error.value = "";
}

function isDatasetBound(name: string): boolean {
  return Boolean(screen.value?.items.some((item) => "dataBinding" in item && item.dataBinding?.filterBy?.globalVariable === name));
}

function updateType(name: string, type: BlueprintVariableType): void {
  if (type === "object" && isDatasetBound(name)) { error.value = "对象变量不能用于数据绑定过滤，请先解除过滤绑定。"; return; }
  saveVariables(variables.value.map((variable) => variable.name === name
    ? { ...variable, type, initialValue: defaultValue(type) }
    : variable));
  error.value = "";
}

function valueText(variable: BlueprintVariable): string {
  return variable.type === "object" ? JSON.stringify(variable.initialValue, null, 2) ?? "null" : String(variable.initialValue ?? "");
}

function safeJson(value: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 10000 && value.every((entry) => safeJson(entry, depth + 1));
  if (typeof value !== "object") return false;
  const entries = Object.entries(value);
  return entries.length <= 10000 && entries.every(([key, entry]) => !["__proto__", "prototype", "constructor"].includes(key) && safeJson(entry, depth + 1));
}

function updateInitialValue(variable: BlueprintVariable, event: Event): void {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement;
  let value: unknown;
  if (variable.type === "string") value = target.value;
  else if (variable.type === "number") {
    value = Number(target.value);
    if (!Number.isFinite(value)) { error.value = `${variable.name} 需要一个有效数字。`; return; }
  } else if (variable.type === "boolean") value = (target as HTMLInputElement).checked;
  else {
    try { value = JSON.parse(target.value) as unknown; }
    catch { error.value = `${variable.name} 不是有效的 JSON。`; return; }
    if (!safeJson(value) || (value !== null && typeof value !== "object")) { error.value = `${variable.name} 需要安全的 JSON 对象或数组。`; return; }
  }
  saveVariables(variables.value.map((entry) => entry.name === variable.name ? { ...entry, initialValue: value } : entry));
  error.value = "";
}

function isReferenced(name: string): boolean {
  return blueprintUsesVariable(graph.value, name)
    || Boolean(screen.value?.items.some((item) => "dataBinding" in item && item.dataBinding?.filterBy?.globalVariable === name));
}

function removeVariable(name: string): void {
  if (isReferenced(name)) { error.value = `变量 ${name} 仍被蓝图或数据绑定引用，请先解除引用。`; return; }
  saveVariables(variables.value.filter((variable) => variable.name !== name));
  error.value = "";
}
</script>

<template>
  <div class="global-variables">
    <p class="global-variables__hint">变量按大屏独立保存，可用于蓝图交互和数据绑定过滤。重命名会同步更新蓝图与数据绑定引用；类型变更会重置初始值。</p>
    <form class="global-variables__create" @submit.prevent="addVariable">
      <label class="global-variables__field">
        变量名
        <input v-model="newName" class="cf-control cf-control--compact" type="text" maxlength="64" :placeholder="suggestedName" />
      </label>
      <label class="global-variables__field">
        类型
        <select v-model="newType" class="cf-control cf-control--compact">
          <option value="string">文本</option><option value="number">数字</option><option value="boolean">布尔</option><option value="object">对象</option>
        </select>
      </label>
      <button class="cf-button cf-button--small" type="submit" :disabled="!screen">添加变量</button>
    </form>
    <div v-if="!screen" class="global-variables__empty">当前没有打开的大屏。</div>
    <div v-else-if="!variables.length" class="global-variables__empty">还没有全局变量。添加一个变量即可在数据绑定和蓝图中使用。</div>
    <section v-for="variable in variables" :key="variable.name" class="global-variables__item">
      <div class="global-variables__item-head">
        <input class="cf-control cf-control--compact global-variables__name" :value="variable.name" :aria-label="`变量名称 ${variable.name}`" maxlength="64" @change="renameVariable(variable.name, $event)" />
        <button type="button" class="global-variables__remove" :disabled="isReferenced(variable.name)" :title="isReferenced(variable.name) ? '此变量仍被蓝图或数据绑定引用' : '删除变量'" :aria-label="`删除变量 ${variable.name}`" @click="removeVariable(variable.name)">删除</button>
      </div>
      <label class="global-variables__field">类型
        <select class="cf-control cf-control--compact" :value="variable.type" @change="updateType(variable.name, ($event.target as HTMLSelectElement).value as BlueprintVariableType)">
          <option v-for="(label, type) in typeLabels" :key="type" :value="type" :disabled="type === 'object' && isDatasetBound(variable.name)">{{ label }}</option>
        </select>
      </label>
      <label v-if="variable.type === 'boolean'" class="global-variables__boolean">
        <input type="checkbox" :checked="Boolean(variable.initialValue)" @change="updateInitialValue(variable, $event)" /> 初始值
      </label>
      <label v-else class="global-variables__field">初始值
        <textarea v-if="variable.type === 'object'" class="cf-control cf-control--compact global-variables__json" spellcheck="false" :value="valueText(variable)" @change="updateInitialValue(variable, $event)" />
        <input v-else class="cf-control cf-control--compact" :type="variable.type === 'number' ? 'number' : 'text'" :value="valueText(variable)" @change="updateInitialValue(variable, $event)" />
      </label>
    </section>
    <p v-if="error" class="global-variables__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.global-variables { display: flex; flex-direction: column; gap: 10px; padding: 10px; color: var(--cf-text); }
.global-variables__hint, .global-variables__empty { margin: 0; color: var(--cf-text-2); font-size: 10px; line-height: 1.5; }
.global-variables__create, .global-variables__item { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--cf-border); border-radius: 6px; padding: 9px; background: color-mix(in srgb, var(--cf-panel) 92%, #000 8%); }
.global-variables__field { display: flex; flex-direction: column; gap: 4px; color: var(--cf-text-2); font-size: 10px; }
.global-variables__field .cf-control { width: 100%; min-width: 0; }
.global-variables__item-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; }
.global-variables__name { flex: 1; min-width: 0; font-weight: 600; }
.global-variables__remove { border: 0; background: transparent; color: var(--cf-danger); cursor: pointer; font: inherit; font-size: 10px; }
.global-variables__remove:disabled { opacity: .45; cursor: not-allowed; }
.global-variables__boolean { display: flex; align-items: center; gap: 7px; color: var(--cf-text-2); font-size: 10px; }
.global-variables__json { min-height: 80px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; }
.global-variables__error { margin: 0; color: var(--cf-danger); font-size: 10px; line-height: 1.45; }
</style>
