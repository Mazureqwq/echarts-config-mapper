<script setup lang="ts">
import { computed, ref } from "vue";
import type { ScreenItem } from "@/core/model/types";
import { useDocumentStore } from "@/stores/documentStore";
import Icon from "@/shared/ui/Icon.vue";
import { compressImageFile } from "@/core/storage/imageCompress";

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

function setNumberProp(key: string, ev: Event, min: number, max: number): void {
  const value = Number((ev.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  setProp(key, Math.min(max, Math.max(min, value)));
}

function toggleShadow(ev: Event): void {
  if (props.item.kind !== "text") return;
  const enabled = (ev.target as HTMLInputElement).checked;
  setProp("shadow", enabled ? { color: "#00cfff", blur: 12, offsetX: 0, offsetY: 2 } : undefined);
}

function setShadowNumber(key: "blur" | "offsetX" | "offsetY", ev: Event): void {
  if (props.item.kind !== "text") return;
  const value = Number((ev.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  const current = props.item.shadow ?? { color: "#00cfff", blur: 12, offsetX: 0, offsetY: 2 };
  setProp("shadow", { ...current, [key]: Math.min(64, Math.max(key === "blur" ? 0 : -64, value)) });
}

function setShadowColor(ev: Event): void {
  if (props.item.kind !== "text") return;
  const current = props.item.shadow ?? { color: "#00cfff", blur: 12, offsetX: 0, offsetY: 2 };
  setProp("shadow", { ...current, color: (ev.target as HTMLInputElement).value });
}

async function onPickImage(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const dataUrl = await compressImageFile(file);
  setProp("src", dataUrl);
  input.value = "";
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
          <option value="400">400 · 标准</option>
          <option value="500">500 · 中等</option>
          <option value="600">600 · 半粗</option>
          <option value="bold">700 · 粗体</option>
          <option value="800">800 · 特粗</option>
        </select>
      </label>
      <label class="style-panel__row">字体
        <select :value="item.fontFamily ?? 'system-ui'" @change="setProp('fontFamily', ($event.target as HTMLSelectElement).value)">
          <option value="system-ui">系统默认</option>
          <option value="Microsoft YaHei">微软雅黑</option>
          <option value="Arial">Arial</option>
          <option value="SimHei">黑体</option>
          <option value="SimSun">宋体</option>
          <option value="serif">衬线体</option>
          <option value="monospace">等宽体</option>
        </select>
      </label>
      <label class="style-panel__row">字体样式
        <select :value="item.fontStyle ?? 'normal'" @change="setProp('fontStyle', ($event.target as HTMLSelectElement).value)">
          <option value="normal">常规</option>
          <option value="italic">斜体</option>
          <option value="oblique">倾斜</option>
        </select>
      </label>
      <label class="style-panel__row">垂直对齐
        <select :value="item.verticalAlign ?? 'top'" @change="setProp('verticalAlign', ($event.target as HTMLSelectElement).value)">
          <option value="top">顶部</option>
          <option value="middle">居中</option>
          <option value="bottom">底部</option>
        </select>
      </label>
      <details class="style-panel__advanced">
        <summary>高级文字样式</summary>
        <label class="style-panel__row">行高（倍数）
          <input type="number" min="0.5" max="4" step="0.1" :value="item.lineHeight ?? 1.4" @change="setNumberProp('lineHeight', $event, 0.5, 4)" />
        </label>
        <label class="style-panel__row">字间距（px）
          <input type="number" min="-16" max="64" step="1" :value="item.letterSpacing ?? 0" @change="setNumberProp('letterSpacing', $event, -16, 64)" />
        </label>
        <label class="style-panel__row">溢出处理
          <select :value="item.overflow ?? 'clip'" @change="setProp('overflow', ($event.target as HTMLSelectElement).value)">
            <option value="clip">裁切</option>
            <option value="ellipsis">多行省略</option>
          </select>
        </label>
        <label v-if="item.overflow === 'ellipsis'" class="style-panel__row">最多行数
          <input type="number" min="1" max="30" :value="item.lineClamp ?? 2" @change="setNumberProp('lineClamp', $event, 1, 30)" />
        </label>
        <label class="style-panel__row">背景色
          <span class="style-panel__inline-control">
            <input type="color" :value="item.backgroundColor ?? '#0b1020'" @input="setProp('backgroundColor', ($event.target as HTMLInputElement).value)" />
            <button type="button" class="style-panel__clear" @click="setProp('backgroundColor', undefined)">清除</button>
          </span>
        </label>
        <label class="style-panel__row">内边距（px）
          <input type="number" min="0" max="128" :value="item.padding ?? 0" @change="setNumberProp('padding', $event, 0, 128)" />
        </label>
        <label class="style-panel__row">圆角（px）
          <input type="number" min="0" max="128" :value="item.radius ?? 0" @change="setNumberProp('radius', $event, 0, 128)" />
        </label>
        <label class="style-panel__row">描边颜色
          <input type="color" :value="item.borderColor ?? '#344054'" @input="setProp('borderColor', ($event.target as HTMLInputElement).value)" />
        </label>
        <label class="style-panel__row">描边宽度（px）
          <input type="number" min="0" max="16" :value="item.borderWidth ?? 0" @change="setNumberProp('borderWidth', $event, 0, 16)" />
        </label>
        <label class="style-panel__row">文字阴影
          <input type="checkbox" :checked="!!item.shadow" @change="toggleShadow" />
        </label>
        <template v-if="item.shadow">
          <label class="style-panel__row">阴影颜色
            <input type="color" :value="item.shadow.color" @input="setShadowColor" />
          </label>
          <label class="style-panel__row">模糊半径（px）
            <input type="number" min="0" max="64" :value="item.shadow.blur" @change="setShadowNumber('blur', $event)" />
          </label>
          <label class="style-panel__row">阴影偏移 X / Y
            <span class="style-panel__inline-control">
              <input type="number" min="-64" max="64" :value="item.shadow.offsetX" @change="setShadowNumber('offsetX', $event)" />
              <input type="number" min="-64" max="64" :value="item.shadow.offsetY" @change="setShadowNumber('offsetY', $event)" />
            </span>
          </label>
        </template>
      </details>
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
.style-panel__advanced { padding-top: 6px; border-top: 1px solid var(--cf-border); }
.style-panel__advanced summary { margin-bottom: 8px; color: var(--cf-text); font-size: 11px; cursor: pointer; }
.style-panel__inline-control { display: flex; align-items: center; gap: 5px; }
.style-panel__inline-control input[type="color"] { width: 48px; }
.style-panel__clear { border: 1px solid var(--cf-border); border-radius: 4px; padding: 4px 7px; background: var(--cf-bg); color: var(--cf-text-2); cursor: pointer; }
.style-panel__upload:hover {
  color: var(--cf-primary);
  border-color: var(--cf-primary);
}
</style>
