import { createComponentItem, createItem } from "@/core/model/schema";
import { componentRegistry } from "@/core/components/builtins";
import type { Screen, ScreenItem, ShapeItem, TextItem, ChartSpec } from "@/core/model/types";
import type { ComponentBlock, DesignTheme } from "./types";

export const BUILT_IN_THEMES: readonly DesignTheme[] = [
  {
    id: "monitor-dark",
    name: "监控大屏 · 深色",
    description: "适用于指挥中心与实时监控，深色底、冷色强调。",
    tokens: {
      canvas: "#081522", panel: "#0d2234", text: "#e8f4ff", muted: "#89a8be", accent: "#29d3ff", border: "#214258",
      chartPalette: ["#29d3ff", "#5b8cff", "#33d6a6", "#f5bd4f", "#ff7185", "#a987ff", "#55c8d8"],
      titleStyle: { color: "#e8f4ff", fontWeight: "700", letterSpacing: "1px" },
      borderStyle: { color: "#214258", width: "1px", radius: "8px" },
    },
  },
  {
    id: "business-light",
    name: "商务数据 · 浅色",
    description: "适用于经营分析与汇报场景，浅色底、清晰层级。",
    tokens: {
      canvas: "#f1f5fb", panel: "#ffffff", text: "#172b4d", muted: "#63758b", accent: "#3478f6", border: "#d8e1ed",
      chartPalette: ["#3478f6", "#13a88a", "#f5a623", "#8b63d9", "#ed6575", "#28a9c5", "#607d9b"],
      titleStyle: { color: "#172b4d", fontWeight: "700", letterSpacing: "0" },
      borderStyle: { color: "#d8e1ed", width: "1px", radius: "8px" },
    },
  },
];

function uuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `block-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeTitlePanelBlock(): ComponentBlock {
  const panel = createItem("shape", { x: 72, y: 176, w: 1240, h: 680 }) as ShapeItem;
  panel.id = "title-panel-background";
  panel.name = "信息面板";
  panel.fill = "rgba(19, 43, 64, 0.82)";
  panel.stroke = "rgba(71, 165, 210, 0.45)";
  panel.strokeWidth = 1;
  panel.radius = 12;
  const title = createItem("text", { x: 96, y: 48, w: 1200, h: 94 }) as TextItem;
  title.id = "title-panel-heading";
  title.name = "页面标题";
  title.text = "运营态势总览";
  title.fontSize = 48;
  title.color = "#e9f6ff";
  title.weight = "bold";
  return { id: "title-panel", name: "标题与信息面板", version: 1, description: "标题栏 + 内容面板，可继续拖入图表或指标组件。", items: [panel, title] };
}

function makeKpiBlock(): ComponentBlock {
  const heading = createItem("text", { x: 96, y: 84, w: 1200, h: 66 }) as TextItem;
  heading.id = "kpi-group-heading";
  heading.name = "指标组标题";
  heading.text = "核心指标";
  heading.fontSize = 34;
  heading.color = "#e9f6ff";
  heading.weight = "bold";
  const labels = ["总访问量", "活跃用户", "转化率"];
  const items: ScreenItem[] = [heading];
  labels.forEach((label, index) => {
    const item = createComponentItem(componentRegistry.get("chartforge.kpi", 1)!, {
      x: 96 + index * 404, y: 188, w: 360, h: 188,
    });
    item.id = `kpi-group-${index + 1}`;
    item.name = label;
    item.props = { ...item.props, label };
    items.push(item);
  });
  return { id: "kpi-group", name: "KPI 指标组", version: 1, description: "标题与三个已注册的 KPI 指标卡，可绑定工作区数据集。", items };
}

export const BUILT_IN_BLOCKS: readonly ComponentBlock[] = [makeTitlePanelBlock(), makeKpiBlock()];

export function getThemeById(id: string | undefined): DesignTheme | undefined {
  return BUILT_IN_THEMES.find((theme) => theme.id === id);
}

export function applyThemeToScreen(screen: Screen, theme: DesignTheme): void {
  screen.themeId = theme.id;
  screen.canvas.background = { kind: "color", color: theme.tokens.canvas };
}

export function instantiateComponentBlock(
  block: ComponentBlock,
  offset: { x: number; y: number } = { x: 0, y: 0 },
  createId: (index: number) => string = () => uuid(),
): ScreenItem[] {
  return block.items.map((item, index) => {
    const clone = JSON.parse(JSON.stringify(item)) as ScreenItem;
    clone.id = createId(index);
    clone.frame = { ...clone.frame, x: clone.frame.x + offset.x, y: clone.frame.y + offset.y };
    return clone;
  });
}

/** Add the theme palette only when the chart does not specify its own colors. */
export function applyThemeChartPalette(spec: ChartSpec, palette: readonly string[]): ChartSpec {
  if (!palette.length || Object.prototype.hasOwnProperty.call(spec.option, "color")) return spec;
  return { ...spec, option: { ...spec.option, color: [...palette] } };
}

export function themeCssVariables(theme: DesignTheme | undefined): Record<string, string> {
  if (!theme) return {};
  const style: Record<string, string> = {
    "--cf-panel": theme.tokens.panel,
    "--cf-text": theme.tokens.text,
    "--cf-text-2": theme.tokens.muted,
    "--cf-primary": theme.tokens.accent,
    "--cf-border": theme.tokens.border,
  };
  for (const [key, value] of Object.entries(theme.tokens.titleStyle)) {
    style[`--cf-theme-title-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`] = value;
  }
  for (const [key, value] of Object.entries(theme.tokens.borderStyle)) {
    style[`--cf-theme-border-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`] = value;
  }
  return style;
}
