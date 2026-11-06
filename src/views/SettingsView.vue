<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Icon from "@/shared/ui/Icon.vue";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import {
  DEFAULT_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  clampTimeout,
  formatPairs,
  parsePairs,
  previewUrl,
} from "@/core/live/apiSettings";
import { probeSource } from "@/core/live/probe";

const router = useRouter();
const ws = useWorkspaceStore();

const api = computed(() => ws.settings.api);

const baseUrl = ref(api.value?.baseUrl ?? "");
const headersText = ref(formatPairs(api.value?.headers));
const queryText = ref(formatPairs(api.value?.query));
const intervalSec = ref(api.value?.defaultIntervalSec ?? 30);
const timeoutMs = ref(clampTimeout(api.value?.timeoutMs ?? DEFAULT_TIMEOUT_MS));
const exportHeaders = ref(api.value?.exportHeaders === true);
/** token 默认打码：截图、录屏、演示时不会顺手把令牌露出去 */
const revealHeaders = ref(false);

const savedAt = ref(0);
const dirty = computed(() => {
  const cur = api.value;
  return (
    baseUrl.value.trim() !== (cur?.baseUrl ?? "") ||
    headersText.value.trim() !== formatPairs(cur?.headers) ||
    queryText.value.trim() !== formatPairs(cur?.query) ||
    Number(intervalSec.value) !== (cur?.defaultIntervalSec ?? 30) ||
    Number(timeoutMs.value) !== clampTimeout(cur?.timeoutMs ?? DEFAULT_TIMEOUT_MS) ||
    exportHeaders.value !== (cur?.exportHeaders === true)
  );
});

const SENSITIVE_KEY = /(authorization|cookie|token|secret|key|password|sign)/i;

/** 只有敏感键的值打码，Content-Type 这类照样看得见 */
function maskedHeaders(): string {
  return headersText.value
    .split(/\r?\n/)
    .map((line) => {
      const eq = line.indexOf("=");
      if (eq === -1) return line;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (!value || !SENSITIVE_KEY.test(key)) return line;
      const tail = value.length > 8 ? value.slice(-4) : "";
      return `${key}=●●●●●●${tail}`;
    })
    .join("\n");
}

/** 打码状态下不可编辑，避免把 ●●●● 存回去 */
const headersView = computed(() => (revealHeaders.value ? headersText.value : maskedHeaders()));

function syncFromStore(): void {
  baseUrl.value = api.value?.baseUrl ?? "";
  headersText.value = formatPairs(api.value?.headers);
  queryText.value = formatPairs(api.value?.query);
  intervalSec.value = api.value?.defaultIntervalSec ?? 30;
  timeoutMs.value = clampTimeout(api.value?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  exportHeaders.value = api.value?.exportHeaders === true;
}

watch(() => ws.workspace.settings.api, syncFromStore, { deep: true });

function save(): void {
  const timeout = Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(Number(timeoutMs.value) || DEFAULT_TIMEOUT_MS)));
  timeoutMs.value = timeout;
  const interval = Math.min(3600, Math.max(1, Math.round(Number(intervalSec.value) || 30)));
  intervalSec.value = interval;
  ws.updateApiSettings({
    baseUrl: baseUrl.value.trim(),
    headers: parsePairs(headersText.value),
    query: parsePairs(queryText.value),
    timeoutMs: timeout,
    defaultIntervalSec: interval,
    ...(exportHeaders.value ? { exportHeaders: true } : {}),
  });
  savedAt.value = Date.now();
  notice.value = "已保存，所有图表的相对路径都会使用这里的配置";
}

const notice = ref("");

function reset(): void {
  ws.resetApiSettings();
  syncFromStore();
  notice.value = "已恢复默认（不再使用公共前缀与公共请求头）";
}

// ---- 探活 ----
const probing = ref(false);
const probe = ref<{ ok: boolean; text: string } | null>(null);

async function testBaseUrl(): Promise<void> {
  const url = baseUrl.value.trim();
  if (!url) {
    probe.value = { ok: false, text: "先填写接口基础地址，例如 https://api.example.com" };
    return;
  }
  probing.value = true;
  probe.value = null;
  const result = await probeSource(
    {
      url,
      intervalSec: 30,
      headers: parsePairs(headersText.value),
      query: parsePairs(queryText.value),
      timeoutMs: clampTimeout(timeoutMs.value),
    },
    undefined
  );
  probing.value = false;
  if (result.ok) {
    probe.value = {
      ok: true,
      text: `连通：HTTP ${result.status ?? 200}，耗时 ${result.durationMs} ms`,
    };
  } else {
    probe.value = {
      ok: false,
      text: `失败${result.status ? `（HTTP ${result.status}）` : ""}：${result.error ?? "未知错误"}`,
    };
  }
}

/** 相对路径最终会拼成什么样，给用户一个直观对照 */
const samplePreview = computed(() => previewUrl("/api/sales", { baseUrl: baseUrl.value.trim() }));

function goCharts(): void {
  router.push("/charts");
}
function goScreens(): void {
  router.push("/screens");
}
</script>

<template>
  <div class="settings">
    <header class="settings__header">
      <h1 class="settings__logo"><Icon name="chart" :size="20" /> ChartForge 图表工作台</h1>
      <nav class="settings__nav">
        <button class="settings__nav-btn" @click="goCharts">图表库</button>
        <button class="settings__nav-btn" @click="goScreens">大屏库</button>
        <button class="settings__nav-btn active">接口设置</button>
      </nav>
      <div class="settings__actions">
        <span v-if="savedAt" class="settings__saved">已保存</span>
        <span v-else-if="dirty" class="settings__dirty">有未保存的改动</span>
      </div>
    </header>

    <main class="settings__body">
      <section class="settings__card">
        <h2>接口基础地址</h2>
        <p class="settings__desc">
          填一次前缀，各图表里只写相对路径（如 <code>/api/sales</code>）即可。图表里填完整 http 地址时会直接用它，忽略这里。
        </p>
        <div class="settings__row">
          <input
            v-model="baseUrl"
            class="settings__input"
            placeholder="https://api.example.com/v1"
            spellcheck="false"
          />
          <button class="settings__btn" :disabled="probing" @click="testBaseUrl">
            {{ probing ? "请求中…" : "探活" }}
          </button>
        </div>
        <div v-if="probe" class="settings__probe" :class="probe.ok ? 'is-ok' : 'is-bad'">
          {{ probe.text }}
        </div>
        <div class="settings__preview">
          拼接预览：<code>{{ samplePreview }}</code>
        </div>
        <p class="settings__warn">
          浏览器只能直连允许跨域（CORS）的接口；跨域被拦截时探活会提示「可能是地址写错、服务未启动，或对方没开 CORS」。
        </p>
      </section>

      <section class="settings__card">
        <h2>公共请求头</h2>
        <p class="settings__desc">每行一条 <code>Key=Value</code>，所有实时数据源都会带上；单个数据源的配置会覆盖同名项。</p>
        <textarea
          v-model="headersView"
          class="settings__textarea"
          rows="4"
          spellcheck="false"
          :readonly="!revealHeaders"
          placeholder="Authorization=Bearer xxx"
          @input="headersText = ($event.target as HTMLTextAreaElement).value"
        />
        <div class="settings__row settings__row--between">
          <label class="settings__check">
            <input v-model="revealHeaders" type="checkbox" />
            显示明文
          </label>
          <span class="settings__hint">令牌以明文保存在本机 localStorage，仅在浏览器内使用</span>
        </div>
      </section>

      <section class="settings__card">
        <h2>公共查询参数</h2>
        <p class="settings__desc">每行一条 <code>key=value</code>，会拼到每个请求的 URL 上（如 <code>appKey=xxx</code>）。</p>
        <textarea v-model="queryText" class="settings__textarea" rows="3" spellcheck="false" placeholder="tenant=demo" />
      </section>

      <section class="settings__card">
        <h2>默认参数</h2>
        <div class="settings__row settings__row--between">
          <label class="settings__field">
            <span>默认拉取间隔（秒）</span>
            <input v-model.number="intervalSec" class="settings__input settings__input--num" type="number" min="5" max="3600" />
          </label>
          <label class="settings__field">
            <span>请求超时（毫秒，{{ MIN_TIMEOUT_MS }}–{{ MAX_TIMEOUT_MS }}）</span>
            <input v-model.number="timeoutMs" class="settings__input settings__input--num" type="number" :min="MIN_TIMEOUT_MS" :max="MAX_TIMEOUT_MS" step="500" />
          </label>
        </div>
        <p class="settings__desc">新建数据源时用它做默认值；超时保护可避免接口卡死时图表一直停在旧数据。</p>
      </section>

      <section class="settings__card">
        <h2>导出与安全</h2>
        <label class="settings__check">
          <input v-model="exportHeaders" type="checkbox" />
          导出 JSON 时保留请求头里的令牌值
        </label>
        <p class="settings__warn">
          默认不勾选：导出的文件会把手里的 <code>Authorization</code>、<code>token</code> 等值替换成 <code>***</code>，
          方便安全地分享工作区。确需带令牌迁移时再勾选。
        </p>
      </section>

      <div class="settings__footer">
        <button class="settings__btn settings__btn--primary" @click="save">保存设置</button>
        <button class="settings__btn" @click="reset">恢复默认</button>
        <span v-if="notice" class="settings__notice">{{ notice }}</span>
      </div>
    </main>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--cf-bg);
}
.settings__header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 14px 24px;
  background: var(--cf-panel);
  border-bottom: 1px solid var(--cf-border);
}
.settings__logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  margin: 0;
}
.settings__nav {
  display: flex;
  gap: 8px;
}
.settings__nav-btn {
  padding: 6px 14px;
  border: 1px solid var(--cf-border);
  border-radius: 7px;
  background: transparent;
  color: var(--cf-text);
  cursor: pointer;
  font-size: 13px;
}
.settings__nav-btn.active {
  background: color-mix(in srgb, var(--cf-primary) 12%, transparent);
  border-color: var(--cf-primary);
  color: var(--cf-primary);
}
.settings__actions {
  margin-left: auto;
  font-size: 12px;
}
.settings__saved {
  color: var(--cf-primary);
}
.settings__dirty {
  color: var(--cf-text-2);
}
.settings__body {
  flex: 1;
  overflow: auto;
  padding: 20px 24px 40px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 980px;
  width: 100%;
  margin: 0 auto;
}
.settings__card {
  background: var(--cf-panel);
  border: 1px solid var(--cf-border);
  border-radius: var(--cf-radius);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.settings__card h2 {
  margin: 0;
  font-size: 15px;
}
.settings__desc,
.settings__warn,
.settings__hint,
.settings__preview {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--cf-text-2);
}
.settings__warn {
  opacity: 0.9;
}
.settings__card code,
.settings__preview code {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11.5px;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--cf-bg);
}
.settings__row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.settings__row--between {
  justify-content: space-between;
  flex-wrap: wrap;
}
.settings__input {
  flex: 1;
  padding: 7px 10px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 13px;
}
.settings__input--num {
  flex: none;
  width: 130px;
}
.settings__textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
}
.settings__textarea[readonly] {
  color: var(--cf-text-2);
}
.settings__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--cf-text-2);
}
.settings__check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--cf-text);
  cursor: pointer;
}
.settings__btn {
  padding: 7px 14px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: transparent;
  color: var(--cf-text);
  cursor: pointer;
  font-size: 13px;
}
.settings__btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.settings__btn--primary {
  background: var(--cf-primary);
  border-color: var(--cf-primary);
  color: #fff;
}
.settings__probe {
  font-size: 12px;
  line-height: 1.6;
  word-break: break-all;
}
.settings__probe.is-ok {
  color: var(--cf-primary);
}
.settings__probe.is-bad {
  color: var(--cf-danger);
}
.settings__footer {
  display: flex;
  align-items: center;
  gap: 10px;
}
.settings__notice {
  font-size: 12px;
  color: var(--cf-primary);
}
</style>
