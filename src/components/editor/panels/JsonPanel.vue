<template>
  <div class="json-panel">
    <div class="json-head">
      <span class="json-title">option JSON</span>
      <span class="json-state" :class="stateClass">
        <Icon :name="error ? 'warning' : 'check'" :size="11" />
        {{ error ? "格式错误" : "已同步" }}
      </span>
    </div>

    <textarea
      class="json-editor"
      spellcheck="false"
      v-model="text"
      @input="onInput"
      @blur="apply"
    />

    <p v-if="error" class="json-error">{{ error }}</p>

    <div class="json-actions">
      <button class="soft-btn primary" @click="apply">应用到图表</button>
      <button class="soft-btn" @click="format">格式化</button>
      <button class="soft-btn" @click="resetToChart">从图表回填</button>
    </div>

    <p class="tips">编辑后可直接应用；非法 JSON 会保留输入并标红，不会破坏图表。</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import Icon from "@/components/ui/Icon.vue";
import { useWorkspaceStore } from "@/stores/workspace";
import type { ChartInstance } from "@/types/chart";
import { deepClone } from "@/utils/object";

const props = defineProps<{ chart: ChartInstance }>();
const store = useWorkspaceStore();

const text = ref(JSON.stringify(props.chart.option, null, 2));
const error = ref<string | null>(null);

const stateClass = computed(() => (error.value ? "is-error" : "is-ok"));

watch(
  () => props.chart.option,
  (option) => {
    if (error.value) return;
    const next = JSON.stringify(option, null, 2);
    if (next !== text.value) text.value = next;
  },
  { deep: true },
);

// 切换图表类型时，用新类型的 option 覆盖编辑器内容
watch(
  () => props.chart.type,
  () => {
    text.value = JSON.stringify(props.chart.option, null, 2);
    error.value = null;
  },
);

function onInput(): void {
  try {
    JSON.parse(text.value);
    error.value = null;
  } catch (err) {
    error.value = (err as Error).message;
  }
}

function apply(): void {
  try {
    const parsed = JSON.parse(text.value);
    error.value = null;
    store.replaceOption(props.chart.id, deepClone(parsed), true);
    ElMessage.success("已应用到图表");
  } catch (err) {
    error.value = (err as Error).message;
  }
}

function format(): void {
  try {
    const parsed = JSON.parse(text.value);
    text.value = JSON.stringify(parsed, null, 2);
    error.value = null;
  } catch (err) {
    error.value = (err as Error).message;
  }
}

function resetToChart(): void {
  text.value = JSON.stringify(props.chart.option, null, 2);
  error.value = null;
}
</script>

<style scoped>
.json-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1 1 auto;
}

.json-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.json-title {
  font-size: 11.5px;
  color: var(--cf-text-dim);
  font-family: var(--cf-font-mono);
}

.json-state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
}

.json-state.is-ok {
  color: var(--cf-success);
}

.json-state.is-error {
  color: var(--cf-danger);
}

.json-editor {
  flex: 1 1 auto;
  min-height: 240px;
  width: 100%;
  padding: 10px;
  border-radius: var(--cf-radius-sm);
  border: 1px solid var(--cf-border);
  background: #0d121c;
  color: #c7d2e5;
  font-family: var(--cf-font-mono);
  font-size: 11px;
  line-height: 1.55;
  resize: none;
  tab-size: 2;
  outline: none;
}

.json-editor:focus {
  border-color: var(--cf-accent);
}

.json-error {
  margin: 0;
  padding: 6px 8px;
  border-radius: var(--cf-radius-sm);
  background: var(--cf-danger-soft);
  color: #fca5a5;
  font-family: var(--cf-font-mono);
  font-size: 10px;
  word-break: break-all;
}

.json-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.soft-btn {
  padding: 5px 10px;
  border-radius: var(--cf-radius-sm);
  border: 1px solid var(--cf-border);
  background: var(--cf-bg-2);
  color: var(--cf-text-dim);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: all var(--cf-fast);
}

.soft-btn:hover {
  border-color: var(--cf-border-strong);
  color: var(--cf-text);
}

.soft-btn.primary {
  background: var(--cf-accent);
  border-color: var(--cf-accent);
  color: #fff;
}

.soft-btn.primary:hover {
  background: var(--cf-accent-hover);
}

.tips {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--cf-text-faint);
}
</style>
