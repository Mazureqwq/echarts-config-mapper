<template>
  <header class="topbar">
    <div class="brand">
      <span class="logo"><Icon name="spark" :size="15" /></span>
      <div class="brand-text">
        <strong>ChartForge</strong>
        <span>ECharts 配置编辑器</span>
      </div>
    </div>

    <div class="divider" />

    <div class="group">
      <button class="tbtn" :disabled="!store.canUndo" title="撤销 (Ctrl+Z)" @click="store.undo()">
        <Icon name="undo" />
      </button>
      <button class="tbtn" :disabled="!store.canRedo" title="重做 (Ctrl+Shift+Z)" @click="store.redo()">
        <Icon name="redo" />
      </button>
      <button class="tbtn wide" title="恢复当前图表类型的默认配置" @click="resetCurrent">
        <Icon name="reset" /><span>重置配置</span>
      </button>
    </div>

    <button class="tbtn wide" :disabled="!canSave" :title="canSave ? saveHint : readonlyHint" @click="saveAsAsset">
      <Icon name="plus" /><span>存为资产</span>
    </button>

    <div class="spacer" />

    <button class="copy-btn" title="复制当前图表 option JSON (Ctrl+C)" @click="copyOption">
      <Icon name="copy" :size="14" />
      <span>复制 JSON</span>
      <kbd>Ctrl+C</kbd>
    </button>

    <div class="group">
      <button class="tbtn wide" title="下载 option JSON 文件" @click="downloadJson">
        <Icon name="code" /><span>下载 JSON</span>
      </button>
      <button class="tbtn wide" title="导出当前图表 PNG (2x)" @click="exportPng">
        <Icon name="image" /><span>PNG</span>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from "element-plus";
import Icon from "@/components/ui/Icon.vue";
import { CHART_META } from "@/config/editor";
import { isSaveApiAvailable, useAssetsStore } from "@/stores/assets";
import { useWorkspaceStore } from "@/stores/workspace";
import { getChart } from "@/utils/echartsRegistry";
import { download, downloadText } from "@/utils/download";
import { deepClone } from "@/utils/object";

const store = useWorkspaceStore();
const assetsStore = useAssetsStore();
const canSave = isSaveApiAvailable();
const saveHint = "保存当前图表到图表库";
const readonlyHint = "生产环境只读";

function optionJson(): string {
  return JSON.stringify(store.option, null, 2);
}

async function copyOption(): Promise<void> {
  const text = optionJson();
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success(`已复制 ${CHART_META[store.type].label} 的 option`);
  } catch {
    ElMessage.error("复制失败，请检查浏览器剪贴板权限");
  }
}

function downloadJson(): void {
  downloadText(optionJson(), `${store.type}-option-${Date.now()}.json`);
  ElMessage.success("已下载 option JSON");
}

function exportPng(): void {
  const instance = getChart(store.type);
  if (!instance) {
    ElMessage.error("图表尚未渲染完成");
    return;
  }
  const backgroundColor = store.backdrop === "light" ? "#ffffff" : "#0e1420";
  const url = instance.getDataURL({ type: "png", pixelRatio: 2, backgroundColor });
  download(url, `${store.type}-${Date.now()}.png`);
  ElMessage.success("已导出 PNG");
}

function resetCurrent(): void {
  store.resetCurrent();
  ElMessage.success("已恢复默认配置");
}

async function saveAsAsset(): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt("资产名称", "存为资产", {
      confirmButtonText: "保存",
      cancelButtonText: "取消",
      inputValue: CHART_META[store.type].label,
      inputValidator: (input: string) => (input && input.trim().length > 0 ? true : "名称不能为空"),
    });
    const name = (value ?? "").trim();
    if (!name) return;
    await assetsStore.saveAsset({
      name,
      category: CHART_META[store.type].label,
      chartType: store.type,
      option: deepClone(store.option),
    });
    ElMessage.success("已保存到图表库");
  } catch {
    /* 用户取消或校验未通过 */
  }
}
</script>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--cf-header-h);
  padding: 0 14px;
  background: var(--cf-bg-1);
  border-bottom: 1px solid var(--cf-border);
  flex: 0 0 auto;
  z-index: 20;
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
}

.logo {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--cf-accent), #22d3ee);
  color: #0b0f17;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.brand-text strong {
  font-size: 12.5px;
}

.brand-text span {
  font-size: 10px;
  color: var(--cf-text-faint);
}

.divider {
  width: 1px;
  height: 22px;
  background: var(--cf-border);
}

.group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  min-width: 28px;
  padding: 0 8px;
  justify-content: center;
  border-radius: var(--cf-radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--cf-text-dim);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all var(--cf-fast);
}

.tbtn:hover:not(:disabled) {
  background: var(--cf-bg-3);
  border-color: var(--cf-border);
  color: var(--cf-text);
}

.tbtn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--cf-radius-sm);
  border: 1px solid var(--cf-accent);
  background: var(--cf-accent);
  color: #fff;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all var(--cf-fast);
}

.copy-btn:hover {
  background: var(--cf-accent-hover);
  border-color: var(--cf-accent-hover);
}

.copy-btn kbd {
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.18);
  font-family: var(--cf-font-mono);
  font-size: 9.5px;
}

.spacer {
  flex: 1 1 auto;
}
</style>
