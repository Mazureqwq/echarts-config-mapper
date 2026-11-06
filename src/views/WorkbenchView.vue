<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDocumentStore } from "@/stores/documentStore";
import CanvasStage from "@/workbench/CanvasStage.vue";
import LeftPanel from "@/workbench/LeftPanel.vue";
import InspectorPanel from "@/workbench/InspectorPanel.vue";
import TopBar from "@/workbench/TopBar.vue";
import ShortcutsHelp from "@/workbench/ShortcutsHelp.vue";
import { snapshotStage } from "@/workbench/stageThumbnail";
import { LiveExecutor } from "@/core/live/liveExecutor";

const props = defineProps<{ id: string }>();
const ws = useWorkspaceStore();
const doc = useDocumentStore();
const stageWrap = ref<HTMLDivElement | null>(null);

// ---- 实时数据：编辑期也保持拉取，否则配置完看不到效果 ----
let executor: LiveExecutor | null = null;

/** 数据源配置指纹：增删图表、改地址/间隔时才重新挂载 */
const liveSignature = computed(() =>
  doc.items
    .filter((i) => i.kind === "chart" && i.spec.source)
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
  const live = doc.items.filter((i) => i.kind === "chart" && i.spec.source);
  if (!live.length) return;
  executor = new LiveExecutor({ resolveApi: () => ws.settings.api });
  for (const item of live) {
    if (item.kind !== "chart" || !item.spec.source) continue;
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
  ws.load();
  if (ws.workspace.screens.length === 0) {
    doc.addScreen("我的图表");
    doc.initHistory();
    return;
  }
  const target = ws.workspace.screens.find((s) => s.id === props.id);
  doc.currentScreenId = target ? target.id : ws.workspace.screens[0].id;
  doc.initHistory();
  syncLive();
});

async function refreshThumbnail(): Promise<void> {
  const el = stageWrap.value?.querySelector(".canvas-stage__canvas") as HTMLElement | null;
  if (!el || !doc.currentScreenId) return;
  try {
    const dataUrl = await snapshotStage(el);
    doc.setScreenThumbnail(doc.currentScreenId, dataUrl);
  } catch {
    /* 缩略图失败不阻塞 */
  }
}

onBeforeUnmount(() => {
  executor?.dispose();
  executor = null;
  void refreshThumbnail();
});
</script>

<template>
  <div class="workbench">
    <TopBar :screen-id="doc.currentScreenId ?? id" @saved="refreshThumbnail" />
    <div class="workbench__main">
      <aside class="workbench__side workbench__side--left">
        <LeftPanel />
      </aside>
      <div ref="stageWrap" class="workbench__stage">
        <CanvasStage />
      </div>
      <aside class="workbench__side workbench__side--right">
        <InspectorPanel />
      </aside>
    </div>
    <ShortcutsHelp />
  </div>
</template>

<style scoped>
.workbench {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.workbench__main {
  flex: 1;
  display: flex;
  min-height: 0;
}
.workbench__side {
  flex-shrink: 0;
  background: var(--cf-panel);
  overflow-y: auto;
}
.workbench__side--left {
  width: 240px;
  border-right: 1px solid var(--cf-border);
}
.workbench__side--right {
  width: 300px;
  border-left: 1px solid var(--cf-border);
}
.workbench__stage {
  flex: 1;
  display: flex;
  min-width: 0;
}
</style>
