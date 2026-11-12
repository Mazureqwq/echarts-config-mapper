<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowReactive, watch } from "vue";
import type { ComponentRenderProps } from "@/core/components/types";
import { buildMapLegend, buildMapSceneOption, computeRegionCenter, filterLayersForZoom, formatMapValue, interpolateDrillView, normalizeMapSceneProps, type DrillView, type MapLegendEntry } from "@/core/components/mapScene";
import { getMap } from "echarts/core";
import EChartsView from "@/workbench/EChartsView.vue";
import { themeMode } from "@/shared/theme";
import { filterRowsByBinding } from "@/core/components/dataWidgets";
import type { DatasetSnapshot } from "@/core/model/types";
import { useWorkspaceStore } from "@/stores/workspaceStore";

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
  window.removeEventListener("keydown", onDocKeydown, true);
  if (tweenHandle !== null) cancelAnimationFrame(tweenHandle);
  for (const stop of layerStops.values()) stop();
  layerStops.clear();
});

const rowsByLayerId = computed(() => Object.fromEntries(scene.value.layers.flatMap((layer) => {
  if (!layer.dataBinding) return [];
  const snapshot = layerSnapshots[layer.id];
  return [[layer.id, filterRowsByBinding(snapshot?.rows ?? [], layer.dataBinding, props.variables)]];
})));
const chartView = ref<InstanceType<typeof EChartsView> | null>(null);
const liveCamera = ref<{ center: [number, number]; zoom: number } | null>(null);
const actualCamera = ref<{ center: [number, number]; zoom: number } | null>(null);
const visibleSig = ref("");
interface DrillEntry extends DrillView { regionName: string }
const drillStack = ref<DrillEntry[]>([]);
let tweenHandle: number | null = null;
function layerSignature(zoom: number): string {
  return filterLayersForZoom(scene.value.layers, zoom).map((layer) => layer.id).join("|");
}
function onRoam(camera: { center: [number, number]; zoom: number }): void {
  actualCamera.value = camera;
  const sig = layerSignature(camera.zoom);
  if (sig === visibleSig.value) return;
  visibleSig.value = sig;
  liveCamera.value = camera;
}
function currentCamera(): DrillView {
  const source = actualCamera.value ?? liveCamera.value;
  return source
    ? { center: [...source.center] as [number, number], zoom: source.zoom }
    : { center: [...scene.value.view.center] as [number, number], zoom: scene.value.view.zoom };
}
function tweenCamera(to: DrillView): void {
  if (tweenHandle !== null) cancelAnimationFrame(tweenHandle);
  const from = currentCamera();
  const start = Date.now();
  const step = () => {
    const t = Math.min(1, (Date.now() - start) / 350);
    const frame = interpolateDrillView(from, to, t);
    chartView.value?.setCamera?.(frame.center, frame.zoom);
    if (t < 1) {
      tweenHandle = requestAnimationFrame(step);
    } else {
      tweenHandle = null;
      liveCamera.value = { center: [...to.center] as [number, number], zoom: to.zoom };
      visibleSig.value = layerSignature(to.zoom);
    }
  };
  tweenHandle = requestAnimationFrame(step);
}
function startDrill(regionName: string): void {
  if (!(scene.value.drill?.enabled ?? true)) return;
  const geoJson = getMap("china")?.geoJson;
  const center = geoJson ? computeRegionCenter(geoJson, regionName) : null;
  if (!center) return;
  const from = currentCamera();
  const targetZoom = Math.min(scene.value.view.maxZoom, Math.max(4.5, from.zoom));
  drillStack.value = [...drillStack.value, { center, zoom: targetZoom, regionName }];
  tweenCamera({ center, zoom: targetZoom });
}
function drillToLevel(index: number): void {
  if (!drillStack.value.length && index >= 0) return;
  const target = index >= 0 ? drillStack.value[index] ?? null : null;
  drillStack.value = target ? drillStack.value.slice(0, index + 1) : [];
  const to: DrillView = target
    ? { center: [...target.center] as [number, number], zoom: target.zoom }
    : { center: [...scene.value.view.center] as [number, number], zoom: scene.value.view.zoom };
  tweenCamera(to);
  props.emitEvent("regionUpdrill", { name: target ? target.regionName : "全国", presentation: scene.value.presentation });
}
function onDocKeydown(ev: KeyboardEvent): void {
  if (ev.key !== "Escape" || !drillStack.value.length) return;
  ev.stopImmediatePropagation();
  ev.preventDefault();
  drillToLevel(drillStack.value.length - 2);
}
onMounted(() => window.addEventListener("keydown", onDocKeydown, true));
watch(scene, () => {
  visibleSig.value = layerSignature(liveCamera.value?.zoom ?? scene.value.view.zoom);
}, { immediate: true });
function onChartEvent(payload: { type: "click" | "dblclick"; name: string | null; value: number | null; componentType: string; seriesType: string }): void {
  if (payload.componentType !== "series" || payload.seriesType !== "map" || !payload.name) return;
  const eventName = payload.type === "click" ? "regionClick" : "regionDblclick";
  props.emitEvent(eventName, {
    name: payload.name,
    value: payload.value,
    valueText: formatMapValue(payload.value, scene.value.valueFormat),
    presentation: scene.value.presentation,
  });
  if (payload.type === "dblclick") startDrill(payload.name);
}
const result = computed(() => {
  const zoom = liveCamera.value?.zoom ?? scene.value.view.zoom;
  const layers = filterLayersForZoom(scene.value.layers, zoom);
  const rawProps = props.item.props as Record<string, unknown>;
  const optionProps: Record<string, unknown> = { ...rawProps, layers };
  if (liveCamera.value) optionProps.view = { ...scene.value.view, center: liveCamera.value.center, zoom: liveCamera.value.zoom };
  const built = buildMapSceneOption(optionProps, props.rows, props.item.dataBinding?.fields, rowsByLayerId.value);
  const bindingErrors = scene.value.layers.flatMap((layer) => {
    if (!layer.dataBinding) return [];
    const snapshot = layerSnapshots[layer.id];
    return snapshot?.status === "error" ? [`${layer.name}：${snapshot.error || "数据集读取失败"}`] : [];
  });
  return { ...built, errors: [...built.errors, ...bindingErrors] };
});
const visibleLayers = computed(() => scene.value.layers.filter((layer) => layer.visible).length);
const legendEntries = computed<MapLegendEntry[]>(() =>
  buildMapLegend(props.item.props, props.rows, props.item.dataBinding?.fields),
);
</script>

<template>
  <div class="map-scene" :class="`map-scene--${scene.presentation}`" :style="{ backgroundColor: scene.view.backgroundColor }">
    <div class="map-scene__surface" :style="{ backgroundColor: scene.view.backgroundColor }">
      <EChartsView ref="chartView" class="map-scene__chart" :option="result.option" :theme="themeMode" @roam="onRoam" @chart-event="onChartEvent" />
      <div class="map-scene__caption">{{ scene.presentation === 'tilted' ? '立体地图 · 2.5D' : '平面地图 · 2D' }}</div>
      <div v-if="drillStack.length" class="map-scene__breadcrumb" role="navigation" aria-label="地图下钻面包屑">
        <button type="button" class="map-scene__crumb" @click="drillToLevel(-1)">全国</button>
        <template v-for="(entry, index) in drillStack" :key="`${entry.regionName}-${index}`">
          <span class="map-scene__crumb-sep">›</span>
          <button type="button" class="map-scene__crumb" @click="drillToLevel(index)">{{ entry.regionName }}</button>
        </template>
      </div>
      <div class="map-scene__layers">{{ visibleLayers }} 个可见图层</div>
      <div v-if="legendEntries.length" class="map-scene__legend" :class="`map-scene__legend--${scene.legend?.position ?? 'top-right'}`">
        <template v-for="(entry, index) in legendEntries" :key="index">
          <span v-if="'stops' in entry" class="map-scene__legend-range">
            <i class="map-scene__legend-bar" :style="{ background: `linear-gradient(90deg, ${entry.stops.join(', ')})` }" />
            {{ entry.from }} – {{ entry.to }}
          </span>
          <span v-else class="map-scene__legend-item">
            <i class="map-scene__legend-swatch" :style="{ background: entry.color }" />{{ entry.label }}
          </span>
        </template>
      </div>
      <div v-if="result.errors.length" class="map-scene__status" role="status">{{ result.errors.join('；') }}</div>
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
.map-scene__legend { position: absolute; z-index: 2; display: flex; flex-direction: column; gap: 3px; padding: 5px 8px; border: 1px solid #54bad744; border-radius: 4px; background: #061622c9; font-size: 10px; pointer-events: none; }
.map-scene__legend--top-right { top: 10px; right: 10px; }
.map-scene__legend--bottom-right { right: 10px; bottom: 34px; }
.map-scene__legend--bottom-left { left: 10px; bottom: 10px; }
.map-scene__legend-range { display: flex; align-items: center; gap: 6px; color: #b9e9f5; }
.map-scene__legend-bar { display: inline-block; width: 96px; height: 8px; border-radius: 3px; border: 1px solid #54bad744; }
.map-scene__legend-item { display: flex; align-items: center; gap: 5px; color: #b9e9f5; }
.map-scene__legend-swatch { width: 9px; height: 9px; border-radius: 2px; }
.map-scene__status { position: absolute; z-index: 2; left: 50%; bottom: 10px; max-width: 75%; transform: translateX(-50%); padding: 5px 8px; border-radius: 4px; background: #07121dd9; color: #ffd17b; font-size: 10px; text-align: center; pointer-events: none; }
</style>
