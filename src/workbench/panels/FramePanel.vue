<script setup lang="ts">
import type { Frame } from "@/core/model/types";

const props = defineProps<{ frame: Frame }>();
const emit = defineEmits<{ (e: "change", patch: Partial<Frame>): void }>();

function onNumber(key: keyof Frame, ev: Event): void {
  const v = Number((ev.target as HTMLInputElement).value);
  if (!Number.isFinite(v)) return;
  emit("change", { [key]: v } as Partial<Frame>);
}
</script>

<template>
  <div class="frame-panel">
    <div class="frame-panel__grid">
      <label>X<input type="number" :value="Math.round(frame.x)" @change="onNumber('x', $event)" /></label>
      <label>Y<input type="number" :value="Math.round(frame.y)" @change="onNumber('y', $event)" /></label>
      <label>宽<input type="number" :value="Math.round(frame.w)" @change="onNumber('w', $event)" /></label>
      <label>高<input type="number" :value="Math.round(frame.h)" @change="onNumber('h', $event)" /></label>
      <label>旋转<input type="number" :value="Math.round(frame.rotate)" @change="onNumber('rotate', $event)" /></label>
    </div>
  </div>
</template>

<style scoped>
.frame-panel__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.frame-panel__grid label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--cf-text-2);
}
.frame-panel__grid input {
  width: 72px;
  padding: 4px 6px;
  border: 1px solid var(--cf-border);
  border-radius: 4px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 12px;
}
</style>
