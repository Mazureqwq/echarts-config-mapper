<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import { exportJson } from "@/core/storage/workspaceRepo";
import { snapshotStagePng } from "@/workbench/stageThumbnail";
import Icon from "@/shared/ui/Icon.vue";

const props = defineProps<{ screenId: string }>();
const emit = defineEmits<{ (e: "saved"): void }>();

const router = useRouter();
const ws = useWorkspaceStore();
const doc = useDocumentStore();
const ui = useUiStore();
const exporting = ref(false);
const exportMsg = ref("");
let msgTimer: ReturnType<typeof setTimeout> | null = null;

function flash(msg: string, isError = false): void {
  exportMsg.value = isError ? `导出失败：${msg}` : msg;
  if (msgTimer !== null) clearTimeout(msgTimer);
  msgTimer = setTimeout(() => {
    exportMsg.value = "";
  }, 4000);
}

const screen = computed(() => ws.screens.find((s) => s.id === props.screenId) ?? null);

const saveText = computed(() => {
  if (ws.saveState === "error") return "保存失败：存储空间不足，请导出备份或删除部分图表后重试";
  return "已自动保存";
});

function onRename(ev: Event): void {
  doc.setScreenName((ev.target as HTMLInputElement).value);
}

function manualSave(): void {
  try {
    ws.save();
    emit("saved");
  } catch {
    /* saveState 已置 error */
  }
}

function retry(): void {
  manualSave();
}

function download(name: string, dataUrlOrJson: string, isDataUrl: boolean): void {
  const a = document.createElement("a");
  if (isDataUrl) {
    a.href = dataUrlOrJson;
  } else {
    a.href = URL.createObjectURL(new Blob([dataUrlOrJson], { type: "application/json" }));
  }
  a.download = name;
  a.click();
  if (!isDataUrl) URL.revokeObjectURL(a.href);
}

function exportJsonFile(): void {
  if (!screen.value) return;
  download(`${screen.value.name || "图表"}.screen.json`, exportJson(screen.value), false);
}

async function exportPng(): Promise<void> {
  const el = document.querySelector(".canvas-stage__canvas") as HTMLElement | null;
  if (!el) {
    flash("未找到画布", true);
    return;
  }
  exporting.value = true;
  try {
    const dataUrl = await snapshotStagePng(el);
    download(`${screen.value?.name || "图表"}@2x.png`, dataUrl, true);
    flash("已导出 2 倍 PNG");
  } catch (e) {
    flash(e instanceof Error ? e.message : String(e), true);
  } finally {
    exporting.value = false;
  }
}

function goPlay(): void {
  router.push(`/play/${props.screenId}`);
}
</script>

<template>
  <header class="topbar">
    <router-link class="topbar__back" to="/" title="返回列表"><Icon name="menu" :size="16" /></router-link>
    <input
      class="topbar__name"
      :value="screen?.name ?? ''"
      placeholder="图表名称"
      @change="onRename"
    />
    <span class="topbar__save" :class="{ 'topbar__save--error': ws.saveState === 'error' }">
      {{ saveText }}
      <button v-if="ws.saveState === 'error'" class="topbar__link" @click="retry">重试</button>
    </span>

    <div class="topbar__center">
      <button class="topbar__btn" :disabled="!doc.history.canUndo" title="撤销 (Ctrl+Z)" @click="doc.undo()">
        <Icon name="undo" :size="15" />
      </button>
      <button class="topbar__btn" :disabled="!doc.history.canRedo" title="重做 (Ctrl+Y)" @click="doc.redo()">
        <Icon name="redo" :size="15" />
      </button>
      <span class="topbar__sep" />
      <button
        class="topbar__btn"
        :class="{ 'topbar__btn--on': ui.previewing }"
        title="预览（隐藏辅助线与手柄）"
        @click="ui.setPreviewing(!ui.previewing)"
      >
        <Icon name="eye" :size="15" /> 预览
      </button>
      <button class="topbar__btn" title="演示模式" @click="goPlay">
        <Icon name="play" :size="15" /> 演示
      </button>
    </div>

    <div class="topbar__right">
      <button class="topbar__btn" title="保存并刷新缩略图" @click="manualSave">
        <Icon name="check" :size="15" /> 保存
      </button>
      <button class="topbar__btn" title="导出 JSON" @click="exportJsonFile">
        <Icon name="download" :size="15" /> JSON
      </button>
      <button class="topbar__btn" :disabled="exporting" title="导出 2 倍 PNG" @click="exportPng">
        <Icon name="image" :size="15" /> PNG@2x
      </button>
      <span
        v-if="exportMsg"
        class="topbar__export-msg"
        :class="{ 'topbar__export-msg--error': exportMsg.startsWith('导出失败') }"
        >{{ exportMsg }}</span
      >
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: var(--cf-panel);
  border-bottom: 1px solid var(--cf-border);
  flex-shrink: 0;
}
.topbar__back {
  color: var(--cf-text-2);
  display: flex;
  align-items: center;
  text-decoration: none;
}
.topbar__name {
  width: 180px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--cf-text);
  font-size: 14px;
  font-weight: 600;
}
.topbar__name:hover,
.topbar__name:focus {
  border-color: var(--cf-border);
  background: var(--cf-bg);
  outline: none;
}
.topbar__save {
  font-size: 12px;
  color: var(--cf-text-2);
}
.topbar__save--error {
  color: var(--cf-danger);
}
.topbar__link {
  border: none;
  background: none;
  color: var(--cf-primary);
  cursor: pointer;
  font-size: 12px;
  padding: 0 2px;
}
.topbar__center {
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
}
.topbar__right {
  display: flex;
  align-items: center;
  gap: 4px;
}
.topbar__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
}
.topbar__btn:hover:not(:disabled) {
  background: var(--cf-bg);
  color: var(--cf-text);
}
.topbar__btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.topbar__btn--on {
  background: color-mix(in srgb, var(--cf-primary) 12%, transparent);
  color: var(--cf-primary);
}
.topbar__sep {
  width: 1px;
  height: 16px;
  background: var(--cf-border);
}
.topbar__export-msg {
  margin-left: 8px;
  font-size: 12px;
  color: var(--cf-success, #2f9e6e);
  white-space: nowrap;
}
.topbar__export-msg--error {
  color: var(--cf-danger, #d54941);
}
</style>