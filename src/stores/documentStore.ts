import { defineStore } from "pinia";
import { markRaw } from "vue";
import { History, HISTORY_LIMIT } from "@/core/history/history";
import { createItem, createScreen } from "@/core/model/schema";
import { deepMerge } from "@/core/chart/optionBuilder";
import { chartRegistry } from "@/core/chart/registry";
import { rotateFrame } from "@/core/geometry/transform";
import { matrixToChartData, validateChartData } from "@/core/chart/chartData";
import { MIN_INTERVAL_SEC } from "@/core/live/liveExecutor";
import type {
  ChartAsset,
  ChartData,
  ChartItem,
  ChartType,
  Frame,
  LiveSource,
  Screen,
  ScreenItem,
  Workspace,
} from "@/core/model/types";
import { exportJson } from "@/core/storage/workspaceRepo";
import { useWorkspaceStore } from "./workspaceStore";

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

function setPath(obj: Record<string, unknown>, keys: string[], value: unknown): void {
  let node: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const cur = node[k];
    if (cur === null || cur === undefined || typeof cur !== "object") {
      node[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    }
    node = node[k] as Record<string, unknown>;
  }
  node[keys[keys.length - 1]] = value;
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
      result.push(existing);
    } else {
      result.push(src);
    }
  }
  target.screens = result;
}

function isChartDataLike(raw: unknown): raw is ChartData {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "kind" in raw &&
    ["category", "nameValue", "xy", "radar"].includes(
      (raw as { kind: unknown }).kind as string
    )
  );
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
    changeChartType(id: string, type: ChartType): void {
      const item = this.items.find((i) => i.id === id);
      if (!item || item.kind !== "chart") return;
      item.spec = chartRegistry[type].defaultSpec();
      this.commit();
    },
    addItem(item: ScreenItem) {
      const screen = this.currentScreen;
      if (!screen) return;
      Object.assign(item.frame, clampFrameToCanvas(item.frame, screen.canvas.width, screen.canvas.height));
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
      try {
        let data: ChartData;
        if (Array.isArray(raw)) {
          data = matrixToChartData(raw as string[][], item.spec.type);
        } else if (isChartDataLike(raw)) {
          data = raw;
        } else {
          throw new Error("无法识别的数据格式");
        }
        if (!validateChartData(data)) {
          throw new Error("数据形状不合法");
        }
        item.spec.data = deepClone(data);
        this.liveStatus[id] = { ...status };
        return true;
      } catch (e) {
        this.liveStatus[id] = {
          ...status,
          stale: true,
          error: e instanceof Error ? e.message : String(e),
        };
        return false;
      }
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
      const item = this.items.find((i) => i.id === id);
      if (!item || item.kind !== "chart") return;
      const ws = useWorkspaceStore();
      const now = Date.now();
      ws.workspace.assets.push({
        id: newId(),
        name: item.name || "未命名图表",
        thumbnail: "",
        spec: deepClone(item.spec),
        createdAt: now,
        updatedAt: now,
      });
      this.commit();
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
