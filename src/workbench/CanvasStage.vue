<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import { createItem } from "@/core/model/schema";
import { boxSelect } from "@/core/geometry/hit";
import { chartRegistry } from "@/core/chart/registry";
import type { ScreenItem, ChartType } from "@/core/model/types";
import ItemView from "./ItemView.vue";
import SelectionOverlay from "./SelectionOverlay.vue";

const doc = useDocumentStore();
const ui = useUiStore();

const stageEl = ref<HTMLDivElement | null>(null);
const marquee = ref<{ x: number; y: number; w: number; h: number } | null>(null);

interface Point {
  x: number;
  y: number;
}

const items = computed<ScreenItem[]>(() => doc.items);
const selectedItems = computed<ScreenItem[]>(() =>
  doc.items.filter((i) => doc.selectedIds.includes(i.id))
);

const canvasStyle = computed<Record<string, string>>(() => ({
  width: `${doc.currentScreen?.canvas.width ?? 1920}px`,
  height: `${doc.currentScreen?.canvas.height ?? 1080}px`,
  transform: `translate(${ui.pan.x}px, ${ui.pan.y}px) scale(${ui.zoom / 100})`,
  transformOrigin: "0 0",
}));

const bgStyle = computed<Record<string, string>>(() => {
  const bg = doc.currentScreen?.canvas.background;
  if (!bg) return { background: "#FFFFFF" };
  if (bg.kind === "gradient") {
    return { background: `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})` };
  }
  if (bg.kind === "image") {
    return {
      background: `url(${bg.src}) center/cover no-repeat`,
    };
  }
  return { background: bg.color };
});

function canvasPoint(ev: { clientX: number; clientY: number }): Point {
  const rect = stageEl.value?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  const z = ui.zoom / 100;
  return {
    x: (ev.clientX - rect.left - ui.pan.x) / z,
    y: (ev.clientY - rect.top - ui.pan.y) / z,
  };
}

// ---- 缩放平移 ----
let spacePressed = false;
let panState: { startX: number; startY: number; panX: number; panY: number } | null = null;
let marqueeState: { start: Point } | null = null;

function onWheel(ev: WheelEvent): void {
  const before = canvasPoint(ev);
  const factor = ev.deltaY > 0 ? 0.9 : 1.1;
  ui.setZoom(ui.zoom * factor);
  const after = canvasPoint(ev);
  const z = ui.zoom / 100;
  ui.setPan({
    x: ui.pan.x + (after.x - before.x) * z,
    y: ui.pan.y + (after.y - before.y) * z,
  });
}

function onWindowMove(ev: MouseEvent): void {
  if (panState) {
    ui.setPan({
      x: panState.panX + (ev.clientX - panState.startX),
      y: panState.panY + (ev.clientY - panState.startY),
    });
    return;
  }
  if (marqueeState) {
    const cur = canvasPoint(ev);
    const s = marqueeState.start;
    const rect = {
      x: Math.min(s.x, cur.x),
      y: Math.min(s.y, cur.y),
      w: Math.abs(cur.x - s.x),
      h: Math.abs(cur.y - s.y),
    };
    marquee.value = rect;
  }
}

function onWindowUp(ev: MouseEvent): void {
  if (marqueeState && marquee.value) {
    const hits = boxSelect(doc.items, marquee.value);
    const ids = hits.filter((i) => !i.hidden && !i.locked).map((i) => i.id);
    doc.selectedIds = ev.shiftKey
      ? [...new Set([...doc.selectedIds, ...ids])]
      : ids;
  }
  marqueeState = null;
  marquee.value = null;
  panState = null;
  window.removeEventListener("mousemove", onWindowMove);
  window.removeEventListener("mouseup", onWindowUp);
}

function onStageDown(ev: MouseEvent): void {
  if (ev.button === 1 || (ev.button === 0 && spacePressed)) {
    panState = {
      startX: ev.clientX,
      startY: ev.clientY,
      panX: ui.pan.x,
      panY: ui.pan.y,
    };
  } else if (ev.button === 0) {
    marqueeState = { start: canvasPoint(ev) };
    if (!ev.shiftKey) doc.selectedIds = [];
  }
  window.addEventListener("mousemove", onWindowMove);
  window.addEventListener("mouseup", onWindowUp);
}

function onItemClick(ev: MouseEvent, item: ScreenItem): void {
  if (item.locked || item.hidden) return;
  ev.stopPropagation();
  if (ev.shiftKey) {
    doc.selectedIds = doc.selectedIds.includes(item.id)
      ? doc.selectedIds.filter((id) => id !== item.id)
      : [...doc.selectedIds, item.id];
  } else {
    doc.selectedIds = [item.id];
  }
}

function onKeyDown(ev: KeyboardEvent): void {
  if (ev.key === "Escape") {
    doc.selectedIds = [];
  } else if (ev.code === "Space") {
    spacePressed = true;
    ev.preventDefault();
  }
}

function onKeyUp(ev: KeyboardEvent): void {
  if (ev.code === "Space") spacePressed = false;
}

window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
});

// ---- 拖入落位 ----
const DROP_MIME = "application/x-chartforge-item";

interface DropPayload {
  kind: ScreenItem["kind"];
  chartType?: ChartType;
}

function onDrop(ev: DragEvent): void {
  const raw = ev.dataTransfer?.getData(DROP_MIME);
  if (!raw) return;
  let payload: DropPayload;
  try {
    payload = JSON.parse(raw) as DropPayload;
  } catch {
    return;
  }
  const pt = canvasPoint(ev);
  let item: ScreenItem;
  if (payload.kind === "chart") {
    const type = payload.chartType ?? "line";
    item = createItem(
      "chart",
      { x: Math.round(pt.x - 200), y: Math.round(pt.y - 150) },
      chartRegistry[type].defaultSpec()
    );
  } else if (payload.kind === "text") {
    item = createItem("text", { x: Math.round(pt.x - 80), y: Math.round(pt.y - 16) });
  } else if (payload.kind === "image") {
    item = createItem("image", { x: Math.round(pt.x - 120), y: Math.round(pt.y - 80) });
  } else {
    item = createItem("shape", { x: Math.round(pt.x - 80), y: Math.round(pt.y - 50) });
  }
  doc.addItem(item);
}

defineExpose({ canvasPoint, DROP_MIME });
</script>

<template>
  <div
    ref="stageEl"
    class="canvas-stage"
    tabindex="0"
    @wheel.prevent="onWheel"
    @mousedown="onStageDown"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <div class="canvas-stage__canvas" :style="canvasStyle">
      <div class="canvas-stage__bg" :style="bgStyle" />
      <ItemView
        v-for="item in items"
        :key="item.id"
        :item="item"
        @mousedown.stop="onItemClick($event, item)"
      />
      <SelectionOverlay :selected="selectedItems" :marquee="marquee" />
    </div>
  </div>
</template>

<style scoped>
.canvas-stage {
  position: relative;
  flex: 1;
  overflow: hidden;
  background: var(--cf-canvas-bg, #e9ebf0);
  outline: none;
}
.canvas-stage__canvas {
  position: absolute;
  left: 0;
  top: 0;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
}
.canvas-stage__bg {
  position: absolute;
  inset: 0;
}
</style>
