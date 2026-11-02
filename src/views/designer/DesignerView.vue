<template>
  <div class="designer cf-app">
    <aside class="designer-left">
      <PalettePanel />
    </aside>

    <div class="designer-main">
      <header class="designer-topbar">
        <el-button @click="goScreens">返回</el-button>
        <el-input
          class="name-input"
          :model-value="screenName"
          placeholder="大屏名称"
          @change="onRename"
        />
        <el-button :disabled="!designer.canUndo" @click="designer.undo()">撤销</el-button>
        <el-button :disabled="!designer.canRedo" @click="designer.redo()">重做</el-button>
        <el-select class="vm-select" :model-value="designer.viewMode" @update:model-value="onViewMode">
          <el-option value="fit" label="适应窗口" />
          <el-option :value="0.5" label="50%" />
          <el-option :value="1" label="100%" />
        </el-select>
        <span class="topbar-spacer"></span>
        <el-button type="primary" class="save-btn" @click="onSave">
          保存
          <span v-if="designer.dirty" class="dirty-dot"></span>
        </el-button>
      </header>
      <div class="canvas-holder">
        <DesignerCanvas />
      </div>
    </div>

    <aside class="designer-right">
      <div class="layer-wrap">
        <LayerPanel />
      </div>
      <div class="inspector-wrap">
        <DesignerInspector />
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import DesignerCanvas from "@/components/designer/DesignerCanvas.vue";
import PalettePanel from "@/components/designer/PalettePanel.vue";
import LayerPanel from "@/components/designer/LayerPanel.vue";
import DesignerInspector from "@/components/designer/DesignerInspector.vue";
import { useDesignerKeyboard } from "@/composables/useDesignerKeyboard";
import type { DesignerViewMode } from "@/stores/designer";
import { useDesignerStore } from "@/stores/designer";

const route = useRoute();
const router = useRouter();
const designer = useDesignerStore();

useDesignerKeyboard();

const screenName = computed(() => designer.schema?.name ?? "");

function goScreens(): void {
  void router.push("/screens");
}

function onRename(value: string): void {
  if (!designer.schema) return;
  const name = value.trim();
  if (!name || name === designer.schema.name) return;
  designer.schema.name = name;
  designer.touch();
}

function onViewMode(value: string | number): void {
  const next: DesignerViewMode =
    value === "fit" ? "fit" : Number(value) === 0.5 ? 0.5 : 1;
  designer.viewMode = next;
}

async function onSave(): Promise<void> {
  try {
    await designer.save();
    ElMessage.success("大屏已保存");
  } catch {
    ElMessage.error("保存失败：保存 API 仅开发环境可用");
  }
}

onMounted(() => {
  const id = String(route.params.id ?? "");
  if (!id || id === "new") {
    designer.newSchema();
    void router.replace("/designer/" + (designer.schema?.id ?? ""));
  } else if (!designer.load(id)) {
    ElMessage.warning("大屏不存在或已被删除");
    void router.replace("/screens");
  }
  window.addEventListener("beforeunload", onBeforeUnload);
});

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", onBeforeUnload);
});

/** 有未保存更改时拦截浏览器刷新/关闭 */
function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!designer.dirty) return;
  event.preventDefault();
  event.returnValue = "";
}

onBeforeRouteLeave(() => {
  if (!designer.dirty) return true;
  return ElMessageBox.confirm("当前大屏有未保存的更改，确定离开？", "提示", {
    confirmButtonText: "离开",
    cancelButtonText: "留下",
    type: "warning",
  })
    .then(() => true)
    .catch(() => false);
});
</script>

<style scoped>
.designer {
  display: flex;
  height: 100%;
  width: 100%;
  background: var(--cf-bg-0);
  overflow: hidden;
}

.designer-left {
  flex: 0 0 240px;
  width: 240px;
  border-right: 1px solid var(--cf-border);
  background: var(--cf-bg-1);
}

.designer-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.designer-topbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--cf-border);
  background: var(--cf-bg-1);
}

.name-input {
  width: 200px;
}

.vm-select {
  width: 130px;
}

.topbar-spacer {
  flex: 1 1 auto;
}

.save-btn {
  position: relative;
}

.dirty-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cf-danger);
}

.canvas-holder {
  flex: 1 1 auto;
  min-height: 0;
}

.designer-right {
  flex: 0 0 300px;
  width: 300px;
  border-left: 1px solid var(--cf-border);
  background: var(--cf-bg-1);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.layer-wrap {
  flex: 0 0 40%;
  border-bottom: 1px solid var(--cf-border);
  min-height: 0;
}

.inspector-wrap {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
