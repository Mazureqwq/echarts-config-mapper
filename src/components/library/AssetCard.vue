<template>
  <div ref="rootEl" class="asset-card">
    <div class="card-preview">
      <ChartRenderer v-if="visible" :chart="chart" />
      <span v-else class="preview-loading">加载中…</span>
    </div>
    <div class="card-meta">
      <span class="asset-name" :title="asset.name">{{ asset.name }}</span>
      <span class="asset-category">{{ asset.category || "未分类" }}</span>
    </div>
    <div class="card-actions">
      <button class="action-btn" type="button" @click="editCopy">编辑副本</button>
      <button class="action-btn danger" type="button" @click="removeAsset">删除</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import type { ChartAsset } from "@/core/types";
import type { ChartInstance } from "@/types/chart";
import ChartRenderer from "@/components/chart/ChartRenderer.vue";
import { useAssetsStore } from "@/stores/assets";

const props = defineProps<{ asset: ChartAsset }>();

const router = useRouter();
const assetsStore = useAssetsStore();

const rootEl = ref<HTMLElement | null>(null);
const visible = ref(false);
let observer: IntersectionObserver | null = null;

/** 复用 ChartRenderer：以资产快照构造一张 288x216 的图表卡片 */
const chart = computed<ChartInstance>(() => ({
  id: props.asset.id,
  type: props.asset.chartType,
  title: props.asset.name,
  x: 0,
  y: 0,
  w: 288,
  h: 216,
  option: props.asset.option,
}));

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          visible.value = true;
          if (observer) {
            observer.disconnect();
            observer = null;
          }
        }
      }
    },
    { rootMargin: "160px" },
  );
  if (rootEl.value) observer.observe(rootEl.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

/** 带着资产 id 进入编辑器（副本语义，不回写资产） */
function editCopy(): void {
  router.push({ path: "/editor", query: { fromAsset: props.asset.id } });
}

async function removeAsset(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      "删除后不可恢复，确定删除图表资产「" + props.asset.name + "」吗？",
      "删除资产",
      { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" },
    );
  } catch {
    return;
  }
  try {
    await assetsStore.deleteAsset(props.asset.id);
  } catch {
    ElMessage.error("删除资产失败");
  }
}
</script>

<style scoped>
.asset-card {
  position: relative;
  width: 288px;
  border: 1px solid var(--cf-border);
  border-radius: var(--cf-radius);
  background: var(--cf-bg-1);
  overflow: hidden;
  transition: border-color var(--cf-fast), transform var(--cf-fast);
}

.asset-card:hover {
  border-color: var(--cf-border-strong);
  transform: translateY(-2px);
}

.card-preview {
  width: 100%;
  height: 216px;
  background: var(--cf-stage);
}

.preview-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 12px;
  color: var(--cf-text-faint);
}

.card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
}

.asset-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--cf-text);
}

.asset-category {
  flex: none;
  font-size: 12px;
  color: var(--cf-text-dim);
}

.card-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity var(--cf-fast);
}

.asset-card:hover .card-actions,
.asset-card:focus-within .card-actions {
  opacity: 1;
}

.action-btn {
  padding: 3px 8px;
  font-size: 12px;
  font-family: inherit;
  color: var(--cf-text);
  background: rgba(11, 15, 23, 0.72);
  border: 1px solid var(--cf-border-strong);
  border-radius: var(--cf-radius-sm);
  cursor: pointer;
  transition: background var(--cf-fast), color var(--cf-fast), border-color var(--cf-fast);
}

.action-btn:hover {
  background: rgba(11, 15, 23, 0.92);
  border-color: var(--cf-accent);
  color: var(--cf-accent);
}

.action-btn.danger:hover {
  border-color: var(--cf-danger);
  color: var(--cf-danger);
}
</style>
