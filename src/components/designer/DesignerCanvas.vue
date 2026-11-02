<template>
  <div class="designer-canvas">
    <Scaler
      ref="scalerRef"
      :width="designer.schema?.canvas.width"
      :height="designer.schema?.canvas.height"
      :fixed-scale="fixedScale"
    >
      <div
        class="canvas-surface"
        :style="surfaceStyle"
        @dragover.prevent
        @drop.prevent="onDrop"
        @pointerdown="selectEmpty"
      >
        <div
          v-for="item in designer.schema?.items ?? []"
          :key="item.id"
          class="canvas-item"
          :class="{ locked: item.locked }"
          :style="itemStyle(item)"
          @pointerdown.stop="startDrag(item, $event)"
        >
          <ScreenItemView :item="item" />
        </div>
        <div v-if="selectedItem" class="selection-frame" :style="itemStyle(selectedItem)">
          <div
            v-for="handle in HANDLES"
            :key="handle"
            class="selection-handle"
            :data-handle="handle"
            :style="handleStyle(handle)"
            @pointerdown.stop.prevent="startResizeSelected(handle, $event)"
          ></div>
        </div>
      </div>
    </Scaler>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Scaler from "@/core/Scaler.vue";
import ScreenItemView from "@/core/ScreenItemView.vue";
import { applyResize } from "@/core/resize";
import type { ResizeHandle } from "@/core/resize";
import { createScreenItem } from "@/core/item";
import { DEFAULT_SIZES, SCREEN_H, SCREEN_W } from "@/core/types";
import type { ItemType, Rect, ScreenItem } from "@/core/types";
import { useAssetsStore } from "@/stores/assets";
import { useDesignerStore } from "@/stores/designer";

/** 物料拖拽载荷：资产只带 assetId，落点时再查（避免拖大对象进 dataTransfer） */
interface PalettePayload {
  kind: "chart-asset" | "chart-default" | "widget";
  assetId?: string;
  type?: ItemType;
}

const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const designer = useDesignerStore();
const assetsStore = useAssetsStore();
const scalerRef = ref<InstanceType<typeof Scaler> | null>(null);

/** 非 fit 视图用固定缩放档位（0.5 / 1），fit 时交给 Scaler 自适应 */
const fixedScale = computed<number | undefined>(() =>
  designer.viewMode === "fit" ? undefined : designer.viewMode,
);

const surfaceStyle = computed<Record<string, string>>(() => ({
  background: designer.schema?.canvas.background ?? "transparent",
}));

const selectedItem = computed<ScreenItem | null>(() => {
  if (!designer.schema || !designer.selectedId) return null;
  return designer.schema.items.find((item) => item.id === designer.selectedId) ?? null;
});

function toCanvasPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
  return scalerRef.value?.toCanvas(event) ?? { x: 0, y: 0 };
}

function itemStyle(item: ScreenItem): Record<string, string> {
  return {
    left: item.rect.x + "px",
    top: item.rect.y + "px",
    width: item.rect.w + "px",
    height: item.rect.h + "px",
    zIndex: String(item.zIndex),
  };
}

const HANDLE_ANCHORS: Record<ResizeHandle, [number, number]> = {
  nw: [0, 0],
  n: [50, 0],
  ne: [100, 0],
  e: [100, 50],
  se: [100, 100],
  s: [50, 100],
  sw: [0, 100],
  w: [0, 50],
};

function handleStyle(handle: ResizeHandle): Record<string, string> {
  const [px, py] = HANDLE_ANCHORS[handle];
  return {
    left: px + "%",
    top: py + "%",
    transform: "translate(-50%, -50%)",
  };
}

function selectEmpty(): void {
  designer.select(null);
}

/** 拖入落点 → 画布坐标并按元素尺寸居中、钳制到画布内 */
function clampPos(x: number, y: number, w: number, h: number): Partial<Rect> {
  return {
    x: Math.min(Math.max(x, 0), Math.max(0, SCREEN_W - w)),
    y: Math.min(Math.max(y, 0), Math.max(0, SCREEN_H - h)),
  };
}

function onDrop(event: DragEvent): void {
  const raw = event.dataTransfer?.getData("cf/palette");
  if (!raw || !designer.schema) return;
  let payload: PalettePayload;
  try {
    payload = JSON.parse(raw) as PalettePayload;
  } catch {
    return;
  }
  const pos = toCanvasPoint(event);
  if (payload.kind === "chart-asset" && payload.assetId) {
    const asset = assetsStore.byId(payload.assetId);
    if (!asset) return;
    const size = DEFAULT_SIZES.chart;
    designer.addItemFromAsset(
      asset,
      clampPos(pos.x - size.w / 2, pos.y - size.h / 2, size.w, size.h),
    );
    return;
  }
  if (payload.kind === "chart-default") {
    const size = DEFAULT_SIZES.chart;
    designer.addItem(
      createScreenItem("chart", clampPos(pos.x - size.w / 2, pos.y - size.h / 2, size.w, size.h)),
    );
    return;
  }
  if (payload.kind === "widget" && payload.type) {
    const size = DEFAULT_SIZES[payload.type];
    designer.addItem(
      createScreenItem(
        payload.type,
        clampPos(pos.x - size.w / 2, pos.y - size.h / 2, size.w, size.h),
      ),
    );
  }
}

/** pointerdown 拖动：实时位移走 updateRect(record=false)，pointerup 统一 commit */
function startDrag(item: ScreenItem, event: PointerEvent): void {
  designer.select(item.id);
  if (item.locked) return;
  const start = toCanvasPoint(event);
  const originX = item.rect.x;
  const originY = item.rect.y;
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);
  let moved = false;

  const onMove = (moveEvent: PointerEvent): void => {
    const pos = toCanvasPoint(moveEvent);
    moved = true;
    designer.updateRect(
      item.id,
      { x: originX + (pos.x - start.x), y: originY + (pos.y - start.y) },
      false,
    );
  };
  const onUp = (): void => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    if (moved) designer.commit();
  };
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
}

function startResize(item: ScreenItem, handle: ResizeHandle, event: PointerEvent): void {
  const start = toCanvasPoint(event);
  const origin = { ...item.rect };
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);
  let moved = false;

  const onMove = (moveEvent: PointerEvent): void => {
    const pos = toCanvasPoint(moveEvent);
    const next = applyResize(origin, handle, pos.x - start.x, pos.y - start.y);
    moved = true;
    designer.updateRect(item.id, next, false);
  };
  const onUp = (): void => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    if (moved) designer.commit();
  };
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
}

function startResizeSelected(handle: ResizeHandle, event: PointerEvent): void {
  const item = selectedItem.value;
  if (item) startResize(item, handle, event);
}
</script>

<style scoped>
.designer-canvas {
  width: 100%;
  height: 100%;
}

.canvas-surface {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.canvas-item {
  position: absolute;
  cursor: move;
}

.canvas-item.locked {
  cursor: default;
}

.selection-frame {
  position: absolute;
  border: 1px dashed var(--cf-accent);
  pointer-events: none;
  z-index: 9999;
}

.selection-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #ffffff;
  border: 1px solid var(--cf-accent);
  border-radius: 2px;
  pointer-events: auto;
  cursor: nwse-resize;
  z-index: 10000;
}
</style>
