<script setup lang="ts">
import { computed, ref } from "vue";
import { useDocumentStore } from "@/stores/documentStore";
import type { ScreenItem } from "@/core/model/types";
import { resizeFrame, rotateFrame } from "@/core/geometry/transform";
import type { Handle } from "@/core/geometry/transform";
import { frameCenter } from "@/core/geometry/hit";

const props = defineProps<{ item: ScreenItem; zoom: number }>();
const doc = useDocumentStore();

const wrapperEl = ref<HTMLDivElement | null>(null);

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
  const f = props.item.frame;
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
  const rad = (-props.item.frame.rotate * Math.PI) / 180;
  return {
    dx: dx * Math.cos(rad) - dy * Math.sin(rad),
    dy: dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

function onHandleDown(ev: MouseEvent, handle: Handle): void {
  ev.stopPropagation();
  ev.preventDefault();
  const start = { x: ev.clientX, y: ev.clientY };
  const frame0 = { ...props.item.frame };
  const zoom = props.zoom / 100;
  const move = (e: MouseEvent) => {
    const local = toLocalDelta((e.clientX - start.x) / zoom, (e.clientY - start.y) / zoom);
    const next = resizeFrame(frame0, handle, local.dx, local.dy, { keepAspect: e.shiftKey });
    doc.updateItemFrame(props.item.id, next, { commit: false });
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
  const frame0 = { ...props.item.frame };
  const c = frameCenter(frame0);
  const rect = wrapperEl.value?.getBoundingClientRect();
  const cx = rect ? rect.left + rect.width / 2 : ev.clientX;
  const cy = rect ? rect.top + rect.height / 2 : ev.clientY;
  const startAngle = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI;
  const move = (e: MouseEvent) => {
    const angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    const target = frame0.rotate + (angle - startAngle);
    const next = rotateFrame(frame0, c, target, { snap: e.shiftKey });
    doc.updateItemFrame(props.item.id, next, { commit: false });
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
  <div ref="wrapperEl" class="transform-handles" :style="wrapperStyle">
    <div class="transform-handles__rotate-line" />
    <button
      class="transform-handles__rotate"
      title="旋转（Shift 吸附 15°）"
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
