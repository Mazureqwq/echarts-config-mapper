<script setup lang="ts">
import { computed } from "vue";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import type { ChartItem, Frame, ScreenItem } from "@/core/model/types";
import FramePanel from "./panels/FramePanel.vue";
import StylePanel from "./panels/StylePanel.vue";
import ScreenPanel from "./panels/ScreenPanel.vue";
import ChartConfigPanel from "./panels/ChartConfigPanel.vue";
import DataTablePanel from "./panels/DataTablePanel.vue";
import Icon from "@/shared/ui/Icon.vue";
import type { AlignMode } from "@/stores/documentStore";

const doc = useDocumentStore();
const ui = useUiStore();

const selected = computed<ScreenItem[]>(() =>
  doc.items.filter((i) => doc.selectedIds.includes(i.id))
);
const single = computed<ScreenItem | null>(() =>
  selected.value.length === 1 ? selected.value[0] : null
);
const focusItem = computed<ChartItem | null>(() => {
  if (!ui.editingId) return null;
  const it = doc.items.find((i) => i.id === ui.editingId);
  return it && it.kind === "chart" ? it : null;
});

const ALIGN_TOOLS: Array<{ mode: AlignMode; icon: string; title: string }> = [
  { mode: "left", icon: "align-left", title: "左对齐" },
  { mode: "centerX", icon: "align-center", title: "水平居中" },
  { mode: "right", icon: "align-right", title: "右对齐" },
  { mode: "distributeH", icon: "distribute-h", title: "水平等间距" },
  { mode: "top", icon: "align-top", title: "顶对齐" },
  { mode: "centerY", icon: "align-middle", title: "垂直居中" },
  { mode: "bottom", icon: "align-bottom", title: "底对齐" },
  { mode: "distributeV", icon: "distribute-v", title: "垂直等间距" },
];

function onFrameChange(patch: Partial<Frame>): void {
  if (single.value) doc.updateItemFrame(single.value.id, patch);
}
</script>

<template>
  <div class="inspector">
    <!-- 聚焦编辑 -->
    <template v-if="focusItem">
      <div class="inspector__head">
        <span>聚焦编辑：{{ focusItem.name }}</span>
        <button class="inspector__back" @click="ui.setEditing(null)">返回（Esc）</button>
      </div>
      <div class="inspector__body">
        <div class="inspector__section"><ChartConfigPanel :item="focusItem" /></div>
        <div class="inspector__section"><DataTablePanel :item="focusItem" /></div>
      </div>
    </template>

    <!-- 多选 -->
    <template v-else-if="selected.length > 1">
      <div class="inspector__head">已选 {{ selected.length }} 个元素</div>
      <div class="inspector__body">
        <div class="inspector__section">
          <div class="inspector__section-title">对齐分布</div>
          <div class="inspector__align-grid">
            <button
              v-for="t in ALIGN_TOOLS"
              :key="t.mode"
              class="inspector__icon-btn"
              :title="t.title"
              @click="doc.alignDistribute(t.mode)"
            >
              <Icon :name="t.icon" :size="15" />
            </button>
          </div>
          <div class="inspector__align-grid">
            <button class="inspector__icon-btn" title="组合 (Ctrl+G)" @click="doc.addGroup()">
              <Icon name="group" :size="15" />
            </button>
            <button class="inspector__icon-btn" title="取消组合" @click="doc.ungroup()">
              <Icon name="close" :size="15" />
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- 单选 -->
    <template v-else-if="single">
      <div class="inspector__head">
        <span>{{ single.name || single.kind }}</span>
        <button
          v-if="single.kind === 'chart'"
          class="inspector__back"
          title="聚焦编辑"
          @click="ui.setEditing(single.id)"
        >
          聚焦编辑
        </button>
      </div>
      <div class="inspector__body">
        <div class="inspector__section">
          <div class="inspector__section-title">位置尺寸</div>
          <FramePanel :frame="single.frame" @change="onFrameChange" />
        </div>
        <div class="inspector__section">
          <div class="inspector__section-title">属性</div>
          <StylePanel :item="single" />
        </div>
        <template v-if="single.kind === 'chart'">
          <div class="inspector__section">
            <div class="inspector__section-title">图表配置</div>
            <ChartConfigPanel :item="single" />
          </div>
          <div class="inspector__section">
            <DataTablePanel :item="single" />
          </div>
        </template>
      </div>
    </template>

    <!-- 无选中 -->
    <template v-else>
      <div class="inspector__head">画布设置</div>
      <div class="inspector__body">
        <div class="inspector__section"><ScreenPanel /></div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.inspector {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.inspector__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--cf-border);
  font-weight: 600;
  font-size: 13px;
}
.inspector__back {
  padding: 3px 10px;
  font-size: 12px;
  border: 1px solid var(--cf-border);
  border-radius: 5px;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
}
.inspector__body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.inspector__section {
  margin-bottom: 18px;
}
.inspector__section-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--cf-text);
}
.inspector__align-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.inspector__icon-btn {
  width: 32px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
}
.inspector__icon-btn:hover {
  color: var(--cf-primary);
  border-color: var(--cf-primary);
}
</style>
