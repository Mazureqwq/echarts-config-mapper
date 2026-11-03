<script setup lang="ts">
import { ref, watch } from "vue";
import type { ChartItem } from "@/core/model/types";
import { useDocumentStore } from "@/stores/documentStore";

const props = defineProps<{ item: ChartItem }>();
const doc = useDocumentStore();

const enabled = ref(Boolean(props.item.spec.source));
const url = ref(props.item.spec.source?.url ?? "");
const intervalSec = ref(props.item.spec.source?.intervalSec ?? 30);
const dataPath = ref(props.item.spec.source?.dataPath ?? "");
const notice = ref("");

watch(
  () => props.item.id,
  () => {
    enabled.value = Boolean(props.item.spec.source);
    url.value = props.item.spec.source?.url ?? "";
    intervalSec.value = props.item.spec.source?.intervalSec ?? 30;
    dataPath.value = props.item.spec.source?.dataPath ?? "";
    notice.value = "";
  }
);

function save(): void {
  if (!enabled.value) {
    doc.setLiveSource(props.item.id, null);
    notice.value = "已关闭实时数据";
    return;
  }
  if (!url.value.trim()) {
    notice.value = "请填写接口地址";
    return;
  }
  doc.setLiveSource(props.item.id, {
    url: url.value.trim(),
    intervalSec: Math.max(5, Number(intervalSec.value) || 30),
    ...(dataPath.value.trim() ? { dataPath: dataPath.value.trim() } : {}),
  });
  notice.value = "已保存，将按间隔拉取数据";
}
</script>

<template>
  <div class="live-panel">
    <label class="live-panel__row">
      <span>启用实时数据</span>
      <input v-model="enabled" type="checkbox" />
    </label>
    <template v-if="enabled">
      <label class="live-panel__row">
        <span>接口地址</span>
        <input v-model="url" placeholder="https://api.example.com/data" />
      </label>
      <label class="live-panel__row">
        <span>间隔（秒，≥5）</span>
        <input v-model.number="intervalSec" type="number" min="5" />
      </label>
      <label class="live-panel__row">
        <span>取值路径 dataPath</span>
        <input v-model="dataPath" placeholder="result.rows（可空）" />
      </label>
    </template>
    <button class="live-panel__save" @click="save">保存数据源</button>
    <div v-if="notice" class="live-panel__notice">{{ notice }}</div>
  </div>
</template>

<style scoped>
.live-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.live-panel__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--cf-text-2);
}
.live-panel__row input:not([type="checkbox"]) {
  width: 170px;
  padding: 4px 6px;
  border: 1px solid var(--cf-border);
  border-radius: 4px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 12px;
}
.live-panel__save {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  background: var(--cf-primary);
  color: #fff;
  cursor: pointer;
  font-size: 12px;
}
.live-panel__notice {
  font-size: 12px;
  color: var(--cf-primary);
}
</style>
