import type { Frame } from "./types";

export interface TemplateSlot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScreenCanvas {
  width: number;
  height: number;
}

export interface ScreenTemplate {
  id: string;
  name: string;
  description: string;
  slots: (canvas: ScreenCanvas) => TemplateSlot[];
}

/** 画布四周留白与槽位间距 */
export const TEMPLATE_PADDING = 24;
export const TEMPLATE_GAP = 16;
/** 小于这个尺寸的槽位直接丢弃（放不下图表） */
export const MIN_SLOT_SIDE = 40;

/** 占位元素的名字前缀，用于识别与清理模板槽位 */
export const PLACEHOLDER_PREFIX = "图表位";

function inner(canvas: ScreenCanvas) {
  const p = TEMPLATE_PADDING;
  return {
    x: p,
    y: p,
    w: Math.max(0, canvas.width - p * 2),
    h: Math.max(0, canvas.height - p * 2),
  };
}

/** 把可用区域切成 cols × rows，丢弃过小的槽位 */
function grid(canvas: ScreenCanvas, cols: number, rows: number): TemplateSlot[] {
  const area = inner(canvas);
  const gap = TEMPLATE_GAP;
  const cellW = (area.w - gap * (cols - 1)) / cols;
  const cellH = (area.h - gap * (rows - 1)) / rows;
  const slots: TemplateSlot[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const w = Math.round(cellW);
      const h = Math.round(cellH);
      if (w < MIN_SLOT_SIDE || h < MIN_SLOT_SIDE) continue;
      slots.push({
        x: Math.round(area.x + c * (cellW + gap)),
        y: Math.round(area.y + r * (cellH + gap)),
        w,
        h,
      });
    }
  }
  return slots;
}

function mainSide(canvas: ScreenCanvas): TemplateSlot[] {
  const area = inner(canvas);
  const gap = TEMPLATE_GAP;
  const leftW = Math.round((area.w - gap) * 0.62);
  const rightW = Math.round(area.w - gap - leftW);
  const halfH = Math.round((area.h - gap) / 2);
  const slots: TemplateSlot[] = [];
  if (leftW >= MIN_SLOT_SIDE && area.h >= MIN_SLOT_SIDE) {
    slots.push({ x: area.x, y: area.y, w: leftW, h: Math.round(area.h) });
  }
  for (let i = 0; i < 2; i++) {
    if (rightW < MIN_SLOT_SIDE || halfH < MIN_SLOT_SIDE) continue;
    slots.push({
      x: Math.round(area.x + leftW + gap),
      y: Math.round(area.y + i * (halfH + gap)),
      w: rightW,
      h: halfH,
    });
  }
  return slots;
}

function topBanner(canvas: ScreenCanvas): TemplateSlot[] {
  const area = inner(canvas);
  const gap = TEMPLATE_GAP;
  const bannerH = Math.round((area.h - gap) * 0.18);
  const restH = Math.round(area.h - gap - bannerH);
  const slots: TemplateSlot[] = [];
  if (bannerH >= MIN_SLOT_SIDE) {
    slots.push({ x: area.x, y: area.y, w: Math.round(area.w), h: bannerH });
  }
  const cellW = (area.w - gap) / 2;
  const cellH = (restH - gap) / 2;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const w = Math.round(cellW);
      const h = Math.round(cellH);
      if (w < MIN_SLOT_SIDE || h < MIN_SLOT_SIDE) continue;
      slots.push({
        x: Math.round(area.x + c * (cellW + gap)),
        y: Math.round(area.y + bannerH + gap + r * (cellH + gap)),
        w,
        h,
      });
    }
  }
  return slots;
}

export const SCREEN_TEMPLATES: ScreenTemplate[] = [
  {
    id: "blank",
    name: "空白画布",
    description: "从零开始，自由摆放",
    slots: () => [],
  },
  {
    id: "grid-2x2",
    name: "2 × 2 四宫格",
    description: "四个等分区域，适合指标对比",
    slots: (canvas) => grid(canvas, 2, 2),
  },
  {
    id: "main-side",
    name: "1 主 2 辅",
    description: "左侧主图占 6 成，右侧两个辅图",
    slots: mainSide,
  },
  {
    id: "three-cols",
    name: "三列等分",
    description: "三块并排，适合趋势/结构/排名",
    slots: (canvas) => grid(canvas, 3, 1),
  },
  {
    id: "top-banner",
    name: "顶部横幅 + 四宫格",
    description: "顶部放标题或核心指标，下方四个区域",
    slots: topBanner,
  },
];

export function templateById(id: string): ScreenTemplate {
  return SCREEN_TEMPLATES.find((t) => t.id === id) ?? SCREEN_TEMPLATES[0];
}

/** 取模板槽位；未知 id / 空白模板返回空数组 */
export function templateSlots(id: string, canvas: ScreenCanvas): TemplateSlot[] {
  return templateById(id).slots(canvas);
}

/** 两个矩形重叠面积 ÷ 较小者面积（0–1） */
export function overlapRatio(a: Frame, b: Frame): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  const minArea = Math.min(a.w * a.h, b.w * b.h);
  return minArea <= 0 ? 0 : inter / minArea;
}

interface PlaceholderLike {
  id: string;
  kind: string;
  name?: string;
  frame: Frame;
}

export function isPlaceholder(item: { kind: string; name?: string }): boolean {
  return item.kind === "shape" && (item.name ?? "").startsWith(PLACEHOLDER_PREFIX);
}

/** 图表放到哪个位置时，应该清掉哪些模板占位（重叠 ≥ 60%） */
export function placeholdersToClear<T extends PlaceholderLike>(items: T[], frame: Frame): T[] {
  return items.filter((i) => isPlaceholder(i) && overlapRatio(frame, i.frame) >= 0.6);
}
