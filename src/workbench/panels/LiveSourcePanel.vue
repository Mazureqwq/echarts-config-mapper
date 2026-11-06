<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import type { ChartItem, LiveSource } from "@/core/model/types";
import { useDocumentStore } from "@/stores/documentStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { LIVE_MIN_INTERVAL_SEC, LIVE_MAX_INTERVAL_SEC } from "@/core/live/liveSource";
import { resolveDataPath } from "@/core/live/dataPath";
import { probeSource, inferFields } from "@/core/live/probe";
import type { ProbeResult } from "@/core/live/probe";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  clampTimeout,
  formatPairs,
  joinUrl,
  parsePairs,
} from "@/core/live/apiSettings";

const props = defineProps<{ item: ChartItem }>();
const doc = useDocumentStore();
const ws = useWorkspaceStore();

const api = computed(() => ws.settings.api);
const defaultInterval = computed(() => api.value?.defaultIntervalSec ?? 30);

type TabKey = "connect" | "debug" | "pipeline";
const tab = ref<TabKey>("connect");
const TABS: Array<{ key: TabKey; label: string; soon?: boolean }> = [
  { key: "connect", label: "连接" },
  { key: "debug", label: "调试台" },
  { key: "pipeline", label: "加工", soon: true },
];

const enabled = ref(Boolean(props.item.spec.source));
const useAbsolute = ref(false);
const path = ref("");
const absoluteUrl = ref("");
const method = ref<"GET" | "POST">("GET");
const body = ref("");
const intervalSec = ref(30);
const timeoutMs = ref(DEFAULT_TIMEOUT_MS);
const dataPath = ref("");
const headersText = ref("");
const queryText = ref("");

const notice = ref("");

function syncFromItem(): void {
  const src = props.item.spec.source;
  enabled.value = Boolean(src);
  useAbsolute.value = Boolean(src?.url) && !src?.path;
  path.value = src?.path ?? (src?.url ? "" : "");
  absoluteUrl.value = src?.url ?? "";
  method.value = src?.method === "POST" ? "POST" : "GET";
  body.value = src?.body ?? "";
  intervalSec.value = src?.intervalSec ?? defaultInterval.value;
  timeoutMs.value = clampTimeout(src?.timeoutMs ?? api.value?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  dataPath.value = src?.dataPath ?? "";
  headersText.value = formatPairs(src?.headers);
  queryText.value = formatPairs(src?.query);
  notice.value = "";
  probe.value = null;
  snapshotNotice.value = "";
  reveal.value = false;
}

watch(() => props.item.id, syncFromItem, { immediate: true });

/** 当前表单拼出来的数据源（探活与保存共用同一份，避免「测的通但存的不对」） */
const draft = computed<LiveSource | null>(() => {
  const url = useAbsolute.value ? absoluteUrl.value.trim() : "";
  const p = useAbsolute.value ? "" : path.value.trim();
  if (!url && !p) return null;
  const headers = parsePairs(headersText.value);
  const query = parsePairs(queryText.value);
  const src: LiveSource = {
    url,
    intervalSec: Math.min(
      LIVE_MAX_INTERVAL_SEC,
      Math.max(LIVE_MIN_INTERVAL_SEC, Math.round(Number(intervalSec.value) || defaultInterval.value))
    ),
    timeoutMs: clampTimeout(Number(timeoutMs.value) || DEFAULT_TIMEOUT_MS),
    ...(p ? { path: p } : {}),
    ...(method.value === "POST" ? { method: "POST" as const } : {}),
    ...(method.value === "POST" && body.value.trim() ? { body: body.value } : {}),
    ...(dataPath.value.trim() ? { dataPath: dataPath.value.trim() } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(Object.keys(query).length ? { query } : {}),
  };
  return src;
});

/** 相对路径最终请求的真实地址 */
const finalUrl = computed(() => {
  if (useAbsolute.value) return absoluteUrl.value.trim();
  return joinUrl(api.value?.baseUrl, path.value.trim());
});

const needsBaseUrl = computed(
  () => !useAbsolute.value && !path.value.trim().startsWith("http") && !api.value?.baseUrl
);

/** 最近一次拉取状态（由 LiveExecutor 回写） */
const status = computed(() => doc.liveStatus[props.item.id]);
const statusText = computed(() => {
  if (!props.item.spec.source) return "";
  const s = status.value;
  if (!s) return "等待首次拉取…";
  const time = new Date(s.updatedAt).toLocaleTimeString("zh-CN", { hour12: false });
  if (s.stale) return `拉取失败（${time}）：${s.error ?? "未知错误"}，画面保持上一份数据`;
  return `最近更新 ${time}`;
});

// ---- 调试台 ----
const probing = ref(false);
const probe = ref<ProbeResult | null>(null);
const reveal = ref(false);
const snapshotNotice = ref("");

/** dataPath 命中后的数据（调试台展示与「填充图表」都用它） */
const picked = computed(() => {
  if (!probe.value?.ok) return { ok: false as const, value: undefined };
  const value = resolveDataPath(probe.value.raw, dataPath.value.trim() || undefined);
  return { ok: value !== undefined, value };
});

const pickedInfo = computed(() => {
  if (!probe.value?.ok) return null;
  if (!picked.value.ok) return { fields: [] as string[], rows: 0, invalid: true };
  const { fields, rows } = inferFields(picked.value.value);
  return { fields, rows: rows.length, invalid: false };
});

async function runProbe(): Promise<void> {
  const src = draft.value;
  if (!src) {
    probe.value = { ok: false, durationMs: 0, url: "", method: "GET", error: "请先填写接口地址或相对路径" };
    return;
  }
  probing.value = true;
  probe.value = null;
  snapshotNotice.value = "";
  probe.value = await probeSource(src, api.value);
  probing.value = false;
}

function fillFromProbe(): void {
  if (!probe.value?.ok || !picked.value.ok) return;
  const ok = doc.applyLiveUpdate(props.item.id, picked.value.value, {
    stale: false,
    updatedAt: Date.now(),
  });
  snapshotNotice.value = ok
    ? "已用这份数据填充图表（本次为快照，之后仍按保存的数据源自动刷新）"
    : "这份数据无法映射成当前图表类型的格式，试试调整取值路径";
}

// ---- 保存 ----
function save(): void {
  if (!enabled.value) {
    doc.setLiveSource(props.item.id, null);
    notice.value = "已关闭实时数据";
    return;
  }
  const src = draft.value;
  if (!src) {
    notice.value = "请填写相对路径或完整地址";
    return;
  }
  doc.setLiveSource(props.item.id, src);
  notice.value = `已保存，每 ${src.intervalSec} 秒拉取一次`;
  if (tab.value !== "connect") tab.value = "connect";
}

function useDefaultInterval(): void {
  intervalSec.value = defaultInterval.value;
}
</script>

<template>
  <div class="live">
    <div class="live__tabs">
      <button
        v-for="t in TABS"
        :key="t.key"
        class="live__tab"
        :class="{ active: tab === t.key }"
        :disabled="Boolean(t.soon)"
        :title="t.soon ? '数据加工将在下一版开放' : ''"
        @click="tab = t.key"
      >
        {{ t.label }}<span v-if="t.soon" class="live__soon">待上线</span>
      </button>
    </div>

    <!-- 连接 -->
    <div v-if="tab === 'connect'" class="live__pane">
      <label class="live__row">
        <span>启用实时数据</span>
        <input v-model="enabled" type="checkbox" />
      </label>

      <template v-if="enabled">
        <label class="live__row">
          <span>写法</span>
          <select v-model="useAbsolute" class="live__select">
            <option :value="false">相对路径（用全局 baseUrl）</option>
            <option :value="true">完整地址</option>
          </select>
        </label>

        <label v-if="!useAbsolute" class="live__row">
          <span>相对路径</span>
          <input v-model="path" placeholder="/api/sales" spellcheck="false" />
        </label>
        <label v-else class="live__row">
          <span>完整地址</span>
          <input v-model="absoluteUrl" placeholder="https://api.example.com/sales" spellcheck="false" />
        </label>

        <div class="live__preview">
          实际请求：<code>{{ finalUrl || "（还没填）" }}</code>
          <RouterLink class="live__inline-link" to="/settings">配置公共接口 →</RouterLink>
        </div>
        <div v-if="needsBaseUrl" class="live__warn">
          还没配公共接口地址，相对路径会请求当前站点。到「接口设置」里填一次 baseUrl 即可。
        </div>

        <div class="live__row">
          <span>方法</span>
          <select v-model="method" class="live__select">
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </div>
        <textarea
          v-if="method === 'POST'"
          v-model="body"
          class="live__textarea"
          rows="3"
          spellcheck="false"
          placeholder='{"region":"华东"}'
        />

        <label class="live__row">
          <span>间隔（秒，≥{{ LIVE_MIN_INTERVAL_SEC }}）</span>
          <input v-model.number="intervalSec" type="number" :min="LIVE_MIN_INTERVAL_SEC" :max="LIVE_MAX_INTERVAL_SEC" />
        </label>
        <button class="live__link" @click="useDefaultInterval">用全局默认间隔（{{ defaultInterval }} 秒）</button>

        <label class="live__row">
          <span>超时（毫秒）</span>
          <input v-model.number="timeoutMs" type="number" :min="MIN_TIMEOUT_MS" :max="MAX_TIMEOUT_MS" step="500" />
        </label>

        <label class="live__row">
          <span>取值路径 dataPath</span>
          <input v-model="dataPath" placeholder="result.rows  或  result.rows[*].value" spellcheck="false" />
        </label>
        <div class="live__hint">
          载荷支持二维表（首行表头）、对象数组 <code>[{"月份":"一月","销量":10}]</code>、纯数值数组；
          路径支持 <code>a.b</code>、<code>rows[0].value</code>、<code>rows[*].value</code>（通配会拍平成数组）。
        </div>

        <details class="live__more">
          <summary>图表级请求头 / 查询参数（覆盖全局同名项）</summary>
          <div class="live__pairs">
            <span class="live__pairs-label">请求头（Key=Value，每行一条）</span>
            <textarea v-model="headersText" class="live__textarea" rows="3" spellcheck="false" placeholder="X-Tenant=demo" />
            <span class="live__pairs-label">查询参数（key=value，每行一条）</span>
            <textarea v-model="queryText" class="live__textarea" rows="2" spellcheck="false" placeholder="region=east" />
          </div>
        </details>

        <div class="live__ops">
          <button class="live__btn" @click="tab = 'debug'">去调试台试一下</button>
          <button class="live__btn live__btn--primary" @click="save">保存数据源</button>
        </div>
      </template>
      <button v-else class="live__btn live__btn--primary" @click="save">保存数据源</button>

      <div v-if="notice" class="live__notice">{{ notice }}</div>
    </div>

    <!-- 调试台 -->
    <div v-else-if="tab === 'debug'" class="live__pane">
      <div class="live__preview">
        请求：<code>{{ probe?.method ?? method }} {{ finalUrl || "（还没填地址）" }}</code>
      </div>
      <div class="live__ops">
        <button class="live__btn live__btn--primary" :disabled="probing" @click="runProbe">
          {{ probing ? "请求中…" : "发一次请求" }}
        </button>
        <span v-if="probe" class="live__status-code" :class="probe.ok ? 'is-ok' : 'is-bad'">
          {{ probe.ok ? `HTTP ${probe.status ?? 200}` : "请求失败" }} · {{ probe.durationMs }} ms
        </span>
      </div>

      <div v-if="probe && !probe.ok" class="live__warn">{{ probe.error }}</div>

      <template v-if="probe?.ok">
        <div class="live__debug-block">
          <div class="live__debug-title">
            取值路径命中：<code>{{ dataPath.trim() || "（未填写，取整个响应）" }}</code>
          </div>
          <div v-if="pickedInfo?.invalid" class="live__warn">
            这个路径在返回数据里取不到值，检查一下大小写或层级。
          </div>
          <template v-else>
            <div class="live__debug-meta">
              共 {{ pickedInfo?.rows ?? 0 }} 行 · {{ pickedInfo?.fields.length ?? 0 }} 个字段
            </div>
            <div class="live__fields">
              <span v-for="f in pickedInfo?.fields" :key="f" class="live__field">{{ f }}</span>
            </div>
          </template>
        </div>

        <div class="live__debug-block">
          <div class="live__debug-title">返回数据（前 10 行）</div>
          <div class="live__json" :class="{ 'live__json--masked': !reveal }">
            {{
              reveal
                ? JSON.stringify(picked.ok ? picked.value : probe.raw, null, 2).slice(0, 4000)
                : "已隐藏，点下方「显示原始响应」查看"
            }}
          </div>
          <button class="live__link" @click="reveal = !reveal">
            {{ reveal ? "隐藏原始响应" : "显示原始响应（可能含敏感数据）" }}
          </button>
        </div>

        <button class="live__btn" :disabled="!picked.ok" @click="fillFromProbe">
          用这份数据填充图表（快照）
        </button>
        <div v-if="snapshotNotice" class="live__notice">{{ snapshotNotice }}</div>
      </template>
    </div>

    <div
      v-if="statusText"
      class="live__status"
      :class="{ 'live__status--bad': status?.stale }"
    >
      {{ statusText }}
    </div>
  </div>
</template>

<style scoped>
.live {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.live__tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 7px;
  background: var(--cf-bg);
}
.live__tab {
  flex: 1;
  padding: 5px 6px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--cf-text-2);
  font-size: 12px;
  cursor: pointer;
}
.live__tab.active {
  background: var(--cf-panel);
  color: var(--cf-text);
  box-shadow: var(--cf-shadow);
}
.live__tab:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.live__soon {
  margin-left: 3px;
  font-size: 9px;
  padding: 0 3px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--cf-primary) 16%, transparent);
  color: var(--cf-primary);
}
.live__pane {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.live__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--cf-text-2);
}
.live__row input:not([type="checkbox"]),
.live__select {
  width: 170px;
  padding: 4px 6px;
  border: 1px solid var(--cf-border);
  border-radius: 4px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 12px;
}
.live__textarea {
  width: 100%;
  padding: 5px 7px;
  border: 1px solid var(--cf-border);
  border-radius: 4px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11px;
  resize: vertical;
}
.live__preview,
.live__hint,
.live__status,
.live__debug-meta {
  font-size: 11px;
  line-height: 1.6;
  color: var(--cf-text-2);
  word-break: break-all;
}
.live__preview code,
.live__hint code,
.live__debug-title code {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 10.5px;
  padding: 0 3px;
  border-radius: 3px;
  background: var(--cf-bg);
}
.live__warn {
  font-size: 11px;
  line-height: 1.6;
  color: var(--cf-danger);
}
.live__inline-link {
  margin-left: 6px;
  color: var(--cf-primary);
  font-size: 11px;
  text-decoration: none;
}
.live__link {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--cf-primary);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
}
.live__more summary {
  font-size: 11px;
  color: var(--cf-text-2);
  cursor: pointer;
}
.live__pairs {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 0 0;
}
.live__pairs-label {
  font-size: 11px;
  color: var(--cf-text-2);
}
.live__ops {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.live__btn {
  padding: 6px 12px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: transparent;
  color: var(--cf-text);
  cursor: pointer;
  font-size: 12px;
}
.live__btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.live__btn--primary {
  border-color: var(--cf-primary);
  background: var(--cf-primary);
  color: #fff;
}
.live__status-code {
  font-size: 11px;
  color: var(--cf-text-2);
}
.live__status-code.is-ok {
  color: var(--cf-primary);
}
.live__status-code.is-bad {
  color: var(--cf-danger);
}
.live__notice {
  font-size: 12px;
  color: var(--cf-primary);
  line-height: 1.6;
}
.live__debug-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: var(--cf-panel);
}
.live__debug-title {
  font-size: 11.5px;
  color: var(--cf-text);
}
.live__fields {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.live__field {
  padding: 1px 6px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--cf-primary) 12%, transparent);
  color: var(--cf-primary);
  font-size: 10.5px;
}
.live__json {
  max-height: 220px;
  overflow: auto;
  padding: 6px;
  border-radius: 4px;
  background: var(--cf-bg);
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 10.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}
.live__json--masked {
  color: var(--cf-text-2);
  white-space: normal;
}
.live__status {
  color: var(--cf-text-2);
}
.live__status--bad {
  color: var(--cf-danger);
}
</style>
