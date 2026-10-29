import { defineStore } from "pinia";
import { HISTORY_LIMIT, MAX_CANVAS_H, MAX_CANVAS_W, MIN_CANVAS_H, MIN_CANVAS_W, STORAGE_KEY } from "@/config/editor";
import { createDefaultOption } from "@/config/optionFactory";
import { CHART_META } from "@/config/editor";
import type { ChartInstance, ChartType, EChartsOptionLike, HistorySnapshot } from "@/types/chart";
import { HistoryStack } from "@/utils/history";
import { deepClone, getByPath, setByPath } from "@/utils/object";
import { toDarkTheme, toLightTheme } from "@/utils/theme";

export type PreviewBackdrop = "dark" | "light" | "grid";

interface PersistedWorkspace {
  type: ChartType;
  options: Partial<Record<ChartType, EChartsOptionLike>>;
  size: { w: number; h: number };
  backdrop: PreviewBackdrop;
}

const clampCanvas = (value: number, min: number, max: number): number =>
  Math.min(Math.max(Math.round(value) || min, min), max);

const clampSize = (w: number, h: number) => ({
  w: clampCanvas(w, MIN_CANVAS_W, MAX_CANVAS_W),
  h: clampCanvas(h, MIN_CANVAS_H, MAX_CANVAS_H),
});

const defaultSnapshot = (): HistorySnapshot => ({ options: {}, type: "line" });

export const useWorkspaceStore = defineStore("workspace", {
  state: () => ({
    /** 当前选中的图表类型（中间预览的就是它） */
    type: "line" as ChartType,
    /** 每种类型各自保留一份 option，来回切换不丢编辑 */
    options: {} as Partial<Record<ChartType, EChartsOptionLike>>,
    /** 预览画布尺寸 */
    size: { w: 800, h: 480 },
    /** 仅影响预览观感，不会写进复制的 JSON */
    backdrop: "dark" as PreviewBackdrop,
    history: new HistoryStack<HistorySnapshot>(defaultSnapshot(), HISTORY_LIMIT),
    canUndo: false,
    canRedo: false,
    revision: 0,
  }),

  getters: {
    /** 供 Inspector / 预览使用的当前图表描述 */
    current(state): ChartInstance {
      return {
        id: state.type,
        type: state.type,
        title: CHART_META[state.type].label,
        x: 0,
        y: 0,
        w: state.size.w,
        h: state.size.h,
        option: this.optionOf(state.type),
      };
    },

    optionOf(state) {
      return (type: ChartType): EChartsOptionLike => {
        if (!state.options[type]) state.options[type] = createDefaultOption(type);
        return state.options[type] as EChartsOptionLike;
      };
    },

    /** 当前 option（带懒初始化） */
    option(state): EChartsOptionLike {
      return this.optionOf(state.type);
    },
  },

  actions: {
    ensureOption(type: ChartType): EChartsOptionLike {
      if (!this.options[type]) this.options[type] = createDefaultOption(type);
      return this.options[type] as EChartsOptionLike;
    },

    commit(): void {
      const snapshot: HistorySnapshot = {
        type: this.type,
        options: deepClone(this.options) as Record<ChartType, EChartsOptionLike>,
      };
      this.history.push(snapshot);
      this.canUndo = this.history.canUndo;
      this.canRedo = this.history.canRedo;
      this.touch();
    },

    touch(): void {
      this.revision += 1;
      this.persist();
    },

    undo(): void {
      const snapshot = this.history.undo();
      this.applySnapshot(snapshot);
      this.canUndo = this.history.canUndo;
      this.canRedo = this.history.canRedo;
      this.touch();
    },

    redo(): void {
      const snapshot = this.history.redo();
      this.applySnapshot(snapshot);
      this.canUndo = this.history.canUndo;
      this.canRedo = this.history.canRedo;
      this.touch();
    },

    applySnapshot(snapshot: HistorySnapshot): void {
      this.type = snapshot.type;
      this.options = snapshot.options;
    },

    /** 切换图表类型（保留各类型已编辑的 option） */
    selectType(type: ChartType): void {
      if (this.type === type) return;
      this.ensureOption(type);
      this.ensureOption(this.type);
      this.type = type;
      this.commit();
    },

    setSize(w: number, h: number): void {
      const next = clampSize(w, h);
      this.size = next;
      this.touch();
    },

    /**
     * 切换预览背景；浅色背景会同时把图表配色换成浅底可读版本
     * （改动进入历史，可用 Ctrl+Z 撤销）
     */
    setBackdrop(backdrop: PreviewBackdrop): void {
      if (this.backdrop === backdrop) return;
      const previous = this.backdrop;
      this.backdrop = backdrop;

      const option = this.ensureOption(this.type);
      if (backdrop === "light" && previous !== "light") {
        this.options[this.type] = toLightTheme(option);
      } else if (backdrop !== "light" && previous === "light") {
        this.options[this.type] = toDarkTheme(option);
      }
      this.commit();
    },

    /** 按路径更新当前图表 option */
    updateOption(_id: string, path: string | Array<string | number>, value: unknown): void {
      const option = this.ensureOption(this.type);
      this.options[this.type] = setByPath(option, path, value);
      this.touch();
    },

    /** 整体替换当前 option（数据表格 / JSON 面板） */
    replaceOption(_id: string, option: EChartsOptionLike, record = true): void {
      this.options[this.type] = option;
      if (record) this.commit();
      else this.touch();
    },

    readOption(path: string, fallback?: unknown): unknown {
      return getByPath(this.option, path, fallback);
    },

    /** 恢复当前类型的默认配置 */
    resetCurrent(): void {
      this.options[this.type] = createDefaultOption(this.type);
      this.commit();
    },

    /** 恢复全部类型为默认配置 */
    resetAll(): void {
      this.options = {};
      this.ensureOption(this.type);
      this.commit();
    },

    restore(): boolean {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw) as PersistedWorkspace;
        if (!data || typeof data !== "object") return false;
        if (data.type) this.type = data.type;
        if (data.options && typeof data.options === "object") this.options = data.options;
        if (data.size) this.size = clampSize(data.size.w, data.size.h);
        if (data.backdrop) this.backdrop = data.backdrop;
        this.ensureOption(this.type);
        this.history.reset({ type: this.type, options: deepClone(this.options) as Record<ChartType, EChartsOptionLike> });
        this.canUndo = false;
        this.canRedo = false;
        return true;
      } catch {
        return false;
      }
    },

    persist(): void {
      try {
        const payload: PersistedWorkspace = {
          type: this.type,
          options: this.options,
          size: this.size,
          backdrop: this.backdrop,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        /* 存储不可用时静默降级 */
      }
    },
  },
});
