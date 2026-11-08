import { componentRegistry } from "@/core/components/builtins";
import { createComponentItem, createItem } from "@/core/model/schema";
import { templateSlots, type ScreenCanvas, type TemplateSlot } from "@/core/model/templates";
import { getThemeById } from "@/core/design/library";
import type { ComponentItem, ScreenItem, ShapeItem } from "@/core/model/types";

export type LayoutBackgroundKind = "layout" | "asset";
export type LayoutBackgroundPreviewKey =
  | "monitor-main-side"
  | "monitor-grid-2x2"
  | "monitor-panel-frame"
  | "monitor-title-band"
  | "monitor-corner-accent";

export interface LayoutBackgroundEntry {
  readonly id: string;
  readonly kind: LayoutBackgroundKind;
  readonly name: string;
  readonly description: string;
  readonly previewKey: LayoutBackgroundPreviewKey;
}

const entries: LayoutBackgroundEntry[] = [
  { id: "monitor-main-side", kind: "layout", name: "主辅分栏", description: "一块主视觉区与两个辅助区，包含深色面板和标题装饰。", previewKey: "monitor-main-side" },
  { id: "monitor-grid-2x2", kind: "layout", name: "2×2 数据区", description: "四块均衡的数据面板，带有轻量角标。", previewKey: "monitor-grid-2x2" },
  { id: "monitor-panel-frame", kind: "asset", name: "信息面板框", description: "单独添加一个深色信息面板底框。", previewKey: "monitor-panel-frame" },
  { id: "monitor-title-band", kind: "asset", name: "标题带", description: "单独添加一个分区标题装饰条。", previewKey: "monitor-title-band" },
  { id: "monitor-corner-accent", kind: "asset", name: "角标装饰条", description: "单独添加一组冷色角标。", previewKey: "monitor-corner-accent" },
];

export const LAYOUT_BACKGROUND_ENTRIES: readonly LayoutBackgroundEntry[] = Object.freeze(
  entries.map((entry) => Object.freeze(entry))
);

const LAYOUTS = {
  "monitor-main-side": { templateId: "main-side", slotCount: 3 },
  "monitor-grid-2x2": { templateId: "grid-2x2", slotCount: 4 },
} as const;

const ASSETS = {
  "monitor-panel-frame": { kind: "shape", w: 480, h: 280 },
  "monitor-title-band": { kind: "section-title", w: 520, h: 72 },
  "monitor-corner-accent": { kind: "corner-frame", w: 260, h: 180 },
} as const;

const theme = getThemeById("monitor-dark");
const COMPONENT_IDS = {
  sectionTitle: "chartforge.section-title",
  cornerFrame: "chartforge.corner-frame",
} as const;

export function listLayoutBackgroundEntries(): readonly LayoutBackgroundEntry[] {
  return LAYOUT_BACKGROUND_ENTRIES;
}

function validCanvas(canvas: ScreenCanvas): boolean {
  return Number.isFinite(canvas.width) && Number.isFinite(canvas.height) && canvas.width >= 8 && canvas.height >= 8;
}

function validFrame(frame: TemplateSlot, canvas: ScreenCanvas): boolean {
  return [frame.x, frame.y, frame.w, frame.h].every(Number.isFinite) &&
    frame.x >= 0 && frame.y >= 0 && frame.w > 0 && frame.h > 0 &&
    frame.x + frame.w <= canvas.width && frame.y + frame.h <= canvas.height;
}

function makePanelBackground(slot: TemplateSlot, name: string): ShapeItem {
  const item = createItem("shape", slot) as ShapeItem;
  item.name = name;
  item.shape = "rect";
  item.fill = theme?.tokens.panel ?? "#0d2234";
  item.stroke = theme?.tokens.border ?? "#214258";
  item.strokeWidth = 1;
  item.radius = 8;
  return item;
}

function makeDecoration(
  componentId: typeof COMPONENT_IDS[keyof typeof COMPONENT_IDS],
  frame: TemplateSlot,
  name: string,
  props: Record<string, unknown>
): ComponentItem | null {
  const definition = componentRegistry.get(componentId, 1);
  if (!definition) return null;
  const item = createComponentItem(definition, frame);
  item.name = name;
  item.props = { ...item.props, ...props };
  return item;
}

function titleForSlot(index: number): string {
  return index === 0 ? "主视区" : `辅助区 ${index}`;
}

export function createLayoutBackgroundItems(id: string, canvas: ScreenCanvas): ScreenItem[] {
  const layout = LAYOUTS[id as keyof typeof LAYOUTS];
  if (!layout || !validCanvas(canvas) || !theme) return [];

  const slots = templateSlots(layout.templateId, canvas);
  if (slots.length !== layout.slotCount || slots.some((slot) => !validFrame(slot, canvas))) return [];

  const items: ScreenItem[] = [];
  for (const [index, slot] of slots.entries()) {
    items.push(makePanelBackground(slot, `底板面板 ${index + 1}`));

    if (id === "monitor-main-side") {
      const titleHeight = Math.min(72, slot.h);
      const title = makeDecoration(
        COMPONENT_IDS.sectionTitle,
        { x: slot.x, y: slot.y, w: slot.w, h: titleHeight },
        `${titleForSlot(index)} 标题带`,
        { title: titleForSlot(index), variant: "bar", accentColor: theme.tokens.accent }
      );
      if (!title) return [];
      items.push(title);
    }

    const corners = makeDecoration(
      COMPONENT_IDS.cornerFrame,
      slot,
      `${titleForSlot(index)} 角标`,
      { variant: "corner", color: theme.tokens.accent }
    );
    if (!corners) return [];
    items.push(corners);
  }

  return items.every((item) => validFrame(item.frame, canvas)) ? items : [];
}

function centeredFrame(
  canvas: ScreenCanvas,
  size: { w: number; h: number },
  position?: { x: number; y: number }
): TemplateSlot | null {
  if (!validCanvas(canvas)) return null;
  if (position && (!Number.isFinite(position.x) || !Number.isFinite(position.y))) return null;

  const w = Math.min(size.w, canvas.width);
  const h = Math.min(size.h, canvas.height);
  if (w <= 0 || h <= 0) return null;
  const centerX = position?.x ?? canvas.width / 2;
  const centerY = position?.y ?? canvas.height / 2;
  const x = Math.min(canvas.width - w, Math.max(0, centerX - w / 2));
  const y = Math.min(canvas.height - h, Math.max(0, centerY - h / 2));
  return { x, y, w, h };
}

export function createLayoutAssetItems(
  id: string,
  canvas: ScreenCanvas,
  position?: { x: number; y: number }
): ScreenItem[] {
  const asset = ASSETS[id as keyof typeof ASSETS];
  if (!asset || !validCanvas(canvas) || !theme) return [];

  const frame = centeredFrame(canvas, asset, position);
  if (!frame) return [];

  let item: ScreenItem;
  if (asset.kind === "shape") {
    item = makePanelBackground(frame, "信息面板框");
  } else if (asset.kind === "section-title") {
    const title = makeDecoration(COMPONENT_IDS.sectionTitle, frame, "标题带", {
      title: "分区标题",
      variant: "bar",
      accentColor: theme.tokens.accent,
    });
    if (!title) return [];
    item = title;
  } else {
    const corner = makeDecoration(COMPONENT_IDS.cornerFrame, frame, "角标装饰条", {
      variant: "corner",
      color: theme.tokens.accent,
    });
    if (!corner) return [];
    item = corner;
  }

  return validFrame(item.frame, canvas) ? [item] : [];
}
