<script setup lang="ts">
import { computed } from "vue";
import { useDocumentStore } from "@/stores/documentStore";
import { themeMode, setTheme } from "@/shared/theme";
import type { Background } from "@/core/model/types";

const doc = useDocumentStore();
const screen = computed(() => doc.currentScreen);

function onName(ev: Event): void {
  doc.setScreenName((ev.target as HTMLInputElement).value);
}

function onCanvasDim(dim: "width" | "height", ev: Event): void {
  const raw = Number((ev.target as HTMLInputElement).value);
  if (!Number.isFinite(raw)) return;
  const value = Math.min(7680, Math.max(320, Math.round(raw)));
  if (dim === "width") doc.setCanvas({ width: value });
  else doc.setCanvas({ height: value });
}

function onKind(ev: Event): void {
  const kind = (ev.target as HTMLSelectElement).value;
  const cur = screen.value?.canvas.background;
  let bg: Background;
  if (kind === "gradient") {
    bg = { kind: "gradient", from: cur?.kind === "gradient" ? cur.from : "#5470C6", to: cur?.kind === "gradient" ? cur.to : "#91CC75", angle: 180 };
  } else if (kind === "image") {
    bg = { kind: "image", src: cur?.kind === "image" ? cur.src : "" };
  } else {
    bg = { kind: "color", color: cur?.kind === "color" ? cur.color : "#FFFFFF" };
  }
  doc.setCanvas({ background: bg });
}

function patchBg(patch: Partial<Extract<Background, { kind: "color" }>> & Partial<Extract<Background, { kind: "gradient" }>> & Partial<Extract<Background, { kind: "image" }>>): void {
  const cur = screen.value?.canvas.background;
  if (!cur) return;
  doc.setCanvas({ background: { ...cur, ...patch } as Background });
}
</script>

<template>
  <div v-if="screen" class="screen-panel">
    <label class="screen-panel__row">图表名称
      <input :value="screen.name" @change="onName" />
    </label>
    <label class="screen-panel__row">画布尺寸
      <span class="screen-panel__dims">
        <input
          type="number"
          min="320"
          max="7680"
          :value="screen.canvas.width"
          @change="onCanvasDim('width', $event)"
        />
        ×
        <input
          type="number"
          min="320"
          max="7680"
          :value="screen.canvas.height"
          @change="onCanvasDim('height', $event)"
        />
      </span>
    </label>
    <label class="screen-panel__row">背景类型
      <select :value="screen.canvas.background.kind" @change="onKind">
        <option value="color">纯色</option>
        <option value="gradient">渐变</option>
        <option value="image">图片</option>
      </select>
    </label>
    <template v-if="screen.canvas.background.kind === 'color'">
      <label class="screen-panel__row">背景色
        <input type="color" :value="screen.canvas.background.color" @input="patchBg({ color: ($event.target as HTMLInputElement).value } as never)" />
      </label>
    </template>
    <template v-else-if="screen.canvas.background.kind === 'gradient'">
      <label class="screen-panel__row">起始色
        <input type="color" :value="screen.canvas.background.from" @input="patchBg({ from: ($event.target as HTMLInputElement).value } as never)" />
      </label>
      <label class="screen-panel__row">结束色
        <input type="color" :value="screen.canvas.background.to" @input="patchBg({ to: ($event.target as HTMLInputElement).value } as never)" />
      </label>
      <label class="screen-panel__row">角度
        <input type="number" :value="screen.canvas.background.angle" @change="patchBg({ angle: Number(($event.target as HTMLInputElement).value) } as never)" />
      </label>
    </template>
    <template v-else>
      <label class="screen-panel__row">图片地址
        <input :value="screen.canvas.background.src" @change="patchBg({ src: ($event.target as HTMLInputElement).value } as never)" />
      </label>
    </template>
    <label class="screen-panel__row">界面主题
      <select :value="themeMode" @change="setTheme(($event.target as HTMLSelectElement).value as never)">
        <option value="light">亮色</option>
        <option value="dark">暗色</option>
      </select>
    </label>
  </div>
</template>

<style scoped>
.screen-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.screen-panel__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--cf-text-2);
}
.screen-panel__row input,
.screen-panel__row select {
  width: 150px;
  padding: 4px 6px;
  border: 1px solid var(--cf-border);
  border-radius: 4px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 12px;
}
.screen-panel__row input[type="color"] {
  padding: 2px;
  height: 28px;
}
.screen-panel__dims {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--cf-text);
}
.screen-panel__dims input {
  width: 68px;
  padding: 4px 6px;
  border: 1px solid var(--cf-border);
  border-radius: 4px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 12px;
}
</style>
