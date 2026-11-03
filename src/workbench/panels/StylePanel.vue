<script setup lang="ts">
import { computed, ref } from "vue";
import type { ScreenItem } from "@/core/model/types";
import { useDocumentStore } from "@/stores/documentStore";
import Icon from "@/shared/ui/Icon.vue";

const props = defineProps<{ item: ScreenItem }>();
const doc = useDocumentStore();
const fileEl = ref<HTMLInputElement | null>(null);

const item = computed(() => props.item);

function setProp(key: string, value: unknown): void {
  doc.updateItemProps(props.item.id, { [key]: value });
}

function setOpacity(ev: Event): void {
  const v = Number((ev.target as HTMLInputElement).value);
  if (!Number.isFinite(v)) return;
  setProp("opacity", Math.min(1, Math.max(0, v)));
}

async function onPickImage(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const dataUrl = await compressImage(file);
  setProp("src", dataUrl);
  input.value = "";
}

async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxSide = 2048;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx?.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}
</script>

<template>
  <div class="style-panel">
    <label class="style-panel__row">名称
      <input :value="item.name" @change="setProp('name', ($event.target as HTMLInputElement).value)" />
    </label>
    <label class="style-panel__row">不透明度
      <input
        type="number"
        min="0"
        max="1"
        step="0.1"
        :value="item.opacity ?? 1"
        @change="setOpacity"
      />
    </label>

    <template v-if="item.kind === 'text'">
      <label class="style-panel__row">文本
        <textarea :value="item.text" rows="3" @change="setProp('text', ($event.target as HTMLTextAreaElement).value)" />
      </label>
      <label class="style-panel__row">字号
        <input type="number" :value="item.fontSize" @change="setProp('fontSize', Number(($event.target as HTMLInputElement).value))" />
      </label>
      <label class="style-panel__row">颜色
        <input type="color" :value="item.color" @input="setProp('color', ($event.target as HTMLInputElement).value)" />
      </label>
      <label class="style-panel__row">对齐
        <select :value="item.align" @change="setProp('align', ($event.target as HTMLSelectElement).value)">
          <option value="left">左</option>
          <option value="center">中</option>
          <option value="right">右</option>
        </select>
      </label>
      <label class="style-panel__row">字重
        <select :value="item.weight" @change="setProp('weight', ($event.target as HTMLSelectElement).value)">
          <option value="normal">常规</option>
          <option value="bold">加粗</option>
        </select>
      </label>
    </template>

    <template v-else-if="item.kind === 'image'">
      <label class="style-panel__row">图片地址
        <input :value="item.src" placeholder="URL 或上传" @change="setProp('src', ($event.target as HTMLInputElement).value)" />
      </label>
      <button class="style-panel__upload" @click="fileEl?.click()">
        <Icon name="upload" :size="13" /> 上传图片（自动压缩）
      </button>
      <input ref="fileEl" type="file" accept="image/*" style="display: none" @change="onPickImage" />
      <label class="style-panel__row">填充方式
        <select :value="item.fit" @change="setProp('fit', ($event.target as HTMLSelectElement).value)">
          <option value="contain">适应</option>
          <option value="cover">裁剪填满</option>
          <option value="fill">拉伸</option>
        </select>
      </label>
    </template>

    <template v-else-if="item.kind === 'shape'">
      <label class="style-panel__row">形状
        <select :value="item.shape" @change="setProp('shape', ($event.target as HTMLSelectElement).value)">
          <option value="rect">矩形</option>
          <option value="ellipse">椭圆</option>
          <option value="line">线条</option>
        </select>
      </label>
      <label class="style-panel__row">填充
        <input type="color" :value="item.fill ?? '#5470C6'" @input="setProp('fill', ($event.target as HTMLInputElement).value)" />
      </label>
      <label class="style-panel__row">描边
        <input type="color" :value="item.stroke ?? '#333333'" @input="setProp('stroke', ($event.target as HTMLInputElement).value)" />
      </label>
      <label class="style-panel__row">描边宽
        <input type="number" :value="item.strokeWidth ?? 1" @change="setProp('strokeWidth', Number(($event.target as HTMLInputElement).value))" />
      </label>
      <label class="style-panel__row">圆角
        <input type="number" :value="item.radius ?? 0" @change="setProp('radius', Number(($event.target as HTMLInputElement).value))" />
      </label>
    </template>
  </div>
</template>

<style scoped>
.style-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.style-panel__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--cf-text-2);
}
.style-panel__row input,
.style-panel__row select,
.style-panel__row textarea {
  width: 150px;
  padding: 4px 6px;
  border: 1px solid var(--cf-border);
  border-radius: 4px;
  background: var(--cf-bg);
  color: var(--cf-text);
  font-size: 12px;
  font-family: inherit;
}
.style-panel__row input[type="color"] {
  padding: 2px;
  height: 28px;
}
.style-panel__upload {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px dashed var(--cf-border);
  border-radius: 6px;
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
  font-size: 12px;
}
.style-panel__upload:hover {
  color: var(--cf-primary);
  border-color: var(--cf-primary);
}
</style>
