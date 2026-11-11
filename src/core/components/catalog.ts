import { chartRegistry } from "@/core/chart/registry";
import type { ChartType } from "@/core/model/types";
import { componentRegistry } from "./builtins";
import type { ComponentCatalogEntry, ComponentCatalogGroup, ComponentDefinition, LegacyItemKind } from "./types";

const BASIC_ITEM_KINDS: readonly Exclude<LegacyItemKind, "chart">[] = ["text", "image", "shape"];
const BASIC_LABELS: Record<Exclude<LegacyItemKind, "chart">, { name: string; description: string }> = {
  text: { name: "文本", description: "添加可编辑的文本内容。" },
  image: { name: "图片", description: "添加本地或工作区图片资源。" },
  shape: { name: "形状", description: "添加矩形、椭圆或线条等基础图形。" },
};

export function componentCatalogEntries(definitions: readonly ComponentDefinition[]): ComponentCatalogEntry[] {
  return definitions.flatMap((definition): ComponentCatalogEntry[] => {
    if (definition.renderer.kind !== "vue") return [];

    const metadata = definition.catalog;
    return [{
      key: `${definition.id}@${definition.version}`,
      source: "component",
      componentId: definition.id,
      componentVersion: definition.version,
      group: metadata?.group ?? "data",
      name: definition.name,
      description: metadata?.description ?? "通用数据组件。",
      tags: metadata?.tags ?? [],
      previewKey: metadata?.previewKey ?? "generic",
    }];
  });
}

export function getComponentCatalog(): readonly ComponentCatalogEntry[] {
  const charts: ComponentCatalogEntry[] = (Object.keys(chartRegistry) as ChartType[])
    .filter((chartType) => !["map", "geoScatter", "geoHeatmap", "geoFlow"].includes(chartType))
    .map((chartType) => {
    const descriptor = chartRegistry[chartType];
    return {
      key: `chart:${chartType}`,
      source: "chart",
      chartType,
      group: descriptor.catalogGroup,
      name: descriptor.label,
      description: `${descriptor.label}可视化图表。`,
      tags: ["图表", chartType],
      previewKey: `chart-${chartType}`,
    };
  });

  const components = componentCatalogEntries(componentRegistry.list());
  const basics: ComponentCatalogEntry[] = BASIC_ITEM_KINDS.map((itemKind) => {
    const label = BASIC_LABELS[itemKind];
    return {
      key: `basic:${itemKind}`,
      source: "basic",
      itemKind,
      group: "basic",
      name: label.name,
      description: label.description,
      tags: ["基础", itemKind],
      previewKey: `basic-${itemKind}`,
    };
  });

  return [...charts, ...components, ...basics];
}

export function filterComponentCatalog(
  entries: readonly ComponentCatalogEntry[],
  query: string,
  group: ComponentCatalogGroup | "all"
): ComponentCatalogEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (group !== "all" && entry.group !== group) return false;
    if (!normalizedQuery) return true;
    return [entry.name, entry.description, ...entry.tags]
      .some((value) => value.toLowerCase().includes(normalizedQuery));
  });
}
