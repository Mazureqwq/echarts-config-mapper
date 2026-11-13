<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowReactive, shallowRef, watch } from "vue";
import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

// v6 全局 worker 地址：默认 import.meta.url 在 Vite 打包后解析不到独立 worker 文件
setWorkerUrl(maplibreWorkerUrl);
import type { ComponentRenderProps } from "@/core/components/types";
import { buildMapLibreScene, type MapLibreSceneLabel } from "@/core/components/mapLibreScene";
import { formatMapValue, normalizeMapSceneProps } from "@/core/components/mapScene";
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
  // T6：双击下钻（startDrill）在此接入
}

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
  // minZoom/maxZoom 由 setStyle 应用 style 根字段完成（v6 jumpTo 不接受该对参数）
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
      attributionControl: false,
      interactive: true,
    });
    instance.on("error", onMapError as never);
    instance.on("click", "cf-fill", (ev) => emitRegionEvent("click", ev));
    instance.on("dblclick", "cf-fill", (ev) => emitRegionEvent("dblclick", ev));
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
});
</script>

<template>
  <div class="map-scene" :class="`map-scene--${scene.presentation}`" :style="{ backgroundColor: scene.view.backgroundColor }">
    <div class="map-scene__surface" :style="{ backgroundColor: scene.view.backgroundColor }">
      <div ref="hostEl" class="map-scene__chart" />
      <div class="map-scene__caption">{{ scene.presentation === 'tilted' ? '立体地图 · 2.5D' : '平面地图 · 2D' }}</div>
      <div class="map-scene__layers">{{ visibleLayers }} 个可见图层</div>
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
.map-scene__layers { right: 10px; bottom: 10px; }
.map-scene__labels { position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: hidden; }
.map-scene__label { position: absolute; transform: translate(-50%, -50%); font-size: 10px; color: #e7fbff; text-shadow: 0 0 3px #013a4a, 0 0 2px #013a4a; white-space: nowrap; }
.map-scene__status { position: absolute; z-index: 2; left: 50%; bottom: 10px; max-width: 75%; transform: translateX(-50%); padding: 5px 8px; border-radius: 4px; background: #07121dd9; color: #ffd17b; font-size: 10px; text-align: center; pointer-events: none; }
</style>
