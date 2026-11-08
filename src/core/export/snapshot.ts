import type { Background, ChartItem, DesignAsset, Screen, ScreenItem, Workspace } from "@/core/model/types";
import { applyThemeChartPalette, getThemeById } from "@/core/design/library";
import { buildOption } from "@/core/chart/optionBuilder";
import { isPlaceholder } from "@/core/model/templates";
import {
  GENERATOR_VERSION,
  PACKAGE_FORMAT,
  PACKAGE_SCHEMA_VERSION,
} from "./model";
import type { ExportOptions, PackageItem, PackagePayload, PackageScreen } from "./model";

/** 只放行 http / https 与 data:image（挡掉 javascript:、data:text/html 这类注入面） */
export function isSafeImageSrc(src: string): boolean {
  const value = String(src ?? "").trim();
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return true;
  return /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(value);
}

function cleanBackground(bg: Background, warnings: string[]): Background {
  if (bg.kind !== "image") return bg;
  if (isSafeImageSrc(bg.src)) return bg;
  warnings.push("背景图地址不在白名单内（只允许 http(s) 或 data:image），已回退为纯色");
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
      // 导出时就把 option 算好：产物运行时只做 setOption，避免把建图逻辑复制一份
      option: buildOption(applyThemeChartPalette(item.spec, getThemeById(themeId)?.tokens.chartPalette ?? [])) as Record<string, unknown>,
      alt: chartAlt(item),
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
      warnings.push(`图片「${item.name || item.id}」的本地素材缺失或地址不在白名单内，已跳过`);
      return null;
    }
    return { ...base, kind: "image", src, fit: item.fit, ...(item.sourceDesignAssetId ? { sourceDesignAssetId: item.sourceDesignAssetId } : {}) };
  }
  if (item.kind === "component") {
    throw new Error(`组件「${item.name || item.componentId}」尚未注册导出渲染器，无法生成离线产物`);
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
    items,
  };
}

/**
 * 组装产物 payload（纯函数，不碰 DOM）。
 * 只带被选中的大屏；不导出图表库、缩略图、localStorage 全库，也不含其它屏。
 */
export function collectReferencedDesignAssets(
  workspace: Workspace,
  screens: readonly import("./model").PackageScreen[],
) {
  const referenced = new Set(
    screens.flatMap((screen) => screen.items.flatMap((item) =>
      item.kind === "image" && item.sourceDesignAssetId ? [item.sourceDesignAssetId] : []
    )),
  );
  return workspace.designAssets.filter((asset) => referenced.has(asset.id));
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
  const payload: PackagePayload = {
    format: PACKAGE_FORMAT,
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    chartforgeVersion: GENERATOR_VERSION,
    exportedAt: new Date(options.now ? options.now() : Date.now()).toISOString(),
    title: screens[0]?.name || "大屏",
    screens,
    ...(designAssets.length ? { designAssets } : {}),
    warnings,
  };

  if (options.keepHeaders) {
    warnings.push("已保留请求头里的令牌：产物可以被任何人直接调用你的接口，转发前请二次确认");
  }
  return payload;
}

/** 把全局接口设置里需要下发到产物里的部分抽出来（V2 实时模式用，V1 仅用于判定是否需要提示） */
export function screenHasLiveSource(screen: Screen): boolean {
  return screen.items.some((i) => i.kind === "chart" && Boolean(i.spec.source));
}
