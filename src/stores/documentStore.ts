import { defineStore } from "pinia";
import { markRaw } from "vue";
import { History, HISTORY_LIMIT } from "@/core/history/history";
import { DEFAULT_FRAME, createComponentItem, createItem, createScreen, normalizeComponentProps } from "@/core/model/schema";
import { componentRegistry } from "@/core/components/builtins";
import { deepMerge } from "@/core/chart/optionBuilder";
import { chartRegistry } from "@/core/chart/registry";
import { rotateFrame } from "@/core/geometry/transform";
import { buildChartData } from "@/core/live/pipeline";
import { MIN_INTERVAL_SEC } from "@/core/live/liveExecutor";
import type {
  ChartAsset,
  ChartData,
  ChartItem,
  ChartType,
  DatasetBinding,
  Frame,
  LiveSource,
  Screen,
  ScreenItem,
  ShapeItem,
  Workspace,
} from "@/core/model/types";
import type { BlueprintGraph } from "@/core/blueprint/types";
import { isValidBlueprintVariableName, renameBlueprintVariable } from "@/core/blueprint/variables";
import { setPath } from "@/core/model/path";
import { placeholdersToClear, PLACEHOLDER_PREFIX } from "@/core/model/templates";
import { exportJson } from "@/core/storage/workspaceRepo";
import { useWorkspaceStore } from "./workspaceStore";
import { BUILT_IN_BLOCKS, applyThemeToScreen, getThemeById, instantiateComponentBlock } from "@/core/design/library";
import { createLayoutAssetItems, createLayoutBackgroundItems } from "@/core/design/layoutBackgrounds";

// Pinia 响应式 Proxy 无法被 structuredClone 克隆，统一走 JSON 深克隆（数据均为纯 JSON）
const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export type AlignMode =
  | "left"
  | "centerX"
  | "right"
  | "top"
  | "centerY"
  | "bottom"
  | "distributeH"
  | "distributeV";

export interface LiveStatus {
  stale: boolean;
  error?: string;
  updatedAt: number;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 重名时追加「副本N」序号：X → X 副本2 → X 副本3 */
function renameWithSuffix(base: string, existing: string[]): string {
  const name = base.trim() || "图表";
  const taken = new Set(existing);
  if (!taken.has(name)) return name;
  let index = 2;
  while (taken.has(`${name} 副本${index}`)) index += 1;
  return `${name} 副本${index}`;
}

function clampFrameToCanvas(frame: Frame, width: number, height: number): Frame {
  const canvasWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const canvasHeight = Math.max(1, Number.isFinite(height) ? height : 1);
  const w = clamp(Number.isFinite(frame.w) ? frame.w : 1, 1, canvasWidth);
  const h = clamp(Number.isFinite(frame.h) ? frame.h : 1, 1, canvasHeight);
  const x = clamp(Number.isFinite(frame.x) ? frame.x : 0, 0, canvasWidth - w);
  const y = clamp(Number.isFinite(frame.y) ? frame.y : 0, 0, canvasHeight - h);
  return { ...frame, x, y, w, h };
}

function clampDelta(value: number, min: number, max: number): number {
  if (max < min) return min;
  return clamp(value, min, max);
}

function restoreWorkspace(target: Workspace, source: Workspace): void {
  target.settings = { ...source.settings };
  target.assets = source.assets.map((a) => ({ ...a, spec: deepClone(a.spec) }));
  const result: Screen[] = [];
  for (const src of source.screens) {
    const existing = target.screens.find((s) => s.id === src.id);
    if (existing) {
      existing.name = src.name;
      existing.canvas = src.canvas;
      existing.updatedAt = src.updatedAt;
      if (src.thumbnail !== undefined) {
        existing.thumbnail = src.thumbnail;
      } else {
        delete existing.thumbnail;
      }
      existing.items = src.items;
      existing.blueprint = src.blueprint;
      if (src.themeId !== undefined) existing.themeId = src.themeId;
      else delete existing.themeId;
      result.push(existing);
    } else {
      result.push(src);
    }
  }
  target.screens = result;
}

export const useDocumentStore = defineStore("document", {
  state: () => ({
    currentScreenId: null as string | null,
    selectedIds: [] as string[],
    clipboard: [] as ScreenItem[],
    liveStatus: {} as Record<string, LiveStatus>,
    history: markRaw(new History<Workspace>({ limit: HISTORY_LIMIT, clone: (v) => deepClone(v) })),
  }),
  getters: {
    currentScreen(state): Screen | null {
      const ws = useWorkspaceStore();
      return ws.workspace.screens.find((s) => s.id === state.currentScreenId) ?? null;
    },
    items(): ScreenItem[] {
      return this.currentScreen?.items ?? [];
    },
  },
  actions: {
    initHistory() {
      this.history.push(useWorkspaceStore().workspace);
    },
    saveSnapshot() {
      this.history.push(useWorkspaceStore().workspace);
    },
    commit() {
      this.saveSnapshot();
      useWorkspaceStore().scheduleSave();
    },
    addScreen(name?: string, canvas?: { width: number; height: number }) {
      const ws = useWorkspaceStore();
      const screen = createScreen(name ?? `大屏${ws.workspace.screens.length + 1}`, canvas);
      ws.workspace.screens.push(screen);
      this.currentScreenId = screen.id;
      this.selectedIds = [];
      this.commit();
      return screen;
    },
    updateScreenMeta(id: string, meta: { name?: string; category?: string; tags?: string[] }) {
      const ws = useWorkspaceStore();
      const screen = ws.workspace.screens.find((s) => s.id === id);
      if (!screen) return;
      if (meta.name !== undefined) screen.name = meta.name || screen.name;
      if (meta.category !== undefined) screen.category = meta.category;
      if (meta.tags !== undefined) screen.tags = meta.tags;
      this.commit();
    },
    addChart(type: ChartType): string {
      const screen = this.currentScreen;
      if (!screen) return "";
      const item = createItem("chart", {}, chartRegistry[type].defaultSpec()) as ChartItem;
      const offset = (screen.items.length % 8) * 20;
      item.frame.x = Math.round((screen.canvas.width - item.frame.w) / 2) + offset;
      item.frame.y = Math.round((screen.canvas.height - item.frame.h) / 2) + offset;
      this.addItem(item);
      return item.id;
    },
    addComponent(componentId: string, componentVersion = 1, position?: { x: number; y: number }): string {
      const screen = this.currentScreen;
      const definition = componentRegistry.get(componentId, componentVersion);
      if (!screen || !definition || definition.renderer.kind !== "vue") return "";
      const item = createComponentItem(definition);
      const offset = (screen.items.length % 8) * 18;
      item.frame.x = position ? Math.round(position.x - item.frame.w / 2) : Math.round((screen.canvas.width - item.frame.w) / 2) + offset;
      item.frame.y = position ? Math.round(position.y - item.frame.h / 2) : Math.round((screen.canvas.height - item.frame.h) / 2) + offset;
      this.addItem(item);
      return item.id;
    },
    applyTheme(themeId: string): void {
      const screen = this.currentScreen;
      const theme = getThemeById(themeId);
      if (!screen || !theme) return;
      applyThemeToScreen(screen, theme);
      this.commit();
    },
    insertBlock(blockId: string, position?: { x: number; y: number }): string[] {
      const screen = this.currentScreen;
      const block = BUILT_IN_BLOCKS.find((entry) => entry.id === blockId);
      if (!screen || !block) return [];
      const xs = block.items.map((item) => item.frame.x);
      const ys = block.items.map((item) => item.frame.y);
      const maxX = Math.max(...block.items.map((item) => item.frame.x + item.frame.w));
      const maxY = Math.max(...block.items.map((item) => item.frame.y + item.frame.h));
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const stagger = (screen.items.length % 7) * 24;
      const targetX = position?.x ?? screen.canvas.width / 2 + stagger;
      const targetY = position?.y ?? screen.canvas.height / 2 + stagger;
      const items = instantiateComponentBlock(block, { x: targetX - centerX, y: targetY - centerY }, () => newId());
      for (const item of items) {
        Object.assign(item.frame, clampFrameToCanvas(item.frame, screen.canvas.width, screen.canvas.height));
        screen.items.push(item);
      }
      this.selectedIds = items.map((item) => item.id);
      this.commit();
      return this.selectedIds;
    },
    addDesignAssetImage(assetId: string, position?: { x: number; y: number }): string {
      const screen = this.currentScreen;
      const asset = useWorkspaceStore().designAssets.find((entry) => entry.id === assetId);
      if (!screen || !asset) return "";
      const item = createItem("image", {
        x: position ? position.x - 200 : (screen.canvas.width - 400) / 2,
        y: position ? position.y - 150 : (screen.canvas.height - 300) / 2,
        w: 400, h: 300,
      });
      if (item.kind !== "image") return "";
      item.name = asset.name;
      item.src = asset.dataUrl;
      item.sourceDesignAssetId = asset.id;
      this.addItem(item);
      return item.id;
    },
    insertLayoutBackground(id: string): string[] {
      const screen = this.currentScreen;
      if (!screen) return [];
      const items = createLayoutBackgroundItems(id, screen.canvas);
      if (!items.length || items.some((item) =>
        ![item.frame.x, item.frame.y, item.frame.w, item.frame.h, item.frame.rotate].every(Number.isFinite) ||
        item.frame.w <= 0 || item.frame.h <= 0
      )) return [];

      const groupId = newId();
      const usedIds = new Set(screen.items.map((item) => item.id));
      for (const item of items) {
        let itemId = newId();
        while (usedIds.has(itemId)) itemId = newId();
        usedIds.add(itemId);
        item.id = itemId;
        item.groupId = groupId;
        Object.assign(item.frame, clampFrameToCanvas(item.frame, screen.canvas.width, screen.canvas.height));
      }
      if (items.some((item) =>
        ![item.frame.x, item.frame.y, item.frame.w, item.frame.h, item.frame.rotate].every(Number.isFinite) ||
        item.frame.w <= 0 || item.frame.h <= 0
      )) return [];

      screen.items.unshift(...items);
      this.selectedIds = items.map((item) => item.id);
      this.commit();
      return this.selectedIds;
    },
    insertLayoutAsset(id: string, position?: { x: number; y: number }): string[] {
      const screen = this.currentScreen;
      if (!screen) return [];
      const items = createLayoutAssetItems(id, screen.canvas, position);
      if (!items.length || items.some((item) =>
        ![item.frame.x, item.frame.y, item.frame.w, item.frame.h, item.frame.rotate].every(Number.isFinite) ||
        item.frame.w <= 0 || item.frame.h <= 0
      )) return [];

      const usedIds = new Set(screen.items.map((item) => item.id));
      for (const item of items) {
        let itemId = newId();
        while (usedIds.has(itemId)) itemId = newId();
        usedIds.add(itemId);
        item.id = itemId;
        Object.assign(item.frame, clampFrameToCanvas(item.frame, screen.canvas.width, screen.canvas.height));
      }
      if (items.some((item) =>
        ![item.frame.x, item.frame.y, item.frame.w, item.frame.h, item.frame.rotate].every(Number.isFinite) ||
        item.frame.w <= 0 || item.frame.h <= 0
      )) return [];

      screen.items.unshift(...items);
      this.selectedIds = items.map((item) => item.id);
      this.commit();
      return this.selectedIds;
    },
    /** 图表落位时清掉被压住的模板占位框 */
    clearPlaceholdersUnder(item: ScreenItem): void {
      const screen = this.currentScreen;
      if (!screen || (item.kind !== "chart" && item.kind !== "component")) return;
      const hit = placeholdersToClear(screen.items, item.frame);
      if (!hit.length) return;
      const ids = new Set(hit.map((h) => h.id));
      screen.items = screen.items.filter((i) => !ids.has(i.id));
    },
    changeChartType(id: string, type: ChartType): void {
      const item = this.items.find((i) => i.id === id);
      if (!item || item.kind !== "chart") return;
      item.spec = chartRegistry[type].defaultSpec();
      this.commit();
    },
    /** 按模板槽位铺一批占位框（拖入图表后会自动清掉） */
    applyTemplate(slots: Array<{ x: number; y: number; w: number; h: number }>) {
      const screen = this.currentScreen;
      if (!screen) return;
      slots.forEach((slot, i) => {
        const holder = createItem("shape", { ...slot }) as ShapeItem;
        holder.name = `${PLACEHOLDER_PREFIX} ${i + 1}`;
        holder.shape = "rect";
        holder.fill = "rgba(127, 140, 255, 0.06)";
        holder.stroke = "rgba(127, 140, 255, 0.45)";
        holder.strokeWidth = 1;
        holder.radius = 8;
        screen.items.push(holder);
      });
      this.commit();
    },
    addItem(item: ScreenItem) {
      const screen = this.currentScreen;
      if (!screen) return;
      Object.assign(item.frame, clampFrameToCanvas(item.frame, screen.canvas.width, screen.canvas.height));
      // 图表落到模板占位框上时，顺手把占位框清掉
      this.clearPlaceholdersUnder(item);
      screen.items.push(item);
      this.selectedIds = [item.id];
      this.commit();
    },
    removeScreen(id: string) {
      const ws = useWorkspaceStore();
      const idx = ws.workspace.screens.findIndex((s) => s.id === id);
      if (idx === -1) return;
      ws.workspace.screens.splice(idx, 1);
      if (this.currentScreenId === id) {
        this.currentScreenId = ws.workspace.screens[0]?.id ?? null;
      }
      this.commit();
    },
    updateItemFrame(id: string, frame: Partial<Frame>, opts?: { commit?: boolean }) {
      const screen = this.currentScreen;
      const item = screen?.items.find((i) => i.id === id);
      if (!item || !screen) return;
      Object.assign(
        item.frame,
        clampFrameToCanvas({ ...item.frame, ...frame }, screen.canvas.width, screen.canvas.height)
      );
      if (opts?.commit !== false) this.commit();
    },
    moveBy(ids: string[], dx: number, dy: number, opts?: { commit?: boolean }) {
      const screen = this.currentScreen;
      if (!screen) return;
      const moving = screen.items.filter((item) => ids.includes(item.id) && !item.locked);
      if (moving.length === 0) return;
      const minX = Math.min(...moving.map((item) => item.frame.x));
      const minY = Math.min(...moving.map((item) => item.frame.y));
      const maxX = Math.max(...moving.map((item) => item.frame.x + item.frame.w));
      const maxY = Math.max(...moving.map((item) => item.frame.y + item.frame.h));
      const boundedDx = clampDelta(dx, -minX, screen.canvas.width - maxX);
      const boundedDy = clampDelta(dy, -minY, screen.canvas.height - maxY);
      for (const item of moving) {
        item.frame.x += boundedDx;
        item.frame.y += boundedDy;
      }
      if (opts?.commit !== false) this.commit();
    },
    rotateFrameTo(id: string, angle: number, opts?: { snap?: boolean; commit?: boolean }) {
      const item = this.items.find((i) => i.id === id);
      if (!item || item.locked) return;
      const f = item.frame;
      const c = { x: f.x + f.w / 2, y: f.y + f.h / 2 };
      item.frame = rotateFrame(f, c, angle, { snap: opts?.snap });
      if (opts?.commit !== false) this.commit();
    },
    removeItems(ids: string[]) {
      const screen = this.currentScreen;
      if (!screen) return;
      const set = new Set(ids);
      screen.items.splice(
        0,
        screen.items.length,
        ...screen.items.filter((i) => !set.has(i.id) || i.locked)
      );
      this.selectedIds = [];
      this.commit();
    },
    updateItemProps(id: string, props: Record<string, unknown>) {
      const item = this.items.find((i) => i.id === id) as Record<string, unknown> | undefined;
      if (!item) return;
      for (const [k, v] of Object.entries(props)) {
        if (k === "id" || k === "kind" || k === "frame" || k === "spec") continue;
        item[k] = v;
      }
      this.commit();
    },
    updateComponentProps(id: string, props: Record<string, unknown>): void {
      const item = this.items.find((entry) => entry.id === id);
      if (!item || item.kind !== "component") return;
      const definition = componentRegistry.get(item.componentId, item.componentVersion);
      if (!definition) return;
      item.props = normalizeComponentProps(definition, props);
      this.commit();
    },
    updateScreenBlueprint(id: string, blueprint: BlueprintGraph, renamedVariables: Readonly<Record<string, string>> = {}): void {
      const screen = useWorkspaceStore().workspace.screens.find((entry) => entry.id === id);
      if (!screen) return;
      for (const item of screen.items) {
        if (!("dataBinding" in item)) continue;
        const filter = item.dataBinding?.filterBy;
        if (filter && renamedVariables[filter.globalVariable]) filter.globalVariable = renamedVariables[filter.globalVariable];
      }
      screen.blueprint = deepClone(blueprint);
      this.commit();
    },
    renameScreenBlueprintVariable(id: string, oldName: string, newName: string): boolean {
      const screen = useWorkspaceStore().workspace.screens.find((entry) => entry.id === id);
      const blueprint = screen?.blueprint;
      if (!screen || !blueprint || !blueprint.variables.some((variable) => variable.name === oldName)) return false;
      if (!isValidBlueprintVariableName(newName) || blueprint.variables.some((variable) => variable.name === newName && variable.name !== oldName)) return false;
      if (oldName === newName) return true;
      this.updateScreenBlueprint(id, renameBlueprintVariable(blueprint, oldName, newName), { [oldName]: newName });
      return true;
    },
    applyBlueprintVisibility(componentId: string, componentVersion: number, visible: boolean): void {
      const targets = this.items.filter((entry) => entry.kind === "component" && entry.componentId === componentId && entry.componentVersion === componentVersion);
      if (!targets.length) return;
      targets.forEach((entry) => { entry.hidden = !visible; });
      this.commit();
    },
    applyBlueprintProps(componentId: string, componentVersion: number, props: Record<string, unknown>): void {
      const targets = this.items.filter((entry) => entry.kind === "component" && entry.componentId === componentId && entry.componentVersion === componentVersion);
      if (!targets.length) return;
      for (const entry of targets) {
        if (entry.kind !== "component") continue;
        const definition = componentRegistry.get(entry.componentId, entry.componentVersion);
        if (!definition) continue;
        entry.props = normalizeComponentProps(definition, { ...entry.props, ...props });
      }
      this.commit();
    },
    updateItemDataBinding(id: string, binding: DatasetBinding | undefined): void {
      const item = this.items.find((entry) => entry.id === id);
      if (!item || (item.kind !== "chart" && item.kind !== "component")) return;
      if (binding?.datasetId) item.dataBinding = deepClone(binding);
      else delete item.dataBinding;
      this.commit();
    },
    applyOptionPatch(id: string, patch: Record<string, unknown>) {
      const item = this.items.find((i) => i.id === id);
      if (!item || item.kind !== "chart") return;
      item.spec.option = deepMerge(item.spec.option as Record<string, unknown>, patch);
      this.commit();
    },
    applyChartConfig(id: string, path: string, value: unknown) {
      const item = this.items.find((i) => i.id === id);
      if (!item || item.kind !== "chart") return;
      setPath(item.spec.option as Record<string, unknown>, path.split("."), value);
      this.commit();
    },
    updateChartData(id: string, data: ChartData) {
      const item = this.items.find((i) => i.id === id);
      if (!item || item.kind !== "chart") return;
      item.spec.data = deepClone(data);
      this.commit();
    },
    setLiveSource(id: string, source: LiveSource | null) {
      const item = this.items.find((i) => i.id === id);
      if (!item || item.kind !== "chart") return;
      if (source === null) {
        delete item.spec.source;
      } else {
        item.spec.source = {
          ...source,
          intervalSec: Math.max(MIN_INTERVAL_SEC, source.intervalSec),
        };
      }
      this.commit();
    },
    applyLiveUpdate(id: string, raw: unknown, status: LiveStatus): boolean {
      const item = this.items.find((i) => i.id === id);
      if (!item || item.kind !== "chart") return false;
      if (status.stale) {
        this.liveStatus[id] = { ...status };
        return false;
      }
      // 原始载荷 → 行过滤/选列/排序/取前 N/字段映射 → ChartData
      const result = buildChartData(raw, item.spec.source, item.spec.type);
      if (!result.ok) {
        // 给用户看人话，原始载荷留给控制台排查
        console.warn("[live] 载荷无法映射:", result.message, raw);
        this.liveStatus[id] = { ...status, stale: true, error: result.message };
        return false;
      }
      item.spec.data = deepClone(result.data);
      this.liveStatus[id] = { ...status };
      return true;
    },
    addGroup() {
      const items = this.items.filter((i) => this.selectedIds.includes(i.id));
      if (items.length < 2) return;
      const gid = newId();
      for (const it of items) it.groupId = gid;
      this.commit();
    },
    ungroup() {
      const items = this.items.filter((i) => this.selectedIds.includes(i.id));
      if (items.length === 0) return;
      for (const it of items) delete it.groupId;
      this.commit();
    },
    alignDistribute(mode: AlignMode) {
      const items = this.items.filter((i) => this.selectedIds.includes(i.id) && !i.locked);
      if (items.length < 2) return;
      const minX = Math.min(...items.map((i) => i.frame.x));
      const maxX = Math.max(...items.map((i) => i.frame.x + i.frame.w));
      const minY = Math.min(...items.map((i) => i.frame.y));
      const maxY = Math.max(...items.map((i) => i.frame.y + i.frame.h));
      switch (mode) {
        case "left":
          for (const it of items) it.frame.x = minX;
          break;
        case "centerX":
          for (const it of items) it.frame.x = minX + (maxX - minX - it.frame.w) / 2;
          break;
        case "right":
          for (const it of items) it.frame.x = maxX - it.frame.w;
          break;
        case "top":
          for (const it of items) it.frame.y = minY;
          break;
        case "centerY":
          for (const it of items) it.frame.y = minY + (maxY - minY - it.frame.h) / 2;
          break;
        case "bottom":
          for (const it of items) it.frame.y = maxY - it.frame.h;
          break;
        case "distributeH": {
          const sorted = [...items].sort((a, b) => a.frame.x - b.frame.x);
          const total = sorted.reduce((sum, it) => sum + it.frame.w, 0);
          const gap = (maxX - minX - total) / (sorted.length - 1);
          let x = minX;
          for (const it of sorted) {
            it.frame.x = x;
            x += it.frame.w + gap;
          }
          break;
        }
        case "distributeV": {
          const sorted = [...items].sort((a, b) => a.frame.y - b.frame.y);
          const total = sorted.reduce((sum, it) => sum + it.frame.h, 0);
          const gap = (maxY - minY - total) / (sorted.length - 1);
          let y = minY;
          for (const it of sorted) {
            it.frame.y = y;
            y += it.frame.h + gap;
          }
          break;
        }
      }
      this.commit();
    },
    copy() {
      const items = this.items.filter((i) => this.selectedIds.includes(i.id));
      this.clipboard = deepClone(items);
    },
    paste() {
      if (this.clipboard.length === 0) return;
      const screen = this.currentScreen;
      if (!screen) return;
      const clones = deepClone(this.clipboard).map((it) => ({
        ...it,
        id: newId(),
        frame: clampFrameToCanvas(
          { ...it.frame, x: it.frame.x + 10, y: it.frame.y + 10 },
          screen.canvas.width,
          screen.canvas.height
        ),
      }));
      if (clones.length === 0) return;
      screen.items.push(...clones);
      this.selectedIds = clones.map((it) => it.id);
      this.commit();
    },
    duplicate() {
      const items = this.items.filter((i) => this.selectedIds.includes(i.id));
      if (items.length === 0) return;
      const screen = this.currentScreen;
      if (!screen) return;
      const clones = deepClone(items).map((it) => ({
        ...it,
        id: newId(),
        frame: clampFrameToCanvas(it.frame, screen.canvas.width, screen.canvas.height),
      }));
      screen.items.push(...clones);
      this.selectedIds = clones.map((it) => it.id);
      this.commit();
    },
    bringToFront(id: string) {
      const screen = this.currentScreen;
      if (!screen) return;
      const idx = screen.items.findIndex((i) => i.id === id);
      if (idx === -1 || idx === screen.items.length - 1) return;
      const [it] = screen.items.splice(idx, 1);
      screen.items.push(it);
      this.commit();
    },
    sendToBack(id: string) {
      const screen = this.currentScreen;
      if (!screen) return;
      const idx = screen.items.findIndex((i) => i.id === id);
      if (idx <= 0) return;
      const [it] = screen.items.splice(idx, 1);
      screen.items.unshift(it);
      this.commit();
    },
    reorderItem(id: string, toIndex: number) {
      const screen = this.currentScreen;
      if (!screen) return;
      const idx = screen.items.findIndex((i) => i.id === id);
      if (idx === -1) return;
      const clamped = Math.max(0, Math.min(screen.items.length - 1, toIndex));
      const [it] = screen.items.splice(idx, 1);
      screen.items.splice(clamped, 0, it);
      this.commit();
    },
    bringForward(id: string) {
      const screen = this.currentScreen;
      if (!screen) return;
      const idx = screen.items.findIndex((i) => i.id === id);
      if (idx === -1 || idx === screen.items.length - 1) return;
      const [it] = screen.items.splice(idx, 1);
      screen.items.splice(idx + 1, 0, it);
      this.commit();
    },
    sendBackward(id: string) {
      const screen = this.currentScreen;
      if (!screen) return;
      const idx = screen.items.findIndex((i) => i.id === id);
      if (idx <= 0) return;
      const [it] = screen.items.splice(idx, 1);
      screen.items.splice(idx - 1, 0, it);
      this.commit();
    },
    saveAsAsset(id: string) {
      this.saveChartAsAsset(id, {});
    },
    /** 把大屏里的图表项保存为图表资产（深拷贝副本，返回资产 id） */
    saveChartAsAsset(
      itemId: string,
      meta: { name?: string; category?: string; tags?: string[]; thumbnail?: string }
    ): string | null {
      const item = this.items.find((i) => i.id === itemId);
      if (!item || item.kind !== "chart") return null;
      const ws = useWorkspaceStore();
      const now = Date.now();
      const asset: ChartAsset = {
        id: newId(),
        name: meta.name?.trim() || item.name || "未命名图表",
        thumbnail: meta.thumbnail ?? "",
        spec: deepClone(item.spec),
        ...(meta.category !== undefined ? { category: meta.category } : {}),
        ...(meta.tags !== undefined ? { tags: [...meta.tags] } : {}),
        defaultSize: { w: item.frame.w, h: item.frame.h },
        createdAt: now,
        updatedAt: now,
      };
      ws.workspace.assets.push(asset);
      this.commit();
      return asset.id;
    },
    /** 把图表资产放置到大屏中，生成独立副本（新 id + 深拷贝 spec） */
    placeAsset(assetId: string, frame?: Partial<Frame>): string {
      const ws = useWorkspaceStore();
      const asset = ws.workspace.assets.find((a) => a.id === assetId);
      const screen = this.currentScreen;
      if (!asset || !screen) return "";
      const size = frame?.w !== undefined && frame?.h !== undefined
        ? { w: frame.w, h: frame.h }
        : asset.defaultSize ?? { w: DEFAULT_FRAME.w, h: DEFAULT_FRAME.h };
      const item = createItem("chart", { ...size, ...frame }, deepClone(asset.spec)) as ChartItem;
      item.name = renameWithSuffix(asset.name, screen.items.map((i) => i.name));
      item.sourceAssetId = asset.id;
      if (frame?.x === undefined) {
        item.frame.x = Math.round((screen.canvas.width - item.frame.w) / 2);
      }
      if (frame?.y === undefined) {
        item.frame.y = Math.round((screen.canvas.height - item.frame.h) / 2);
      }
      this.addItem(item);
      return item.id;
    },
    upsertAsset(asset: ChartAsset) {
      const ws = useWorkspaceStore();
      const idx = ws.workspace.assets.findIndex((a) => a.id === asset.id);
      if (idx === -1) ws.workspace.assets.push(asset);
      else ws.workspace.assets[idx] = asset;
      this.commit();
    },
    setCanvas(patch: Partial<Workspace["screens"][number]["canvas"]>) {
      const screen = this.currentScreen;
      if (!screen) return;
      if (patch.width !== undefined) screen.canvas.width = patch.width;
      if (patch.height !== undefined) screen.canvas.height = patch.height;
      if (patch.background !== undefined) screen.canvas.background = patch.background;
      this.commit();
    },
    fitItemsToCanvas(width: number, height: number) {
      const screen = this.currentScreen;
      if (!screen) return;
      const targetWidth = clamp(Math.round(width), 320, 7680);
      const targetHeight = clamp(Math.round(height), 320, 7680);
      if (screen.items.length > 0) {
        const minX = Math.min(...screen.items.map((item) => item.frame.x));
        const minY = Math.min(...screen.items.map((item) => item.frame.y));
        const maxX = Math.max(...screen.items.map((item) => item.frame.x + item.frame.w));
        const maxY = Math.max(...screen.items.map((item) => item.frame.y + item.frame.h));
        const boundsWidth = Math.max(1, maxX - minX);
        const boundsHeight = Math.max(1, maxY - minY);
        const scale = Math.min(1, targetWidth / boundsWidth, targetHeight / boundsHeight);
        const offsetX = (targetWidth - boundsWidth * scale) / 2;
        const offsetY = (targetHeight - boundsHeight * scale) / 2;
        for (const item of screen.items) {
          Object.assign(
            item.frame,
            clampFrameToCanvas(
              {
                ...item.frame,
                x: offsetX + (item.frame.x - minX) * scale,
                y: offsetY + (item.frame.y - minY) * scale,
                w: item.frame.w * scale,
                h: item.frame.h * scale,
              },
              targetWidth,
              targetHeight
            )
          );
        }
      }
      screen.canvas.width = targetWidth;
      screen.canvas.height = targetHeight;
      this.commit();
    },
    setScreenName(name: string) {
      const screen = this.currentScreen;
      if (!screen) return;
      screen.name = name || screen.name;
      this.commit();
    },
    exportAsset(id: string): string | null {
      const ws = useWorkspaceStore();
      const asset = ws.workspace.assets.find((a) => a.id === id);
      return asset ? exportJson(asset) : null;
    },
    setScreenThumbnail(screenId: string, dataUrl: string) {
      const ws = useWorkspaceStore();
      const screen = ws.workspace.screens.find((s) => s.id === screenId);
      if (!screen) return;
      screen.thumbnail = dataUrl;
      ws.save();
    },
    removeAsset(id: string) {
      const ws = useWorkspaceStore();
      const idx = ws.workspace.assets.findIndex((a) => a.id === id);
      if (idx === -1) return;
      ws.workspace.assets.splice(idx, 1);
      this.commit();
    },
    undo() {
      const prev = this.history.undo();
      if (prev === null) return;
      restoreWorkspace(useWorkspaceStore().workspace, prev);
      useWorkspaceStore().scheduleSave();
    },
    redo() {
      const next = this.history.redo();
      if (next === null) return;
      restoreWorkspace(useWorkspaceStore().workspace, next);
      useWorkspaceStore().scheduleSave();
    },
  },
});
