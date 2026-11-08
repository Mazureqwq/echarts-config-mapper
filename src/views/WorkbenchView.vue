<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDocumentStore } from "@/stores/documentStore";
import CanvasStage from "@/workbench/CanvasStage.vue";
import LeftPanel from "@/workbench/LeftPanel.vue";
import InspectorPanel from "@/workbench/InspectorPanel.vue";
import TopBar from "@/workbench/TopBar.vue";
import Icon from "@/shared/ui/Icon.vue";
import ShortcutsHelp from "@/workbench/ShortcutsHelp.vue";
import { snapshotStage } from "@/workbench/stageThumbnail";
import { LiveExecutor } from "@/core/live/liveExecutor";

const props = defineProps<{ id: string }>();
const ws = useWorkspaceStore();
const doc = useDocumentStore();
const stageWrap = ref<HTMLDivElement | null>(null);
const leftCollapsed = ref(false);
const rightCollapsed = ref(false);

// ---- 实时数据：编辑期也保持拉取，否则配置完看不到效果 ----
let executor: LiveExecutor | null = null;
let compactQuery: MediaQueryList | null = null;

function collapsePanelsOnCompactViewport(): void {
  if (!compactQuery?.matches) return;
  leftCollapsed.value = true;
  rightCollapsed.value = true;
}

/** 数据源配置指纹：增删图表、改地址/间隔时才重新挂载 */
const liveSignature = computed(() =>
  doc.items
    .filter((i) => i.kind === "chart" && i.spec.source && !i.dataBinding)
    .map((i) => {
      const s = i.kind === "chart" ? i.spec.source : undefined;
      const key = JSON.stringify({
        url: s?.url ?? "",
        path: s?.path ?? "",
        method: s?.method ?? "GET",
        body: s?.body ?? "",
        headers: s?.headers ?? null,
        query: s?.query ?? null,
        timeoutMs: s?.timeoutMs ?? 0,
        intervalSec: s?.intervalSec ?? 0,
        dataPath: s?.dataPath ?? "",
        filter: s?.filter ?? null,
        select: s?.select ?? null,
        sort: s?.sort ?? null,
        limit: s?.limit ?? 0,
        map: s?.map ?? null,
        api: ws.settings.api ?? null,
      });
      return `${i.id}:${key}`;
    })
    .join("|")
);

function syncLive(): void {
  executor?.dispose();
  executor = null;
  const live = doc.items.filter((i) => i.kind === "chart" && i.spec.source && !i.dataBinding);
  if (!live.length) return;
  executor = new LiveExecutor({ resolveApi: () => ws.settings.api });
  for (const item of live) {
    if (item.kind !== "chart" || !item.spec.source || item.dataBinding) continue;
    executor.register(item.id, item.spec.source, (u) => {
      void doc.applyLiveUpdate(u.id, u.data, {
        stale: u.stale,
        error: u.error,
        updatedAt: u.updatedAt,
      });
    });
  }
  void executor.tick();
}

watch(liveSignature, syncLive);
watch(() => doc.currentScreenId, syncLive);

onMounted(() => {
  compactQuery = window.matchMedia("(max-width: 680px)");
  compactQuery.addEventListener("change", collapsePanelsOnCompactViewport);
  collapsePanelsOnCompactViewport();
  ws.load();
  if (ws.workspace.screens.length === 0) {
    doc.addScreen("我的图表");
    doc.initHistory();
    void refreshThumbnailAfterRender();
    return;
  }
  const target = ws.workspace.screens.find((s) => s.id === props.id);
  doc.currentScreenId = target ? target.id : ws.workspace.screens[0].id;
  doc.initHistory();
  syncLive();
  void refreshThumbnailAfterRender();
});

async function refreshThumbnail(): Promise<void> {
  const el = stageWrap.value?.querySelector(".canvas-stage__canvas") as HTMLElement | null;
  const screenId = doc.currentScreenId;
  if (!el || !screenId) return;
  try {
    const dataUrl = await snapshotStage(el);
    doc.setScreenThumbnail(screenId, dataUrl);
  } catch {
    /* 缩略图失败不阻塞 */
  }
}

async function refreshThumbnailAfterRender(): Promise<void> {
  await nextTick();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await refreshThumbnail();
}

onBeforeUnmount(() => {
  compactQuery?.removeEventListener("change", collapsePanelsOnCompactViewport);
  compactQuery = null;
  executor?.dispose();
  executor = null;
  void refreshThumbnail();
});
</script>

<template>
  <div class="workbench">
    <TopBar :screen-id="doc.currentScreenId ?? id" @saved="refreshThumbnail" />
    <div class="workbench__main">
      <aside
        class="workbench__side workbench__side--left"
        :class="{ 'workbench__side--collapsed': leftCollapsed }"
        aria-label="左侧资源面板"
      >
        <button
          v-if="leftCollapsed"
          class="workbench__expand"
          aria-label="展开左侧资源面板"
          title="展开资源面板"
          @click="leftCollapsed = false"
        >
          <Icon name="menu" :size="17" />
        </button>
        <LeftPanel v-else @collapse="leftCollapsed = true" />
      </aside>
      <main ref="stageWrap" class="workbench__stage" aria-label="画布工作区">
        <CanvasStage />
      </main>
      <aside
        class="workbench__side workbench__side--right"
        :class="{ 'workbench__side--collapsed': rightCollapsed }"
        aria-label="右侧属性面板"
      >
        <button
          v-if="rightCollapsed"
          class="workbench__expand"
          aria-label="展开右侧属性面板"
          title="展开属性面板"
          @click="rightCollapsed = false"
        >
          <Icon name="settings" :size="17" />
        </button>
        <InspectorPanel v-else @collapse="rightCollapsed = true" />
      </aside>
    </div>
    <ShortcutsHelp />
  </div>
</template>

<style scoped>
.workbench {
  --cf-bg: #151b26;
  --cf-panel: #1c2532;
  --cf-border: #303c4e;
  --cf-text: #e7edf5;
  --cf-text-2: #a8b5c6;
  --cf-primary: #49b9f2;
  --cf-canvas-bg: #111720;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--cf-bg);
  color: var(--cf-text);
}
.workbench__main {
  flex: 1;
  display: flex;
  min-height: 0;
  min-width: 0;
}
.workbench__side {
  position: relative;
  flex: 0 0 auto;
  background: var(--cf-panel);
  overflow: hidden;
  transition: width 160ms ease;
}
.workbench__side--left {
  width: 292px;
  border-right: 1px solid var(--cf-border);
}
.workbench__side--right {
  width: 320px;
  border-left: 1px solid var(--cf-border);
}
.workbench__side--collapsed {
  width: 48px;
}
.workbench__expand {
  display: flex;
  width: 100%;
  height: 44px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-bottom: 1px solid var(--cf-border);
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
}
.workbench__expand:hover {
  color: var(--cf-primary);
  background: color-mix(in srgb, var(--cf-primary) 8%, transparent);
}
.workbench__stage {
  flex: 1;
  display: flex;
  min-width: 0;
  min-height: 0;
}
@media (max-width: 900px) {
  .workbench__side--left:not(.workbench__side--collapsed) { width: 244px; }
  .workbench__side--right:not(.workbench__side--collapsed) { width: 276px; }
}
@media (max-width: 680px) {
  .workbench__main { position: relative; }
  .workbench__side--left:not(.workbench__side--collapsed) {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 5;
    width: min(292px, 82vw);
    box-shadow: 12px 0 28px rgba(0, 0, 0, 0.28);
  }
  .workbench__side--right:not(.workbench__side--collapsed) {
    position: absolute;
    inset: 0 0 0 auto;
    z-index: 5;
    width: min(320px, 86vw);
    box-shadow: -12px 0 28px rgba(0, 0, 0, 0.28);
  }
  .workbench__side--collapsed { width: 40px; }
  .workbench__stage { width: 100%; }
}
</style>
