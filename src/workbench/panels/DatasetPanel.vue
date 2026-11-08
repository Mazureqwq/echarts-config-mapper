<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { DatasetRuntime } from "@/core/data/datasetRuntime";
import { formatPairs, parsePairs } from "@/core/live/apiSettings";
import { validateLiveSource } from "@/core/live/liveSource";
import type { DatasetDefinition, DatasetPipeline, DatasetSnapshot, HttpMethodName } from "@/core/model/types";
import ConfirmDialog from "@/shared/ui/ConfirmDialog.vue";
import Icon from "@/shared/ui/Icon.vue";

const ws = useWorkspaceStore();
const selectedId = ref(ws.workspace.datasets[0]?.id ?? "");
const isCreating = ref(false);
const sourceKind = ref<"static" | "http">("static");
const name = ref("");
const staticJson = ref("[]");
const endpoint = ref("");
const method = ref<HttpMethodName>("GET");
const body = ref("");
const intervalSec = ref(30);
const dataPath = ref("");
const headersText = ref("");
const queryText = ref("");
const parametersText = ref("");
const filterText = ref("[]");
const selectText = ref("");
const sortField = ref("");
const sortDesc = ref(false);
const limitText = ref("");
const error = ref("");
const deleteOpen = ref(false);
const preview = ref<DatasetSnapshot>({ status: "idle", rows: [] });

const selectedDataset = computed(() => ws.workspace.datasets.find((dataset) => dataset.id === selectedId.value) ?? null);
const columns = computed(() => {
  const first = preview.value.rows[0];
  return first ? Object.keys(first).slice(0, 5) : [];
});
let runtime = new DatasetRuntime(ws.workspace.datasets, { resolveApi: () => ws.settings.api });
let stopPreview: (() => void) | null = null;
let consumerSeq = 0;

function stopSelectedPreview(): void {
  stopPreview?.();
  stopPreview = null;
}

function subscribeSelected(): void {
  stopSelectedPreview();
  preview.value = { status: "idle", rows: [] };
  if (isCreating.value || !selectedDataset.value) return;
  const currentRuntime = runtime;
  const consumerId = `dataset-panel-${++consumerSeq}`;
  stopPreview = currentRuntime.subscribe(selectedDataset.value.id, consumerId, (snapshot) => {
    preview.value = snapshot;
  });
}

function rebuildRuntime(): void {
  stopSelectedPreview();
  runtime.dispose();
  runtime = new DatasetRuntime(ws.workspace.datasets, { resolveApi: () => ws.settings.api });
  subscribeSelected();
}

function loadDraft(dataset: DatasetDefinition | null): void {
  error.value = "";
  if (!dataset) return;
  name.value = dataset.name;
  sourceKind.value = dataset.source.kind;
  parametersText.value = formatPairs(dataset.parameters);
  filterText.value = JSON.stringify(dataset.pipeline?.filter ?? [], null, 2);
  selectText.value = dataset.pipeline?.select?.join(", ") ?? "";
  sortField.value = dataset.pipeline?.sort?.field ?? "";
  sortDesc.value = dataset.pipeline?.sort?.desc === true;
  limitText.value = dataset.pipeline?.limit ? String(dataset.pipeline.limit) : "";
  if (dataset.source.kind === "static") {
    staticJson.value = JSON.stringify(dataset.source.data, null, 2);
    endpoint.value = "";
    method.value = "GET";
    body.value = "";
    intervalSec.value = ws.settings.api?.defaultIntervalSec ?? 30;
    dataPath.value = "";
    headersText.value = "";
    queryText.value = "";
  } else {
    const live = dataset.source.live;
    endpoint.value = live.url || live.path || "";
    method.value = live.method ?? "GET";
    body.value = live.body ?? "";
    intervalSec.value = live.intervalSec;
    dataPath.value = live.dataPath ?? "";
    headersText.value = formatPairs(live.headers);
    queryText.value = formatPairs(live.query);
  }
}

watch(
  [selectedId, isCreating],
  ([id, creating]) => {
    if (creating) {
      stopSelectedPreview();
      preview.value = { status: "idle", rows: [] };
      return;
    }
    loadDraft(ws.workspace.datasets.find((dataset) => dataset.id === id) ?? null);
    subscribeSelected();
  },
  { immediate: true }
);

watch(
  () => JSON.stringify({ datasets: ws.workspace.datasets, api: ws.settings.api }),
  () => rebuildRuntime(),
  { deep: true }
);

function beginCreate(kind: "static" | "http"): void {
  isCreating.value = true;
  selectedId.value = "";
  sourceKind.value = kind;
  name.value = kind === "static" ? "新建静态数据集" : "新建 HTTP 数据集";
  staticJson.value = "[\n  {\n    \"name\": \"示例\", \"value\": 0\n  }\n]";
  endpoint.value = "";
  method.value = "GET";
  body.value = "";
  intervalSec.value = ws.settings.api?.defaultIntervalSec ?? 30;
  dataPath.value = "";
  headersText.value = "";
  queryText.value = "";
  parametersText.value = "";
  filterText.value = "[]";
  selectText.value = "";
  sortField.value = "";
  sortDesc.value = false;
  limitText.value = "";
  error.value = "";
}

function cancelCreate(): void {
  isCreating.value = false;
  selectedId.value = ws.workspace.datasets[0]?.id ?? "";
  if (!selectedId.value) {
    name.value = "";
    preview.value = { status: "idle", rows: [] };
  }
}

function buildPipeline(): DatasetPipeline | undefined {
  const filterRaw = JSON.parse(filterText.value || "[]") as unknown;
  if (!Array.isArray(filterRaw)) throw new Error("过滤条件必须是 JSON 数组");
  const supportedOps = new Set(["eq", "ne", "gt", "gte", "lt", "lte", "contains", "in", "notEmpty"]);
  const filter = filterRaw.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("每条过滤条件都必须是对象");
    const row = entry as Record<string, unknown>;
    if (typeof row.field !== "string" || !row.field.trim() || typeof row.op !== "string" || !supportedOps.has(row.op)) {
      throw new Error("过滤条件需要有效字段和支持的运算符");
    }
    return {
      field: row.field.trim(),
      op: row.op as NonNullable<DatasetPipeline["filter"]>[number]["op"],
      value: row.value === null || row.value === undefined ? "" : String(row.value),
    };
  });
  const select = selectText.value.split(",").map((field) => field.trim()).filter(Boolean);
  const pipeline: DatasetPipeline = {};
  if (filter.length) pipeline.filter = filter;
  if (select.length) pipeline.select = select;
  if (sortField.value.trim()) pipeline.sort = { field: sortField.value.trim(), ...(sortDesc.value ? { desc: true } : {}) };
  const limit = Number(limitText.value);
  if (limitText.value.trim()) {
    if (!Number.isFinite(limit) || limit < 1) throw new Error("行数上限必须是大于 0 的整数");
    pipeline.limit = Math.min(5000, Math.round(limit));
  }
  return Object.keys(pipeline).length ? pipeline : undefined;
}

function buildSource(): DatasetDefinition["source"] {
  if (sourceKind.value === "static") {
    return { kind: "static", data: JSON.parse(staticJson.value || "[]") as unknown };
  }
  const validation = validateLiveSource({
    url: endpoint.value,
    intervalSec: intervalSec.value,
    dataPath: dataPath.value,
  });
  if (!validation.ok) throw new Error(validation.message);
  const absolute = /^https?:\/\//i.test(endpoint.value.trim());
  const headers = parsePairs(headersText.value);
  const query = parsePairs(queryText.value);
  if (method.value === "POST" && body.value.trim()) {
    try { JSON.parse(body.value); } catch { throw new Error("POST 请求体必须是有效 JSON"); }
  }
  return {
    kind: "http",
    live: {
      url: absolute ? endpoint.value.trim() : "",
      ...(!absolute ? { path: endpoint.value.trim() } : {}),
      intervalSec: validation.source.intervalSec,
      ...(validation.source.dataPath ? { dataPath: validation.source.dataPath } : {}),
      method: method.value,
      ...(method.value === "POST" && body.value.trim() ? { body: body.value } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
      ...(Object.keys(query).length ? { query } : {}),
    },
  };
}

function saveDataset(): void {
  try {
    const cleanedName = name.value.trim();
    if (!cleanedName) throw new Error("请填写数据集名称");
    const source = buildSource();
    const pipeline = buildPipeline();
    const parameters = parsePairs(parametersText.value);
    if (isCreating.value) {
      const id = ws.createDataset(cleanedName, source);
      ws.updateDataset(id, { parameters, pipeline: pipeline ?? null });
      // Refresh the runtime before the selection watcher subscribes to the new ID.
      rebuildRuntime();
      isCreating.value = false;
      selectedId.value = id;
    } else if (selectedDataset.value) {
      ws.updateDataset(selectedDataset.value.id, { name: cleanedName, source, parameters, pipeline: pipeline ?? null });
    }
    error.value = "";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

function refreshPreview(): void {
  if (!selectedDataset.value) return;
  void runtime.refresh(selectedDataset.value.id).catch((cause: unknown) => {
    error.value = cause instanceof Error ? cause.message : String(cause);
  });
}

function deleteSelected(): void {
  if (!selectedDataset.value) return;
  ws.removeDataset(selectedDataset.value.id);
  deleteOpen.value = false;
  selectedId.value = ws.workspace.datasets[0]?.id ?? "";
}

function displayCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

onBeforeUnmount(() => {
  stopSelectedPreview();
  runtime.dispose();
});
</script>

<template>
  <div class="dataset-panel">
    <div class="dataset-panel__create">
      <button class="cf-button cf-button--primary cf-button--compact" type="button" @click="beginCreate('static')">
        <Icon name="plus" :size="13" /> 静态
      </button>
      <button class="cf-button cf-button--compact" type="button" @click="beginCreate('http')">
        <Icon name="plus" :size="13" /> HTTP
      </button>
    </div>

    <div v-if="ws.workspace.datasets.length" class="dataset-panel__list" aria-label="工作区数据集">
      <button
        v-for="dataset in ws.workspace.datasets"
        :key="dataset.id"
        class="dataset-panel__item"
        :class="{ 'dataset-panel__item--active': selectedId === dataset.id && !isCreating }"
        type="button"
        @click="isCreating = false; selectedId = dataset.id"
      >
        <span class="dataset-panel__item-name">{{ dataset.name }}</span>
        <span class="dataset-panel__badge">{{ dataset.source.kind === "static" ? "静态" : "HTTP" }}</span>
      </button>
    </div>
    <p v-else-if="!isCreating" class="dataset-panel__empty">暂无数据集。先创建静态数据，或接入 HTTP API。</p>

    <section v-if="isCreating || selectedDataset" class="dataset-panel__editor" aria-label="数据集配置">
      <div class="dataset-panel__section-head">
        <h3>{{ isCreating ? "新建数据集" : "数据配置" }}</h3>
        <button v-if="isCreating" class="dataset-panel__icon-button" type="button" aria-label="取消新建数据集" @click="cancelCreate">
          <Icon name="close" :size="15" />
        </button>
      </div>
      <label class="dataset-panel__field">
        名称
        <input v-model="name" class="cf-control cf-control--compact" type="text" maxlength="80" />
      </label>
      <label class="dataset-panel__field">
        数据源类型
        <select v-model="sourceKind" class="cf-control cf-control--compact">
          <option value="static">静态数据</option>
          <option value="http">HTTP API</option>
        </select>
      </label>

      <template v-if="sourceKind === 'static'">
        <label class="dataset-panel__field">
          JSON 数据
          <textarea v-model="staticJson" class="cf-control cf-control--compact dataset-panel__textarea" spellcheck="false" placeholder='[{ "name": "A", "value": 1 }]' />
        </label>
      </template>
      <template v-else>
        <label class="dataset-panel__field">
          接口地址 / 相对路径
          <input v-model="endpoint" class="cf-control cf-control--compact" type="text" placeholder="/api/sales 或 https://…" spellcheck="false" />
        </label>
        <div class="dataset-panel__grid">
          <label class="dataset-panel__field">
            方法
            <select v-model="method" class="cf-control cf-control--compact">
              <option value="GET">GET</option><option value="POST">POST</option>
            </select>
          </label>
          <label class="dataset-panel__field">
            间隔（秒）
            <input v-model.number="intervalSec" class="cf-control cf-control--compact" type="number" min="5" max="3600" />
          </label>
        </div>
        <label class="dataset-panel__field">
          数据路径（可选）
          <input v-model="dataPath" class="cf-control cf-control--compact" type="text" placeholder="data.rows" spellcheck="false" />
        </label>
        <label class="dataset-panel__field">
          请求头（每行 key=value）
          <textarea v-model="headersText" class="cf-control cf-control--compact dataset-panel__textarea dataset-panel__textarea--small" spellcheck="false" placeholder="Authorization=Bearer …" />
        </label>
        <label class="dataset-panel__field">
          请求参数（每行 key=value）
          <textarea v-model="queryText" class="cf-control cf-control--compact dataset-panel__textarea dataset-panel__textarea--small" spellcheck="false" placeholder="region=west" />
        </label>
        <label class="dataset-panel__field">
          POST 请求体（JSON）
          <textarea v-model="body" class="cf-control cf-control--compact dataset-panel__textarea dataset-panel__textarea--small" spellcheck="false" :disabled="method !== 'POST'" placeholder='{"page": 1}' />
        </label>
      </template>

      <details class="dataset-panel__advanced">
        <summary>参数与数据加工</summary>
        <label class="dataset-panel__field">
          数据集参数（覆盖接口同名参数）
          <textarea v-model="parametersText" class="cf-control cf-control--compact dataset-panel__textarea dataset-panel__textarea--small" spellcheck="false" placeholder="tenant=demo" />
        </label>
        <label class="dataset-panel__field">
          行过滤（JSON 数组，支持 eq / gt / contains 等）
          <textarea v-model="filterText" class="cf-control cf-control--compact dataset-panel__textarea dataset-panel__textarea--small" spellcheck="false" placeholder='[{"field":"sales","op":"gt","value":"0"}]' />
        </label>
        <label class="dataset-panel__field">
          选列（逗号分隔）
          <input v-model="selectText" class="cf-control cf-control--compact" type="text" placeholder="city, sales" />
        </label>
        <div class="dataset-panel__grid">
          <label class="dataset-panel__field">
            排序字段
            <input v-model="sortField" class="cf-control cf-control--compact" type="text" />
          </label>
          <label class="dataset-panel__check"><input v-model="sortDesc" type="checkbox" /> 降序</label>
        </div>
        <label class="dataset-panel__field">
          最多保留行数
          <input v-model="limitText" class="cf-control cf-control--compact" type="number" min="1" max="5000" />
        </label>
      </details>

      <div v-if="error" class="dataset-panel__error" role="alert">{{ error }}</div>
      <div class="dataset-panel__actions">
        <button class="cf-button cf-button--primary cf-button--compact" type="button" @click="saveDataset">保存数据集</button>
        <button v-if="!isCreating" class="cf-button cf-button--compact" type="button" @click="deleteOpen = true">删除</button>
      </div>
      <div v-if="!isCreating" class="dataset-panel__preview">
        <div class="dataset-panel__preview-head">
          <span>数据预览</span>
          <button class="dataset-panel__icon-button" type="button" aria-label="刷新数据预览" title="刷新数据" @click="refreshPreview">
            <Icon name="refresh" :size="14" />
          </button>
        </div>
        <div class="dataset-panel__status" :class="`dataset-panel__status--${preview.status}`" role="status">
          {{ preview.status === "idle" ? "待加载" : preview.status === "loading" ? "正在请求…" : preview.status === "success" ? `${preview.rows.length} 行` : preview.status === "stale" ? `数据过期：${preview.error ?? "请求失败"}` : `请求失败：${preview.error ?? "未知错误"}` }}
        </div>
        <div v-if="preview.rows.length && columns.length" class="dataset-panel__table-wrap">
          <table class="dataset-panel__table">
            <thead><tr><th v-for="column in columns" :key="column">{{ column }}</th></tr></thead>
            <tbody>
              <tr v-for="(row, index) in preview.rows.slice(0, 6)" :key="index">
                <td v-for="column in columns" :key="column">{{ displayCell(row[column]) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <ConfirmDialog
      v-if="deleteOpen && selectedDataset"
      title="删除数据集"
      :message="`确定删除「${selectedDataset.name}」？已绑定的组件将由后续任务显示缺失状态。`"
      confirm-text="删除"
      @confirm="deleteSelected"
      @cancel="deleteOpen = false"
    />
  </div>
</template>

<style scoped>
.dataset-panel { display: flex; flex-direction: column; gap: 10px; padding: 10px; color: var(--cf-text); }
.dataset-panel__create, .dataset-panel__actions, .dataset-panel__preview-head { display: flex; align-items: center; gap: 6px; }
.dataset-panel__create > button:first-child { flex: 1; }
.dataset-panel__create > button { flex: 1; }
.dataset-panel__list { display: flex; flex-direction: column; gap: 4px; max-height: 148px; overflow: auto; }
.dataset-panel__item { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 7px 8px; border: 1px solid var(--cf-border); border-radius: 6px; background: var(--cf-bg); color: var(--cf-text-2); cursor: pointer; text-align: left; }
.dataset-panel__item--active { border-color: var(--cf-primary); color: var(--cf-primary); background: color-mix(in srgb, var(--cf-primary) 10%, transparent); }
.dataset-panel__item-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.dataset-panel__badge { flex: none; font-size: 9px; opacity: .8; }
.dataset-panel__empty { margin: 0; color: var(--cf-text-2); font-size: 11px; line-height: 1.55; }
.dataset-panel__editor { display: flex; min-width: 0; flex-direction: column; gap: 9px; }
.dataset-panel__section-head { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--cf-border); padding-top: 10px; }
.dataset-panel__section-head h3 { margin: 0; font-size: 12px; }
.dataset-panel__field { display: flex; min-width: 0; flex-direction: column; gap: 4px; color: var(--cf-text-2); font-size: 10px; }
.dataset-panel__field .cf-control { width: 100%; min-width: 0; }
.dataset-panel__textarea { min-height: 96px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; line-height: 1.45; }
.dataset-panel__textarea--small { min-height: 54px; }
.dataset-panel__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: end; }
.dataset-panel__check { display: flex; align-items: center; gap: 5px; min-height: 30px; color: var(--cf-text-2); font-size: 10px; }
.dataset-panel__advanced { border-top: 1px solid var(--cf-border); padding-top: 8px; }
.dataset-panel__advanced summary { margin-bottom: 8px; color: var(--cf-primary); cursor: pointer; font-size: 11px; }
.dataset-panel__advanced[open] { display: flex; flex-direction: column; gap: 9px; }
.dataset-panel__actions { justify-content: space-between; }
.dataset-panel__error { padding: 7px; border: 1px solid color-mix(in srgb, var(--cf-danger) 45%, transparent); border-radius: 6px; background: color-mix(in srgb, var(--cf-danger) 8%, transparent); color: var(--cf-danger); font-size: 10px; line-height: 1.45; }
.dataset-panel__preview { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--cf-border); padding-top: 8px; }
.dataset-panel__preview-head { justify-content: space-between; font-size: 11px; font-weight: 600; }
.dataset-panel__icon-button { display: grid; width: 26px; height: 26px; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--cf-text-2); cursor: pointer; }
.dataset-panel__icon-button:hover { color: var(--cf-primary); background: color-mix(in srgb, var(--cf-primary) 10%, transparent); }
.dataset-panel__status { color: var(--cf-text-2); font-size: 10px; line-height: 1.45; }
.dataset-panel__status--success { color: #55c78a; }
.dataset-panel__status--stale, .dataset-panel__status--error { color: var(--cf-danger); }
.dataset-panel__status--loading { color: var(--cf-primary); }
.dataset-panel__table-wrap { max-width: 100%; overflow: auto; border: 1px solid var(--cf-border); border-radius: 5px; }
.dataset-panel__table { width: 100%; border-collapse: collapse; font-size: 9px; }
.dataset-panel__table th, .dataset-panel__table td { max-width: 112px; padding: 5px 6px; border-bottom: 1px solid var(--cf-border); text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dataset-panel__table th { background: color-mix(in srgb, var(--cf-panel) 72%, transparent); color: var(--cf-text); }
.dataset-panel__table tr:last-child td { border-bottom: 0; }
.cf-button--compact { min-height: 28px; padding: 4px 8px; font-size: 10px; }
</style>
