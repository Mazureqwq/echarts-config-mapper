import type { Background, ChartItem, DatasetDefinition, DesignAsset, Screen, ScreenItem, Workspace } from "@/core/model/types";
import { componentRegistry } from "@/core/components/builtins";
import { applyThemeChartPalette, getThemeById } from "@/core/design/library";
import { runPipeline } from "@/core/live/pipeline";
import { buildOption } from "@/core/chart/optionBuilder";
import { isPlaceholder } from "@/core/model/templates";
import {
  GENERATOR_VERSION,
  PACKAGE_FORMAT,
  PACKAGE_SCHEMA_VERSION,
} from "./model";
import type { ExportOptions, PackageItem, PackagePayload, PackageScreen } from "./model";

/** Offline artifacts only permit self-contained image data URLs. */
export function isSafeImageSrc(src: string): boolean {
  const value = String(src ?? "").trim();
  return /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(value);
}

function cleanBackground(bg: Background, warnings: string[]): Background {
  if (bg.kind !== "image") return bg;
  if (isSafeImageSrc(bg.src)) return bg;
  warnings.push("背景图含外部或不安全地址；离线产物已回退为纯色");
  return { kind: "color", color: "#0b1020" };
}

function chartAlt(item: ChartItem): string {
  const typeLabel: Record<string, string> = {
    line: "折线图",
    bar: "柱状图",
    pie: "饼图",
    map: "地图",
    scatter: "散点图",
    radar: "雷达图",
  };
  const kind = typeLabel[item.spec.type] ?? "图表";
  return `${item.name || "图表"}（${kind}）`;
}

const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
function cleanJson(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    const output = value.map((entry) => cleanJson(entry, seen)).filter((entry) => entry !== undefined);
    seen.delete(value);
    return output;
  }
  if (typeof value !== "object") return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key)) continue;
    const cleaned = cleanJson(entry, seen);
    if (cleaned !== undefined) output[key] = cleaned;
  }
  seen.delete(value);
  return output;
}
function cleanJsonObject(value: unknown): Record<string, unknown> {
  const cleaned = cleanJson(value);
  return cleaned !== null && typeof cleaned === "object" && !Array.isArray(cleaned) ? cleaned as Record<string, unknown> : {};
}

function cleanBlueprint(graph: NonNullable<Screen["blueprint"]>, warnings: string[]): NonNullable<Screen["blueprint"]> {
  const safe = cleanJson(graph) as NonNullable<Screen["blueprint"]>;
  let removedLiveAction = false;
  const nodes = safe.nodes.map((node) => {
    if (node.kind !== "datasetAction" || node.action === "filter") return node;
    removedLiveAction = true;
    return node.action === "setParams" ? { ...node, params: {} } : node;
  });
  if (removedLiveAction) warnings.push("离线产物仅保留数据筛选；实时参数更新和刷新动作已禁用");
  return { ...safe, nodes };
}

function toPackageItem(item: ScreenItem, warnings: string[], themeId: string | undefined, designAssets: readonly DesignAsset[]): PackageItem | null {
  const base = {
    id: item.id,
    name: item.name || "",
    frame: { ...item.frame },
    opacity: typeof item.opacity === "number" ? item.opacity : 1,
  };

  if (item.kind === "chart") {
    return {
      ...base,
      kind: "chart",
      type: item.spec.type,
      option: buildOption(applyThemeChartPalette(item.spec, getThemeById(themeId)?.tokens.chartPalette ?? [])) as Record<string, unknown>,
      alt: chartAlt(item),
      ...(item.dataBinding ? { dataBinding: cleanJson(item.dataBinding) as ChartItem["dataBinding"] } : {}),
      ...(item.dataBinding ? { dataTemplate: cleanJson(item.spec.data) as ChartItem["spec"]["data"] } : {}),
    };
  }
  if (item.kind === "text") {
    return {
      ...base,
      kind: "text",
      text: item.text,
      fontSize: item.fontSize,
      color: item.color,
      align: item.align,
      weight: item.weight,
      ...(typeof item.lineHeight === "number" ? { lineHeight: item.lineHeight } : {}),
    };
  }
  if (item.kind === "image") {
    const linkedAsset = item.sourceDesignAssetId
      ? designAssets.find((asset) => asset.id === item.sourceDesignAssetId)
      : undefined;
    const src = linkedAsset?.dataUrl ?? item.src;
    if (!isSafeImageSrc(src)) {
      warnings.push(`图片「${item.name || item.id}」含外部或不安全地址，离线产物已跳过该图片`);
      return null;
    }
    return { ...base, kind: "image", src, fit: item.fit, ...(item.sourceDesignAssetId ? { sourceDesignAssetId: item.sourceDesignAssetId } : {}) };
  }
  if (item.kind === "component") {
    const definition = componentRegistry.get(item.componentId, item.componentVersion);
    const supported = definition && ["chartforge-data-table-v1", "chartforge-kpi-v1", "chartforge-progress-list-v1", "chartforge-section-title-v1", "chartforge-corner-frame-v1"].includes(definition.exportRendererId);
    const label = item.name && item.name !== "component" && item.name !== "组件" ? item.name : item.componentId;
    if (!supported) throw new Error(`组件「${label}」的导出渲染器版本缺失或不受支持，无法生成离线产物`);
    return {
      ...base,
      kind: "component",
      componentId: item.componentId,
      componentVersion: item.componentVersion,
      props: cleanJsonObject(item.props),
      ...(item.dataBinding ? { dataBinding: cleanJson(item.dataBinding) as ChartItem["dataBinding"] } : {}),
    };
  }
  return {
    ...base,
    kind: "shape",
    shape: item.shape,
    ...(item.fill ? { fill: item.fill } : {}),
    ...(item.stroke ? { stroke: item.stroke } : {}),
    ...(typeof item.strokeWidth === "number" ? { strokeWidth: item.strokeWidth } : {}),
    ...(typeof item.radius === "number" ? { radius: item.radius } : {}),
  };
}

/** 大屏 → 产物里的屏幕（剔除隐藏项、模板占位、非法图片；缩略图一律不带） */
export function toPackageScreen(screen: Screen, warnings: string[], designAssets: readonly DesignAsset[] = []): PackageScreen {
  const items: PackageItem[] = [];
  for (const item of screen.items) {
    if (item.hidden) continue;
    if (isPlaceholder(item)) continue;
    const pack = toPackageItem(item, warnings, screen.themeId, designAssets);
    if (pack) items.push(pack);
  }
  return {
    id: screen.id,
    name: screen.name,
    canvas: {
      width: screen.canvas.width,
      height: screen.canvas.height,
      background: cleanBackground(screen.canvas.background, warnings),
    },
    ...(screen.themeId ? { themeId: screen.themeId } : {}),
    ...(screen.blueprint ? { blueprint: cleanBlueprint(screen.blueprint, warnings) } : {}),
    items,
  };
}

/**
 * 组装产物 payload（纯函数，不碰 DOM）。
 * 只带被选中的大屏；不导出图表库、缩略图、localStorage 全库，也不含其它屏。
 */
export function collectReferencedDesignAssets(
  workspace: Workspace,
  screens: readonly PackageScreen[],
) {
  const referenced = new Set(
    screens.flatMap((screen) => screen.items.flatMap((item) =>
      item.kind === "image" && item.sourceDesignAssetId ? [item.sourceDesignAssetId] : []
    )),
  );
  return workspace.designAssets.filter((asset) => referenced.has(asset.id));
}

function referencedDatasetIds(screens: readonly PackageScreen[]): Set<string> {
  const ids = new Set<string>();
  for (const screen of screens) {
    for (const item of screen.items) if ("dataBinding" in item && item.dataBinding?.datasetId) ids.add(item.dataBinding.datasetId);
    for (const node of screen.blueprint?.nodes ?? []) if (node.kind === "datasetAction") ids.add(node.datasetId);
  }
  return ids;
}

function normalizedRows(rows: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const safe = cleanJson(row);
    return safe !== null && typeof safe === "object" && !Array.isArray(safe)
      ? safe as Record<string, unknown>
      : { value: safe };
  });
}

function datasetRows(
  definition: DatasetDefinition,
  options: ExportOptions,
  warnings: string[],
): Array<Record<string, unknown>> {
  const snapshot = options.datasetSnapshots?.get(definition.id);
  if (snapshot && (snapshot.status === "success" || snapshot.status === "stale" || snapshot.rows.length > 0)) {
    if (snapshot.status === "stale" || ((snapshot.status === "loading" || snapshot.status === "error") && snapshot.rows.length > 0)) {
      warnings.push(`数据集「${definition.name}」使用最近一次成功快照（当前状态：${snapshot.status}）`);
    }
    return normalizedRows(snapshot.rows);
  }
  if (definition.source.kind === "static") {
    const result = runPipeline(definition.source.data, definition.pipeline);
    if (result.ok) return normalizedRows(result.rows);
    warnings.push(`数据集「${definition.name}」未能生成静态快照：${result.message}`);
    return [];
  }
  warnings.push(`数据集「${definition.name}」没有可用的离线数据快照，相关组件将显示空数据`);
  return [];
}

function collectReferencedDatasets(
  definitions: readonly DatasetDefinition[],
  screens: readonly PackageScreen[],
  options: ExportOptions,
  warnings: string[],
): PackagePayload["datasets"] {
  const refs = referencedDatasetIds(screens);
  const byId = new Map(definitions.map((dataset) => [dataset.id, dataset]));
  const result: PackagePayload["datasets"] = [];
  for (const id of refs) {
    const definition = byId.get(id);
    if (!definition) { warnings.push(`引用的数据集「${id}」不存在，已导出为空快照`); result.push({ id, rows: [] }); continue; }
    result.push({ id, rows: datasetRows(definition, options, warnings) });
  }
  return result;
}

export function buildPackagePayload(
  workspace: Workspace,
  screenIds: string[],
  options: ExportOptions = {}
): PackagePayload {
  const warnings: string[] = [];
  const screens = workspace.screens
    .filter((s) => screenIds.includes(s.id))
    .map((s) => toPackageScreen(s, warnings, workspace.designAssets));

  if (!screens.length) warnings.push("没有找到要导出的大屏");

  const designAssets = collectReferencedDesignAssets(workspace, screens);
  const datasets = collectReferencedDatasets(workspace.datasets, screens, options, warnings);
  const payload: PackagePayload = {
    format: PACKAGE_FORMAT,
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    chartforgeVersion: GENERATOR_VERSION,
    exportedAt: new Date(options.now ? options.now() : Date.now()).toISOString(),
    title: screens[0]?.name || "大屏",
    screens,
    ...(designAssets.length ? { designAssets } : {}),
    datasets,
    warnings,
  };

  if (options.keepHeaders) {
    warnings.push("已忽略保留请求头选项：离线产物不会包含数据源 URL、请求头、请求体或令牌");
  }
  return payload;
}

/** 把全局接口设置里需要下发到产物里的部分抽出来（V2 实时模式用，V1 仅用于判定是否需要提示） */
export function screenHasLiveSource(screen: Screen): boolean {
  return screen.items.some((i) => i.kind === "chart" && Boolean(i.spec.source));
}
