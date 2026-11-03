import { defineStore } from "pinia";
import { markRaw } from "vue";
import { History, HISTORY_LIMIT } from "@/core/history/history";
import { createScreen } from "@/core/model/schema";
import { deepMerge } from "@/core/chart/optionBuilder";
import { matrixToChartData, validateChartData } from "@/core/chart/chartData";
import { MIN_INTERVAL_SEC } from "@/core/live/liveExecutor";
import type {
  ChartData,
  Frame,
  LiveSource,
  Screen,
  ScreenItem,
  Workspace,
} from "@/core/model/types";
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
    addScreen(name?: string) {
      const ws = useWorkspaceStore();
      const screen = createScreen(name ?? `大屏${ws.workspace.screens.length + 1}`);
      ws.workspace.screens.push(screen);
      this.currentScreenId = screen.id;
      this.selectedIds = [];
      this.commit();
      return screen;
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
    updateItemFrame(id: string, frame: Partial<Frame>) {
      const item = this.items.find((i) => i.id === id);
      if (!item) return;
      Object.assign(item.frame, frame);
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
      const clones = deepClone(this.clipboard).map((it) => ({
        ...it,
        id: newId(),
        frame: { ...it.frame, x: it.frame.x + 10, y: it.frame.y + 10 },
      }));
      const screen = this.currentScreen;
      if (!screen) return;
      screen.items.push(...clones);
      this.selectedIds = clones.map((it) => it.id);
      this.commit();
    },
    duplicate() {
      this.copy();
      this.paste();
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
