<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDocumentStore } from "@/stores/documentStore";
import { exportJson } from "@/core/storage/workspaceRepo";
import type { Screen } from "@/core/model/types";
import ConfirmDialog from "@/shared/ui/ConfirmDialog.vue";
import Icon from "@/shared/ui/Icon.vue";

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

function clampDim(v: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(7680, Math.max(320, Math.round(v)));
}

function openCreate(): void {
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

function exportScreen(screen: Screen): void {
  download(`${screen.name || "大屏"}.screen.json`, exportJson(screen));
}

function exportWorkspace(): void {
  download("chartforge-workspace.json", ws.exportAll());
}
</script>

<template>
  <div class="library">
    <header class="library__header">
      <h1 class="library__logo"><Icon name="chart" :size="20" /> ChartForge 图表工作台</h1>
      <nav class="library__nav">
        <button class="library__nav-btn active">大屏库</button>
        <button class="library__nav-btn" @click="openCharts">图表库</button>
      </nav>
      <div class="library__actions">
        <button class="library__btn library__btn--primary" @click="openCreate">
          <Icon name="plus" :size="14" /> 新建大屏
        </button>
        <button class="library__btn" @click="exportWorkspace">
          <Icon name="download" :size="14" /> 导出全部
        </button>
      </div>
    </header>

    <main class="library__body">
      <div v-if="screens.length > 0" class="library__filters">
        <input v-model="search" class="library__search" type="search" placeholder="搜索名称或标签" />
        <select v-model="categoryFilter" class="library__select">
          <option value="">全部分类</option>
          <option value="未分类">未分类</option>
          <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
        </select>
        <div class="library__tags">
          <button
            v-for="t in allTags"
            :key="t"
            class="library__tag"
            :class="{ active: activeTag === t }"
            @click="activeTag = activeTag === t ? null : t"
          >
            {{ t }}
          </button>
        </div>
      </div>

      <div v-if="screens.length === 0" class="library__empty">
        <Icon name="chart" :size="42" />
        <p>还没有大屏，点击「新建大屏」开始制作</p>
      </div>
      <div v-else-if="filteredScreens.length === 0" class="library__empty">
        <Icon name="chart" :size="42" />
        <p>没有符合筛选条件的大屏</p>
      </div>
      <div v-else class="library__grid">
        <div v-for="screen in filteredScreens" :key="screen.id" class="library__card">
          <div class="library__thumb" @click="openWorkbench(screen.id)">
            <img v-if="screen.thumbnail" :src="screen.thumbnail" alt="" />
            <div v-else class="library__thumb-empty">
              {{ screen.canvas.width }} × {{ screen.canvas.height }}
            </div>
          </div>
          <div class="library__card-name" @click="openWorkbench(screen.id)">{{ screen.name }}</div>
          <div class="library__card-chips">
            <span v-if="screen.category" class="library__chip">{{ screen.category }}</span>
            <span v-for="t in screen.tags ?? []" :key="t" class="library__chip library__chip--tag">{{ t }}</span>
          </div>
          <div class="library__card-ops">
            <button title="编辑信息" @click="openEdit(screen)"><Icon name="settings" :size="13" /></button>
            <button title="演示" @click="openPlay(screen.id)"><Icon name="play" :size="13" /></button>
            <button title="复制" @click="duplicate(screen.id)"><Icon name="copy" :size="13" /></button>
            <button title="导出" @click="exportScreen(screen)"><Icon name="download" :size="13" /></button>
            <button title="删除" class="library__danger" @click="askDelete(screen)"><Icon name="trash" :size="13" /></button>
          </div>
        </div>
      </div>
    </main>

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
          <select v-model="createPreset" @change="onCreatePresetChange">
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
          />
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
          />
        </label>
        <label class="library__check">
          <input type="checkbox" :checked="createAspectLocked" @change="onCreateAspectLockChange" />
          <span>锁定宽高比</span>
        </label>
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
          <input v-model="editName" type="text" placeholder="图表名称" />
        </label>
        <label class="library__field">
          分类
          <select v-model="editCategory">
            <option value="">未分类</option>
            <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <label class="library__field">
          标签
          <input v-model="editTagsText" type="text" placeholder="用逗号或空格分隔" />
        </label>
      </div>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.library {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.library__header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 14px 24px;
  background: var(--cf-panel);
  border-bottom: 1px solid var(--cf-border);
}
.library__logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  margin: 0;
}
.library__nav {
  display: flex;
  gap: 6px;
}
.library__nav-btn {
  padding: 6px 14px;
  border: 1px solid var(--cf-border);
  border-radius: 7px;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  font-size: 13px;
}
.library__nav-btn.active {
  background: color-mix(in srgb, var(--cf-primary) 12%, transparent);
  border-color: var(--cf-primary);
  color: var(--cf-primary);
  font-weight: 600;
}
.library__actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.library__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid var(--cf-border);
  border-radius: 7px;
  background: transparent;
  color: var(--cf-text);
  cursor: pointer;
  font-size: 13px;
}
.library__btn--primary {
  background: var(--cf-primary);
  border-color: var(--cf-primary);
  color: #fff;
}
.library__body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
.library__filters {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.library__search {
  width: 220px;
  padding: 7px 10px;
  border: 1px solid var(--cf-border);
  border-radius: 7px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 13px;
}
.library__select {
  padding: 7px 10px;
  border: 1px solid var(--cf-border);
  border-radius: 7px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 13px;
}
.library__tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.library__tag {
  padding: 4px 10px;
  border: 1px solid var(--cf-border);
  border-radius: 999px;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  font-size: 12px;
}
.library__tag.active {
  background: color-mix(in srgb, var(--cf-primary) 12%, transparent);
  border-color: var(--cf-primary);
  color: var(--cf-primary);
}
.library__empty {
  text-align: center;
  padding: 80px 0;
  color: var(--cf-text-2);
}
.library__empty p {
  margin-top: 12px;
}
.library__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 16px;
}
.library__card {
  background: var(--cf-panel);
  border: 1px solid var(--cf-border);
  border-radius: 10px;
  overflow: hidden;
}
.library__thumb {
  aspect-ratio: 16 / 9;
  cursor: pointer;
  background: var(--cf-canvas-bg);
}
.library__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.library__thumb-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cf-text-2);
  font-size: 12px;
}
.library__card-name {
  padding: 10px 12px 4px;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.library__card-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding: 0 12px;
  min-height: 8px;
}
.library__chip {
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cf-primary) 10%, transparent);
  color: var(--cf-primary);
  font-size: 11px;
}
.library__chip--tag {
  background: var(--cf-bg);
  color: var(--cf-text-2);
  border: 1px solid var(--cf-border);
}
.library__card-ops {
  display: flex;
  gap: 2px;
  padding: 6px 8px 10px;
}
.library__card-ops button {
  border: none;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  padding: 5px 8px;
  border-radius: 6px;
}
.library__card-ops button:hover {
  background: var(--cf-bg);
  color: var(--cf-primary);
}
.library__danger:hover {
  color: var(--cf-danger) !important;
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
.library__field input,
.library__field select {
  width: 170px;
  padding: 6px 8px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 13px;
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
</style>
