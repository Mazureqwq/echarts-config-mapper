<template>
  <div class="source-editor">
    <div class="field-row">
      <span class="field-label">模式</span>
      <el-radio-group :model-value="config.mode" @update:model-value="onMode">
        <el-radio-button value="static">静态</el-radio-button>
        <el-radio-button value="api">API</el-radio-button>
      </el-radio-group>
    </div>

    <template v-if="isApi">
      <div class="field-row">
        <span class="field-label">接口地址</span>
        <el-input
          :model-value="config.api.url"
          placeholder="https://api.example.com/data"
          @change="onUrl"
        />
      </div>
      <div class="field-row">
        <span class="field-label">请求方法</span>
        <el-select :model-value="config.api.method" class="method-select" @update:model-value="onMethod">
          <el-option value="GET" label="GET" />
          <el-option value="POST" label="POST" />
        </el-select>
      </div>
      <div class="field-row">
        <span class="field-label">轮询间隔</span>
        <el-input-number
          :model-value="config.api.interval"
          :min="0"
          :step="1"
          @update:model-value="onInterval"
        />
        <span class="field-hint">秒，0 表示只拉取一次</span>
      </div>
      <div class="field-row">
        <span class="field-label">取数路径</span>
        <el-input
          :model-value="config.api.dataPath"
          placeholder="如 data.list"
          @change="onDataPath"
        />
      </div>
      <div class="field-row">
        <span class="field-label">写回路径</span>
        <el-input
          :model-value="config.api.optionPath"
          placeholder="如 series.0.data"
          @change="onOptionPath"
        />
      </div>

      <div class="headers-block">
        <div class="section-sub">请求头</div>
        <div v-for="row in headerRows" :key="row[0]" class="header-row">
          <el-input
            :model-value="row[0]"
            class="header-key"
            placeholder="键"
            @change="onHeaderKey(row[0], $event)"
          />
          <el-input
            :model-value="row[1]"
            class="header-val"
            placeholder="值"
            @change="onHeaderValue(row[0], $event)"
          />
          <button class="header-del" title="删除该请求头" @click="removeHeader(row[0])">×</button>
        </div>
        <el-button size="small" @click="addHeader">添加请求头</el-button>
      </div>
    </template>

    <div v-else class="source-hint">
      静态模式：图表数据直接来自 option 内的 series 数据，可在「数据」或「JSON」页签编辑。
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { createDefaultDataSource } from "@/core/item";
import type { DataSourceApi, DataSourceConfig, ScreenItem } from "@/core/types";
import { useDesignerStore } from "@/stores/designer";

const props = defineProps<{ item: ScreenItem }>();
const designer = useDesignerStore();

/** 数据源配置兜底：老数据缺 dataSource 时给默认静态配置 */
const config = computed<DataSourceConfig>(
  () => props.item.chart?.dataSource ?? createDefaultDataSource(),
);

const isApi = computed(() => config.value.mode === "api");

/** 请求头键值对行（保持对象键序） */
const headerRows = computed(() => Object.entries(config.value.api.headers));

function patchApi(patch: Partial<DataSourceApi>): void {
  designer.setDataSource(props.item.id, {
    mode: config.value.mode,
    api: { ...config.value.api, ...patch },
  });
}

function onMode(value: string | number | boolean): void {
  const mode = value === "api" ? "api" : "static";
  designer.setDataSource(props.item.id, { mode, api: config.value.api });
}

function onUrl(value: string): void {
  patchApi({ url: value });
}

function onMethod(value: string | number | boolean): void {
  patchApi({ method: value === "POST" ? "POST" : "GET" });
}

function onInterval(value: number | undefined): void {
  patchApi({ interval: value ?? 0 });
}

function onDataPath(value: string): void {
  patchApi({ dataPath: value });
}

function onOptionPath(value: string): void {
  patchApi({ optionPath: value });
}

function onHeaderKey(oldKey: string, next: string): void {
  const key = next.trim();
  if (!key || key === oldKey) return;
  const headers: Record<string, string> = {};
  for (const [entryKey, entryValue] of headerRows.value) {
    headers[entryKey === oldKey ? key : entryKey] = entryValue;
  }
  patchApi({ headers });
}

function onHeaderValue(key: string, value: string): void {
  patchApi({ headers: { ...config.value.api.headers, [key]: value } });
}

function addHeader(): void {
  const headers = { ...config.value.api.headers };
  let index = 1;
  while (headers["header" + index] !== undefined) index++;
  headers["header" + index] = "";
  patchApi({ headers });
}

function removeHeader(key: string): void {
  const headers = { ...config.value.api.headers };
  delete headers[key];
  patchApi({ headers });
}
</script>

<style scoped>
.source-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.field-label {
  flex: 0 0 64px;
  font-size: 11.5px;
  color: var(--cf-text-dim);
}

.field-hint {
  font-size: 10.5px;
  color: var(--cf-text-faint);
}

.method-select {
  width: 110px;
}

.headers-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--cf-border);
  border-radius: var(--cf-radius-sm);
}

.section-sub {
  font-size: 11px;
  color: var(--cf-text-dim);
}

.header-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-key {
  flex: 1 1 40%;
}

.header-val {
  flex: 1 1 60%;
}

.header-del {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border: 1px solid var(--cf-border);
  border-radius: var(--cf-radius-sm);
  background: transparent;
  color: var(--cf-text-dim);
  cursor: pointer;
  line-height: 1;
}

.header-del:hover {
  border-color: var(--cf-danger);
  color: var(--cf-danger);
}

.source-hint {
  font-size: 11.5px;
  line-height: 1.8;
  color: var(--cf-text-dim);
}
</style>
