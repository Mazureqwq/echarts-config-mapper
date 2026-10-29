<template>
  <div class="editor cf-app">
    <TopBar />
    <div class="editor-body">
      <ChartLibrary />
      <PreviewCanvas />
      <InspectorPanel />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { ElMessage } from "element-plus";
import TopBar from "@/components/editor/TopBar.vue";
import ChartLibrary from "@/components/editor/ChartLibrary.vue";
import PreviewCanvas from "@/components/editor/PreviewCanvas.vue";
import InspectorPanel from "@/components/editor/InspectorPanel.vue";
import { CHART_META } from "@/config/editor";
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

async function copyOption(): Promise<void> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(store.option, null, 2));
    ElMessage.success(`已复制 ${CHART_META[store.type].label} 的 option`);
  } catch {
    ElMessage.error("复制失败，请检查浏览器剪贴板权限");
  }
}

function onKeyDown(event: KeyboardEvent): void {
  const mod = event.ctrlKey || event.metaKey;
  if (isTypingTarget(event.target)) return;

  if (mod && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) store.redo();
    else store.undo();
    return;
  }

  if (mod && event.key.toLowerCase() === "y") {
    event.preventDefault();
    store.redo();
    return;
  }

  if (mod && event.key.toLowerCase() === "c") {
    event.preventDefault();
    void copyOption();
    return;
  }

  // 数字键 1-6 快速切换图表类型
  if (!mod && /^[1-6]$/.test(event.key)) {
    const types = ["line", "bar", "pie", "map", "scatter", "radar"] as const;
    const next = types[Number(event.key) - 1];
    if (next) store.selectType(next);
  }
}

onMounted(() => {
  store.restore();
  store.ensureOption(store.type);
  window.addEventListener("keydown", onKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeyDown);
});
</script>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--cf-bg-0);
}

.editor-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}
</style>
