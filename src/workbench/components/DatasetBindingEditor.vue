<script setup lang="ts">
import { computed } from "vue";
import type { DatasetBinding } from "@/core/model/types";
import { useWorkspaceStore } from "@/stores/workspaceStore";

const props = withDefaults(defineProps<{ modelValue?: DatasetBinding; showFields?: boolean }>(), { showFields: false });
const emit = defineEmits<{ (event: "update:modelValue", value: DatasetBinding | undefined): void }>();
const ws = useWorkspaceStore();
const binding = computed(() => props.modelValue);

function update(patch: Partial<DatasetBinding>): void {
  const datasetId = patch.datasetId ?? binding.value?.datasetId ?? "";
  if (!datasetId) { emit("update:modelValue", undefined); return; }
  const next: DatasetBinding = { ...(binding.value ?? { datasetId }), ...patch, datasetId };
  if (next.fields && !Object.values(next.fields).some(Boolean)) delete next.fields;
  if (next.filterBy && (!next.filterBy.field.trim() || !next.filterBy.globalVariable.trim())) delete next.filterBy;
  emit("update:modelValue", next);
}
function updateField(key: "category" | "value" | "seriesField", value: string): void {
  update({ fields: { ...(binding.value?.fields ?? {}), [key]: value.trim() || undefined } });
}
function updateFilter(key: "field" | "globalVariable", value: string): void {
  update({ filterBy: { field: binding.value?.filterBy?.field ?? "", globalVariable: binding.value?.filterBy?.globalVariable ?? "", [key]: value.trim() } });
}
</script>

<template>
  <div class="dataset-binding-editor">
    <label class="dataset-binding-editor__field">
      工作区数据集
      <select class="cf-control cf-control--compact" :value="binding?.datasetId ?? ''" @change="update({ datasetId: ($event.target as HTMLSelectElement).value })">
        <option value="">不绑定</option>
        <option v-for="dataset in ws.workspace.datasets" :key="dataset.id" :value="dataset.id">{{ dataset.name }}（{{ dataset.source.kind === 'static' ? '静态' : 'HTTP' }}）</option>
      </select>
    </label>
    <template v-if="binding?.datasetId">
      <template v-if="showFields">
        <div class="dataset-binding-editor__heading">图表字段映射</div>
        <label class="dataset-binding-editor__field">分类 / X 字段<input class="cf-control cf-control--compact" type="text" :value="binding.fields?.category ?? ''" placeholder="month" @input="updateField('category', ($event.target as HTMLInputElement).value)" /></label>
        <label class="dataset-binding-editor__field">数值 / Y 字段<input class="cf-control cf-control--compact" type="text" :value="binding.fields?.value ?? ''" placeholder="sales" @input="updateField('value', ($event.target as HTMLInputElement).value)" /></label>
        <label class="dataset-binding-editor__field">系列字段（可选）<input class="cf-control cf-control--compact" type="text" :value="binding.fields?.seriesField ?? ''" placeholder="region" @input="updateField('seriesField', ($event.target as HTMLInputElement).value)" /></label>
      </template>
      <div class="dataset-binding-editor__heading">变量过滤（可选）</div>
      <label class="dataset-binding-editor__field">匹配字段<input class="cf-control cf-control--compact" type="text" :value="binding.filterBy?.field ?? ''" placeholder="city" @input="updateFilter('field', ($event.target as HTMLInputElement).value)" /></label>
      <label class="dataset-binding-editor__field">全局变量名<input class="cf-control cf-control--compact" type="text" :value="binding.filterBy?.globalVariable ?? ''" placeholder="selectedCity" @input="updateFilter('globalVariable', ($event.target as HTMLInputElement).value)" /></label>
      <p class="dataset-binding-editor__hint">过滤只使用声明式字段与全局变量相等比较，不执行表达式。</p>
    </template>
  </div>
</template>

<style scoped>
.dataset-binding-editor { display: flex; flex-direction: column; gap: 8px; }
.dataset-binding-editor__field { display: flex; flex-direction: column; gap: 4px; color: var(--cf-text-2); font-size: 10px; }
.dataset-binding-editor__field .cf-control { width: 100%; min-width: 0; }
.dataset-binding-editor__heading { border-top: 1px solid var(--cf-border); padding-top: 7px; color: var(--cf-text); font-size: 10px; font-weight: 600; }
.dataset-binding-editor__hint { margin: 0; color: var(--cf-text-2); font-size: 9px; line-height: 1.45; }
</style>
