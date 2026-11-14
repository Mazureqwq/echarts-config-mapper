<script setup lang="ts">
import { computed, ref } from "vue";
import type { ComponentItem } from "@/core/model/types";
import {
  createMapSceneLayer,
  MAP_BORDER_DEFAULT,
  MAP_EMPHASIS_DEFAULT,
  MAP_LABEL_DEFAULT,
  MAP_LAYER_TYPES,
  MAP_OUTLINE_DEFAULT_COLOR,
  MAP_SELECTED_DEFAULT,
  MAP_TOOLTIP_DEFAULT,
  normalizeMapSceneProps,
  type MapSceneLayer as MapLayer,
  type MapSceneView,
  type MapLayerType,
} from "@/core/components/mapScene";
import { useUiStore } from "@/stores/uiStore";
import { applyMapQuickStyle } from "@/core/components/mapQuickStyles";
import DatasetBindingEditor from "./DatasetBindingEditor.vue";
import MapQuickStylePicker from "./MapQuickStylePicker.vue";

const props = defineProps<{ item: ComponentItem }>();
const emit = defineEmits<{ (event: "update:props", value: Record<string, unknown>): void; (event: "update:data-binding", value: ComponentItem["dataBinding"]): void }>();
const scene = computed(() => normalizeMapSceneProps(props.item.props, props.item.componentId.endsWith("tilted") ? "tilted" : "flat"));
const ui = useUiStore();
const newType = ref<MapLayerType>("regionFill");
const tab = ref<"style" | "data" | "interaction">("style");
const LAYER_LABELS: Record<MapLayerType, string> = { regionFill: "区域填色", geoScatter: "地理散点", geoHeatmap: "点热力", geoFlow: "OD 飞线" };

function updateProps(patch: Record<string, unknown>): void { emit("update:props", { ...props.item.props, ...patch }); }
function changePresentation(value: string): void {
  if (value !== "flat" && value !== "tilted") return;
  updateProps({ presentation: value });
}
/** 快速样式：把预设的具体色值写回 props（令牌随 props 持久化，双端同源）。 */
function applyQuickStyle(id: string): void {
  emit("update:props", applyMapQuickStyle({ ...props.item.props }, id));
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
/** T8：视图偏移（容器百分比，正 x 右移 / 正 y 下移） */
function changeViewOffset(axis: "x" | "y", event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  const current = scene.value.view.offset ?? { x: 0, y: 0 };
  updateView({ offset: { ...current, [axis]: value } });
}
/** T8：外轮廓强化层（精确国界外环） */
function updateOutline(patch: Record<string, unknown>): void {
  const current = (scene.value.border?.outline ?? { show: false, color: MAP_OUTLINE_DEFAULT_COLOR, width: 2 }) as unknown as Record<string, unknown>;
  updateProps({ border: { ...(scene.value.border ?? MAP_BORDER_DEFAULT), outline: { ...current, ...patch } } });
}
/** T8：标注缩放阈值（空值表示不设阈值） */
function changeLabelMinZoom(event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  const current = { ...(scene.value.label ?? MAP_LABEL_DEFAULT) } as Record<string, unknown>;
  if (raw === "") {
    delete current.minZoom;
    updateProps({ label: current });
    return;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  updateProps({ label: { ...current, minZoom: value } });
}
function updateLayer(id: string, patch: Omit<Partial<MapLayer>, "style"> & { style?: Partial<MapLayer["style"]> }): void {
  const layers = scene.value.layers.map((layer) => layer.id === id ? { ...layer, ...patch, style: { ...layer.style, ...patch.style } } : layer);
  updateProps({ layers });
}
function updateLayerBinding(id: string, binding: ComponentItem["dataBinding"]): void {
  updateLayer(id, { dataBinding: binding });
}
function uniqueLayerName(type: MapLayerType): string {
  const existingNames = new Set(scene.value.layers.map((layer) => layer.name));
  let suffix = scene.value.layers.filter((layer) => layer.type === type).length + 1;
  let name = `${LAYER_LABELS[type]} ${suffix}`;
  while (existingNames.has(name)) {
    suffix += 1;
    name = `${LAYER_LABELS[type]} ${suffix}`;
  }
  return name;
}
function addLayer(): void {
  if (scene.value.layers.length >= 50) return;
  const layer = createMapSceneLayer(newType.value);
  layer.name = uniqueLayerName(newType.value);
  updateProps({ layers: [...scene.value.layers, layer] });
}
function addTemplate(kind: "heat" | "scatter-flow"): void {
  if (kind === "heat") {
    if (scene.value.layers.length >= 50) return;
    const layer = createMapSceneLayer("regionFill");
    layer.name = uniqueLayerName("regionFill");
    updateProps({
      layers: [...scene.value.layers, layer],
      legend: { ...(scene.value.legend ?? { show: false, position: "top-right", mode: "continuous" }), show: true, mode: "continuous" },
    });
  } else {
    if (scene.value.layers.length >= 48) return;
    const flow = createMapSceneLayer("geoFlow");
    flow.name = uniqueLayerName("geoFlow");
    const scatter = createMapSceneLayer("geoScatter");
    scatter.name = uniqueLayerName("geoScatter");
    updateProps({ layers: [...scene.value.layers, flow, scatter] });
  }
}
function updateLayerZoom(layer: MapLayer, key: "minZoom" | "maxZoom", event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  const layers = scene.value.layers.map((entry) => {
    if (entry.id !== layer.id) return entry;
    if (raw === "") {
      const copy = { ...entry } as Record<string, unknown>;
      delete copy[key];
      return copy as unknown as MapLayer;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) return entry;
    return { ...entry, [key]: value };
  });
  updateProps({ layers });
}
function openBlueprint(): void {
  ui.setBlueprintOpen(true);
}
function updateGroup(
  key: "legend" | "label" | "border" | "emphasis" | "selected" | "tooltipStyle" | "valueFormat" | "scaleBar",
  patch: Record<string, unknown>,
): void {
  const current = (scene.value[key] ?? {}) as Record<string, unknown>;
  updateProps({ [key]: { ...current, ...patch } });
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
    <div class="map-scene-inspector__tabs" role="tablist">
      <button type="button" role="tab" class="map-scene-inspector__tab" :class="{ 'map-scene-inspector__tab--active': tab === 'style' }" :aria-selected="tab === 'style'" @click="tab = 'style'">样式</button>
      <button type="button" role="tab" class="map-scene-inspector__tab" :class="{ 'map-scene-inspector__tab--active': tab === 'data' }" :aria-selected="tab === 'data'" @click="tab = 'data'">数据</button>
      <button type="button" role="tab" class="map-scene-inspector__tab" :class="{ 'map-scene-inspector__tab--active': tab === 'interaction' }" :aria-selected="tab === 'interaction'" @click="tab = 'interaction'">交互</button>
    </div>
    <template v-if="tab === 'style'">
    <section class="map-scene-inspector__section">
      <h3>地图容器</h3>
      <div class="map-scene-inspector__field">
        <MapQuickStylePicker :active-id="scene.quickStyle?.id" @select="applyQuickStyle" />
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
        <label>水平偏移<input class="cf-control cf-control--compact" type="number" min="-100" max="100" step="1" aria-label="视图水平偏移" :value="scene.view.offset?.x ?? 0" @change="changeViewOffset('x', $event)" /></label>
        <label>垂直偏移<input class="cf-control cf-control--compact" type="number" min="-100" max="100" step="1" aria-label="视图垂直偏移" :value="scene.view.offset?.y ?? 0" @change="changeViewOffset('y', $event)" /></label>
      </div>
      <label class="map-scene-inspector__check"><input type="checkbox" :checked="scene.view.dragEnabled" @change="changeViewToggle('dragEnabled', $event)" />允许拖拽平移</label>
      <label class="map-scene-inspector__check"><input type="checkbox" :checked="scene.view.zoomEnabled" @change="changeViewToggle('zoomEnabled', $event)" />允许滚轮缩放</label>
      <label class="map-scene-inspector__check"><input type="checkbox" :checked="scene.view.showLabels" @change="changeViewToggle('showLabels', $event)" />显示省级名称</label>
      <p class="map-scene-inspector__hint">2.5D 预设以本地省界矢量轮廓表现顶面与挤出厚度，不代表真实海拔地形；当前范围为中国。</p>
    </section>

    <section class="map-scene-inspector__section">
      <h3>外观与图例</h3>
      <label class="map-scene-inspector__check">
        <input type="checkbox" :checked="scene.legend?.show ?? false" @change="updateGroup('legend', { show: ($event.target as HTMLInputElement).checked })" />显示图例
      </label>
      <div class="map-scene-inspector__view-grid">
        <label>图例位置
          <select class="cf-control cf-control--compact" :value="scene.legend?.position ?? 'top-right'" @change="updateGroup('legend', { position: ($event.target as HTMLSelectElement).value })">
            <option value="top-right">右上</option><option value="bottom-right">右下</option><option value="bottom-left">左下</option>
          </select>
        </label>
        <label>图例模式
          <select class="cf-control cf-control--compact" :value="scene.legend?.mode ?? 'continuous'" @change="updateGroup('legend', { mode: ($event.target as HTMLSelectElement).value })">
            <option value="continuous">连续</option><option value="segments">分段</option>
          </select>
        </label>
        <label>标注颜色<input type="color" :value="scene.label?.color ?? MAP_LABEL_DEFAULT.color" @input="updateGroup('label', { color: ($event.target as HTMLInputElement).value })" /></label>
        <label>标注字号<input class="cf-control cf-control--compact" type="number" min="8" max="40" :value="scene.label?.size ?? MAP_LABEL_DEFAULT.size" @change="updateGroup('label', { size: Number(($event.target as HTMLInputElement).value) })" /></label>
        <label>边线颜色<input type="color" :value="scene.border?.color ?? MAP_BORDER_DEFAULT.color" @input="updateGroup('border', { color: ($event.target as HTMLInputElement).value })" /></label>
        <label>边线粗细<input class="cf-control cf-control--compact" type="number" min="0" max="8" step="0.5" :value="scene.border?.width ?? MAP_BORDER_DEFAULT.width" @change="updateGroup('border', { width: Number(($event.target as HTMLInputElement).value) })" /></label>
        <label>边线线型
          <select class="cf-control cf-control--compact" :value="scene.border?.type ?? MAP_BORDER_DEFAULT.type" @change="updateGroup('border', { type: ($event.target as HTMLSelectElement).value })">
            <option value="solid">实线</option><option value="dashed">虚线</option>
          </select>
        </label>
        <label>悬停填充<input type="color" :value="scene.emphasis?.areaColor ?? MAP_EMPHASIS_DEFAULT.areaColor" @input="updateGroup('emphasis', { areaColor: ($event.target as HTMLInputElement).value })" /></label>
        <label>点击态填充<input type="color" :value="scene.selected?.areaColor ?? MAP_SELECTED_DEFAULT.areaColor" @input="updateGroup('selected', { areaColor: ($event.target as HTMLInputElement).value })" /></label>
        <label>Tooltip 底色<input type="color" :value="scene.tooltipStyle?.background ?? MAP_TOOLTIP_DEFAULT.background" @input="updateGroup('tooltipStyle', { background: ($event.target as HTMLInputElement).value })" /></label>
        <label>Tooltip 文字<input type="color" :value="scene.tooltipStyle?.color ?? MAP_TOOLTIP_DEFAULT.color" @input="updateGroup('tooltipStyle', { color: ($event.target as HTMLInputElement).value })" /></label>
        <label>数值小数位<input class="cf-control cf-control--compact" type="number" min="0" max="4" :value="scene.valueFormat?.decimals ?? 0" @change="updateGroup('valueFormat', { decimals: Number(($event.target as HTMLInputElement).value) })" /></label>
        <label>数值单位<input class="cf-control cf-control--compact" type="text" maxlength="12" :value="scene.valueFormat?.suffix ?? ''" @change="updateGroup('valueFormat', { suffix: ($event.target as HTMLInputElement).value })" /></label>
        <label>标注最小缩放<input class="cf-control cf-control--compact" type="number" min="0.5" max="20" step="0.5" aria-label="标注最小缩放" :value="scene.label?.minZoom ?? ''" placeholder="不限" @change="changeLabelMinZoom($event)" /></label>
        <label>比例尺位置
          <select class="cf-control cf-control--compact" aria-label="比例尺位置" :value="scene.scaleBar?.position ?? 'bottom-left'" @change="updateGroup('scaleBar', { position: ($event.target as HTMLSelectElement).value })">
            <option value="bottom-left">左下</option><option value="bottom-right">右下</option>
            <option value="top-left">左上</option><option value="top-right">右上</option>
          </select>
        </label>
        <label>外轮廓颜色<input type="color" aria-label="外轮廓颜色" :value="scene.border?.outline?.color ?? MAP_OUTLINE_DEFAULT_COLOR" @input="updateOutline({ color: ($event.target as HTMLInputElement).value })" /></label>
        <label>外轮廓粗细<input class="cf-control cf-control--compact" type="number" min="0" max="12" step="0.5" aria-label="外轮廓粗细" :value="scene.border?.outline?.width ?? 2" @change="updateOutline({ width: Number(($event.target as HTMLInputElement).value) })" /></label>
      </div>
      <label class="map-scene-inspector__check">
        <input type="checkbox" aria-label="显示比例尺" :checked="scene.scaleBar?.show ?? false" @change="updateGroup('scaleBar', { show: ($event.target as HTMLInputElement).checked })" />显示比例尺
      </label>
      <label class="map-scene-inspector__check">
        <input type="checkbox" aria-label="强化外轮廓" :checked="scene.border?.outline?.show ?? false" @change="updateOutline({ show: ($event.target as HTMLInputElement).checked })" />强化外轮廓（精确国界外环）
      </label>
      <details class="map-scene-inspector__binding">
        <summary>高级：标注描边/阴影、点击态与 Tooltip 边框</summary>
        <div class="map-scene-inspector__view-grid">
          <label>描边色<input type="color" :value="scene.label?.stroke ?? '#013a4a'" @input="updateGroup('label', { stroke: ($event.target as HTMLInputElement).value })" /></label>
          <label>描边宽<input class="cf-control cf-control--compact" type="number" min="0" max="6" :value="scene.label?.strokeWidth ?? 1" @change="updateGroup('label', { strokeWidth: Number(($event.target as HTMLInputElement).value) })" /></label>
          <label>阴影色<input type="color" :value="scene.label?.shadow ?? '#00ffff'" @input="updateGroup('label', { shadow: ($event.target as HTMLInputElement).value })" /></label>
          <label>阴影模糊<input class="cf-control cf-control--compact" type="number" min="0" max="24" :value="scene.label?.shadowBlur ?? 0" @change="updateGroup('label', { shadowBlur: Number(($event.target as HTMLInputElement).value) })" /></label>
          <label>悬停边线<input type="color" :value="scene.emphasis?.borderColor ?? '#ffffff'" @input="updateGroup('emphasis', { borderColor: ($event.target as HTMLInputElement).value })" /></label>
          <label>悬停文字<input type="color" :value="scene.emphasis?.labelColor ?? '#ffffff'" @input="updateGroup('emphasis', { labelColor: ($event.target as HTMLInputElement).value })" /></label>
          <label>点击态边线<input type="color" :value="scene.selected?.borderColor ?? '#ffffff'" @input="updateGroup('selected', { borderColor: ($event.target as HTMLInputElement).value })" /></label>
          <label>Tooltip 边框<input type="color" :value="scene.tooltipStyle?.borderColor ?? '#1f2a3a'" @input="updateGroup('tooltipStyle', { borderColor: ($event.target as HTMLInputElement).value })" /></label>
        </div>
      </details>
    </section>

    <section class="map-scene-inspector__section">
      <div class="map-scene-inspector__heading"><h3>地图图层（{{ scene.layers.length }}）</h3><span>上层绘制在后</span></div>
      <div class="map-scene-inspector__add">
        <select v-model="newType" class="cf-control cf-control--compact" aria-label="新增地图图层类型">
          <option v-for="type in MAP_LAYER_TYPES" :key="type" :value="type">{{ LAYER_LABELS[type] }}</option>
        </select>
        <button type="button" class="cf-btn cf-btn--small" :disabled="scene.layers.length >= 50" @click="addLayer">添加图层</button>
      </div>
      <div class="map-scene-inspector__templates">
        <button type="button" class="cf-btn cf-btn--small" :disabled="scene.layers.length >= 50" @click="addTemplate('heat')">区域热力+图例</button>
        <button type="button" class="cf-btn cf-btn--small" :disabled="scene.layers.length >= 48" @click="addTemplate('scatter-flow')">散点+飞线</button>
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
          <label>最小缩放 <input class="cf-control cf-control--compact" type="number" min="0.5" max="20" step="0.1" :value="layer.minZoom ?? ''" :aria-label="`${layer.name}最小缩放`" placeholder="不限" @change="updateLayerZoom(layer, 'minZoom', $event)" /></label>
          <label>最大缩放 <input class="cf-control cf-control--compact" type="number" min="0.5" max="20" step="0.1" :value="layer.maxZoom ?? ''" :aria-label="`${layer.name}最大缩放`" placeholder="不限" @change="updateLayerZoom(layer, 'maxZoom', $event)" /></label>
        </div>
        <div v-if="layer.type === 'regionFill'" class="map-scene-inspector__view-grid">
          <label>色带模式
            <select class="cf-control cf-control--compact" :value="layer.style.colorMode ?? 'gradient'" :aria-label="`${layer.name}色带模式`" @change="updateLayer(layer.id, { style: { colorMode: ($event.target as HTMLSelectElement).value as 'gradient' | 'segments' } })">
              <option value="gradient">渐变</option><option value="segments">分段</option>
            </select>
          </label>
          <label v-if="(layer.style.colorMode ?? 'gradient') === 'segments'">分段数
            <input class="cf-control cf-control--compact" type="number" min="2" max="10" :value="layer.style.segments ?? 5" :aria-label="`${layer.name}分段数`" @change="updateLayer(layer.id, { style: { segments: Number(($event.target as HTMLInputElement).value) } })" />
          </label>
          <label>色带-低<input type="color" :value="layer.style.colors?.min ?? '#102b3d'" :aria-label="`${layer.name}色带低值色`" @input="updateLayer(layer.id, { style: { colors: { ...(layer.style.colors ?? { min: '#102b3d', mid: '#1c5f8f', max: layer.style.color, empty: '#0d1a26' }), min: ($event.target as HTMLInputElement).value } } })" /></label>
          <label>色带-中<input type="color" :value="layer.style.colors?.mid ?? '#1c5f8f'" :aria-label="`${layer.name}色带中值色`" @input="updateLayer(layer.id, { style: { colors: { ...(layer.style.colors ?? { min: '#102b3d', mid: '#1c5f8f', max: layer.style.color, empty: '#0d1a26' }), mid: ($event.target as HTMLInputElement).value } } })" /></label>
          <label>色带-高<input type="color" :value="layer.style.colors?.max ?? layer.style.color" :aria-label="`${layer.name}色带高值色`" @input="updateLayer(layer.id, { style: { colors: { ...(layer.style.colors ?? { min: '#102b3d', mid: '#1c5f8f', max: layer.style.color, empty: '#0d1a26' }), max: ($event.target as HTMLInputElement).value } } })" /></label>
          <label>空值色<input type="color" :value="layer.style.colors?.empty ?? '#0d1a26'" :aria-label="`${layer.name}空值色`" @input="updateLayer(layer.id, { style: { colors: { ...(layer.style.colors ?? { min: '#102b3d', mid: '#1c5f8f', max: layer.style.color, empty: '#0d1a26' }), empty: ($event.target as HTMLInputElement).value } } })" /></label>
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

    </template>
    <template v-else-if="tab === 'data'">
    <section class="map-scene-inspector__section">
      <h3>共享数据绑定</h3>
      <DatasetBindingEditor :model-value="item.dataBinding" :show-fields="true" :map-scene="true" @update:model-value="emit('update:data-binding', $event)" />
    </section>
    </template>
    <template v-else>
      <section class="map-scene-inspector__section">
        <h3>区域交互</h3>
        <label class="map-scene-inspector__check"><input type="checkbox" :checked="scene.drill?.enabled ?? true" @change="updateProps({ drill: { enabled: ($event.target as HTMLInputElement).checked } })" />双击区域下钻定位</label>
        <p class="map-scene-inspector__hint">区域事件：单击 regionClick、双击 regionDblclick、上钻 regionUpdrill（载荷含区域名与数值），可在蓝图中驱动变量与组件联动。</p>
        <button type="button" class="cf-btn cf-btn--small" @click="openBlueprint">打开蓝图编辑器</button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.map-scene-inspector { display: flex; flex-direction: column; gap: 12px; }
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
.map-scene-inspector__tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
.map-scene-inspector__tab { padding: 5px 0; border: 1px solid var(--cf-border); border-radius: 5px; background: transparent; color: var(--cf-text-2); font-size: 11px; cursor: pointer; }
.map-scene-inspector__tab--active { border-color: var(--cf-primary); color: var(--cf-primary); background: color-mix(in srgb, var(--cf-primary) 10%, transparent); }
.map-scene-inspector__templates { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
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
