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
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import TopBar from "@/components/editor/TopBar.vue";
import ChartLibrary from "@/components/editor/ChartLibrary.vue";
import PreviewCanvas from "@/components/editor/PreviewCanvas.vue";
import InspectorPanel from "@/components/editor/InspectorPanel.vue";
import { CHART_META } from "@/config/editor";
import { useWorkspaceStore } from "@/stores/workspace";
import { provideOptionEditor } from "@/composables/useOptionEditor";
import { useAssetsStore } from "@/stores/assets";
import { deepClone } from "@/utils/object";

const store = useWorkspaceStore();
const route = useRoute();
const router = useRouter();
const assetsStore = useAssetsStore();

provideOptionEditor({
  read: (path, fallback) => store.readOption(path, fallback),
  update: (path, value) => store.updateOption(store.type, path, value),
  replace: (option, record) => store.replaceOption(store.type, option, record),
  commit: () => store.commit(),
});

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

async function copyOption(): Promise<void> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(store.option, null, 2));
    ElMessage.success("已复制 " + CHART_META[store.type].label + " 的 option");
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
  loadFromAssetQuery();
  window.addEventListener("keydown", onKeyDown);
});

/** 图表库「编辑副本」跳转而来：以资产快照载入 option（深拷贝副本语义，不回写资产） */
function loadFromAssetQuery(): void {
  const fromAsset = route.query.fromAsset;
  if (typeof fromAsset !== "string" || !fromAsset) return;
  const asset = assetsStore.byId(fromAsset);
  if (asset) {
    store.selectType(asset.chartType);
    store.replaceOption(store.type, deepClone(asset.option), true);
  } else {
    ElMessage.warning("来源资产不存在或已被删除");
  }
  router.replace({ query: {} });
}

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeyDown);
});
</script>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--cf-bg-0);
}

.editor-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}
</style>
