<script setup lang="ts">
import { computed, ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { exportScreenPackage } from "@/core/export";
import { formatBytes, saveBlob } from "@/core/export/download";
import { screenHasLiveSource } from "@/core/export/snapshot";
import type { ArtifactMode } from "@/core/export/model";
import type { Screen } from "@/core/model/types";
import Icon from "./Icon.vue";

const props = defineProps<{ screen: Screen }>();
const emit = defineEmits<{ (e: "close"): void }>();

const ws = useWorkspaceStore();

const mode = ref<ArtifactMode>("folder");
const keepHeaders = ref(false);
const busy = ref(false);
const error = ref("");
const done = ref<{ fileName: string; size: string; warnings: string[] } | null>(null);

const hasLive = computed(() => screenHasLiveSource(props.screen));
const chartCount = computed(
  () => props.screen.items.filter((i) => i.kind === "chart").length
);

async function run(): Promise<void> {
  busy.value = true;
  error.value = "";
  done.value = null;
  try {
    const result = await exportScreenPackage({
      workspace: ws.workspace,
      screenIds: [props.screen.id],
      mode: mode.value,
      options: { keepHeaders: keepHeaders.value },
    });
    saveBlob(result.blob, result.fileName);
    done.value = {
      fileName: result.fileName,
      size: formatBytes(result.bytes),
      warnings: result.warnings,
    };
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="export-dialog" @click.self="emit('close')">
    <div class="export-dialog__panel" role="dialog" aria-modal="true" aria-label="导出可交付产物">
      <header class="export-dialog__head">
        <h2><Icon name="package" :size="16" /> 导出「{{ screen.name || "未命名大屏" }}」</h2>
        <button class="export-dialog__x" title="关闭" @click="emit('close')">×</button>
      </header>

      <div class="export-dialog__body">
        <p class="export-dialog__desc">
          导出的是一份<strong>能直接打开、能部署</strong>的产物，不依赖 ChartForge：
          zip 包解压后放任意静态服务器即可；单文件 HTML 双击就能看。
        </p>

        <div class="export-dialog__field">
          <span class="export-dialog__label">产物形态</span>
          <label class="export-dialog__radio">
            <input v-model="mode" type="radio" value="folder" />
            <span>
              zip 目录包（推荐）
              <em>index.html + assets + manifest + 许可证，可部署、可校验</em>
            </span>
          </label>
          <label class="export-dialog__radio">
            <input v-model="mode" type="radio" value="inline" />
            <span>
              单文件 HTML
              <em>全部内联，双击即用；体积较大，适合传阅</em>
            </span>
          </label>
        </div>

        <div class="export-dialog__field">
          <span class="export-dialog__label">数据</span>
          <div class="export-dialog__note">
            当前导出为<strong>静态快照</strong>：{{ chartCount }} 个图表按此刻的数据固化，产物完全离线、不含任何密钥
            {{ hasLive ? "（这块大屏配了实时数据源，产物里不会自动刷新）" : "" }}。
          </div>
          <label class="export-dialog__check">
            <input v-model="keepHeaders" type="checkbox" />
            <span>
              保留请求头里的令牌值
              <em>默认剔除；勾选后产物可被任何人直接调用你的接口</em>
            </span>
          </label>
        </div>

        <div class="export-dialog__field">
          <span class="export-dialog__label">安全与标准</span>
          <ul class="export-dialog__list">
            <li>严格 CSP（<code>default-src 'none'</code>），零外部脚本、零 CDN</li>
            <li>用户文本全部转义，图片地址只放行 http(s) / data:image</li>
            <li>目录包内脚本带 SRI 完整性校验，<code>manifest.json</code> 记录每份文件的 SHA-256</li>
            <li>保留 ECharts 的 Apache-2.0 声明（<code>NOTICE-ECHARTS.txt</code>）</li>
          </ul>
        </div>

        <div v-if="error" class="export-dialog__error">{{ error }}</div>
        <div v-if="done" class="export-dialog__done">
          <div>已生成 <strong>{{ done.fileName }}</strong>（{{ done.size }}）</div>
          <ul v-if="done.warnings.length" class="export-dialog__list">
            <li v-for="w in done.warnings" :key="w">{{ w }}</li>
          </ul>
        </div>
      </div>

      <footer class="export-dialog__foot">
        <button class="export-dialog__btn" @click="emit('close')">关闭</button>
        <button class="export-dialog__btn export-dialog__btn--primary" :disabled="busy" @click="run">
          {{ busy ? "生成中…" : "生成并下载" }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.export-dialog {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  padding: 24px;
}
.export-dialog__panel {
  width: min(560px, 100%);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--cf-panel);
  border: 1px solid var(--cf-border);
  border-radius: var(--cf-radius);
  box-shadow: var(--cf-shadow);
}
.export-dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--cf-border);
}
.export-dialog__head h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 15px;
}
.export-dialog__x {
  border: none;
  background: transparent;
  color: var(--cf-text-2);
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
}
.export-dialog__body {
  padding: 16px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.export-dialog__desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--cf-text-2);
}
.export-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.export-dialog__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--cf-text);
}
.export-dialog__radio,
.export-dialog__check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12.5px;
  color: var(--cf-text);
  cursor: pointer;
}
.export-dialog__radio em,
.export-dialog__check em {
  display: block;
  margin-top: 2px;
  font-style: normal;
  font-size: 11.5px;
  color: var(--cf-text-2);
  line-height: 1.6;
}
.export-dialog__note {
  font-size: 12px;
  line-height: 1.8;
  color: var(--cf-text-2);
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--cf-bg);
}
.export-dialog__list {
  margin: 0;
  padding-left: 18px;
  font-size: 11.5px;
  line-height: 1.9;
  color: var(--cf-text-2);
}
.export-dialog__list code {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 10.5px;
  padding: 0 3px;
  border-radius: 3px;
  background: var(--cf-bg);
}
.export-dialog__error {
  font-size: 12px;
  color: var(--cf-danger);
  line-height: 1.7;
}
.export-dialog__done {
  font-size: 12px;
  color: var(--cf-primary);
  line-height: 1.8;
}
.export-dialog__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--cf-border);
}
.export-dialog__btn {
  padding: 7px 14px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: transparent;
  color: var(--cf-text);
  cursor: pointer;
  font-size: 12.5px;
}
.export-dialog__btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.export-dialog__btn--primary {
  background: var(--cf-primary);
  border-color: var(--cf-primary);
  color: #fff;
}
</style>
