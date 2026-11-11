<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { CSSProperties } from "vue";
import type { DatasetSnapshot, ScreenItem } from "@/core/model/types";
import type { ComponentRenderProps } from "@/core/components/types";
import { componentRegistry } from "@/core/components/builtins";
import { filterRowsByBinding } from "@/core/components/dataWidgets";
import { buildOption } from "@/core/chart/optionBuilder";
import { applyThemeChartPalette, getThemeById } from "@/core/design/library";
import { buildChartDataFromRows } from "@/core/live/payload";
import { themeMode } from "@/shared/theme";
import { useDocumentStore } from "@/stores/documentStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import EChartsView from "./EChartsView.vue";

const doc = useDocumentStore();
const ws = useWorkspaceStore();
const props = withDefaults(defineProps<{
  item: ScreenItem;
  variables?: Readonly<Record<string, unknown>>;
  emitEvent?: ComponentRenderProps["emitEvent"];
}>(), { variables: () => ({}), emitEvent: () => undefined });

const componentDefinition = computed(() => {
  const item = props.item;
  return item.kind === "component"
    ? componentRegistry.get(item.componentId, item.componentVersion)
    : undefined;
});

const componentView = computed(() => {
  const renderer = componentDefinition.value?.renderer;
  return renderer?.kind === "vue" ? renderer.view : null;
});

const componentFallback = computed(() => {
  const item = props.item;
  return item.kind === "component"
    ? `组件未注册：${item.componentId}@${item.componentVersion}`
    : "";
});

const legacyAdapterAvailable = computed(() => {
  const item = props.item;
  return (
    item.kind !== "component" &&
    componentRegistry.get(`legacy.${item.kind}`, 1)?.renderer.kind === "legacy"
  );
});

const boxStyle = computed<CSSProperties>(() => {
  const f = props.item.frame;
  const style: CSSProperties = {
    position: "absolute",
    left: `${f.x}px`,
    top: `${f.y}px`,
    width: `${f.w}px`,
    height: `${f.h}px`,
    transform: `rotate(${f.rotate}deg)`,
    transformOrigin: "center center",
  };
  if (props.item.opacity !== undefined) style.opacity = String(props.item.opacity);
  if (props.item.hidden) style.display = "none";
  return style;
});

const textBoxStyle = computed<CSSProperties>(() => {
  const it = props.item;
  if (it.kind !== "text") return {};
  return {
    display: "flex",
    flexDirection: "column",
    justifyContent: it.verticalAlign === "middle" ? "center" : it.verticalAlign === "bottom" ? "flex-end" : "flex-start",
    boxSizing: "border-box",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    padding: `${it.padding ?? 0}px`,
    backgroundColor: it.backgroundColor,
    border: it.borderWidth ? `${it.borderWidth}px solid ${it.borderColor ?? "transparent"}` : undefined,
    borderRadius: it.radius ? `${it.radius}px` : undefined,
  };
});

const textContentStyle = computed<CSSProperties>(() => {
  const it = props.item;
  if (it.kind !== "text") return {};
  return {
    display: it.overflow === "ellipsis" ? "-webkit-box" : "block",
    overflow: "hidden",
    textOverflow: it.overflow === "ellipsis" ? "ellipsis" : "clip",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: it.overflow === "ellipsis" ? String(it.lineClamp ?? 2) : undefined,
    fontFamily: it.fontFamily ?? "system-ui",
    fontSize: `${it.fontSize}px`,
    fontStyle: it.fontStyle ?? "normal",
    fontWeight: it.weight,
    letterSpacing: it.letterSpacing ? `${it.letterSpacing}px` : undefined,
    lineHeight: it.lineHeight !== undefined ? String(it.lineHeight) : "1.4",
    color: it.color,
    textAlign: it.align,
    textShadow: it.shadow ? `${it.shadow.offsetX}px ${it.shadow.offsetY}px ${it.shadow.blur}px ${it.shadow.color}` : undefined,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    width: "100%",
  };
});

const imageSrc = computed(() => {
  const item = props.item;
  if (item.kind !== "image") return "";
  return item.sourceDesignAssetId
    ? ws.designAssets.find((asset) => asset.id === item.sourceDesignAssetId)?.dataUrl ?? item.src
    : item.src;
});

const imageStyle = computed<CSSProperties>(() => {
  const it = props.item;
  if (it.kind !== "image") return {};
  return {
    width: "100%",
    height: "100%",
    objectFit: it.fit,
    display: "block",
  };
});

const shapeStyle = computed<CSSProperties>(() => {
  const it = props.item;
  if (it.kind !== "shape") return {};
  const style: CSSProperties = {
    width: "100%",
    height: "100%",
    background: it.fill ?? "transparent",
  };
  if (it.stroke) {
    style.border = `${it.strokeWidth ?? 1}px solid ${it.stroke}`;
  }
  if (it.shape === "ellipse") {
    style.borderRadius = "50%";
  } else if (it.shape === "rect" && it.radius) {
    style.borderRadius = `${it.radius}px`;
  } else if (it.shape === "line") {
    style.background = it.stroke ?? it.fill ?? "#333";
    style.height = `${it.strokeWidth ?? 2}px`;
    style.marginTop = `calc(50% - ${(it.strokeWidth ?? 2) / 2}px)`;
  }
  return style;
});

const datasetBinding = computed(() =>
  props.item.kind === "chart" || props.item.kind === "component" ? props.item.dataBinding : undefined
);
const datasetSnapshot = ref<DatasetSnapshot>({ status: "idle", rows: [] });
const datasetRuntime = ws.getDatasetRuntime();
let stopDataset: (() => void) | null = null;
let consumerSeq = 0;

watch(
  () => {
    const datasetId = datasetBinding.value?.datasetId ?? "";
    return [datasetId, !!datasetId && ws.workspace.datasets.some((dataset) => dataset.id === datasetId)] as const;
  },
  ([datasetId, exists]) => {
    stopDataset?.();
    stopDataset = null;
    datasetSnapshot.value = { status: "idle", rows: [] };
    if (!datasetId) return;
    if (!exists) {
      datasetSnapshot.value = { status: "error", rows: [], error: "绑定的数据集不存在" };
      return;
    }
    try {
      const consumerId = `item-view-${props.item.id}-${++consumerSeq}`;
      stopDataset = datasetRuntime.subscribe(datasetId, consumerId, (snapshot) => {
        datasetSnapshot.value = snapshot;
      });
    } catch (cause) {
      datasetSnapshot.value = { status: "error", rows: [], error: cause instanceof Error ? cause.message : String(cause) };
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  stopDataset?.();
  stopDataset = null;
});

const boundRows = computed(() =>
  filterRowsByBinding(datasetSnapshot.value.rows, datasetBinding.value, props.variables)
);
const componentRows = computed(() => {
  if (datasetBinding.value) return boundRows.value;
  return componentDefinition.value?.sampleRows?.map((row) => ({ ...row })) ?? [];
});

function emitComponentEvent(name: string, payload: unknown): void {
  const definition = componentDefinition.value;
  if (!definition?.events.some((event) => event.name === name)) return;
  props.emitEvent(name, payload);
}

const chartDataError = computed(() => {
  const item = props.item;
  if (item.kind !== "chart" || !item.dataBinding) return "";
  const result = buildChartDataFromRows(boundRows.value, item.dataBinding.fields, item.spec.type);
  if (!result.ok) return result.message;
  const isGeo = item.spec.type === "geoScatter" || item.spec.type === "geoHeatmap" || item.spec.type === "geoFlow";
  if (isGeo && datasetSnapshot.value.status === "success" && boundRows.value.length === 0) return "当前筛选没有匹配的地理数据";
  return "";
});

const chartPalette = computed(() => getThemeById(doc.currentScreen?.themeId)?.tokens.chartPalette ?? []);

const chartOption = computed<Record<string, unknown> | null>(() => {
  const it = props.item;
  if (it.kind !== "chart") return null;
  if (!it.dataBinding) return buildOption(applyThemeChartPalette(it.spec, chartPalette.value));
  const result = buildChartDataFromRows(boundRows.value, it.dataBinding.fields, it.spec.type);
  if (!result.ok) return null;
  const isGeo = it.spec.type === "geoScatter" || it.spec.type === "geoHeatmap" || it.spec.type === "geoFlow";
  if (isGeo && datasetSnapshot.value.status === "success" && boundRows.value.length === 0) return null;
  return buildOption(applyThemeChartPalette({ ...it.spec, data: result.data }, chartPalette.value));
});
</script>

<template>
  <div class="item-view" :style="boxStyle" :data-item-id="item.id">
    <div
      v-if="item.kind === 'chart' && (doc.liveStatus[item.id]?.stale || datasetSnapshot.status === 'stale')"
      class="item-view__stale"
      data-ui-only
      title="实时数据拉取失败，显示的是最后一次成功数据"
    >
      数据过期
    </div>
    <template v-if="item.kind === 'text' && legacyAdapterAvailable">
      <div :style="textBoxStyle"><span :style="textContentStyle">{{ item.text }}</span></div>
    </template>
    <template v-else-if="item.kind === 'image' && legacyAdapterAvailable">
      <img v-if="imageSrc" :src="imageSrc" :style="imageStyle" alt="" draggable="false" />
      <div v-else class="item-view__img-empty">图片</div>
    </template>
    <template v-else-if="item.kind === 'shape' && legacyAdapterAvailable">
      <div :style="shapeStyle" />
    </template>
    <template v-else-if="item.kind === 'component'">
      <component
        v-if="componentView"
        :is="componentView"
        v-bind="item.props"
        :item="item"
        :snapshot="datasetSnapshot"
        :rows="componentRows"
        :variables="variables"
        :emit-event="emitComponentEvent"
      />
      <div v-else class="item-view__missing">{{ componentFallback }}</div>
    </template>
    <template v-else-if="item.kind === 'chart' && legacyAdapterAvailable">
      <EChartsView v-if="chartOption" :option="chartOption" :theme="themeMode" />
      <div v-if="chartDataError" class="item-view__binding-error" role="status">{{ chartDataError }}</div>
    </template>
  </div>
</template>

<style scoped>
.item-view__stale {
  position: absolute;
  top: -10px;
  right: -10px;
  z-index: 5;
  padding: 1px 8px;
  border-radius: 9px;
  background: #faad14;
  color: #fff;
  font-size: 11px;
  pointer-events: none;
}
.item-view__img-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--cf-border);
  color: var(--cf-text-2);
  font-size: 12px;
}
.item-view__binding-error {
  position: absolute;
  inset: auto 4px 4px;
  z-index: 4;
  padding: 3px 6px;
  border-radius: 4px;
  background: rgba(127, 29, 29, 0.88);
  color: #fff;
  font-size: 10px;
  pointer-events: none;
}
.item-view__missing {
  box-sizing: border-box;
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  padding: 12px;
  border: 1px dashed var(--cf-border);
  color: var(--cf-text-2);
  font-size: 12px;
  text-align: center;
  overflow-wrap: anywhere;
}
</style>
