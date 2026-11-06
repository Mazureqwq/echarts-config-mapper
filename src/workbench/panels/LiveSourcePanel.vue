<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ChartItem } from "@/core/model/types";
import { useDocumentStore } from "@/stores/documentStore";
import { probeLiveSource, validateLiveSource, LIVE_MIN_INTERVAL_SEC } from "@/core/live/liveSource";

const props = defineProps<{ item: ChartItem }>();
const doc = useDocumentStore();

const enabled = ref(Boolean(props.item.spec.source));
const url = ref(props.item.spec.source?.url ?? "");
const intervalSec = ref(props.item.spec.source?.intervalSec ?? 30);
const dataPath = ref(props.item.spec.source?.dataPath ?? "");
const notice = ref("");
const probing = ref(false);
const probeText = ref("");
const probeOk = ref<boolean | null>(null);

function syncFromItem(): void {
  enabled.value = Boolean(props.item.spec.source);
  url.value = props.item.spec.source?.url ?? "";
  intervalSec.value = props.item.spec.source?.intervalSec ?? 30;
  dataPath.value = props.item.spec.source?.dataPath ?? "";
  notice.value = "";
  probeText.value = "";
  probeOk.value = null;
}

watch(() => props.item.id, syncFromItem);

/** 最近一次拉取状态（由 LiveExecutor 回写） */
const status = computed(() => doc.liveStatus[props.item.id]);

const statusText = computed(() => {
  const s = status.value;
  if (!props.item.spec.source) return "";
  if (!s) return "等待首次拉取…";
  const time = new Date(s.updatedAt).toLocaleTimeString("zh-CN", { hour12: false });
  if (s.stale) return `拉取失败（${time}）：${s.error ?? "未知错误"}，画面保持上一份数据`;
  return `最近更新 ${time}`;
});

async function test(): Promise<void> {
  const checked = validateLiveSource({
    url: url.value,
    intervalSec: Number(intervalSec.value),
    dataPath: dataPath.value,
  });
  if (!checked.ok) {
    probeOk.value = false;
    probeText.value = checked.message;
    return;
  }
  probing.value = true;
  probeText.value = "";
  const result = await probeLiveSource(checked.source);
  probing.value = false;
  probeOk.value = result.ok;
  probeText.value = result.ok ? `连接成功：${result.preview}` : `连接失败：${result.error}`;
}

function save(): void {
  if (!enabled.value) {
    doc.setLiveSource(props.item.id, null);
    notice.value = "已关闭实时数据";
    return;
  }
  const checked = validateLiveSource({
    url: url.value,
    intervalSec: Number(intervalSec.value),
    dataPath: dataPath.value,
  });
  if (!checked.ok) {
    notice.value = checked.message;
    return;
  }
  doc.setLiveSource(props.item.id, checked.source);
  notice.value = `已保存，每 ${checked.source.intervalSec} 秒拉取一次`;
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
        <input v-model="url" placeholder="https://api.example.com/data 或 /api/data" />
      </label>
      <label class="live-panel__row">
        <span>间隔（秒，≥{{ LIVE_MIN_INTERVAL_SEC }}）</span>
        <input
          v-model.number="intervalSec"
          type="number"
          :min="LIVE_MIN_INTERVAL_SEC"
          max="3600"
        />
      </label>
      <label class="live-panel__row">
        <span>取值路径 dataPath</span>
        <input v-model="dataPath" placeholder="result.rows  或  result.rows[*].value" />
      </label>
      <div class="live-panel__hint">
        载荷支持：二维表（首行表头）、对象数组（如 <code>[{"月份":"一月","销量":10}]</code>）、纯数值数组。
        路径支持 <code>a.b</code>、<code>rows[0].value</code>、<code>rows[*].value</code>（通配会拍平成数组）。
      </div>
      <div class="live-panel__ops">
        <button class="live-panel__test" :disabled="probing" @click="test">
          {{ probing ? "测试中…" : "测试连接" }}
        </button>
        <button class="live-panel__save" @click="save">保存数据源</button>
      </div>
      <div
        v-if="probeText"
        class="live-panel__probe"
        :class="probeOk ? 'live-panel__probe--ok' : 'live-panel__probe--bad'"
      >
        {{ probeText }}
      </div>
    </template>
    <button v-else class="live-panel__save" @click="save">保存数据源</button>

    <div v-if="notice" class="live-panel__notice">{{ notice }}</div>
    <div
      v-if="statusText"
      class="live-panel__status"
      :class="{ 'live-panel__status--bad': status?.stale }"
    >
      {{ statusText }}
    </div>
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
.live-panel__hint {
  font-size: 11px;
  color: var(--cf-text-2);
  line-height: 1.6;
  opacity: 0.85;
}
.live-panel__hint code {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 10.5px;
  padding: 0 3px;
  border-radius: 3px;
  background: var(--cf-bg);
}
.live-panel__ops {
  display: flex;
  gap: 8px;
}
.live-panel__test {
  padding: 6px 12px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: transparent;
  color: var(--cf-text);
  cursor: pointer;
  font-size: 12px;
}
.live-panel__test:disabled {
  opacity: 0.6;
  cursor: default;
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
.live-panel__probe,
.live-panel__status {
  font-size: 11px;
  line-height: 1.5;
  word-break: break-all;
}
.live-panel__probe--ok {
  color: var(--cf-primary);
}
.live-panel__probe--bad,
.live-panel__status--bad {
  color: var(--cf-danger);
}
.live-panel__status {
  color: var(--cf-text-2);
}
</style>
