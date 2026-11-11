<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import type { ChartType, DatasetBinding, DatasetSnapshot, GeoFieldMapping } from "@/core/model/types";
import { runPipeline } from "@/core/live/pipeline";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDocumentStore } from "@/stores/documentStore";

const props = withDefaults(defineProps<{ modelValue?: DatasetBinding; showFields?: boolean; chartType?: ChartType; mapScene?: boolean }>(), { showFields: false, mapScene: false });
const emit = defineEmits<{ (event: "update:modelValue", value: DatasetBinding | undefined): void }>();
const ws = useWorkspaceStore();
const doc = useDocumentStore();
const binding = computed(() => props.modelValue);
const fieldListId = `cf-dataset-fields-${useId()}`;
const datasetRuntime = ws.getDatasetRuntime();
const datasetSnapshot = ref<DatasetSnapshot>({ status: "idle", rows: [] });
let stopDataset: (() => void) | null = null;
let previewSeq = 0;
const selectedDataset = computed(() => ws.workspace.datasets.find((dataset) => dataset.id === binding.value?.datasetId));
const staticRows = computed(() => {
  const dataset = selectedDataset.value;
  if (!dataset || dataset.source.kind !== "static") return [];
  const result = runPipeline(dataset.source.data, dataset.pipeline);
  return result.ok ? result.rows : [];
});
const fieldNames = computed(() => {
  const dataset = selectedDataset.value;
  const rows = dataset?.source.kind === "static" ? staticRows.value : datasetSnapshot.value.rows;
  return [...new Set(rows.slice(0, 100).flatMap((row) => Object.keys(row)))].slice(0, 200);
});
const variables = computed(() => doc.currentScreen?.blueprint?.variables ?? []);
const filterVariables = computed(() => variables.value.filter((variable) => variable.type !== "object"));
const hasSelectedFilterVariable = computed(() => filterVariables.value.some((variable) => variable.name === binding.value?.filterBy?.globalVariable));
const filterFieldDraft = ref("");
const filterVariableDraft = ref("");
watch(
  () => binding.value?.datasetId,
  () => {
    filterFieldDraft.value = binding.value?.filterBy?.field ?? "";
    filterVariableDraft.value = binding.value?.filterBy?.globalVariable ?? "";
  },
  { immediate: true },
);

type GeoFieldKey = keyof GeoFieldMapping;
const GEO_FIELDS: Partial<Record<ChartType, readonly { key: GeoFieldKey; label: string }[]>> = {
  geoScatter: [
    { key: "longitude", label: "经度" }, { key: "latitude", label: "纬度" },
    { key: "name", label: "名称（可选）" }, { key: "value", label: "数值（可选）" },
  ],
  geoHeatmap: [
    { key: "longitude", label: "经度" }, { key: "latitude", label: "纬度" }, { key: "value", label: "热力值" },
  ],
  geoFlow: [
    { key: "originLongitude", label: "起点经度" }, { key: "originLatitude", label: "起点纬度" },
    { key: "destinationLongitude", label: "终点经度" }, { key: "destinationLatitude", label: "终点纬度" },
    { key: "name", label: "路线名称（可选）" }, { key: "value", label: "数值（可选）" },
  ],
};
const MAP_SCENE_GEO_FIELDS: readonly { key: GeoFieldKey; label: string }[] = [
  { key: "longitude", label: "经度" }, { key: "latitude", label: "纬度" },
  { key: "name", label: "名称（可选）" }, { key: "value", label: "数值（可选）" },
  { key: "originLongitude", label: "起点经度" }, { key: "originLatitude", label: "起点纬度" },
  { key: "destinationLongitude", label: "终点经度" }, { key: "destinationLatitude", label: "终点纬度" },
];
const geoFields = computed(() => props.mapScene ? MAP_SCENE_GEO_FIELDS : props.chartType ? GEO_FIELDS[props.chartType] ?? [] : []);

watch(
  () => {
    const datasetId = binding.value?.datasetId ?? "";
    return [datasetId, !!datasetId && ws.workspace.datasets.some((dataset) => dataset.id === datasetId)] as const;
  },
  ([datasetId, exists]) => {
    stopDataset?.();
    stopDataset = null;
    datasetSnapshot.value = { status: "idle", rows: [] };
    if (!datasetId) return;
    if (!exists) {
      datasetSnapshot.value = { status: "error", rows: [], error: "绑定的数据集不存在" };
      return;
    }
    try {
      stopDataset = datasetRuntime.subscribe(datasetId, `binding-editor-${fieldListId}-${++previewSeq}`, (snapshot) => {
        datasetSnapshot.value = snapshot;
      });
    } catch (cause) {
      datasetSnapshot.value = { status: "error", rows: [], error: cause instanceof Error ? cause.message : String(cause) };
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  stopDataset?.();
  stopDataset = null;
});

function update(patch: Partial<DatasetBinding>): void {
  const datasetId = patch.datasetId ?? binding.value?.datasetId ?? "";
  if (!datasetId) { emit("update:modelValue", undefined); return; }
  const next: DatasetBinding = { ...(binding.value ?? { datasetId }), ...patch, datasetId };
  if (next.fields && !Object.values(next.fields).some(Boolean)) delete next.fields;
  if (next.filterBy && !next.filterBy.field.trim() && !next.filterBy.globalVariable.trim()) delete next.filterBy;
  emit("update:modelValue", next);
}
function updateField(key: "category" | "value" | "seriesField", value: string): void {
  update({ fields: { ...(binding.value?.fields ?? {}), [key]: value.trim() || undefined } });
}
function updateGeoField(key: GeoFieldKey, value: string): void {
  const geo: GeoFieldMapping = { ...(binding.value?.fields?.geo ?? {}) };
  const normalized = value.trim();
  if (normalized) geo[key] = normalized;
  else delete geo[key];
  const fields = { ...(binding.value?.fields ?? {}) };
  if (Object.values(geo).some(Boolean)) fields.geo = geo;
  else delete fields.geo;
  update({ fields });
}
function updateFilter(key: "field" | "globalVariable", value: string): void {
  if (key === "field") filterFieldDraft.value = value.trim();
  else filterVariableDraft.value = value.trim();
  if (filterFieldDraft.value && filterVariableDraft.value) {
    update({ filterBy: { field: filterFieldDraft.value, globalVariable: filterVariableDraft.value } });
  } else if (binding.value?.filterBy) {
    update({ filterBy: undefined });
  }
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
        <template v-if="mapScene">
          <div class="dataset-binding-editor__heading">区域字段映射</div>
          <label class="dataset-binding-editor__field">区域名称字段<input class="cf-control cf-control--compact" type="text" :list="fieldListId" :value="binding.fields?.category ?? ''" placeholder="province" @input="updateField('category', ($event.target as HTMLInputElement).value)" /></label>
          <label class="dataset-binding-editor__field">区域数值字段<input class="cf-control cf-control--compact" type="text" :list="fieldListId" :value="binding.fields?.value ?? ''" placeholder="value" @input="updateField('value', ($event.target as HTMLInputElement).value)" /></label>
          <div class="dataset-binding-editor__heading">地理图层字段映射（按图层类型使用）</div>
          <label v-for="field in geoFields" :key="field.key" class="dataset-binding-editor__field">
            {{ field.label }}
            <input class="cf-control cf-control--compact" type="text" :list="fieldListId" :value="binding.fields?.geo?.[field.key] ?? ''" :placeholder="field.key" @input="updateGeoField(field.key, ($event.target as HTMLInputElement).value)" />
          </label>
        </template>
        <template v-else-if="geoFields.length">
          <div class="dataset-binding-editor__heading">地图字段映射</div>
          <label v-for="field in geoFields" :key="field.key" class="dataset-binding-editor__field">
            {{ field.label }}
            <input class="cf-control cf-control--compact" type="text" :list="fieldListId" :value="binding.fields?.geo?.[field.key] ?? ''" :placeholder="field.key" @input="updateGeoField(field.key, ($event.target as HTMLInputElement).value)" />
          </label>
        </template>
        <template v-else>
          <div class="dataset-binding-editor__heading">图表字段映射</div>
          <label class="dataset-binding-editor__field">{{ chartType === 'map' ? '区域名称字段' : '分类 / X 字段' }}<input class="cf-control cf-control--compact" type="text" :list="fieldListId" :value="binding.fields?.category ?? ''" placeholder="month" @input="updateField('category', ($event.target as HTMLInputElement).value)" /></label>
          <label class="dataset-binding-editor__field">{{ chartType === 'map' ? '区域数值字段' : '数值 / Y 字段' }}<input class="cf-control cf-control--compact" type="text" :list="fieldListId" :value="binding.fields?.value ?? ''" placeholder="sales" @input="updateField('value', ($event.target as HTMLInputElement).value)" /></label>
          <label v-if="chartType !== 'map'" class="dataset-binding-editor__field">系列字段（可选）<input class="cf-control cf-control--compact" type="text" :list="fieldListId" :value="binding.fields?.seriesField ?? ''" placeholder="region" @input="updateField('seriesField', ($event.target as HTMLInputElement).value)" /></label>
        </template>
      </template>
      <p v-if="datasetSnapshot.status === 'error'" class="dataset-binding-editor__hint" role="status">字段预览失败：{{ datasetSnapshot.error || '数据集不可用' }}。仍可手动输入字段名。</p>
      <p v-else-if="datasetSnapshot.status === 'loading' && !fieldNames.length" class="dataset-binding-editor__hint" role="status">正在加载数据集字段…</p>
      <p v-else-if="fieldNames.length" class="dataset-binding-editor__hint">已发现 {{ fieldNames.length }} 个字段；输入时可从建议中选择，也可手动填写。</p>
      <p v-else class="dataset-binding-editor__hint">暂无可建议字段；仍可手动输入字段名。</p>
      <datalist :id="fieldListId"><option v-for="fieldName in fieldNames" :key="fieldName" :value="fieldName" /></datalist>
      <div class="dataset-binding-editor__heading">变量过滤（可选）</div>
      <label class="dataset-binding-editor__field">匹配字段<input class="cf-control cf-control--compact" type="text" :list="fieldListId" :value="filterFieldDraft" placeholder="city" @input="updateFilter('field', ($event.target as HTMLInputElement).value)" /></label>
      <label class="dataset-binding-editor__field">全局变量
        <select class="cf-control cf-control--compact" :value="filterVariableDraft" @change="updateFilter('globalVariable', ($event.target as HTMLSelectElement).value)">
          <option value="">不使用变量</option>
          <option v-if="binding.filterBy?.globalVariable && !hasSelectedFilterVariable" :value="binding.filterBy.globalVariable" disabled>未定义或不支持的变量：{{ binding.filterBy.globalVariable }}</option>
          <option v-for="variable in filterVariables" :key="variable.name" :value="variable.name">{{ variable.name }}（{{ variable.type === 'string' ? '文本' : variable.type === 'number' ? '数字' : '布尔' }}）</option>
        </select>
      </label>
      <p v-if="!filterVariables.length" class="dataset-binding-editor__hint">请先在左侧“变量”面板声明文本、数字或布尔变量。</p>
      <p class="dataset-binding-editor__hint">只支持文本、数字和布尔变量的相等过滤；过滤仅使用声明式字段，不执行表达式或用户代码。</p>
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
