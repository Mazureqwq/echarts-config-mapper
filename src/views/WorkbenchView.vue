<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDocumentStore } from "@/stores/documentStore";
import CanvasStage from "@/workbench/CanvasStage.vue";
import LeftPanel from "@/workbench/LeftPanel.vue";
import InspectorPanel from "@/workbench/InspectorPanel.vue";
import TopBar from "@/workbench/TopBar.vue";
import ShortcutsHelp from "@/workbench/ShortcutsHelp.vue";
import { snapshotStage } from "@/workbench/stageThumbnail";

const props = defineProps<{ id: string }>();
const ws = useWorkspaceStore();
const doc = useDocumentStore();
const stageWrap = ref<HTMLDivElement | null>(null);

onMounted(() => {
  ws.load();
  if (ws.workspace.screens.length === 0) {
    doc.addScreen("我的大屏");
    doc.initHistory();
    return;
  }
  const target = ws.workspace.screens.find((s) => s.id === props.id);
  doc.currentScreenId = target ? target.id : ws.workspace.screens[0].id;
  doc.initHistory();
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
