<script setup lang="ts">
import { computed, ref } from "vue";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import type { Frame, ScreenItem } from "@/core/model/types";
import { resizeFrame, rotateFrame, snapResizeFrameToGrid } from "@/core/geometry/transform";
import type { Handle } from "@/core/geometry/transform";
import { frameCenter, rotatePoint } from "@/core/geometry/hit";

const props = defineProps<{ items: ScreenItem[]; zoom: number }>();
const doc = useDocumentStore();
const ui = useUiStore();

const wrapperEl = ref<HTMLDivElement | null>(null);

const single = computed<ScreenItem | null>(() =>
  props.items.length === 1 ? props.items[0] : null
);

const virtualFrame = computed<Frame>(() => {
  if (single.value) return { ...single.value.frame };
  const xs = props.items.map((i) => i.frame.x);
  const ys = props.items.map((i) => i.frame.y);
  const x2 = props.items.map((i) => i.frame.x + i.frame.w);
  const y2 = props.items.map((i) => i.frame.y + i.frame.h);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...x2) - x, h: Math.max(...y2) - y, rotate: 0 };
});

const HANDLES: Array<{ handle: Handle; cursor: string; left: string; top: string }> = [
  { handle: "nw", cursor: "nwse-resize", left: "0%", top: "0%" },
  { handle: "n", cursor: "ns-resize", left: "50%", top: "0%" },
  { handle: "ne", cursor: "nesw-resize", left: "100%", top: "0%" },
  { handle: "e", cursor: "ew-resize", left: "100%", top: "50%" },
  { handle: "se", cursor: "nwse-resize", left: "100%", top: "100%" },
  { handle: "s", cursor: "ns-resize", left: "50%", top: "100%" },
  { handle: "sw", cursor: "nesw-resize", left: "0%", top: "100%" },
  { handle: "w", cursor: "ew-resize", left: "0%", top: "50%" },
];

const wrapperStyle = computed(() => {
  const f = virtualFrame.value;
  return {
    left: `${f.x}px`,
    top: `${f.y}px`,
    width: `${f.w}px`,
    height: `${f.h}px`,
    transform: `rotate(${f.rotate}deg)`,
    transformOrigin: "center center",
  };
});

function toLocalDelta(dx: number, dy: number): { dx: number; dy: number } {
  const rad = (-virtualFrame.value.rotate * Math.PI) / 180;
  return {
    dx: dx * Math.cos(rad) - dy * Math.sin(rad),
    dy: dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

function applyMultiResize(next: Frame): void {
  const vb = virtualFrame.value;
  const sx = vb.w > 0 ? next.w / vb.w : 1;
  const sy = vb.h > 0 ? next.h / vb.h : 1;
  for (const it of props.items) {
    if (it.locked) continue;
    doc.updateItemFrame(
      it.id,
      {
        x: next.x + (it.frame.x - vb.x) * sx,
        y: next.y + (it.frame.y - vb.y) * sy,
        w: it.frame.w * sx,
        h: it.frame.h * sy,
      },
      { commit: false }
    );
  }
}

function onHandleDown(ev: MouseEvent, handle: Handle): void {
  ev.stopPropagation();
  ev.preventDefault();
  const start = { x: ev.clientX, y: ev.clientY };
  const frame0 = { ...virtualFrame.value };
  const zoom = props.zoom / 100;
  const isSingle = single.value !== null;
  const move = (e: MouseEvent) => {
    const local = toLocalDelta((e.clientX - start.x) / zoom, (e.clientY - start.y) / zoom);
    const resized = resizeFrame(frame0, handle, local.dx, local.dy, { keepAspect: e.shiftKey });
    const next = ui.gridSnapEnabled
      ? snapResizeFrameToGrid(frame0, resized, handle, ui.gridSize, e.shiftKey)
      : resized;
    if (isSingle) {
      doc.updateItemFrame(single.value!.id, next, { commit: false });
    } else {
      applyMultiResize(next);
    }
  };
  const up = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    doc.commit();
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
}

function onRotateDown(ev: MouseEvent): void {
  ev.stopPropagation();
  ev.preventDefault();
  const frame0 = { ...virtualFrame.value };
  const c = frameCenter(frame0);
  const rect = wrapperEl.value?.getBoundingClientRect();
  const cx = rect ? rect.left + rect.width / 2 : ev.clientX;
  const cy = rect ? rect.top + rect.height / 2 : ev.clientY;
  const startAngle = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI;
  const isSingle = single.value !== null;
  const move = (e: MouseEvent) => {
    const angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    let delta = angle - startAngle;
    if (e.shiftKey) delta = Math.round(delta / 15) * 15;
    if (isSingle) {
      const next = rotateFrame(frame0, c, frame0.rotate + delta, {});
      doc.updateItemFrame(single.value!.id, next, { commit: false });
    } else {
      for (const it of props.items) {
        if (it.locked) continue;
        const ic = frameCenter(it.frame);
        const nc = rotatePoint(ic, c, delta);
        doc.updateItemFrame(
          it.id,
          {
            x: nc.x - it.frame.w / 2,
            y: nc.y - it.frame.h / 2,
            rotate: (((it.frame.rotate + delta) % 360) + 360) % 360,
          },
          { commit: false }
        );
      }
    }
  };
  const up = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    doc.commit();
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
}
</script>

<template>
  <div ref="wrapperEl" class="transform-handles" data-ui-only :style="wrapperStyle">
    <div class="transform-handles__rotate-line" />
    <button
      class="transform-handles__rotate"
      :title="single ? '旋转（Shift 吸附 15°）' : '整体旋转'"
      @mousedown="onRotateDown"
    />
    <button
      v-for="h in HANDLES"
      :key="h.handle"
      class="transform-handles__handle"
      :style="{ left: h.left, top: h.top, cursor: h.cursor }"
      @mousedown="onHandleDown($event, h.handle)"
    />
  </div>
</template>

<style scoped>
.transform-handles {
  position: absolute;
  pointer-events: none;
}
.transform-handles__handle,
.transform-handles__rotate {
  position: absolute;
  width: 9px;
  height: 9px;
  padding: 0;
  border: 1.5px solid var(--cf-primary, #4f6ef7);
  background: #fff;
  border-radius: 2px;
  transform: translate(-50%, -50%);
  pointer-events: auto;
}
.transform-handles__rotate-line {
  position: absolute;
  left: 50%;
  top: -24px;
  width: 1px;
  height: 24px;
  background: var(--cf-primary, #4f6ef7);
}
.transform-handles__rotate {
  left: 50%;
  top: -24px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  cursor: grab;
}
</style>