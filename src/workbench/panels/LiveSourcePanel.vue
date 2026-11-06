<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import type { ChartItem, LiveFilterOp, LiveSource } from "@/core/model/types";
import { useDocumentStore } from "@/stores/documentStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { LIVE_MIN_INTERVAL_SEC, LIVE_MAX_INTERVAL_SEC } from "@/core/live/liveSource";
import { resolveDataPath } from "@/core/live/dataPath";
import { probeSource, inferFields } from "@/core/live/probe";
import type { ProbeResult } from "@/core/live/probe";
import { buildChartData, runPipeline } from "@/core/live/pipeline";
import type { Row } from "@/core/live/pipeline";
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
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "connect", label: "连接" },
  { key: "debug", label: "调试台" },
  { key: "pipeline", label: "加工" },
];

const FILTER_OPS: Array<{ value: LiveFilterOp; label: string }> = [
  { value: "eq", label: "等于" },
  { value: "ne", label: "不等于" },
  { value: "gt", label: "大于" },
  { value: "gte", label: "大于等于" },
  { value: "lt", label: "小于" },
  { value: "lte", label: "小于等于" },
  { value: "contains", label: "包含" },
  { value: "in", label: "属于（逗号分隔）" },
  { value: "notEmpty", label: "非空" },
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

// ---- 加工 ----
const filters = ref<Array<{ field: string; op: LiveFilterOp; value: string }>>([]);
const selectFields = ref<string[]>([]);
const sortField = ref("");
const sortDesc = ref(false);
const limit = ref(0);
const mapCategory = ref("");
const mapValue = ref("");
const mapSeries = ref("");

const notice = ref("");

function syncFromItem(): void {
  const src = props.item.spec.source;
  enabled.value = Boolean(src);
  useAbsolute.value = Boolean(src?.url) && !src?.path;
  path.value = src?.path ?? "";
  absoluteUrl.value = src?.url ?? "";
  method.value = src?.method === "POST" ? "POST" : "GET";
  body.value = src?.body ?? "";
  intervalSec.value = src?.intervalSec ?? defaultInterval.value;
  timeoutMs.value = clampTimeout(src?.timeoutMs ?? api.value?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  dataPath.value = src?.dataPath ?? "";
  headersText.value = formatPairs(src?.headers);
  queryText.value = formatPairs(src?.query);
  filters.value = (src?.filter ?? []).map((f) => ({ ...f }));
  selectFields.value = [...(src?.select ?? [])];
  sortField.value = src?.sort?.field ?? "";
  sortDesc.value = src?.sort?.desc === true;
  limit.value = src?.limit ?? 0;
  mapCategory.value = src?.map?.category ?? "";
  mapValue.value = src?.map?.value ?? "";
  mapSeries.value = src?.map?.seriesField ?? "";
  notice.value = "";
  probe.value = null;
  snapshotNotice.value = "";
  reveal.value = false;
}

watch(() => props.item.id, syncFromItem, { immediate: true });

/** 连接页的表单 → 数据源（探活与保存共用同一份，避免「测的通但存的不对」） */
const draft = computed<LiveSource | null>(() => {
  const url = useAbsolute.value ? absoluteUrl.value.trim() : "";
  const p = useAbsolute.value ? "" : path.value.trim();
  if (!url && !p) return null;
  const headers = parsePairs(headersText.value);
  const query = parsePairs(queryText.value);
  return {
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
});

/** 连接配置 + 加工配置的完整数据源 */
const fullSource = computed<LiveSource | undefined>(() => {
  const base = draft.value;
  if (!base) return undefined;
  const cleanFilters = filters.value.filter((f) => f.field.trim() !== "");
  return {
    ...base,
    ...(cleanFilters.length ? { filter: cleanFilters } : {}),
    ...(selectFields.value.length ? { select: selectFields.value } : {}),
    ...(sortField.value.trim() ? { sort: { field: sortField.value.trim(), ...(sortDesc.value ? { desc: true } : {}) } } : {}),
    ...(limit.value > 0 ? { limit: Math.min(5000, Math.round(limit.value)) } : {}),
    ...(mapCategory.value || mapValue.value || mapSeries.value
      ? {
          map: {
            ...(mapCategory.value ? { category: mapCategory.value } : {}),
            ...(mapValue.value ? { value: mapValue.value } : {}),
            ...(mapSeries.value ? { seriesField: mapSeries.value } : {}),
          },
        }
      : {}),
  };
});

/** 相对路径最终请求的真实地址 */
const finalUrl = computed(() => {
  if (useAbsolute.value) return absoluteUrl.value.trim();
  return joinUrl(api.value?.baseUrl, path.value.trim());
});

const needsBaseUrl = computed(() => !useAbsolute.value && !api.value?.baseUrl);

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

/** dataPath 命中后的数据（调试台与加工预览共用） */
const picked = computed(() => {
  if (!probe.value?.ok) return { ok: false as const, value: undefined };
  const value = resolveDataPath(probe.value.raw, dataPath.value.trim() || undefined);
  return { ok: value !== undefined, value };
});

const pickedInfo = computed(() => {
  if (!probe.value?.ok) return null;
  if (!picked.value.ok) return { fields: [] as string[], rows: [] as Row[], invalid: true };
  const { fields, rows } = inferFields(picked.value.value);
  return { fields, rows, invalid: false };
});

/** 可选的字段清单：优先用调试台拿到的真实字段 */
const fields = computed(() => pickedInfo.value?.fields ?? []);

const processed = computed(() => {
  if (!picked.value.ok) return null;
  return runPipeline(picked.value.value, fullSource.value);
});

const chartPreview = computed(() => {
  if (!picked.value.ok) return null;
  return buildChartData(picked.value.value, fullSource.value, props.item.spec.type);
});

const steps = computed(() => {
  const c = processed.value?.counts;
  if (!c) return "";
  const parts = [`原始 ${c.raw} 行`];
  if (c.filtered !== c.raw) parts.push(`过滤后 ${c.filtered} 行`);
  if (c.sorted !== c.selected) parts.push(`选列后 ${c.selected} 行`);
  if (c.limited !== c.sorted) parts.push(`取前 ${c.limited} 行`);
  else if (c.filtered === c.raw) parts.push("未加工");
  return parts.join(" → ");
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
    ? "已用这份数据填充图表（快照；保存数据源后仍会按配置自动刷新）"
    : "这份数据无法映射成当前图表类型的格式，试试调整取值路径或加工设置";
}

// ---- 加工 ----
function addFilter(): void {
  filters.value.push({ field: fields.value[0] ?? "", op: "eq", value: "" });
}

function removeFilter(index: number): void {
  filters.value.splice(index, 1);
}

function toggleSelect(field: string): void {
  const i = selectFields.value.indexOf(field);
  if (i === -1) selectFields.value.push(field);
  else selectFields.value.splice(i, 1);
}

function clearProcessing(): void {
  filters.value = [];
  selectFields.value = [];
  sortField.value = "";
  sortDesc.value = false;
  limit.value = 0;
  mapCategory.value = "";
  mapValue.value = "";
  mapSeries.value = "";
  notice.value = "已清空加工设置（记得点保存）";
}

// ---- 保存 ----
function save(): void {
  if (!enabled.value) {
    doc.setLiveSource(props.item.id, null);
    notice.value = "已关闭实时数据";
    return;
  }
  const src = fullSource.value;
  if (!src) {
    notice.value = "请填写相对路径或完整地址";
    return;
  }
  doc.setLiveSource(props.item.id, src);
  notice.value = `已保存，每 ${src.intervalSec} 秒拉取一次`;
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
        @click="tab = t.key"
      >
        {{ t.label }}
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
          没配公共接口地址，相对路径会请求当前站点。到「接口设置」填一次 baseUrl 即可。
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
              共 {{ pickedInfo?.rows.length ?? 0 }} 行 · {{ fields.length }} 个字段
            </div>
            <div class="live__fields">
              <span v-for="f in fields" :key="f" class="live__field">{{ f }}</span>
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

    <!-- 加工 -->
    <div v-else class="live__pane">
      <div v-if="!picked.ok" class="live__hint">
        先在「调试台」发一次请求，这里才能列出字段并实时预览加工结果。
      </div>

      <template v-else>
        <div class="live__debug-block">
          <div class="live__debug-title">行过滤（多条为「并且」）</div>
          <div v-for="(f, i) in filters" :key="i" class="live__filter">
            <select v-model="f.field" class="live__select live__select--field">
              <option value="">字段</option>
              <option v-for="name in fields" :key="name" :value="name">{{ name }}</option>
            </select>
            <select v-model="f.op" class="live__select live__select--op">
              <option v-for="op in FILTER_OPS" :key="op.value" :value="op.value">{{ op.label }}</option>
            </select>
            <input
              v-if="f.op !== 'notEmpty'"
              v-model="f.value"
              class="live__input"
              placeholder="值"
              :disabled="!f.field"
            />
            <button class="live__icon-btn" title="删除条件" @click="removeFilter(i)">×</button>
          </div>
          <button class="live__link" @click="addFilter">＋ 添加条件</button>
        </div>

        <div class="live__debug-block">
          <div class="live__debug-title">列选择（不选=保留全部）</div>
          <div class="live__fields">
            <button
              v-for="name in fields"
              :key="name"
              class="live__field live__field--btn"
              :class="{ 'is-on': selectFields.includes(name) }"
              @click="toggleSelect(name)"
            >
              {{ name }}
            </button>
          </div>
        </div>

        <div class="live__debug-block">
          <div class="live__debug-title">排序与取前 N</div>
          <div class="live__row">
            <span>排序字段</span>
            <div class="live__inline">
              <select v-model="sortField" class="live__select">
                <option value="">不排序</option>
                <option v-for="name in fields" :key="name" :value="name">{{ name }}</option>
              </select>
              <select v-model="sortDesc" class="live__select live__select--op" :disabled="!sortField">
                <option :value="false">升序</option>
                <option :value="true">降序</option>
              </select>
            </div>
          </div>
          <div class="live__row">
            <span>取前 N 行（0 = 不限）</span>
            <input v-model.number="limit" type="number" min="0" max="5000" class="live__input live__input--num" />
          </div>
        </div>

        <div class="live__debug-block">
          <div class="live__debug-title">字段映射（留空 = 按第一行自动推断）</div>
          <div class="live__row">
            <span>分类列</span>
            <select v-model="mapCategory" class="live__select">
              <option value="">自动</option>
              <option v-for="name in fields" :key="name" :value="name">{{ name }}</option>
            </select>
          </div>
          <div class="live__row">
            <span>数值列</span>
            <select v-model="mapValue" class="live__select">
              <option value="">自动</option>
              <option v-for="name in fields" :key="name" :value="name">{{ name }}</option>
            </select>
          </div>
          <div class="live__row">
            <span>系列字段（长表转宽表）</span>
            <select v-model="mapSeries" class="live__select">
              <option value="">无</option>
              <option v-for="name in fields" :key="name" :value="name">{{ name }}</option>
            </select>
          </div>
        </div>

        <div class="live__debug-block">
          <div class="live__debug-title">加工预览</div>
          <div class="live__debug-meta">{{ steps }}</div>
          <div v-if="processed && !processed.ok" class="live__warn">{{ processed.message }}</div>
          <template v-else>
            <div v-if="chartPreview && !chartPreview.ok" class="live__warn">
              能取到行，但映射不成当前图表（{{ chartPreview.message }}）
            </div>
            <table v-if="processed?.ok" class="live__table">
              <thead>
                <tr>
                  <th v-for="key in Object.keys(processed.rows[0] ?? {})" :key="key">{{ key }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in processed.rows.slice(0, 5)" :key="i">
                  <td v-for="key in Object.keys(processed.rows[0] ?? {})" :key="key">
                    {{ row[key] === null || row[key] === undefined ? "" : String(row[key]) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </template>
        </div>

        <div class="live__ops">
          <button class="live__btn live__btn--primary" @click="save">保存加工设置</button>
          <button class="live__btn" @click="clearProcessing">清空加工</button>
        </div>
        <div v-if="notice" class="live__notice">{{ notice }}</div>
      </template>
    </div>

    <div v-if="statusText" class="live__status" :class="{ 'live__status--bad': status?.stale }">
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
.live__inline {
  display: flex;
  gap: 4px;
}
.live__inline .live__select {
  width: 100px;
}
.live__select--field {
  width: 100px;
}
.live__select--op {
  width: 84px;
}
.live__input {
  width: 90px;
  padding: 4px 6px;
  border: 1px solid var(--cf-border);
  border-radius: 4px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 12px;
}
.live__input--num {
  width: 70px;
}
.live__filter {
  display: flex;
  align-items: center;
  gap: 4px;
}
.live__icon-btn {
  width: 20px;
  height: 22px;
  border: 1px solid var(--cf-border);
  border-radius: 4px;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
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
.live__field--btn {
  border: 1px solid transparent;
  cursor: pointer;
  opacity: 0.6;
}
.live__field--btn.is-on {
  border-color: var(--cf-primary);
  opacity: 1;
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
.live__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10.5px;
}
.live__table th,
.live__table td {
  padding: 3px 5px;
  border: 1px solid var(--cf-border);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 90px;
}
.live__table th {
  background: var(--cf-bg);
  color: var(--cf-text-2);
  font-weight: 500;
}
.live__status {
  color: var(--cf-text-2);
}
.live__status--bad {
  color: var(--cf-danger);
}
</style>
