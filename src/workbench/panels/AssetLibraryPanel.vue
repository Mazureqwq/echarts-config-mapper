<script setup lang="ts">
import { computed, ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDocumentStore } from "@/stores/documentStore";
import type { ChartAsset, ChartType } from "@/core/model/types";
import { ASSET_DND_MIME } from "@/shared/dnd";
import Icon from "@/shared/ui/Icon.vue";

const ws = useWorkspaceStore();
const doc = useDocumentStore();

const search = ref("");
const categoryFilter = ref("");
const activeTag = ref<string | null>(null);

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  line: "折线图",
  bar: "柱状图",
  pie: "饼图",
  map: "地图",
  scatter: "散点图",
  radar: "雷达图",
};
const CATEGORIES = Object.values(CHART_TYPE_LABELS);

const allTags = computed<string[]>(() => {
  const set = new Set<string>();
  for (const a of ws.assets) {
    for (const t of a.tags ?? []) set.add(t);
  }
  return [...set];
});

const filtered = computed<ChartAsset[]>(() => {
  const q = search.value.trim().toLowerCase();
  return ws.assets.filter((a) => {
    if (q) {
      const haystack = [a.name, ...(a.tags ?? [])].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (categoryFilter.value === "未分类") {
      if (a.category) return false;
    } else if (categoryFilter.value && a.category !== categoryFilter.value) {
      return false;
    }
    if (activeTag.value && !(a.tags ?? []).includes(activeTag.value)) return false;
    return true;
  });
});

function typeLabel(type: ChartType): string {
  return CHART_TYPE_LABELS[type] ?? type;
}

function drag(ev: DragEvent, asset: ChartAsset): void {
  if (!ev.dataTransfer) return;
  ev.dataTransfer.effectAllowed = "copy";
  ev.dataTransfer.setData(ASSET_DND_MIME, asset.id);
  ev.dataTransfer.setData("text/plain", asset.name);
}

function place(asset: ChartAsset): void {
  doc.placeAsset(asset.id);
}
</script>

<template>
  <div class="asset-lib">
    <input v-model="search" class="asset-lib__search" type="search" placeholder="搜索名称或标签" />
    <div class="asset-lib__filters">
      <select v-model="categoryFilter" class="asset-lib__select">
        <option value="">全部分类</option>
        <option value="未分类">未分类</option>
        <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>
    <div v-if="allTags.length > 0" class="asset-lib__tags">
      <button
        v-for="t in allTags"
        :key="t"
        class="asset-lib__tag"
        :class="{ 'asset-lib__tag--active': activeTag === t }"
        @click="activeTag = activeTag === t ? null : t"
      >
        {{ t }}
      </button>
    </div>

    <div class="asset-lib__list">
      <div
        v-for="asset in filtered"
        :key="asset.id"
        class="asset-lib__row"
        draggable="true"
        :title="`${asset.name}（${typeLabel(asset.spec.type)}）`"
        @dragstart="drag($event, asset)"
        @dblclick="place(asset)"
      >
        <img v-if="asset.thumbnail" class="asset-lib__thumb" :src="asset.thumbnail" alt="" />
        <div v-else class="asset-lib__thumb asset-lib__thumb--empty">
          <Icon name="chart" :size="18" />
        </div>
        <div class="asset-lib__meta">
          <div class="asset-lib__name">{{ asset.name }}</div>
          <div class="asset-lib__sub">
            {{ asset.category || typeLabel(asset.spec.type) }}
            <span v-for="t in asset.tags ?? []" :key="t" class="asset-lib__chip">{{ t }}</span>
          </div>
        </div>
        <button class="asset-lib__add" title="添加到画布" @click.stop="place(asset)">
          <Icon name="plus" :size="13" />
        </button>
      </div>
    </div>

    <div v-if="ws.assets.length === 0" class="asset-lib__empty">
      图表库还没有图表。先在图表库（/charts）新建并编辑图表，再拖进大屏。
    </div>
    <div v-else-if="filtered.length === 0" class="asset-lib__empty">没有符合筛选条件的图表资产</div>
    <div v-else class="asset-lib__hint">拖到画布指定位置，或双击/点击 ＋ 居中放置（均为独立副本）</div>
  </div>
</template>

<style scoped>
.asset-lib {
  padding: 12px;
}
.asset-lib__search {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 12px;
}
.asset-lib__filters {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.asset-lib__select {
  flex: 1;
  padding: 5px 8px;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 12px;
}
.asset-lib__tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.asset-lib__tag {
  padding: 2px 8px;
  border: 1px solid var(--cf-border);
  border-radius: 999px;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  font-size: 11px;
}
.asset-lib__tag--active {
  background: color-mix(in srgb, var(--cf-primary) 12%, transparent);
  border-color: var(--cf-primary);
  color: var(--cf-primary);
}
.asset-lib__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}
.asset-lib__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  border: 1px solid var(--cf-border);
  border-radius: 8px;
  background: var(--cf-bg);
  cursor: grab;
  user-select: none;
}
.asset-lib__row:hover {
  border-color: var(--cf-primary);
}
.asset-lib__thumb {
  width: 48px;
  height: 36px;
  border-radius: 5px;
  object-fit: cover;
  flex: none;
  background: var(--cf-panel);
}
.asset-lib__thumb--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cf-text-2);
}
.asset-lib__meta {
  flex: 1;
  min-width: 0;
}
.asset-lib__name {
  font-size: 12px;
  color: var(--cf-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-lib__sub {
  font-size: 11px;
  color: var(--cf-text-2);
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 2px;
}
.asset-lib__chip {
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid var(--cf-border);
  font-size: 10px;
}
.asset-lib__add {
  border: none;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  padding: 4px;
  border-radius: 5px;
  flex: none;
}
.asset-lib__add:hover {
  background: var(--cf-panel);
  color: var(--cf-primary);
}
.asset-lib__empty,
.asset-lib__hint {
  margin-top: 12px;
  color: var(--cf-text-2);
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
}
</style>
