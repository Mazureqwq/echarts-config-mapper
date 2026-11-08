<script setup lang="ts">
import { computed, ref } from "vue";
import { useDocumentStore } from "@/stores/documentStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { BUILT_IN_BLOCKS, BUILT_IN_THEMES } from "@/core/design/library";
import { compressDesignImageFile, getDesignAssetTotalBytes } from "@/core/design/assets";
import { DESIGN_DND_MIME } from "@/shared/dnd";
import type { DesignAsset } from "@/core/model/types";
import type { LayoutBackgroundEntry } from "@/core/design/layoutBackgrounds";
import { insertLayoutBackgroundEntry } from "@/workbench/layoutBackgroundActions";
import LayoutBackgroundCatalog from "@/workbench/components/LayoutBackgroundCatalog.vue";

const doc = useDocumentStore();
const ws = useWorkspaceStore();
const fileInput = ref<HTMLInputElement | null>(null);
const error = ref("");
const notice = ref("");
const assets = computed(() => ws.designAssets);
const usedMiB = computed(() => (getDesignAssetTotalBytes(assets.value) / 1024 / 1024).toFixed(1));
const activeTheme = computed(() => doc.currentScreen?.themeId ?? "");

function requireScreen(): boolean {
  if (doc.currentScreen) return true;
  error.value = "请先创建或打开一个大屏，再插入设计素材。";
  return false;
}

function addBlock(id: string): void {
  error.value = "";
  if (requireScreen()) doc.insertBlock(id);
}
function addAsset(asset: DesignAsset): void {
  error.value = "";
  if (requireScreen()) doc.addDesignAssetImage(asset.id);
}
function addLayoutBackground(entry: LayoutBackgroundEntry): void {
  error.value = "";
  if (!requireScreen()) return;
  insertLayoutBackgroundEntry(entry, {
    insertLayoutBackground: (id) => doc.insertLayoutBackground(id),
    insertLayoutAsset: (id, position) => doc.insertLayoutAsset(id, position),
  });
}
function applyTheme(id: string): void {
  error.value = "";
  if (!requireScreen()) return;
  doc.applyTheme(id);
  notice.value = "主题已应用；现有元素位置与显式样式保持不变。";
}

function startDrag(event: DragEvent, kind: "block" | "design-asset", id: string): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(DESIGN_DND_MIME, JSON.stringify({ kind, id }));
  event.dataTransfer.setData("text/plain", id);
}

async function uploadFiles(event: Event): Promise<void> {
  error.value = "";
  notice.value = "";
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    let result;
    if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
      result = await ws.addDesignAsset({ name: file.name, mime: "image/svg+xml", content: await file.text() });
    } else {
      const image = await compressDesignImageFile(file);
      result = await ws.addDesignAsset({ name: file.name, mime: image.mime, dataUrl: image.dataUrl });
    }
    if (!result.ok) {
      error.value = result.error;
      return;
    }
    notice.value = `已添加「${result.asset.name}」；SVG 已清理，图片已处理为离线数据。`;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "导入素材失败，请检查文件格式后重试。";
  }
}

async function removeAsset(asset: DesignAsset): Promise<void> {
  const result = await ws.removeDesignAsset(asset.id);
  if (!result.ok) {
    error.value = result.error ?? "无法移除此素材。";
    return;
  }
  notice.value = `已从素材库与工作区移除「${asset.name}」。`;
}
</script>

<template>
  <div class="design-library">
    <LayoutBackgroundCatalog @select="addLayoutBackground" />

    <section class="library-section">
      <header class="section-head">
        <div><h3>主题</h3><p>为当前大屏设置默认画布与图表色板</p></div>
      </header>
      <button
        v-for="theme in BUILT_IN_THEMES"
        :key="theme.id"
        class="theme-card"
        :class="{ 'theme-card--active': activeTheme === theme.id }"
        type="button"
        :aria-pressed="activeTheme === theme.id"
        @click="applyTheme(theme.id)"
      >
        <span class="theme-swatch" :style="{ background: theme.tokens.canvas, borderColor: theme.tokens.border }">
          <i v-for="color in theme.tokens.chartPalette.slice(0, 4)" :key="color" :style="{ background: color }" />
        </span>
        <span class="theme-copy"><strong>{{ theme.name }}</strong><small>{{ theme.description }}</small></span>
        <span class="theme-check">{{ activeTheme === theme.id ? "已应用" : "应用" }}</span>
      </button>
    </section>

    <section class="library-section">
      <header class="section-head">
        <div><h3>可复用区块</h3><p>插入为副本；不会替换已有元素</p></div>
      </header>
      <button
        v-for="block in BUILT_IN_BLOCKS"
        :key="block.id"
        class="resource-row"
        type="button"
        draggable="true"
        @dragstart="startDrag($event, 'block', block.id)"
        @click="addBlock(block.id)"
      >
        <span class="resource-icon">▤</span><span class="resource-copy"><strong>{{ block.name }}</strong><small>{{ block.description }}</small></span><span class="insert-mark">＋</span>
      </button>
    </section>

    <section class="library-section">
      <header class="section-head section-head--assets">
        <div><h3>本地图片素材</h3><p>{{ assets.length }} 项 · {{ usedMiB }} / 20 MiB</p></div>
        <button class="upload-button" type="button" @click="fileInput?.click()">＋ 导入</button>
        <input ref="fileInput" class="file-input" type="file" accept="image/svg+xml,image/png,image/webp,.svg,.png,.webp" @change="uploadFiles" />
      </header>
      <p class="asset-hint">SVG、PNG、WebP；单项最大 2 MiB。导入内容保存在工作区。</p>
      <div v-if="assets.length" class="asset-list">
        <article v-for="asset in assets" :key="asset.id" class="asset-card" draggable="true" @dragstart="startDrag($event, 'design-asset', asset.id)">
          <button class="asset-preview" type="button" :aria-label="`插入 ${asset.name}`" @click="addAsset(asset)">
            <img :src="asset.dataUrl" alt="" draggable="false" />
          </button>
          <div class="asset-info"><strong :title="asset.name">{{ asset.name }}</strong><small>{{ asset.mime.replace('image/', '').toUpperCase() }} · {{ (asset.bytes / 1024).toFixed(0) }} KiB</small></div>
          <button class="remove-button" type="button" :aria-label="`删除 ${asset.name}`" @click="removeAsset(asset)">×</button>
        </article>
      </div>
      <p v-else class="empty-state">还没有图片素材。导入后可点击或拖到画布。</p>
    </section>

    <p v-if="error" class="feedback feedback--error" role="alert">{{ error }}</p>
    <p v-else-if="notice" class="feedback" role="status">{{ notice }}</p>
  </div>
</template>

<style scoped>
.design-library { display: flex; flex-direction: column; gap: 18px; padding: 12px; color: var(--cf-text); }
.library-section { min-width: 0; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.section-head h3 { margin: 0; font-size: 12px; font-weight: 700; }
.section-head p, .asset-hint { margin: 3px 0 0; color: var(--cf-text-2); font-size: 10px; line-height: 1.45; }
.theme-card, .resource-row { display: flex; width: 100%; align-items: center; gap: 9px; margin-top: 6px; padding: 8px; border: 1px solid var(--cf-border); border-radius: 7px; background: var(--cf-panel); color: inherit; text-align: left; cursor: pointer; }
.theme-card:hover, .resource-row:hover, .theme-card--active { border-color: var(--cf-primary); }
.theme-swatch { display: flex; width: 44px; height: 32px; flex: 0 0 44px; align-items: flex-end; gap: 3px; padding: 4px; border: 1px solid; border-radius: 5px; }
.theme-swatch i { width: 6px; height: 14px; border-radius: 2px; }
.theme-copy, .resource-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }
.theme-copy strong, .resource-copy strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.theme-copy small, .resource-copy small { color: var(--cf-text-2); font-size: 9px; line-height: 1.35; }
.theme-check { color: var(--cf-primary); font-size: 9px; white-space: nowrap; }
.resource-icon { display: grid; width: 28px; height: 28px; flex: 0 0 28px; place-items: center; border-radius: 5px; background: color-mix(in srgb, var(--cf-primary) 12%, transparent); color: var(--cf-primary); font-size: 15px; }
.insert-mark { color: var(--cf-primary); font-size: 16px; }
.upload-button { flex: 0 0 auto; padding: 5px 8px; border: 1px solid var(--cf-border); border-radius: 5px; background: transparent; color: var(--cf-primary); cursor: pointer; font: inherit; font-size: 10px; }
.file-input { display: none; }
.asset-hint { margin-bottom: 8px; }
.asset-list { display: flex; flex-direction: column; gap: 6px; }
.asset-card { display: flex; min-width: 0; align-items: center; gap: 7px; padding: 6px; border: 1px solid var(--cf-border); border-radius: 6px; background: var(--cf-panel); }
.asset-preview { display: grid; width: 42px; height: 36px; flex: 0 0 42px; place-items: center; overflow: hidden; border: 0; border-radius: 4px; background: color-mix(in srgb, var(--cf-border) 45%, transparent); cursor: pointer; }
.asset-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
.asset-info { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }
.asset-info strong { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.asset-info small { color: var(--cf-text-2); font-size: 9px; }
.remove-button { border: 0; background: transparent; color: var(--cf-text-2); cursor: pointer; font-size: 17px; }
.remove-button:hover { color: #ef5967; }
.empty-state { margin: 7px 0; color: var(--cf-text-2); font-size: 10px; }
.feedback { margin: 0; padding: 7px 8px; border-radius: 5px; background: color-mix(in srgb, var(--cf-primary) 10%, transparent); color: var(--cf-primary); font-size: 10px; line-height: 1.45; }
.feedback--error { background: rgba(230, 70, 70, 0.12); color: #d84d57; }
</style>
