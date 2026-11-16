<script setup lang="ts">
/**
 * T17：内置装饰素材目录（DataV 设计库风格）。
 *
 * 缩略图按条目类型分两条路，但都是**所见即所插**——
 * 不存在「缩略图是另画一张、插进去却是另一张」的偏差：
 *   · 矢量条目 → `decorSvg()` 现场画（带 `crispStrokes`，缩到卡片里也不糊）；
 *   · 成品 PNG 条目 → 直接用素材数据 URL（T18）。
 */
import { computed, ref } from "vue";
import {
  DECOR_GROUP_META,
  DEFAULT_DECOR_ACCENT,
  decorSvg,
  isDecorPngEntry,
  listDecorEntries,
  type DecorEntry,
  type DecorGroup,
} from "@/core/design/decorations";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { getThemeById } from "@/core/design/library";
import { decorPngDataUrl } from "@/core/design/decorPng";
import { decorDragPayload } from "@/workbench/decorActions";
import { setActiveCanvasDragPayload } from "@/shared/dnd";

const emit = defineEmits<{ select: [entry: DecorEntry] }>();
const ws = useWorkspaceStore();

const activeGroup = ref<DecorGroup | "all">("all");
const entries = computed(() =>
  activeGroup.value === "all" ? listDecorEntries() : listDecorEntries(activeGroup.value)
);

/** 缩略图跟随当前大屏主题的强调色，插进去也是这个色。 */
const accent = computed(() => {
  const screen = ws.screens.find((entry) => entry.id === ws.screens[0]?.id);
  return getThemeById(screen?.themeId)?.tokens.accent ?? DEFAULT_DECOR_ACCENT;
});

/** 缩略图：描边保持显示像素宽度，否则 480×300 缩进卡片会变成一块黑。 */
function thumb(entry: DecorEntry): string {
  if (isDecorPngEntry(entry)) return decorPngDataUrl(entry.asset as string) ?? "";
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    decorSvg(entry.id, accent.value, { crispStrokes: true })
  )}`;
}

function isFavorited(entry: DecorEntry): boolean {
  return ws.isFavorite({ kind: "decor", id: entry.id });
}

function toggleFavorite(entry: DecorEntry): void {
  ws.toggleFavorite({ kind: "decor", id: entry.id });
}

function startDrag(event: DragEvent, entry: DecorEntry): void {
  if (!event.dataTransfer) return;
  const payload = decorDragPayload(entry);
  if (!payload) return;
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(payload.mime, payload.data);
  setActiveCanvasDragPayload(payload.mime, payload.data);
  event.dataTransfer.setData("text/plain", entry.id);
}
</script>

<template>
  <section class="library-section decor-catalog" aria-labelledby="decor-catalog-heading" data-decor-section>
    <header class="section-head">
      <div><h3 id="decor-catalog-heading">内置装饰</h3><p>边框 / 标题框 / 背景框 / 装饰素材 · 点击居中添加，也可拖到画布</p></div>
    </header>

    <div class="decor-filters" role="group" aria-label="装饰分类">
      <button
        type="button"
        :aria-pressed="activeGroup === 'all'"
        data-decor-filter="all"
        @click="activeGroup = 'all'"
      >全部<i>{{ listDecorEntries().length }}</i></button>
      <button
        v-for="group in DECOR_GROUP_META"
        :key="group.id"
        type="button"
        :aria-pressed="activeGroup === group.id"
        :data-decor-filter="group.id"
        @click="activeGroup = group.id"
      >{{ group.label }}<i>{{ listDecorEntries(group.id).length }}</i></button>
    </div>

    <div class="decor-grid">
      <div v-for="entry in entries" :key="entry.id" class="decor-cell">
        <button
          class="decor-card"
          type="button"
          draggable="true"
          :aria-label="`插入 ${entry.name}`"
          :data-decor-id="entry.id"
          :data-decor-png="isDecorPngEntry(entry) ? entry.asset : undefined"
          :title="entry.description"
          @click="emit('select', entry)"
          @dragstart="startDrag($event, entry)"
        >
          <span class="decor-thumb" :class="{ 'decor-thumb--screen': entry.group === 'screen-border' }">
            <img :src="thumb(entry)" alt="" aria-hidden="true" />
            <em v-if="isDecorPngEntry(entry)" class="decor-badge">PNG</em>
          </span>
          <span class="decor-copy"><strong>{{ entry.name }}</strong><small>{{ entry.description }}</small></span>
        </button>
        <button
          class="decor-fav"
          type="button"
          :class="{ 'decor-fav--on': isFavorited(entry) }"
          :aria-pressed="isFavorited(entry)"
          :aria-label="`${isFavorited(entry) ? '取消收藏' : '收藏'} ${entry.name}`"
          :data-decor-favorite-id="entry.id"
          @click.stop="toggleFavorite(entry)"
        >{{ isFavorited(entry) ? "★" : "☆" }}</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.decor-filters { display: flex; flex-wrap: wrap; gap: 5px; }
.decor-filters button { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border: 1px solid var(--cf-border); border-radius: 999px; background: transparent; color: var(--cf-text-2); cursor: pointer; font: inherit; font-size: 10px; }
.decor-filters button[aria-pressed="true"] { border-color: var(--cf-primary); background: color-mix(in srgb, var(--cf-primary) 13%, transparent); color: var(--cf-primary); }
.decor-filters i { color: var(--cf-text-2); font-size: 9px; font-style: normal; opacity: .8; }

.decor-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.decor-cell { position: relative; display: flex; min-width: 0; }
.decor-card { display: flex; flex: 1 1 auto; min-width: 0; flex-direction: column; gap: 5px; padding: 6px; border: 1px solid var(--cf-border); border-radius: 7px; background: var(--cf-bg); color: inherit; cursor: grab; font: inherit; text-align: left; transition: border-color 120ms ease, background 120ms ease; }
.decor-card:hover { border-color: color-mix(in srgb, var(--cf-primary) 60%, var(--cf-border)); background: color-mix(in srgb, var(--cf-primary) 4%, var(--cf-bg)); }
.decor-card:focus-visible { border-color: var(--cf-primary); outline: 2px solid color-mix(in srgb, var(--cf-primary) 42%, transparent); outline-offset: 1px; }
.decor-card:active { cursor: grabbing; }

/* 深色底衬让浅色描边的装饰缩略图看得清 */
.decor-thumb { position: relative; display: block; width: 100%; height: 54px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--cf-border) 75%, transparent); border-radius: 5px; background: radial-gradient(circle at 50% 45%, #16233a, #080d16 70%); }
.decor-thumb img { display: block; width: 100%; height: 100%; object-fit: contain; filter: saturate(1.2) brightness(1.15); }
.decor-thumb--screen { height: 46px; }
.decor-badge { position: absolute; right: 3px; bottom: 3px; padding: 0 4px; border-radius: 3px; background: color-mix(in srgb, #000 62%, transparent); color: #9fd8ff; font-size: 8px; font-style: normal; letter-spacing: .04em; line-height: 1.5; }

.decor-copy { display: flex; min-width: 0; flex-direction: column; gap: 1px; }
.decor-copy strong { overflow: hidden; font-size: 10.5px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.decor-copy small { display: -webkit-box; overflow: hidden; color: var(--cf-text-2); font-size: 9px; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }

.decor-fav { position: absolute; top: 4px; right: 4px; display: inline-flex; width: 18px; height: 18px; align-items: center; justify-content: center; padding: 0; border: 1px solid transparent; border-radius: 4px; background: color-mix(in srgb, #000 32%, transparent); color: var(--cf-text-2); cursor: pointer; font-size: 11px; line-height: 1; opacity: .6; }
.decor-cell:hover .decor-fav { opacity: 1; }
.decor-fav:hover { border-color: var(--cf-border); color: #f4c542; }
.decor-fav--on { color: #f4c542; opacity: 1; }
.decor-fav:focus-visible { outline: 2px solid color-mix(in srgb, var(--cf-primary) 45%, transparent); outline-offset: 1px; opacity: 1; }
</style>
