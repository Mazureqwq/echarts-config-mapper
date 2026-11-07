<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDocumentStore } from "@/stores/documentStore";
import { exportJson } from "@/core/storage/workspaceRepo";
import type { Screen } from "@/core/model/types";
import ConfirmDialog from "@/shared/ui/ConfirmDialog.vue";
import ExportPackageDialog from "@/shared/ui/ExportPackageDialog.vue";
import { clampInterval, DEFAULT_INTERVAL_SEC } from "@/core/play/playlist";
import { SCREEN_TEMPLATES, templateSlots } from "@/core/model/templates";
import Icon from "@/shared/ui/Icon.vue";
import AppHeader from "@/shared/ui/AppHeader.vue";
import CollectionFilterBar from "@/shared/ui/CollectionFilterBar.vue";
import EmptyState from "@/shared/ui/EmptyState.vue";
import CollectionCardFrame from "@/shared/ui/CollectionCardFrame.vue";

const router = useRouter();
const ws = useWorkspaceStore();
const doc = useDocumentStore();

const CANVAS_PRESETS = [
  { value: "1920x1080", label: "16:9 · Full HD（1920 × 1080）", width: 1920, height: 1080 },
  { value: "2560x1440", label: "16:9 · QHD（2560 × 1440）", width: 2560, height: 1440 },
  { value: "1920x1200", label: "16:10 · 1920 × 1200", width: 1920, height: 1200 },
  { value: "1600x1200", label: "4:3 · 1600 × 1200", width: 1600, height: 1200 },
  { value: "1080x1920", label: "9:16 · 1080 × 1920", width: 1080, height: 1920 },
  { value: "2560x1080", label: "21:9 · 2560 × 1080", width: 2560, height: 1080 },
  { value: "custom", label: "自定义尺寸" },
] as const;
const CATEGORIES = ["折线图", "柱状图", "饼图", "地图", "散点图", "雷达图"];

const confirmingScreen = ref<Screen | null>(null);

const createOpen = ref(false);
const createPreset = ref("1920x1080");
const createWidth = ref(1920);
const createHeight = ref(1080);
const createAspectLocked = ref(false);
const createAspectRatio = ref(16 / 9);

const editOpen = ref(false);
const editTarget = ref<Screen | null>(null);
const editName = ref("");
const editCategory = ref("");
const editTagsText = ref("");

const search = ref("");
const categoryFilter = ref("");
const activeTag = ref<string | null>(null);

onMounted(() => {
  ws.load();
});

const screens = computed<Screen[]>(() => ws.screens);

const allTags = computed<string[]>(() => {
  const set = new Set<string>();
  for (const s of screens.value) {
    for (const t of s.tags ?? []) set.add(t);
  }
  return [...set];
});

const filteredScreens = computed<Screen[]>(() => {
  const q = search.value.trim().toLowerCase();
  return screens.value.filter((s) => {
    if (q) {
      const haystack = [s.name, ...(s.tags ?? [])].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (categoryFilter.value === "未分类") {
      if (s.category) return false;
    } else if (categoryFilter.value && s.category !== categoryFilter.value) {
      return false;
    }
    if (activeTag.value && !(s.tags ?? []).includes(activeTag.value)) return false;
    return true;
  });
});

function openWorkbench(id: string): void {
  router.push(`/workbench/${id}`);
}

function openPlay(id: string): void {
  router.push(`/play/${id}`);
}

function openCharts(): void {
  router.push("/charts");
}


// ---- 轮播演示 ----
const playlistOpen = ref(false);
const playlistPick = ref<string[]>([]);
const playlistInterval = ref(DEFAULT_INTERVAL_SEC);

function openPlaylist(): void {
  playlistPick.value = ws.workspace.screens.map((s) => s.id);
  playlistInterval.value = DEFAULT_INTERVAL_SEC;
  playlistOpen.value = true;
}

function togglePlaylistPick(id: string): void {
  playlistPick.value = playlistPick.value.includes(id)
    ? playlistPick.value.filter((x) => x !== id)
    : [...playlistPick.value, id];
}

/** 按大屏库当前顺序取选中的 id，保证轮播顺序稳定 */
function orderedPick(): string[] {
  const picked = new Set(playlistPick.value);
  return ws.workspace.screens.filter((s) => picked.has(s.id)).map((s) => s.id);
}

function startPlaylist(): void {
  const ids = orderedPick();
  if (!ids.length) return;
  const interval = clampInterval(playlistInterval.value);
  playlistOpen.value = false;
  router.push(`/play/${ids[0]}?list=${ids.join(",")}&interval=${interval}`);
}

function clampDim(v: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(7680, Math.max(320, Math.round(v)));
}

const createTemplate = ref("blank");

function openCreate(): void {
  createTemplate.value = "blank";
  createPreset.value = "1920x1080";
  createWidth.value = 1920;
  createHeight.value = 1080;
  createAspectLocked.value = false;
  createAspectRatio.value = 16 / 9;
  createOpen.value = true;
}

function onCreatePresetChange(): void {
  const preset = CANVAS_PRESETS.find((item) => item.value === createPreset.value);
  if (!preset || !("width" in preset) || !("height" in preset)) return;
  createWidth.value = preset.width;
  createHeight.value = preset.height;
  createAspectRatio.value = preset.width / preset.height;
}

function onCreateWidthInput(ev: Event): void {
  createPreset.value = "custom";
  const width = Number((ev.target as HTMLInputElement).value);
  if (!Number.isFinite(width)) return;
  createWidth.value = width;
  if (createAspectLocked.value) {
    createHeight.value = clampDim(width / createAspectRatio.value, 1080);
  }
}

function onCreateHeightInput(ev: Event): void {
  createPreset.value = "custom";
  const height = Number((ev.target as HTMLInputElement).value);
  if (!Number.isFinite(height)) return;
  createHeight.value = height;
  if (createAspectLocked.value) {
    createWidth.value = clampDim(height * createAspectRatio.value, 1920);
  }
}

function onCreateAspectLockChange(ev: Event): void {
  createAspectLocked.value = (ev.target as HTMLInputElement).checked;
  if (createAspectLocked.value) {
    createAspectRatio.value =
      clampDim(createWidth.value, 1920) / clampDim(createHeight.value, 1080);
  }
}

function confirmCreate(): void {
  const s = doc.addScreen(`大屏${ws.screens.length + 1}`, {
    width: clampDim(createWidth.value, 1920),
    height: clampDim(createHeight.value, 1080),
  });
  doc.initHistory();
  const slots = templateSlots(createTemplate.value, s.canvas);
  if (slots.length) doc.applyTemplate(slots);
  createOpen.value = false;
  openWorkbench(s.id);
}

function openEdit(screen: Screen): void {
  editTarget.value = screen;
  editName.value = screen.name;
  editCategory.value = screen.category ?? "";
  editTagsText.value = (screen.tags ?? []).join("，");
  editOpen.value = true;
}

function confirmEdit(): void {
  if (!editTarget.value) return;
  const tags = editTagsText.value
    .split(/[，,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  doc.updateScreenMeta(editTarget.value.id, {
    name: editName.value.trim(),
    category: editCategory.value,
    tags,
  });
  editOpen.value = false;
}

function duplicate(id: string): void {
  ws.duplicateScreen(id);
}

function askDelete(screen: Screen): void {
  confirmingScreen.value = screen;
}

function doDelete(): void {
  if (confirmingScreen.value) doc.removeScreen(confirmingScreen.value.id);
  confirmingScreen.value = null;
}

function download(name: string, json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** 导出可交付产物（zip 包 / 单文件 HTML） */
const exportTarget = ref<Screen | null>(null);

function openExportPackage(screen: Screen): void {
  exportTarget.value = screen;
}

function exportScreen(screen: Screen): void {
  download(`${screen.name || "大屏"}.screen.json`, exportJson(screen));
}

function exportWorkspace(): void {
  download("chartforge-workspace.json", ws.exportAll());
}
</script>

<template>
  <div class="library cf-page">
    <AppHeader active="screens">
      <template #actions>
        <div class="library__actions">
        <button class="cf-button cf-button--primary" @click="openCreate">
          <Icon name="plus" :size="14" /> 新建大屏
        </button>
        <button v-if="screens.length > 1" class="cf-button" @click="openPlaylist">
          <Icon name="chart" :size="14" /> 轮播演示
        </button>
        <button class="cf-button" @click="exportWorkspace">
          <Icon name="download" :size="14" /> 导出全部
        </button>
      </div>
      </template>
    </AppHeader>

    <main class="library__body cf-page__content" aria-label="大屏资源库">
      <section class="cf-page__heading" aria-labelledby="screens-page-title">
        <div class="cf-page__eyebrow">ChartForge · 工作区</div>
        <h2 id="screens-page-title" class="cf-page__title">大屏应用</h2>
        <p class="cf-page__description">管理可视化大屏与演示播放，选择一个大屏即可继续编辑。</p>
      </section>
      <CollectionFilterBar
        v-if="screens.length > 0"
        v-model:search="search"
        v-model:category="categoryFilter"
        v-model:active-tag="activeTag"
        :categories="CATEGORIES"
        :tags="allTags"
      />

      <EmptyState v-if="screens.length === 0" title="还没有大屏。大屏是「拼装容器」，需要先在图表库里准备好图表：">
        <ol class="empty-state__steps">
          <li>
            <strong>第 1 步 · 去图表库做图表</strong>
            {{ ws.assets.length > 0 ? `已有 ${ws.assets.length} 张图表可用，可以直接拼装。` : "新建图表并调好类型、参数和数据。" }}
          </li>
          <li>
            <strong>第 2 步 · 新建大屏并拖入图表</strong>
            在大屏画布里把左侧「图表库」的卡片拖到画布上组装、排版。
          </li>
        </ol>
        <template #actions>
          <button
            v-if="ws.assets.length === 0"
            class="cf-button cf-button--primary"
            @click="openCharts"
          >
            去图表库
          </button>
          <button class="cf-button" @click="openCreate">新建大屏</button>
        </template>
      </EmptyState>
      <EmptyState v-else-if="filteredScreens.length === 0" title="没有符合筛选条件的大屏" />
      <div v-else class="library__grid cf-collection-grid">
        <CollectionCardFrame
          v-for="screen in filteredScreens"
          :key="screen.id"
          :title="screen.name"
          :thumbnail="screen.items.length > 0 ? screen.thumbnail : null"
          @open="openWorkbench(screen.id)"
        >
          <template #thumbnail-placeholder>
            <span>{{ screen.items.length > 0 ? "预览待生成" : "空白大屏" }}</span>
            <span>{{ screen.canvas.width }} × {{ screen.canvas.height }}</span>
          </template>
          <template #metadata>
            <span v-if="screen.category" class="collection-card__chip">{{ screen.category }}</span>
            <span v-for="t in screen.tags ?? []" :key="t" class="collection-card__chip collection-card__chip--tag">{{ t }}</span>
          </template>
          <template #actions>
            <button class="cf-button cf-button--plain cf-button--icon" title="编辑信息" @click="openEdit(screen)"><Icon name="settings" :size="13" /></button>
            <button class="cf-button cf-button--plain cf-button--icon" title="演示" @click="openPlay(screen.id)"><Icon name="play" :size="13" /></button>
            <button class="cf-button cf-button--plain cf-button--icon" title="复制" @click="duplicate(screen.id)"><Icon name="copy" :size="13" /></button>
            <button class="cf-button cf-button--plain cf-button--icon" title="导出可交付产物（可直接打开 / 部署）" @click="openExportPackage(screen)">
              <Icon name="package" :size="13" />
            </button>
            <button class="cf-button cf-button--plain cf-button--icon" title="导出 JSON" @click="exportScreen(screen)"><Icon name="download" :size="13" /></button>
            <button class="cf-button cf-button--plain cf-button--icon cf-button--danger" title="删除" @click="askDelete(screen)"><Icon name="trash" :size="13" /></button>
          </template>
        </CollectionCardFrame>
      </div>
    </main>

    <ConfirmDialog
      v-if="playlistOpen"
      title="轮播演示"
      message="选中要循环播放的大屏，按设定间隔自动切换（最少 2 块）。"
      :confirm-text="`开始演示（${orderedPick().length} 块）`"
      @confirm="startPlaylist"
      @cancel="playlistOpen = false"
    >
      <div class="library__form">
        <div class="library__play-list">
          <label
            v-for="s in screens"
            :key="s.id"
            class="library__play-row"
            :class="{ active: playlistPick.includes(s.id) }"
          >
            <input
              type="checkbox"
              :checked="playlistPick.includes(s.id)"
              @change="togglePlaylistPick(s.id)"
            />
            <span class="library__play-name">{{ s.name }}</span>
            <span class="library__play-meta">{{ s.canvas.width }} × {{ s.canvas.height }}</span>
          </label>
        </div>
        <label class="library__field">
          切换间隔（秒）
          <input v-model.number="playlistInterval" type="number" min="3" max="600" step="1" class="cf-control" />
        </label>
        <div class="library__play-note">
          演示中可用 ← / → 手动切屏，空格暂停/继续，Esc 返回工作台。
        </div>
      </div>
    </ConfirmDialog>

    <ConfirmDialog
      v-if="confirmingScreen"
      title="删除大屏"
      :message="`确定删除「${confirmingScreen.name}」？此操作不可撤销。`"
      confirm-text="删除"
      @confirm="doDelete"
      @cancel="confirmingScreen = null"
    />

    <ConfirmDialog
      v-if="createOpen"
      title="新建大屏"
      message="先设置固定画布尺寸，创建后可拖入多个图表与素材。"
      confirm-text="创建空白大屏"
      @confirm="confirmCreate"
      @cancel="createOpen = false"
    >
      <div class="library__form">
        <label class="library__field">
          尺寸预设
          <select v-model="createPreset" @change="onCreatePresetChange" class="cf-control">
            <option v-for="preset in CANVAS_PRESETS" :key="preset.value" :value="preset.value">
              {{ preset.label }}
            </option>
          </select>
        </label>
        <label class="library__field">
          宽度（px）
          <input
            v-model.number="createWidth"
            type="number"
            min="320"
            max="7680"
            step="1"
            @input="onCreateWidthInput"
           class="cf-control" />
        </label>
        <label class="library__field">
          高度（px）
          <input
            v-model.number="createHeight"
            type="number"
            min="320"
            max="7680"
            step="1"
            @input="onCreateHeightInput"
           class="cf-control" />
        </label>
        <label class="library__check">
          <input type="checkbox" :checked="createAspectLocked" @change="onCreateAspectLockChange" />
          <span>锁定宽高比</span>
        </label>
        <div class="library__tpl">
          <div class="library__tpl-title">布局模板</div>
          <div class="library__tpl-grid">
            <button
              v-for="tpl in SCREEN_TEMPLATES"
              :key="tpl.id"
              class="library__tpl-card"
              :class="{ active: createTemplate === tpl.id }"
              @click="createTemplate = tpl.id"
            >
              <span class="library__tpl-name">{{ tpl.name }}</span>
              <span class="library__tpl-desc">{{ tpl.description }}</span>
            </button>
          </div>
          <div class="library__form-note">
            非空白模板会先在画布上铺好占位框；把图表拖到占位框上，占位框自动消失。
          </div>
        </div>
        <div class="library__form-note">
          设计画布：{{ clampDim(createWidth, 1920) }} × {{ clampDim(createHeight, 1080) }} px
        </div>
      </div>
    </ConfirmDialog>

    <ConfirmDialog
      v-if="editOpen && editTarget"
      title="编辑信息"
      message="修改名称、分类与标签。"
      confirm-text="保存"
      @confirm="confirmEdit"
      @cancel="editOpen = false"
    >
      <div class="library__form">
        <label class="library__field">
          名称
          <input v-model="editName" type="text" placeholder="图表名称" class="cf-control" />
        </label>
        <label class="library__field">
          分类
          <select v-model="editCategory" class="cf-control">
            <option value="">未分类</option>
            <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <label class="library__field">
          标签
          <input v-model="editTagsText" type="text" placeholder="用逗号或空格分隔" class="cf-control" />
        </label>
      </div>
    </ConfirmDialog>

    <ExportPackageDialog
      v-if="exportTarget"
      :screen="exportTarget"
      @close="exportTarget = null"
    />
  </div>
</template>

<style scoped>
.library {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.library__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  white-space: nowrap;
}
.library__body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
.library__steps li {
  background: var(--cf-panel);
  border: 1px solid var(--cf-border);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  line-height: 1.6;
}
.library__steps strong {
  display: block;
  color: var(--cf-text);
  font-size: 13px;
  margin-bottom: 2px;
}
.library__play-list {
  display: grid;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
}
.library__play-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}
.library__play-row.active {
  border-color: var(--cf-primary);
  background: color-mix(in srgb, var(--cf-primary) 8%, transparent);
}
.library__play-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.library__play-meta {
  color: var(--cf-text-2);
  font-size: 11px;
}
.library__play-note {
  font-size: 11px;
  color: var(--cf-text-2);
  line-height: 1.5;
}
.library__tpl {
  display: grid;
  gap: 6px;
}
.library__tpl-title {
  font-size: 12px;
  color: var(--cf-text-2);
}
.library__tpl-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
.library__tpl-card {
  display: grid;
  gap: 2px;
  text-align: left;
  padding: 8px 10px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: transparent;
  color: var(--cf-text);
  cursor: pointer;
}
.library__tpl-card.active {
  border-color: var(--cf-primary);
  background: color-mix(in srgb, var(--cf-primary) 10%, transparent);
}
.library__tpl-name {
  font-size: 12px;
  font-weight: 600;
}
.library__tpl-desc {
  font-size: 11px;
  color: var(--cf-text-2);
  line-height: 1.4;
}
.library__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 8px;
}
.library__field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: var(--cf-text-2);
}

.library__check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--cf-text-2);
  font-size: 12px;
  cursor: pointer;
}
.library__check input {
  accent-color: var(--cf-primary);
}
.library__form-note {
  color: var(--cf-text-2);
  font-size: 12px;
  text-align: right;
}
.library__field .cf-control { width: 170px; }
</style>
