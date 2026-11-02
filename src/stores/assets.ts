import { defineStore } from "pinia";
import type { ChartAsset } from "@/core/types";
import type { ChartType, EChartsOptionLike } from "@/types/chart";
import { normalizeChartAsset } from "@/core/item";
import { slugifyName } from "@/utils/slug";

export interface SaveAssetInput {
  name: string;
  category: string;
  tags?: string[];
  chartType: ChartType;
  option: EChartsOptionLike;
}

/** 仅开发环境可用保存 API（生产构建无 dev 中间件，图表库只读） */
export function isSaveApiAvailable(): boolean {
  return import.meta.env.DEV;
}

/** 从仓库内图表库目录加载资产（构建期打包，规范化补齐缺失字段，按名称排序） */
function loadAssets(): ChartAsset[] {
  const modules = import.meta.glob<unknown>("../assets/library/*.chart.json", { eager: true });
  return Object.values(modules)
    .map(normalizeChartAsset)
    .filter((asset): asset is ChartAsset => asset !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function assetPath(id: string): string {
  return "src/assets/library/" + id + ".chart.json";
}

export const useAssetsStore = defineStore("assets", {
  state: () => ({
    assets: loadAssets(),
  }),

  getters: {
    byId(state) {
      return (id: string): ChartAsset | undefined => state.assets.find((asset) => asset.id === id);
    },

    /** 分类去重保序 */
    categories(state): string[] {
      const seen: string[] = [];
      for (const asset of state.assets) {
        if (asset.category && !seen.includes(asset.category)) seen.push(asset.category);
      }
      return seen;
    },

    /** keyword 匹配 name/tags（不区分大小写）；category 为空串表示全部 */
    filtered(state) {
      return (keyword: string, category: string): ChartAsset[] => {
        const kw = keyword.trim().toLowerCase();
        return state.assets.filter((asset) => {
          if (category && asset.category !== category) return false;
          if (!kw) return true;
          return (
            asset.name.toLowerCase().includes(kw) ||
            asset.tags.some((tag) => tag.toLowerCase().includes(kw))
          );
        });
      };
    },
  },

  actions: {
    async saveAsset(input: SaveAssetInput): Promise<ChartAsset> {
      const now = new Date().toISOString();
      const id = slugifyName(input.name) + "-" + Date.now().toString(36);
      const asset: ChartAsset = {
        id,
        name: input.name,
        category: input.category,
        tags: input.tags ?? [],
        chartType: input.chartType,
        option: input.option,
        createdAt: now,
        updatedAt: now,
      };
      const response = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: assetPath(id), content: JSON.stringify(asset, null, 2) }),
      });
      if (!response.ok) throw new Error("保存资产失败");
      this.assets.unshift(asset);
      return asset;
    },

    async deleteAsset(id: string): Promise<void> {
      const response = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: assetPath(id) }),
      });
      if (!response.ok) throw new Error("删除资产失败");
      this.assets = this.assets.filter((asset) => asset.id !== id);
    },
  },
});
