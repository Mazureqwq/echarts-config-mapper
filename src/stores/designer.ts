import { defineStore } from "pinia";
import type { EChartsOptionLike } from "@/types/chart";
import { HISTORY_LIMIT } from "@/config/editor";
import { createDefaultDataSource, createScreenItem, createScreenSchema } from "@/core/item";
import type {
  ChartAsset,
  DataSourceConfig,
  Rect,
  ScreenItem,
  ScreenSchema,
  WidgetProps,
} from "@/core/types";
import { useScreensStore } from "@/stores/screens";
import { HistoryStack } from "@/utils/history";
import { createId } from "@/utils/id";
import { deepClone } from "@/utils/object";

export type DesignerViewMode = "fit" | 0.5 | 1;

export interface DesignerSnapshot {
  items: ScreenItem[];
}

function nextZIndex(items: ScreenItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.zIndex), 0) + 1;
}

export const useDesignerStore = defineStore("designer", {
  state: () => ({
    schema: null as ScreenSchema | null,
    selectedId: null as string | null,
    viewMode: "fit" as DesignerViewMode,
    dirty: false,
    clipboard: null as ScreenItem | null,
    history: new HistoryStack<DesignerSnapshot>({ items: [] }, HISTORY_LIMIT),
    canUndo: false,
    canRedo: false,
  }),

  actions: {
    /** 从 history 同步 canUndo/canRedo（push/undo/redo/reset 之后调用） */
    syncHistory(): void {
      this.canUndo = this.history.canUndo;
      this.canRedo = this.history.canRedo;
    },

    /** 从 screens store 载入副本：重置历史、清脏标记与选中态；找不到返回 false */
    load(id: string): boolean {
      const source = useScreensStore().byId(id);
      if (!source) return false;
      this.schema = deepClone(source);
      this.history.reset({ items: deepClone(this.schema.items) });
      this.syncHistory();
      this.dirty = false;
      this.selectedId = null;
      return true;
    },

    /** 新建空 schema（不落盘）；调用方随后 router.replace 到 /designer/:id */
    newSchema(name?: string): void {
      const schema = createScreenSchema(createId("screen"), name ?? "未命名大屏");
      this.schema = schema;
      this.history.reset({ items: deepClone(schema.items) });
      this.syncHistory();
      this.dirty = false;
      this.selectedId = null;
    },

    select(id: string | null): void {
      this.selectedId = id;
    },

    /** 追加元素：zIndex 置顶、选中并记入历史 */
    addItem(item: ScreenItem): void {
      if (!this.schema) return;
      item.zIndex = nextZIndex(this.schema.items);
      this.schema.items.push(item);
      this.selectedId = item.id;
      this.commit();
    },

    /** 资产快照语义：option 深拷贝，与资产脱离引用 */
    addItemFromAsset(asset: ChartAsset, rect?: Partial<Rect>): void {
      const item = createScreenItem("chart", rect);
      item.name = asset.name;
      item.chart = {
        sourceAssetId: asset.id,
        chartType: asset.chartType,
        option: deepClone(asset.option),
        dataSource: createDefaultDataSource(),
      };
      this.addItem(item);
    },

    removeItem(id: string): void {
      if (!this.schema) return;
      const index = this.schema.items.findIndex((item) => item.id === id);
      if (index < 0) return;
      this.schema.items.splice(index, 1);
      if (this.selectedId === id) this.selectedId = null;
      this.commit();
    },

    /** 合并写入矩形；record 为 true 记入历史，否则只标脏（拖拽过程不产生历史） */
    updateRect(id: string, rect: Partial<Rect>, record = false): void {
      const item = this.schema?.items.find((entry) => entry.id === id);
      if (!item) return;
      Object.assign(item.rect, rect);
      if (record) {
        this.commit();
      } else {
        this.touch();
      }
    },

    renameItem(id: string, name: string): void {
      const item = this.schema?.items.find((entry) => entry.id === id);
      if (!item) return;
      item.name = name;
      this.touch();
    },

    toggleVisible(id: string): void {
      const item = this.schema?.items.find((entry) => entry.id === id);
      if (!item) return;
      item.visible = !item.visible;
      this.commit();
    },

    toggleLocked(id: string): void {
      const item = this.schema?.items.find((entry) => entry.id === id);
      if (!item) return;
      item.locked = !item.locked;
      this.commit();
    },

    bringToFront(id: string): void {
      if (!this.schema) return;
      const item = this.schema.items.find((entry) => entry.id === id);
      if (!item) return;
      item.zIndex = nextZIndex(this.schema.items);
      this.commit();
    },

    /** 后移一层：与紧邻的下一层交换 zIndex */
    sendBackward(id: string): void {
      if (!this.schema) return;
      const item = this.schema.items.find((entry) => entry.id === id);
      if (!item) return;
      const below = this.schema.items
        .filter((entry) => entry.zIndex < item.zIndex)
        .sort((a, b) => b.zIndex - a.zIndex)[0];
      if (below) {
        const z = item.zIndex;
        item.zIndex = below.zIndex;
        below.zIndex = z;
      }
      this.commit();
    },

    setCanvas(patch: Partial<ScreenSchema["canvas"]>): void {
      if (!this.schema) return;
      Object.assign(this.schema.canvas, patch);
      this.touch();
    },

    setProps(id: string, patch: WidgetProps): void {
      const item = this.schema?.items.find((entry) => entry.id === id);
      if (!item) return;
      item.props = { ...(item.props ?? {}), ...patch };
      this.touch();
    },

    setChartOption(id: string, option: EChartsOptionLike, record: boolean): void {
      const item = this.schema?.items.find((entry) => entry.id === id);
      if (!item || !item.chart) return;
      item.chart.option = option;
      if (record) {
        this.commit();
      } else {
        this.touch();
      }
    },

    setDataSource(id: string, cfg: DataSourceConfig): void {
      const item = this.schema?.items.find((entry) => entry.id === id);
      if (!item || !item.chart) return;
      item.chart.dataSource = cfg;
      this.touch();
    },

    /** 复制选中项到剪贴板；无选中为 no-op */
    copySelected(): void {
      const item = this.schema?.items.find((entry) => entry.id === this.selectedId);
      if (!item) return;
      this.clipboard = deepClone(item);
    },

    /** 粘贴剪贴板：新 id、偏移 24px、置顶并选中；剪贴板为空为 no-op */
    paste(): void {
      if (!this.schema || !this.clipboard) return;
      const item = deepClone(this.clipboard);
      item.id = createId("item");
      item.rect.x += 24;
      item.rect.y += 24;
      this.addItem(item);
    },

    /** 记录快照（记录的是提交前状态）并标脏 */
    commit(): void {
      if (!this.schema) return;
      this.history.push({ items: deepClone(this.schema.items) });
      this.syncHistory();
      this.dirty = true;
    },

    touch(): void {
      this.dirty = true;
    },

    undo(): void {
      if (!this.canUndo || !this.schema) return;
      const snapshot = this.history.undo();
      this.schema.items = deepClone(snapshot.items);
      this.syncHistory();
      if (this.selectedId && !this.schema.items.some((item) => item.id === this.selectedId)) {
        this.selectedId = null;
      }
    },

    redo(): void {
      if (!this.canRedo || !this.schema) return;
      const snapshot = this.history.redo();
      this.schema.items = deepClone(snapshot.items);
      this.syncHistory();
      if (this.selectedId && !this.schema.items.some((item) => item.id === this.selectedId)) {
        this.selectedId = null;
      }
    },

    /** 保存到 screens store（/api/save）；成功后清脏标记 */
    async save(): Promise<void> {
      if (!this.schema) return;
      await useScreensStore().save(this.schema);
      this.dirty = false;
    },
  },
});
