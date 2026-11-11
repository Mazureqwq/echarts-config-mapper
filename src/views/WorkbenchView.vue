<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDocumentStore } from "@/stores/documentStore";
import CanvasStage from "@/workbench/CanvasStage.vue";
import LeftPanel from "@/workbench/LeftPanel.vue";
import InspectorPanel from "@/workbench/InspectorPanel.vue";
import TopBar from "@/workbench/TopBar.vue";
import Icon from "@/shared/ui/Icon.vue";
import ShortcutsHelp from "@/workbench/ShortcutsHelp.vue";
import { snapshotStage } from "@/workbench/stageThumbnail";
import { LiveExecutor } from "@/core/live/liveExecutor";
import { componentRegistry } from "@/core/components/builtins";
import { runBlueprint } from "@/core/blueprint/runner";
import type { BlueprintContext, BlueprintGraph, BlueprintVariable } from "@/core/blueprint/types";
import type { ComponentItem } from "@/core/model/types";
import BlueprintEditor from "@/workbench/BlueprintEditor.vue";

const props = defineProps<{ id: string }>();
const ws = useWorkspaceStore();
const doc = useDocumentStore();
const stageWrap = ref<HTMLDivElement | null>(null);
const leftCollapsed = ref(false);
const rightCollapsed = ref(false);
const blueprintOpen = ref(false);
const blueprintMessage = ref("");
const runtimeVariablesByScreen = reactive<Record<string, Record<string, unknown>>>({});
const runtimeVariableDefaultsByScreen: Record<string, Record<string, string>> = {};
const currentRuntimeVariables = computed<Readonly<Record<string, unknown>>>(() => {
  const screenId = doc.currentScreen?.id;
  return screenId ? runtimeVariablesByScreen[screenId] ?? {} : {};
});
const currentBlueprint = computed<BlueprintGraph>(() =>
  doc.currentScreen?.blueprint ?? { nodes: [], edges: [], variables: [] }
);
const boundVariableNames = computed(() => {
  const names = new Set<string>();
  for (const item of doc.currentScreen?.items ?? []) {
    if (!("dataBinding" in item)) continue;
    const name = item.dataBinding?.filterBy?.globalVariable;
    if (name) names.add(name);
  }
  return [...names];
});

function cloneJson<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function variableMatches(variable: BlueprintVariable, value: unknown): boolean {
  if (variable.type === "string") return typeof value === "string";
  if (variable.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (variable.type === "boolean") return typeof value === "boolean";
  return value === null || typeof value === "object";
}
watch(
  () => ({ screenId: doc.currentScreen?.id, variables: doc.currentScreen?.blueprint?.variables }),
  ({ screenId, variables }) => {
    if (!screenId) return;
    const current = runtimeVariablesByScreen[screenId] ?? (runtimeVariablesByScreen[screenId] = {});
    const defaults = runtimeVariableDefaultsByScreen[screenId] ?? (runtimeVariableDefaultsByScreen[screenId] = {});
    const declarations = variables ?? [];
    const names = new Set(declarations.map((variable) => variable.name));
    for (const variable of declarations) {
      const signature = JSON.stringify([variable.type, variable.initialValue]);
      if (!(variable.name in current) || !variableMatches(variable, current[variable.name]) || defaults[variable.name] !== signature) current[variable.name] = cloneJson(variable.initialValue);
      defaults[variable.name] = signature;
    }
    for (const name of Object.keys(current)) if (!names.has(name)) delete current[name];
    for (const name of Object.keys(defaults)) if (!names.has(name)) delete defaults[name];
  },
  { immediate: true, deep: true }
);

function createBlueprintContext(): BlueprintContext {
  const screenId = doc.currentScreen?.id;
  const screenGraph = currentBlueprint.value;
  const values: Record<string, unknown> = screenId ? (runtimeVariablesByScreen[screenId] ?? (runtimeVariablesByScreen[screenId] = {})) : {};
  for (const variable of screenGraph.variables) {
    if (!(variable.name in values) || !variableMatches(variable, values[variable.name])) values[variable.name] = cloneJson(variable.initialValue);
  }
  return {
    getVariable: (name) => values[name],
    setVariable: (name, value) => {
      const declaration = screenGraph.variables.find((variable) => variable.name === name);
      if (!declaration || !variableMatches(declaration, value)) throw new Error(`变量赋值与声明不匹配：${name}`);
      if (!screenId) throw new Error("当前没有可用屏幕");
      runtimeVariablesByScreen[screenId][name] = cloneJson(value);
    },
    setDatasetFilter: (datasetId, field, value) => {
      const text = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value) ?? "";
      ws.getDatasetRuntime().setFilter(datasetId, [{ field, op: "eq", value: text }]);
    },
    setDatasetParameters: (datasetId, parameters) => ws.getDatasetRuntime().setParameters(datasetId, parameters),
    refreshDataset: (datasetId) => ws.getDatasetRuntime().refresh(datasetId),
    setComponentVisibility: (componentId, componentVersion, visible) => doc.applyBlueprintVisibility(componentId, componentVersion, visible),
    setComponentProps: (componentId, componentVersion, componentProps) => doc.applyBlueprintProps(componentId, componentVersion, componentProps),
    navigateScreen: (screenId) => {
      if (ws.workspace.screens.some((screen) => screen.id === screenId)) {
        doc.currentScreenId = screenId;
        doc.selectedIds = [];
      }
    },
  };
}

async function dispatchComponentEvent(item: ComponentItem, name: string, payload: unknown): Promise<void> {
  const definition = componentRegistry.get(item.componentId, item.componentVersion);
  if (!definition?.events.some((event) => event.name === name)) return;
  const screen = doc.currentScreen;
  if (!screen?.blueprint) return;
  const result = await runBlueprint(screen.blueprint, { componentId: item.componentId, componentVersion: item.componentVersion, event: name, payload }, createBlueprintContext(), componentRegistry);
  blueprintMessage.value = result.ok ? "蓝图运行完成" : `蓝图未执行：${result.errors.join("；")}`;
}
function preserveRuntimeVariableRenames(screenId: string, renamedVariables: Readonly<Record<string, string>>): void {
  const values = runtimeVariablesByScreen[screenId];
  const defaults = runtimeVariableDefaultsByScreen[screenId];
  for (const [oldName, newName] of Object.entries(renamedVariables)) {
    if (values && Object.prototype.hasOwnProperty.call(values, oldName)) {
      values[newName] = values[oldName];
      delete values[oldName];
    }
    if (defaults && Object.prototype.hasOwnProperty.call(defaults, oldName)) {
      defaults[newName] = defaults[oldName];
      delete defaults[oldName];
    }
  }
}

function handleVariableRename(oldName: string, newName: string): void {
  const screenId = doc.currentScreenId;
  if (screenId) preserveRuntimeVariableRenames(screenId, { [oldName]: newName });
}

function saveBlueprint(graph: BlueprintGraph, renamedVariables: Record<string, string> = {}): void {
  const screenId = doc.currentScreenId;
  if (!screenId) return;
  preserveRuntimeVariableRenames(screenId, renamedVariables);
  doc.updateScreenBlueprint(screenId, graph, renamedVariables);
  blueprintOpen.value = false;
  blueprintMessage.value = "蓝图已保存";
}

// ---- 实时数据：编辑期也保持拉取，否则配置完看不到效果 ----
let executor: LiveExecutor | null = null;
let compactQuery: MediaQueryList | null = null;

function collapsePanelsOnCompactViewport(): void {
  if (!compactQuery?.matches) return;
  leftCollapsed.value = true;
  rightCollapsed.value = true;
}

/** 数据源配置指纹：增删图表、改地址/间隔时才重新挂载 */
const liveSignature = computed(() =>
  doc.items
    .filter((i) => i.kind === "chart" && i.spec.source && !i.dataBinding)
    .map((i) => {
      const s = i.kind === "chart" ? i.spec.source : undefined;
      const key = JSON.stringify({
        url: s?.url ?? "",
        path: s?.path ?? "",
        method: s?.method ?? "GET",
        body: s?.body ?? "",
        headers: s?.headers ?? null,
        query: s?.query ?? null,
        timeoutMs: s?.timeoutMs ?? 0,
        intervalSec: s?.intervalSec ?? 0,
        dataPath: s?.dataPath ?? "",
        filter: s?.filter ?? null,
        select: s?.select ?? null,
        sort: s?.sort ?? null,
        limit: s?.limit ?? 0,
        map: s?.map ?? null,
        api: ws.settings.api ?? null,
      });
      return `${i.id}:${key}`;
    })
    .join("|")
);

function syncLive(): void {
  executor?.dispose();
  executor = null;
  const live = doc.items.filter((i) => i.kind === "chart" && i.spec.source && !i.dataBinding);
  if (!live.length) return;
  executor = new LiveExecutor({ resolveApi: () => ws.settings.api });
  for (const item of live) {
    if (item.kind !== "chart" || !item.spec.source || item.dataBinding) continue;
    executor.register(item.id, item.spec.source, (u) => {
      void doc.applyLiveUpdate(u.id, u.data, {
        stale: u.stale,
        error: u.error,
        updatedAt: u.updatedAt,
      });
    });
  }
  void executor.tick();
}

watch(liveSignature, syncLive);
watch(() => doc.currentScreenId, syncLive);

onMounted(() => {
  compactQuery = window.matchMedia("(max-width: 680px)");
  compactQuery.addEventListener("change", collapsePanelsOnCompactViewport);
  collapsePanelsOnCompactViewport();
  ws.load();
  if (ws.workspace.screens.length === 0) {
    doc.addScreen("我的图表");
    doc.initHistory();
    void refreshThumbnailAfterRender();
    return;
  }
  const target = ws.workspace.screens.find((s) => s.id === props.id);
  doc.currentScreenId = target ? target.id : ws.workspace.screens[0].id;
  doc.initHistory();
  syncLive();
  void refreshThumbnailAfterRender();
});

async function refreshThumbnail(): Promise<void> {
  const el = stageWrap.value?.querySelector(".canvas-stage__canvas") as HTMLElement | null;
  const screenId = doc.currentScreenId;
  if (!el || !screenId) return;
  try {
    const dataUrl = await snapshotStage(el);
    doc.setScreenThumbnail(screenId, dataUrl);
  } catch {
    /* 缩略图失败不阻塞 */
  }
}

async function refreshThumbnailAfterRender(): Promise<void> {
  await nextTick();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await refreshThumbnail();
}

onBeforeUnmount(() => {
  compactQuery?.removeEventListener("change", collapsePanelsOnCompactViewport);
  compactQuery = null;
  executor?.dispose();
  executor = null;
  void refreshThumbnail();
});
</script>

<template>
  <div class="workbench">
    <TopBar :screen-id="doc.currentScreenId ?? id" @saved="refreshThumbnail" />
    <div class="workbench__blueprint-bar">
      <button class="cf-button cf-button--plain cf-button--small" type="button" @click="blueprintOpen = true">蓝图交互</button>
      <span v-if="blueprintMessage" role="status">{{ blueprintMessage }}</span>
    </div>
    <div class="workbench__main">
      <aside
        class="workbench__side workbench__side--left"
        :class="{ 'workbench__side--collapsed': leftCollapsed }"
        aria-label="左侧资源面板"
      >
        <button
          v-if="leftCollapsed"
          class="workbench__expand"
          aria-label="展开左侧资源面板"
          title="展开资源面板"
          @click="leftCollapsed = false"
        >
          <Icon name="menu" :size="17" />
        </button>
        <LeftPanel v-else @collapse="leftCollapsed = true" @variable-rename="handleVariableRename" />
      </aside>
      <main ref="stageWrap" class="workbench__stage" aria-label="画布工作区">
        <CanvasStage :variables="currentRuntimeVariables" :on-component-event="dispatchComponentEvent" />
      </main>
      <aside
        class="workbench__side workbench__side--right"
        :class="{ 'workbench__side--collapsed': rightCollapsed }"
        aria-label="右侧属性面板"
      >
        <button
          v-if="rightCollapsed"
          class="workbench__expand"
          aria-label="展开右侧属性面板"
          title="展开属性面板"
          @click="rightCollapsed = false"
        >
          <Icon name="settings" :size="17" />
        </button>
        <InspectorPanel v-else @collapse="rightCollapsed = true" />
      </aside>
    </div>
    <BlueprintEditor
      v-if="blueprintOpen && doc.currentScreen"
      :model-value="currentBlueprint"
      :datasets="ws.workspace.datasets"
      :bound-variable-names="boundVariableNames"
      @save="saveBlueprint"
      @close="blueprintOpen = false"
    />
    <ShortcutsHelp />
  </div>
</template>

<style scoped>
.workbench {
  --cf-bg: #151b26;
  --cf-panel: #1c2532;
  --cf-border: #303c4e;
  --cf-text: #e7edf5;
  --cf-text-2: #a8b5c6;
  --cf-primary: #49b9f2;
  --cf-canvas-bg: #111720;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--cf-bg);
  color: var(--cf-text);
}
.workbench__blueprint-bar {
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-bottom: 1px solid var(--cf-border);
  background: var(--cf-panel);
}
.workbench__blueprint-bar span { color: var(--cf-text-2); font-size: 11px; }
.workbench__main {
  flex: 1;
  display: flex;
  min-height: 0;
  min-width: 0;
}
.workbench__side {
  position: relative;
  flex: 0 0 auto;
  background: var(--cf-panel);
  overflow: hidden;
  transition: width 160ms ease;
}
.workbench__side--left {
  width: 292px;
  border-right: 1px solid var(--cf-border);
}
.workbench__side--right {
  width: 320px;
  border-left: 1px solid var(--cf-border);
}
.workbench__side--collapsed {
  width: 48px;
}
.workbench__expand {
  display: flex;
  width: 100%;
  height: 44px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-bottom: 1px solid var(--cf-border);
  background: transparent;
  color: var(--cf-text-2);
  cursor: pointer;
}
.workbench__expand:hover {
  color: var(--cf-primary);
  background: color-mix(in srgb, var(--cf-primary) 8%, transparent);
}
.workbench__stage {
  flex: 1;
  display: flex;
  min-width: 0;
  min-height: 0;
}
@media (max-width: 900px) {
  .workbench__side--left:not(.workbench__side--collapsed) { width: 244px; }
  .workbench__side--right:not(.workbench__side--collapsed) { width: 276px; }
}
@media (max-width: 680px) {
  .workbench__main { position: relative; }
  .workbench__side--left:not(.workbench__side--collapsed) {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 5;
    width: min(292px, 82vw);
    box-shadow: 12px 0 28px rgba(0, 0, 0, 0.28);
  }
  .workbench__side--right:not(.workbench__side--collapsed) {
    position: absolute;
    inset: 0 0 0 auto;
    z-index: 5;
    width: min(320px, 86vw);
    box-shadow: -12px 0 28px rgba(0, 0, 0, 0.28);
  }
  .workbench__side--collapsed { width: 40px; }
  .workbench__stage { width: 100%; }
}
</style>
