<script setup lang="ts">
import { onMounted } from "vue";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDocumentStore } from "@/stores/documentStore";
import CanvasStage from "@/workbench/CanvasStage.vue";
import LayersPanel from "@/workbench/LayersPanel.vue";

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
    <aside class="workbench__side">
      <LayersPanel />
    </aside>
    <CanvasStage />
  </div>
</template>

<style scoped>
.workbench {
  height: 100%;
  display: flex;
}
.workbench__side {
  width: 220px;
  flex-shrink: 0;
  background: var(--cf-panel);
  border-right: 1px solid var(--cf-border);
  overflow-y: auto;
}
</style>
