<template>
  <aside class="layer-panel">
    <header class="layer-head">
      <span class="layer-title">图层（{{ rows.length }}）</span>
      <span class="layer-actions">
        <el-button size="small" :disabled="!designer.selectedId" @click="onBringToFront">置顶</el-button>
        <el-button size="small" :disabled="!designer.selectedId" @click="onSendBackward">上移一层</el-button>
      </span>
    </header>

    <div class="layer-list">
      <div v-if="rows.length === 0" class="layer-empty">还没有元素，从左侧物料拖入</div>
      <div
        v-for="item in rows"
        :key="item.id"
        class="layer-row"
        :class="{ active: item.id === designer.selectedId }"
        @click="designer.select(item.id)"
        @dblclick="rename(item)"
      >
        <span class="layer-z">{{ item.zIndex }}</span>
        <span class="layer-name" :title="item.name">{{ item.name }}</span>
        <button
          class="layer-btn"
          title="显示 / 隐藏"
          @click.stop="designer.toggleVisible(item.id)"
        >
          {{ item.visible ? "显" : "隐" }}
        </button>
        <button
          class="layer-btn"
          :class="{ on: item.locked }"
          title="锁定 / 解锁"
          @click.stop="designer.toggleLocked(item.id)"
        >
          {{ item.locked ? "锁" : "解" }}
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ElMessageBox } from "element-plus";
import type { ScreenItem } from "@/core/types";
import { useDesignerStore } from "@/stores/designer";

const designer = useDesignerStore();

/** 图层按 zIndex 降序展示（越靠上越在顶层） */
const rows = computed<ScreenItem[]>(() =>
  [...(designer.schema?.items ?? [])].sort((a, b) => b.zIndex - a.zIndex),
);

function onBringToFront(): void {
  if (designer.selectedId) designer.bringToFront(designer.selectedId);
}

function onSendBackward(): void {
  if (designer.selectedId) designer.sendBackward(designer.selectedId);
}

async function rename(item: ScreenItem): Promise<void> {
  try {
    const result = await ElMessageBox.prompt("请输入新名称", "重命名图层", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      inputValue: item.name,
      inputPattern: /\S+/,
      inputErrorMessage: "名称不能为空",
    });
    const value = (result.value ?? "").trim();
    if (value) designer.renameItem(item.id, value);
  } catch {
    // 用户取消
  }
}
</script>

<style scoped>
.layer-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.layer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--cf-border);
}

.layer-title {
  font-size: 12px;
  color: var(--cf-text-dim);
}

.layer-actions {
  display: flex;
  gap: 4px;
}

.layer-list {
  flex: 1 1 auto;
  overflow: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.layer-empty {
  margin: 14px 4px;
  font-size: 11.5px;
  color: var(--cf-text-faint);
}

.layer-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: var(--cf-radius-sm);
  cursor: pointer;
  transition: background var(--cf-fast) ease;
}

.layer-row:hover {
  background: var(--cf-bg-hover);
}

.layer-row.active {
  background: var(--cf-accent-soft);
}

.layer-z {
  flex: 0 0 20px;
  font-family: var(--cf-font-mono);
  font-size: 10px;
  color: var(--cf-text-faint);
  text-align: right;
}

.layer-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  color: var(--cf-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-btn {
  flex: 0 0 auto;
  padding: 2px 6px;
  border: 1px solid var(--cf-border);
  border-radius: var(--cf-radius-sm);
  background: transparent;
  font-size: 10.5px;
  color: var(--cf-text-dim);
  cursor: pointer;
  transition: all var(--cf-fast) ease;
}

.layer-btn:hover {
  border-color: var(--cf-border-strong);
  color: var(--cf-text);
}

.layer-btn.on {
  border-color: var(--cf-accent);
  color: var(--cf-accent);
}
</style>
