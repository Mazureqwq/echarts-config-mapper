<script setup lang="ts">
import { computed, ref } from "vue";
import type { ComponentItem } from "@/core/model/types";
import { createMapSceneLayer, MAP_LAYER_TYPES, normalizeMapSceneProps, type MapSceneLayer as MapLayer, type MapSceneView, type MapLayerType } from "@/core/components/mapScene";
import { applyMapSkin, MAP_SKINS } from "@/core/components/mapSkins";
import DatasetBindingEditor from "./DatasetBindingEditor.vue";

const props = defineProps<{ item: ComponentItem }>();
const emit = defineEmits<{ (event: "update:props", value: Record<string, unknown>): void; (event: "update:data-binding", value: ComponentItem["dataBinding"]): void }>();
const scene = computed(() => normalizeMapSceneProps(props.item.props, props.item.componentId.endsWith("tilted") ? "tilted" : "flat"));
const newType = ref<MapLayerType>("regionFill");
const LAYER_LABELS: Record<MapLayerType, string> = { regionFill: "区域填色", geoScatter: "地理散点", geoHeatmap: "点热力", geoFlow: "OD 飞线" };

function updateProps(patch: Record<string, unknown>): void { emit("update:props", { ...props.item.props, ...patch }); }
function applySkin(skinId: string): void {
  emit("update:props", applyMapSkin(props.item.props, skinId) as Record<string, unknown>);
}
function changePresentation(value: string): void {
  if (value !== "flat" && value !== "tilted") return;
  updateProps({ presentation: value });
}
function updateView(patch: Partial<MapSceneView>): void { updateProps({ view: { ...scene.value.view, ...patch } }); }
function changeCenter(index: 0 | 1, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  const center: [number, number] = [...scene.value.view.center];
  center[index] = value;
  updateView({ center });
}
function changeZoom(key: "zoom" | "minZoom" | "maxZoom", event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(value)) updateView({ [key]: value });
}
function changeViewToggle(key: "dragEnabled" | "zoomEnabled" | "showLabels", event: Event): void {
  updateView({ [key]: (event.target as HTMLInputElement).checked });
}
function updateLayer(id: string, patch: Omit<Partial<MapLayer>, "style"> & { style?: Partial<MapLayer["style"]> }): void {
  const layers = scene.value.layers.map((layer) => layer.id === id ? { ...layer, ...patch, style: { ...layer.style, ...patch.style } } : layer);
  updateProps({ layers });
}
function updateLayerBinding(id: string, binding: ComponentItem["dataBinding"]): void {
  updateLayer(id, { dataBinding: binding });
}
function addLayer(): void {
  if (scene.value.layers.length >= 50) return;
  const existingNames = new Set(scene.value.layers.map((layer) => layer.name));
  let suffix = scene.value.layers.filter((layer) => layer.type === newType.value).length + 1;
  let name = `${LAYER_LABELS[newType.value]} ${suffix}`;
  while (existingNames.has(name)) {
    suffix += 1;
    name = `${LAYER_LABELS[newType.value]} ${suffix}`;
  }
  const layer = createMapSceneLayer(newType.value);
  layer.name = name;
  updateProps({ layers: [...scene.value.layers, layer] });
}
function removeLayer(id: string): void { updateProps({ layers: scene.value.layers.filter((layer) => layer.id !== id) }); }
function moveLayer(index: number, delta: number): void {
  const target = index + delta;
  if (target < 0 || target >= scene.value.layers.length) return;
  const layers = [...scene.value.layers];
  [layers[index], layers[target]] = [layers[target]!, layers[index]!];
  updateProps({ layers });
}
</script>

<template>
  <div class="map-scene-inspector">
    <section class="map-scene-inspector__section">
      <h3>地图容器</h3>
      <div class="map-scene-inspector__skins" role="group" aria-label="地图皮肤">
        <button
          v-for="skin in MAP_SKINS"
          :key="skin.id"
          type="button"
          class="map-scene-inspector__skin"
          :class="{ 'map-scene-inspector__skin--active': scene.appliedSkin === skin.id }"
          :title="skin.name"
          @click="applySkin(skin.id)"
        >
          <span
            class="map-scene-inspector__skin-swatch"
            :style="{ background: `linear-gradient(90deg, ${skin.tokens.fill.min}, ${skin.tokens.fill.mid}, ${skin.tokens.fill.max})` }"
          />
          <span class="map-scene-inspector__skin-name">{{ skin.name }}</span>
        </button>
      </div>
      <label class="map-scene-inspector__field">地图预设
        <select class="cf-control cf-control--compact" :value="scene.presentation" @change="changePresentation(($event.target as HTMLSelectElement).value)">
          <option value="flat">2D 平面地图</option><option value="tilted">2.5D 立体地图</option>
        </select>
      </label>
      <div class="map-scene-inspector__view-grid">
        <label>地图中心经度<input class="cf-control cf-control--compact" type="number" min="-180" max="180" step="0.1" :value="scene.view.center[0]" @change="changeCenter(0, $event)" /></label>
        <label>地图中心纬度<input class="cf-control cf-control--compact" type="number" min="-90" max="90" step="0.1" :value="scene.view.center[1]" @change="changeCenter(1, $event)" /></label>
        <label>地图默认缩放<input class="cf-control cf-control--compact" type="number" :min="scene.view.minZoom" :max="scene.view.maxZoom" step="0.05" :value="scene.view.zoom" @change="changeZoom('zoom', $event)" /></label>
        <label>最小缩放<input class="cf-control cf-control--compact" type="number" min="0.5" max="20" step="0.1" :value="scene.view.minZoom" @change="changeZoom('minZoom', $event)" /></label>
        <label>最大缩放<input class="cf-control cf-control--compact" type="number" :min="scene.view.minZoom" max="20" step="0.1" :value="scene.view.maxZoom" @change="changeZoom('maxZoom', $event)" /></label>
        <label>地图背景色<input class="map-scene-inspector__color" type="color" :value="scene.view.backgroundColor" @input="updateView({ backgroundColor: ($event.target as HTMLInputElement).value })" /></label>
      </div>
      <label class="map-scene-inspector__check"><input type="checkbox" :checked="scene.view.dragEnabled" @change="changeViewToggle('dragEnabled', $event)" />允许拖拽平移</label>
      <label class="map-scene-inspector__check"><input type="checkbox" :checked="scene.view.zoomEnabled" @change="changeViewToggle('zoomEnabled', $event)" />允许滚轮缩放</label>
      <label class="map-scene-inspector__check"><input type="checkbox" :checked="scene.view.showLabels" @change="changeViewToggle('showLabels', $event)" />显示省级名称</label>
      <p class="map-scene-inspector__hint">2.5D 预设以本地省界矢量轮廓表现顶面与挤出厚度，不代表真实海拔地形；当前范围为中国。</p>
    </section>

    <section class="map-scene-inspector__section">
      <div class="map-scene-inspector__heading"><h3>地图图层（{{ scene.layers.length }}）</h3><span>上层绘制在后</span></div>
      <div class="map-scene-inspector__add">
        <select v-model="newType" class="cf-control cf-control--compact" aria-label="新增地图图层类型">
          <option v-for="type in MAP_LAYER_TYPES" :key="type" :value="type">{{ LAYER_LABELS[type] }}</option>
        </select>
        <button type="button" class="cf-btn cf-btn--small" :disabled="scene.layers.length >= 50" @click="addLayer">添加图层</button>
      </div>
      <p v-if="!scene.layers.length" class="map-scene-inspector__empty">还没有图层。先添加区域填色、地理散点、点热力或 OD 飞线。</p>
      <article v-for="(layer, index) in scene.layers" :key="layer.id" class="map-scene-inspector__layer">
        <div class="map-scene-inspector__layer-head">
          <input type="checkbox" :checked="layer.visible" :aria-label="`显示${layer.name}`" @change="updateLayer(layer.id, { visible: ($event.target as HTMLInputElement).checked })" />
          <span class="map-scene-inspector__type">{{ LAYER_LABELS[layer.type] }}</span>
          <button type="button" class="map-scene-inspector__icon" :disabled="index === 0" :aria-label="`上移${layer.name}`" @click="moveLayer(index, -1)">↑</button>
          <button type="button" class="map-scene-inspector__icon" :disabled="index === scene.layers.length - 1" :aria-label="`下移${layer.name}`" @click="moveLayer(index, 1)">↓</button>
          <button type="button" class="map-scene-inspector__icon map-scene-inspector__delete" :aria-label="`删除${layer.name}`" @click="removeLayer(layer.id)">×</button>
        </div>
        <strong class="map-scene-inspector__name-display">{{ layer.name || "未命名图层" }}</strong>
        <label class="map-scene-inspector__name-field">图层名称
          <input class="cf-control cf-control--compact map-scene-inspector__name" :value="layer.name" :aria-label="`${LAYER_LABELS[layer.type]}名称`" maxlength="48" @change="updateLayer(layer.id, { name: ($event.target as HTMLInputElement).value })" />
        </label>
        <div class="map-scene-inspector__styles">
          <label>颜色 <input type="color" :value="layer.style.color" :aria-label="`${layer.name}颜色`" @input="updateLayer(layer.id, { style: { color: ($event.target as HTMLInputElement).value } })" /></label>
          <label>透明度 <input class="cf-control cf-control--compact" type="number" min="0" max="1" step="0.05" :value="layer.style.opacity" :aria-label="`${layer.name}透明度`" @change="updateLayer(layer.id, { style: { opacity: Number(($event.target as HTMLInputElement).value) } })" /></label>
          <label>尺寸 <input class="cf-control cf-control--compact" type="number" min="1" max="100" :value="layer.style.size" :aria-label="`${layer.name}尺寸`" @change="updateLayer(layer.id, { style: { size: Number(($event.target as HTMLInputElement).value) } })" /></label>
        </div>
        <details class="map-scene-inspector__binding">
          <summary>数据绑定 · {{ layer.dataBinding ? '独立' : '继承容器' }}</summary>
          <button v-if="layer.dataBinding" type="button" class="cf-btn cf-btn--small" @click="updateLayerBinding(layer.id, undefined)">清除图层绑定并继承容器</button>
          <DatasetBindingEditor
            :model-value="layer.dataBinding"
            :show-fields="true"
            :map-scene="layer.type === 'regionFill'"
            :chart-type="layer.type === 'regionFill' ? undefined : layer.type"
            @update:model-value="updateLayerBinding(layer.id, $event)"
          />
        </details>
      </article>
    </section>

    <section class="map-scene-inspector__section">
      <h3>共享数据绑定</h3>
      <DatasetBindingEditor :model-value="item.dataBinding" :show-fields="true" :map-scene="true" @update:model-value="emit('update:data-binding', $event)" />
    </section>
  </div>
</template>

<style scoped>
.map-scene-inspector { display: flex; flex-direction: column; gap: 12px; }
.map-scene-inspector__skins { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.map-scene-inspector__skin { display: flex; flex-direction: column; gap: 4px; padding: 6px; border: 1px solid var(--cf-border); border-radius: 6px; background: transparent; cursor: pointer; color: var(--cf-text); font-size: 11px; text-align: left; }
.map-scene-inspector__skin:hover { border-color: var(--cf-primary); }
.map-scene-inspector__skin--active { border-color: var(--cf-primary); box-shadow: 0 0 0 1px var(--cf-primary) inset; }
.map-scene-inspector__skin-swatch { display: block; height: 10px; border-radius: 4px; border: 1px solid var(--cf-border); }
.map-scene-inspector__skin-name { line-height: 1.2; }
.map-scene-inspector__section { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--cf-border); padding-top: 9px; }
.map-scene-inspector h3 { margin: 0; color: var(--cf-text); font-size: 11px; font-weight: 650; }
.map-scene-inspector__field { display: flex; flex-direction: column; gap: 4px; color: var(--cf-text-2); font-size: 10px; }
.map-scene-inspector__field .cf-control, .map-scene-inspector__add .cf-control { width: 100%; min-width: 0; }
.map-scene-inspector__view-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; color: var(--cf-text-2); font-size: 9px; }
.map-scene-inspector__view-grid label { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.map-scene-inspector__view-grid .cf-control { width: 100%; min-width: 0; }
.map-scene-inspector__color { width: 100%; height: 25px; padding: 2px; }
.map-scene-inspector__check { display: flex; align-items: center; gap: 6px; color: var(--cf-text-2); font-size: 9px; }
.map-scene-inspector__hint, .map-scene-inspector__empty { margin: 0; color: var(--cf-text-2); font-size: 9px; line-height: 1.45; }
.map-scene-inspector__heading { display: flex; align-items: baseline; justify-content: space-between; gap: 5px; }
.map-scene-inspector__heading span { color: var(--cf-text-2); font-size: 9px; }
.map-scene-inspector__add { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; }
.map-scene-inspector__layer { display: flex; flex-direction: column; gap: 7px; padding: 7px; border: 1px solid var(--cf-border); border-radius: 5px; background: color-mix(in srgb, var(--cf-panel) 80%, transparent); }
.map-scene-inspector__layer-head { display: flex; align-items: center; gap: 5px; }
.map-scene-inspector__type { min-width: 0; flex: 1; overflow: hidden; padding: 4px 7px; border: 1px solid color-mix(in srgb, var(--cf-primary) 28%, var(--cf-border)); border-radius: 5px; background: color-mix(in srgb, var(--cf-primary) 10%, transparent); color: var(--cf-primary); font-size: 10px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.map-scene-inspector__name-display { display: block; overflow-wrap: anywhere; color: var(--cf-text); font-size: 12px; font-weight: 650; line-height: 1.35; }
.map-scene-inspector__name-field { display: flex; min-width: 0; flex-direction: column; gap: 4px; color: var(--cf-text-2); font-size: 9px; }
.map-scene-inspector__name { width: 100%; min-width: 0; }
.map-scene-inspector__icon { width: 23px; height: 25px; border: 1px solid var(--cf-border); border-radius: 4px; background: transparent; color: var(--cf-text); cursor: pointer; }
.map-scene-inspector__icon:disabled { opacity: .35; cursor: default; }
.map-scene-inspector__delete { color: var(--cf-danger); }
.map-scene-inspector__styles { display: grid; grid-template-columns: 48px 1fr 1fr; gap: 6px; align-items: end; color: var(--cf-text-2); font-size: 9px; }
.map-scene-inspector__styles label { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.map-scene-inspector__styles input[type="color"] { width: 100%; height: 25px; padding: 2px; }
.map-scene-inspector__styles .cf-control { width: 100%; min-width: 0; }
.map-scene-inspector__binding { display: flex; flex-direction: column; gap: 7px; border-top: 1px solid var(--cf-border); padding-top: 6px; }
.map-scene-inspector__binding summary { color: var(--cf-text-2); font-size: 10px; cursor: pointer; }
</style>
