<template>
  <main class="page">
    <header class="page-head">
      <div>
        <h1 class="title">大屏列表</h1>
        <p class="tip">创建好的大屏保存到项目内，随时复用、预览与导出</p>
      </div>
      <el-tooltip content="保存 API 仅开发环境可用" :disabled="canWrite" placement="bottom">
        <span>
          <el-button type="primary" :disabled="!canWrite" @click="onCreate">新建大屏</el-button>
        </span>
      </el-tooltip>
    </header>

    <div v-if="store.screens.length === 0" class="empty">
      <p class="empty-title">还没有大屏</p>
      <p class="empty-tip">点击右上角「新建大屏」开始搭建你的第一块大屏</p>
    </div>

    <div v-else class="grid">
      <article v-for="schema in store.screens" :key="schema.id" class="card">
        <div class="preview">
          <ScreenStage :schema="schema" />
        </div>
        <div class="card-body">
          <div class="card-name" :title="schema.name">{{ schema.name }}</div>
          <div class="card-meta">
            <span>{{ schema.items.length }} 个元素</span>
            <span>{{ formatTime(schema.updatedAt) }}</span>
          </div>
          <div class="card-actions">
            <el-button size="small" type="primary" @click="goDesigner(schema.id)">编辑</el-button>
            <el-button size="small" @click="openPreview(schema.id)">预览</el-button>
            <el-button size="small" @click="exportJson(schema)">导出</el-button>
            <el-button size="small" :disabled="!canWrite" @click="onCopy(schema)">复制</el-button>
            <el-button size="small" type="danger" plain :disabled="!canWrite" @click="onRemove(schema)">
              删除
            </el-button>
          </div>
        </div>
      </article>
    </div>
  </main>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import type { ScreenSchema } from "@/core/types";
import ScreenStage from "@/core/ScreenStage.vue";
import { formatDateTime } from "@/core/format";
import { downloadText } from "@/utils/download";
import { useScreensStore } from "@/stores/screens";
import { isSaveApiAvailable } from "@/stores/assets";

const router = useRouter();
const store = useScreensStore();
const canWrite = isSaveApiAvailable();

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : formatDateTime(date);
}

function goDesigner(id: string): void {
  router.push("/designer/" + id);
}

function openPreview(id: string): void {
  window.open("/#/screen/" + id, "_blank");
}

function exportJson(schema: ScreenSchema): void {
  downloadText(JSON.stringify(schema, null, 2), schema.name + ".screen.json");
}

async function onCreate(): Promise<void> {
  let name = "";
  try {
    const result = await ElMessageBox.prompt("请输入大屏名称", "新建大屏", {
      confirmButtonText: "创建",
      cancelButtonText: "取消",
      inputValue: "未命名大屏",
      inputPattern: /\S+/,
      inputErrorMessage: "名称不能为空",
    });
    name = (result.value ?? "").trim();
  } catch {
    return;
  }
  try {
    const schema = await store.create(name || "未命名大屏");
    ElMessage.success("大屏已创建");
    goDesigner(schema.id);
  } catch {
    ElMessage.error("创建失败：保存 API 不可用");
  }
}

async function onCopy(schema: ScreenSchema): Promise<void> {
  try {
    await store.copy(schema.id);
    ElMessage.success("已复制");
  } catch {
    ElMessage.error("复制失败");
  }
}

async function onRemove(schema: ScreenSchema): Promise<void> {
  try {
    await ElMessageBox.confirm("确定删除大屏「" + schema.name + "」？删除后不可恢复。", "删除确认", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  try {
    await store.remove(schema.id);
    ElMessage.success("已删除");
  } catch {
    ElMessage.error("删除失败");
  }
}
</script>

<style scoped>
.page {
  height: 100%;
  overflow: auto;
  padding: 24px 32px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.title {
  margin: 0 0 8px;
  font-size: 18px;
  color: var(--cf-text);
}

.tip {
  margin: 0;
  font-size: 13px;
  color: var(--cf-text-dim);
}

.empty {
  margin-top: 96px;
  text-align: center;
}

.empty-title {
  margin: 0 0 8px;
  font-size: 16px;
  color: var(--cf-text);
}

.empty-tip {
  margin: 0;
  font-size: 13px;
  color: var(--cf-text-dim);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  margin-top: 20px;
}

.card {
  border: 1px solid var(--cf-border);
  border-radius: var(--cf-radius);
  background: var(--cf-bg-1);
  padding: 12px 12px 14px;
  transition: border-color var(--cf-fast) ease;
}

.card:hover {
  border-color: var(--cf-accent);
}

.preview {
  width: 288px;
  height: 162px;
  margin: 0 auto;
  overflow: hidden;
  pointer-events: none;
  border: 1px solid var(--cf-border);
  border-radius: 4px;
}

.card-body {
  margin-top: 12px;
}

.card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--cf-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 12px;
  color: var(--cf-text-dim);
}

.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.card-actions .el-button + .el-button {
  margin-left: 0;
}
</style>
