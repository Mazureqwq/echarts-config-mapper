import { defineStore } from "pinia";
import { createWorkspace, createChartAsset, createChartSpec } from "@/core/model/schema";
import { setPath } from "@/core/model/path";
import type {
  ApiSettings,
  ChartAsset,
  ChartData,
  ChartSpec,
  ChartType,
  DatasetDefinition,
  DatasetPipeline,
  Workspace,
} from "@/core/model/types";
import {
  loadWorkspace,
  saveWorkspace,
  exportJson,
  importJson,
} from "@/core/storage/workspaceRepo";
import { THUMBNAIL_VERSION } from "@/core/storage/thumbnail";

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
    datasets: (s) => s.workspace.datasets,
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
    /** 图表库缩略图（由图表编辑页防抖生成） */
    setAssetThumbnail(id: string, thumbnail: string, version: number = THUMBNAIL_VERSION): void {
      const asset = this.assetById(id);
      if (!asset) return;
      asset.thumbnail = thumbnail;
      asset.thumbnailVersion = version;
      // 刻意不动 updatedAt：缩略图是派生产物，改它不应触发「内容已变更」相关的监听（否则会自触发重算）
      this.save();
    },
    /** 撤销/重做时整体回写 spec */
    replaceAssetSpec(id: string, spec: ChartSpec): void {
      const asset = this.assetById(id);
      if (!asset) return;
      asset.spec = JSON.parse(JSON.stringify(spec)) as ChartSpec;
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
    /** 批量删除（大屏里的副本不受影响） */
    removeAssets(ids: string[]) {
      const set = new Set(ids);
      const before = this.workspace.assets.length;
      this.workspace.assets = this.workspace.assets.filter((a) => !set.has(a.id));
      if (this.workspace.assets.length !== before) this.save();
    },
    /** 批量改分类（传空串表示清空为未分类） */
    setAssetsCategory(ids: string[], category: string) {
      const set = new Set(ids);
      const value = category.trim();
      let touched = false;
      for (const asset of this.workspace.assets) {
        if (!set.has(asset.id)) continue;
        if (value) asset.category = value;
        else delete asset.category;
        asset.updatedAt = Date.now();
        touched = true;
      }
      if (touched) this.save();
    },
    createDataset(
      name: string,
      source: DatasetDefinition["source"] = { kind: "static", data: [] }
    ): string {
      const id = this.assetId();
      const dataset: DatasetDefinition = {
        id,
        name: name.trim() || "未命名数据集",
        source: JSON.parse(JSON.stringify(source)) as DatasetDefinition["source"],
      };
      this.workspace.datasets.push(dataset);
      this.save();
      return id;
    },
    updateDataset(
      id: string,
      patch: {
        name?: string;
        source?: DatasetDefinition["source"];
        parameters?: Record<string, string> | null;
        pipeline?: DatasetPipeline | null;
      }
    ): void {
      const dataset = this.workspace.datasets.find((entry) => entry.id === id);
      if (!dataset) return;
      if (patch.name !== undefined) dataset.name = patch.name.trim() || dataset.name;
      if (patch.source !== undefined) {
        dataset.source = JSON.parse(JSON.stringify(patch.source)) as DatasetDefinition["source"];
      }
      if (patch.parameters !== undefined) {
        const parameters = Object.fromEntries(
          Object.entries(patch.parameters ?? {}).filter(([key]) => key.trim() !== "")
        );
        if (Object.keys(parameters).length) dataset.parameters = parameters;
        else delete dataset.parameters;
      }
      if (patch.pipeline !== undefined) {
        if (patch.pipeline) dataset.pipeline = JSON.parse(JSON.stringify(patch.pipeline)) as DatasetPipeline;
        else delete dataset.pipeline;
      }
      this.save();
    },
    removeDataset(id: string): void {
      const index = this.workspace.datasets.findIndex((entry) => entry.id === id);
      if (index === -1) return;
      this.workspace.datasets.splice(index, 1);
      this.save();
    },
    /** 更新全局接口设置（baseUrl / 公共头 / 公共 query / 超时） */
    updateApiSettings(patch: Partial<ApiSettings>): void {
      const prev: Partial<ApiSettings> = this.workspace.settings.api ?? {};
      const next: ApiSettings = {
        ...prev,
        ...patch,
        baseUrl: String(patch.baseUrl ?? prev.baseUrl ?? "").trim(),
      };
      if (next.headers && !Object.keys(next.headers).length) delete next.headers;
      if (next.query && !Object.keys(next.query).length) delete next.query;
      // 全空时不留一个空壳配置，避免旧数据里出现 settings.api: {}
      const empty =
        !next.baseUrl &&
        !next.headers &&
        !next.query &&
        !next.timeoutMs &&
        !next.defaultIntervalSec &&
        next.exportHeaders !== true;
      if (empty) delete this.workspace.settings.api;
      else this.workspace.settings.api = next;
      this.save();
    },
    resetApiSettings(): void {
      delete this.workspace.settings.api;
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
