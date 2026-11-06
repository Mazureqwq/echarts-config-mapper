import { defineStore } from "pinia";
import { createWorkspace, createChartAsset, createChartSpec } from "@/core/model/schema";
import { setPath } from "@/core/model/path";
import type { ChartAsset, ChartData, ChartType, Workspace } from "@/core/model/types";
import {
  loadWorkspace,
  saveWorkspace,
  exportJson,
  importJson,
} from "@/core/storage/workspaceRepo";

export const SAVE_DEBOUNCE_MS = 500;

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useWorkspaceStore = defineStore("workspace", {
  state: () => ({
    workspace: createWorkspace() as Workspace,
    loaded: false,
    saveState: "idle" as "idle" | "saved" | "error",
  }),
  getters: {
    screens: (s) => s.workspace.screens,
    assets: (s) => s.workspace.assets,
    settings: (s) => s.workspace.settings,
  },
  actions: {
    load() {
      this.workspace = loadWorkspace();
      this.loaded = true;
      this.saveState = "idle";
    },
    save() {
      try {
        saveWorkspace(this.workspace);
        this.saveState = "saved";
      } catch (e) {
        this.saveState = "error";
        throw e;
      }
    },
    scheduleSave() {
      if (saveTimer !== null) {
        clearTimeout(saveTimer);
      }
      saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
          this.save();
        } catch {
          /* saveState 已置 error，顶栏提示并可重试 */
        }
      }, SAVE_DEBOUNCE_MS);
    },
    duplicateScreen(id: string) {
      const src = this.workspace.screens.find((s) => s.id === id);
      if (!src) return;
      const clone = JSON.parse(JSON.stringify(src)) as (typeof this.workspace.screens)[number];
      clone.id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `id-${Date.now().toString(36)}`;
      clone.name = `${src.name} 副本`;
      clone.items.forEach((it) => {
        it.id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      });
      this.workspace.screens.push(clone);
      this.save();
    },
    assetId() {
      return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    },
    /** 新建图表资产（图表库是图表的生产地） */
    createAsset(type: ChartType, name: string, size?: { w: number; h: number }): string {
      const asset = createChartAsset(name.trim() || "未命名图表", createChartSpec(type));
      if (size) asset.defaultSize = { w: size.w, h: size.h };
      this.workspace.assets.push(asset);
      this.save();
      return asset.id;
    },
    assetById(id: string): ChartAsset | undefined {
      return this.workspace.assets.find((a) => a.id === id);
    },
    /** 按 option 点分路径修改资产配置 */
    applyAssetConfig(id: string, path: string, value: unknown): void {
      const asset = this.assetById(id);
      if (!asset) return;
      setPath(asset.spec.option as Record<string, unknown>, path.split("."), value);
      asset.updatedAt = Date.now();
      this.save();
    },
    updateAssetData(id: string, data: ChartData): void {
      const asset = this.assetById(id);
      if (!asset) return;
      asset.spec.data = JSON.parse(JSON.stringify(data)) as ChartData;
      asset.updatedAt = Date.now();
      this.save();
    },
    /** 切换图表类型（重置参数与数据，保留名称/尺寸/元信息） */
    updateAssetType(id: string, type: ChartType): void {
      const asset = this.assetById(id);
      if (!asset) return;
      asset.spec = createChartSpec(type);
      asset.category = asset.category || "";
      asset.updatedAt = Date.now();
      this.save();
    },
    updateAssetSize(id: string, size: { w: number; h: number }): void {
      const asset = this.assetById(id);
      if (!asset) return;
      asset.defaultSize = { w: Math.max(120, Math.round(size.w)), h: Math.max(80, Math.round(size.h)) };
      asset.updatedAt = Date.now();
      this.save();
    },
    duplicateAsset(id: string) {
      const src = this.workspace.assets.find((a) => a.id === id);
      if (!src) return;
      const clone = JSON.parse(JSON.stringify(src)) as (typeof this.workspace.assets)[number];
      clone.id = this.assetId();
      clone.name = `${src.name} 副本`;
      clone.createdAt = Date.now();
      clone.updatedAt = Date.now();
      this.workspace.assets.push(clone);
      this.save();
    },
    updateAssetMeta(
      id: string,
      meta: { name?: string; category?: string; tags?: string[] }
    ) {
      const asset = this.workspace.assets.find((a) => a.id === id);
      if (!asset) return;
      if (meta.name !== undefined) asset.name = meta.name.trim() || asset.name;
      if (meta.category !== undefined) asset.category = meta.category;
      if (meta.tags !== undefined) asset.tags = [...meta.tags];
      asset.updatedAt = Date.now();
      this.save();
    },
    removeAsset(id: string) {
      const idx = this.workspace.assets.findIndex((a) => a.id === id);
      if (idx === -1) return;
      this.workspace.assets.splice(idx, 1);
      this.save();
    },
    exportAll(): string {
      return exportJson(this.workspace);
    },
    importFrom(text: string, mode: "merge" | "replace") {
      this.workspace = importJson(text, mode);
      this.loaded = true;
      this.saveState = "saved";
    },
  },
});
