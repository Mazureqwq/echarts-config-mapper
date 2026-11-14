<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowReactive, shallowRef, watch } from "vue";
import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

// v6 全局 worker 地址：默认 import.meta.url 在 Vite 打包后解析不到独立 worker 文件
setWorkerUrl(maplibreWorkerUrl);
import type { ComponentRenderProps } from "@/core/components/types";
import { buildMapLibreScene, type MapLibreSceneLabel } from "@/core/components/mapLibreScene";
import { computeRegionCenter, formatMapValue, normalizeMapSceneProps } from "@/core/components/mapScene";
import { filterRowsByBinding } from "@/core/components/dataWidgets";
import type { DatasetSnapshot } from "@/core/model/types";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import chinaGeo from "@/assets/geo/china.json";

const props = defineProps<ComponentRenderProps>();
const scene = computed(() => normalizeMapSceneProps(props.item.props));
const ws = useWorkspaceStore();
const datasetRuntime = ws.getDatasetRuntime();
const layerSnapshots = shallowReactive<Record<string, DatasetSnapshot>>({});
const layerStops = new Map<string, () => void>();
let consumerSeq = 0;
const bindingSignature = computed(() => JSON.stringify(scene.value.layers.map((layer) => {
  const datasetId = layer.dataBinding?.datasetId ?? "";
  return [layer.id, datasetId, !!datasetId && ws.workspace.datasets.some((dataset) => dataset.id === datasetId)];
})));

function syncLayerSubscriptions(): void {
  for (const stop of layerStops.values()) stop();
  layerStops.clear();
  for (const key of Object.keys(layerSnapshots)) delete layerSnapshots[key];
  for (const layer of scene.value.layers) {
    const datasetId = layer.dataBinding?.datasetId;
    if (!datasetId) continue;
    if (!ws.workspace.datasets.some((dataset) => dataset.id === datasetId)) {
      layerSnapshots[layer.id] = { status: "error", rows: [], error: "绑定的数据集不存在" };
      continue;
    }
    try {
      layerStops.set(layer.id, datasetRuntime.subscribe(datasetId, `map-layer-${props.item.id}-${layer.id}-${++consumerSeq}`, (snapshot) => {
        layerSnapshots[layer.id] = snapshot;
      }));
    } catch (cause) {
      layerSnapshots[layer.id] = { status: "error", rows: [], error: cause instanceof Error ? cause.message : String(cause) };
    }
  }
}

watch(bindingSignature, syncLayerSubscriptions, { immediate: true });
onBeforeUnmount(() => {
  for (const stop of layerStops.values()) stop();
  layerStops.clear();
  if (map.value) {
    map.value.remove();
    map.value = null;
  }
});

const rowsByLayerId = computed(() => Object.fromEntries(scene.value.layers.flatMap((layer) => {
  if (!layer.dataBinding) return [];
  const snapshot = layerSnapshots[layer.id];
  return [[layer.id, filterRowsByBinding(snapshot?.rows ?? [], layer.dataBinding, props.variables)]];
})));

const result = computed(() => {
  const built = buildMapLibreScene(props.item.props, props.rows, props.item.dataBinding?.fields, rowsByLayerId.value, chinaGeo);
  const bindingErrors = scene.value.layers.flatMap((layer) => {
    if (!layer.dataBinding) return [];
    const snapshot = layerSnapshots[layer.id];
    return snapshot?.status === "error" ? [`${layer.name}：${snapshot.error || "数据集读取失败"}`] : [];
  });
  return { ...built, errors: [...built.errors, ...bindingErrors] };
});
const visibleLayers = computed(() => scene.value.layers.filter((layer) => layer.visible).length);

const hostEl = ref<HTMLDivElement | null>(null);
const map = shallowRef<MapLibreMap | null>(null);
const mapError = ref("");
const labelPositions = ref<Array<{ name: string; x: number; y: number }>>([]);

/* T7：hover / selected feature-state 与 tooltip 数据（与离线运行时同源） */
const hoveredName = ref<string | null>(null);
const hoveredId = ref<string | number | null>(null);
const selectedName = ref<string | null>(null);
const selectedId = ref<string | number | null>(null);
const tooltip = ref<{ visible: boolean; text: string; x: number; y: number }>({ visible: false, text: "", x: 0, y: 0 });

interface LegendRow {
  kind: "segment" | "ramp";
  label: string;
  color?: string;
  stops?: string[];
}

const legendRows = computed<LegendRow[]>(() => {
  const entries = result.value.legend.entries;
  if (result.value.legend.mode === "segments") {
    return entries.map((entry) => {
      const seg = entry as { label: string; color: string };
      return { kind: "segment" as const, label: seg.label, color: seg.color };
    });
  }
  const ramp = entries[0] as { from: string; to: string; stops: string[] } | undefined;
  return ramp ? [{ kind: "ramp" as const, label: `${ramp.from} \u2013 ${ramp.to}`, stops: ramp.stops }] : [];
});

function projectLabels(): void {
  const instance = map.value;
  if (!instance || !result.value.flags.showLabels) {
    labelPositions.value = [];
    return;
  }
  const canvas = instance.getCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  labelPositions.value = result.value.labels
    .map((label: MapLibreSceneLabel) => {
      const point = instance.project(label.centroid);
      return { name: label.name, x: point.x, y: point.y };
    })
    .filter((point) => point.x >= 0 && point.y >= 0 && point.x <= width && point.y <= height);
}

interface RegionPointerEvent {
  features?: Array<{ id?: unknown; properties?: Record<string, unknown> }>;
  point?: { x: number; y: number };
}

function featureIdOf(feature: unknown): string | number | null {
  const f = feature as { id?: unknown; properties?: { name?: unknown } } | undefined;
  if (typeof f?.id === "number" || typeof f?.id === "string") return f.id;
  const name = f?.properties?.name;
  return typeof name === "string" && name ? name : null;
}

function setRegionState(id: string | number | null, key: "cf_hover" | "cf_selected", on: boolean): void {
  const instance = map.value;
  if (!instance || id === null) return;
  try {
    instance.setFeatureState({ source: "china", id }, { [key]: on });
  } catch {
    /* 样式尚未就绪时忽略 */
  }
}

function clearHoverState(): void {
  if (hoveredId.value !== null) setRegionState(hoveredId.value, "cf_hover", false);
  hoveredId.value = null;
  hoveredName.value = null;
}

function onFillMouseMove(ev: RegionPointerEvent): void {
  const feature = ev.features?.[0];
  const name = feature?.properties?.name;
  if (typeof name !== "string" || !name) {
    clearHoverState();
    tooltip.value = { ...tooltip.value, visible: false };
    return;
  }
  if (name !== hoveredName.value) {
    if (hoveredId.value !== null) setRegionState(hoveredId.value, "cf_hover", false);
    hoveredId.value = featureIdOf(feature);
    hoveredName.value = name;
    setRegionState(hoveredId.value, "cf_hover", true);
  }
  const point = ev.point ?? { x: 0, y: 0 };
  tooltip.value = { visible: true, text: result.value.tooltip.texts[name] ?? name, x: point.x, y: point.y };
}

function onFillMouseOut(): void {
  clearHoverState();
  tooltip.value = { ...tooltip.value, visible: false };
}

function onFillClick(ev: RegionPointerEvent): void {
  const feature = ev.features?.[0];
  const name = feature?.properties?.name;
  if (typeof name !== "string" || !name) return;
  if (selectedId.value !== null) setRegionState(selectedId.value, "cf_selected", false);
  selectedId.value = featureIdOf(feature);
  selectedName.value = name;
  setRegionState(selectedId.value, "cf_selected", true);
}

function emitRegionEvent(type: "click" | "dblclick", ev: { features?: Array<{ properties?: Record<string, unknown> }> }): void {
  const name = ev.features?.[0]?.properties?.name;
  if (typeof name !== "string" || !name) return;
  const value = result.value.regionValues[name] ?? null;
  props.emitEvent(type === "click" ? "regionClick" : "regionDblclick", {
    name,
    value,
    valueText: formatMapValue(value, scene.value.valueFormat),
    presentation: scene.value.presentation,
  });
  if (type === "dblclick") startDrill(name);
}

interface DrillEntry { center: [number, number]; zoom: number; regionName: string }
const drillStack = ref<DrillEntry[]>([]);

function currentCamera(): { center: [number, number]; zoom: number } {
  const instance = map.value;
  if (!instance) {
    return { center: [...scene.value.view.center] as [number, number], zoom: scene.value.view.zoom };
  }
  const c = instance.getCenter();
  return { center: [c.lng, c.lat], zoom: instance.getZoom() };
}

function startDrill(regionName: string): void {
  if (!(scene.value.drill?.enabled ?? true)) return;
  const center = computeRegionCenter(chinaGeo, regionName);
  if (!center) return;
  const cam = currentCamera();
  const targetZoom = Math.min(scene.value.view.maxZoom, Math.max(4.5, cam.zoom));
  drillStack.value = [...drillStack.value, { center, zoom: targetZoom, regionName }];
  map.value?.flyTo({ center, zoom: targetZoom, duration: 350, essential: true });
}

function drillToLevel(index: number): void {
  if (!drillStack.value.length && index >= 0) return;
  const target = index >= 0 ? drillStack.value[index] ?? null : null;
  drillStack.value = target ? drillStack.value.slice(0, index + 1) : [];
  const to = target
    ? { center: [...target.center] as [number, number], zoom: target.zoom }
    : { center: [...scene.value.view.center] as [number, number], zoom: scene.value.view.zoom };
  map.value?.flyTo({ center: to.center, zoom: to.zoom, duration: 350, essential: true });
  props.emitEvent("regionUpdrill", { name: target ? target.regionName : "全国", presentation: scene.value.presentation });
}

function onDocKeydown(ev: KeyboardEvent): void {
  if (ev.key !== "Escape" || !drillStack.value.length) return;
  ev.stopImmediatePropagation();
  ev.preventDefault();
  drillToLevel(drillStack.value.length - 2);
}
onMounted(() => window.addEventListener("keydown", onDocKeydown, true));

function onMapError(ev: unknown): void {
  const err = ev as { error?: { message?: string }; message?: string };
  mapError.value = err.error?.message || err.message || "地图渲染出错";
}

const DEFAULT_CENTER: [number, number] = [104.114129, 35.550339];
const DEFAULT_ZOOM = 1.05;

function fitIfDefaultView(): void {
  const instance = map.value;
  const built = result.value;
  if (!instance || !built.bounds) return;
  const center = built.style.center as [number, number];
  const zoom = built.style.zoom as number;
  const isDefault = center[0] === DEFAULT_CENTER[0] && center[1] === DEFAULT_CENTER[1] && zoom === DEFAULT_ZOOM;
  if (!isDefault) return;
  instance.fitBounds(built.bounds, { padding: 28, duration: 0 });
}

function applyScene(): void {
  const instance = map.value;
  if (!instance) return;
  const built = result.value;
  instance.setStyle(built.style as Exclude<Parameters<MapLibreMap["setStyle"]>[0], null>, { diff: true });
  // minZoom/maxZoom are Map options, not style-root properties in MapLibre.
  instance.setMinZoom(built.style.minZoom as number);
  instance.setMaxZoom(built.style.maxZoom as number);
  instance.jumpTo({
    center: [...(built.style.center as [number, number])],
    zoom: built.style.zoom as number,
    pitch: built.style.pitch as number,
  });
  fitIfDefaultView();
  projectLabels();
}

watch(result, applyScene);

watch(
  () => result.value.flags,
  (flags) => {
    const instance = map.value;
    if (!instance) return;
    if (flags.dragEnabled) instance.dragPan.enable();
    else instance.dragPan.disable();
    if (flags.zoomEnabled) instance.scrollZoom.enable();
    else instance.scrollZoom.disable();
    projectLabels();
  },
  { deep: true },
);

onMounted(() => {
  if (!hostEl.value) return;
  try {
    const instance = new MapLibreMap({
      container: hostEl.value,
      style: result.value.style as Exclude<Parameters<MapLibreMap["setStyle"]>[0], null>,
      minZoom: result.value.style.minZoom as number,
      maxZoom: result.value.style.maxZoom as number,
      attributionControl: false,
      interactive: true,
    });
    instance.on("error", onMapError as never);
    instance.on("click", "cf-fill", (ev) => { emitRegionEvent("click", ev); onFillClick(ev); });
    instance.on("dblclick", "cf-fill", (ev) => emitRegionEvent("dblclick", ev));
    instance.on("mousemove", "cf-fill", (ev) => onFillMouseMove(ev));
    instance.on("mouseout", "cf-fill", () => onFillMouseOut());
    // 双击语义让位给区域下钻（T6），关闭 maplibre 默认双击缩放
    instance.doubleClickZoom.disable();
    instance.on("move", projectLabels);
    instance.on("load", () => {
      fitIfDefaultView();
      projectLabels();
    });
    map.value = instance;
    fitIfDefaultView();
    const flags = result.value.flags;
    if (!flags.dragEnabled) instance.dragPan.disable();
    if (!flags.zoomEnabled) instance.scrollZoom.disable();
    projectLabels();
  } catch (cause) {
    mapError.value = cause instanceof Error ? cause.message : String(cause);
  }
});

defineExpose({
  getMap: () => map.value,
  // readScene 保持既有契约（regionValues + errors），交互态数据走 readAppearance
  readScene: () => ({ regionValues: { ...result.value.regionValues }, errors: [...result.value.errors] }),
  readAppearance: () => ({
    legend: result.value.legend,
    tooltip: result.value.tooltip,
    hover: hoveredName.value,
    selected: selectedName.value,
  }),
});
</script>

<template>
  <div class="map-scene" :class="`map-scene--${scene.presentation}`" :style="{ backgroundColor: scene.view.backgroundColor }">
    <div class="map-scene__surface" :style="{ backgroundColor: scene.view.backgroundColor }">
      <div ref="hostEl" class="map-scene__chart" />
      <div class="map-scene__caption">{{ scene.presentation === 'tilted' ? '立体地图 · 2.5D' : '平面地图 · 2D' }}</div>
      <div v-if="drillStack.length" class="map-scene__breadcrumb" role="navigation" aria-label="地图下钻面包屑">
        <button type="button" class="map-scene__crumb" @click="drillToLevel(-1)">全国</button>
        <template v-for="(entry, index) in drillStack" :key="`${entry.regionName}-${index}`">
          <span class="map-scene__crumb-sep">›</span>
          <button type="button" class="map-scene__crumb" @click="drillToLevel(index)">{{ entry.regionName }}</button>
        </template>
      </div>
      <div class="map-scene__layers">{{ visibleLayers }} 个可见图层</div>
      <div
        v-if="result.legend.show"
        class="map-scene__legend"
        :class="`map-scene__legend--${result.legend.position}`"
        role="list"
        aria-label="地图图例"
      >
        <span v-for="(row, index) in legendRows" :key="index" class="map-scene__legend-item" role="listitem">
          <i v-if="row.kind === 'segment'" class="map-scene__legend-swatch" :style="{ background: row.color }" />
          <i v-else class="map-scene__legend-bar" :style="{ background: `linear-gradient(90deg, ${(row.stops ?? []).join(', ')})` }" />
          <span class="map-scene__legend-label">{{ row.label }}</span>
        </span>
      </div>
      <div
        v-if="tooltip.visible"
        class="map-scene__tooltip"
        :style="{
          left: `${tooltip.x + 12}px`,
          top: `${tooltip.y + 12}px`,
          background: result.tooltip.background,
          borderColor: result.tooltip.borderColor,
          color: result.tooltip.color,
          fontSize: `${result.tooltip.fontSize}px`,
        }"
      >{{ tooltip.text }}</div>
      <div class="map-scene__labels" aria-hidden="true">
        <span
          v-for="label in labelPositions"
          :key="label.name"
          class="map-scene__label"
          :style="{ left: `${label.x}px`, top: `${label.y}px` }"
        >{{ label.name }}</span>
      </div>
      <div v-if="result.errors.length" class="map-scene__status" role="status">{{ result.errors.join('；') }}</div>
      <div v-else-if="mapError" class="map-scene__status" role="status">{{ mapError }}</div>
      <div v-else-if="!scene.layers.length" class="map-scene__status" role="status">本地离线底图 · 可从图层面板添加区域填色、散点、热力或飞线</div>
    </div>
  </div>
</template>

<style scoped>
.map-scene { width: 100%; height: 100%; overflow: hidden; color: #b9e9f5; font-family: system-ui, sans-serif; }
.map-scene__surface { position: relative; width: 100%; height: 100%; box-shadow: inset 0 0 34px #1ca7cf24; }
.map-scene--tilted .map-scene__surface { box-shadow: inset 0 0 30px #26c5ff2b, 0 10px 18px #02080e88; }
.map-scene__chart { position: absolute; inset: 0; }

.map-scene__caption, .map-scene__layers { position: absolute; z-index: 2; padding: 5px 8px; border: 1px solid #54bad744; border-radius: 4px; background: #061622c9; font-size: 11px; pointer-events: none; }
.map-scene__caption { top: 10px; left: 10px; }
.map-scene__breadcrumb { position: absolute; z-index: 2; top: 10px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 4px; padding: 4px 8px; border: 1px solid #54bad744; border-radius: 4px; background: #061622c9; font-size: 11px; pointer-events: auto; }
.map-scene__crumb { border: none; background: transparent; color: #b9e9f5; cursor: pointer; padding: 0; font-size: 11px; }
.map-scene__crumb:hover { color: #32d6ff; }
.map-scene__crumb-sep { color: #54bad7; }
.map-scene__layers { right: 10px; bottom: 10px; }
.map-scene__labels { position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: hidden; }
.map-scene__label { position: absolute; transform: translate(-50%, -50%); font-size: 10px; color: #e7fbff; text-shadow: 0 0 3px #013a4a, 0 0 2px #013a4a; white-space: nowrap; }
.map-scene__status { position: absolute; z-index: 2; left: 50%; bottom: 10px; max-width: 75%; transform: translateX(-50%); padding: 5px 8px; border-radius: 4px; background: #07121dd9; color: #ffd17b; font-size: 10px; text-align: center; pointer-events: none; }
.map-scene__legend { position: absolute; z-index: 3; display: flex; flex-direction: column; gap: 3px; padding: 5px 8px; border: 1px solid #54bad744; border-radius: 4px; background: #061622c9; font-size: 10px; pointer-events: none; }
.map-scene__legend--top-right { top: 10px; right: 10px; }
.map-scene__legend--bottom-right { right: 10px; bottom: 34px; }
.map-scene__legend--bottom-left { left: 10px; bottom: 10px; }
.map-scene__legend-item { display: flex; align-items: center; gap: 6px; color: #b9e9f5; }
.map-scene__legend-swatch { width: 9px; height: 9px; border-radius: 2px; }
.map-scene__legend-bar { display: inline-block; width: 96px; height: 8px; border: 1px solid #54bad744; border-radius: 3px; }
.map-scene__legend-label { white-space: nowrap; }
.map-scene__tooltip { position: absolute; z-index: 4; padding: 4px 8px; border: 1px solid #1f2a3a; border-radius: 4px; font-size: 12px; pointer-events: none; white-space: nowrap; }
</style>
