<script setup lang="ts">
import { onMounted } from "vue";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDocumentStore } from "@/stores/documentStore";
import CanvasStage from "@/workbench/CanvasStage.vue";
import LayersPanel from "@/workbench/LayersPanel.vue";
import InspectorPanel from "@/workbench/InspectorPanel.vue";

const props = defineProps<{ id: string }>();
const ws = useWorkspaceStore();
const doc = useDocumentStore();

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
</script>

<template>
  <div class="workbench">
    <aside class="workbench__side workbench__side--left">
      <LayersPanel />
    </aside>
    <CanvasStage />
    <aside class="workbench__side workbench__side--right">
      <InspectorPanel />
    </aside>
  </div>
</template>

<style scoped>
.workbench {
  height: 100%;
  display: flex;
}
.workbench__side {
  flex-shrink: 0;
  background: var(--cf-panel);
  overflow-y: auto;
}
.workbench__side--left {
  width: 220px;
  border-right: 1px solid var(--cf-border);
}
.workbench__side--right {
  width: 300px;
  border-left: 1px solid var(--cf-border);
}
</style>
