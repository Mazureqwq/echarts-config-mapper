import { componentRegistry } from "@/core/components/builtins";
import { createComponentItem, createItem } from "@/core/model/schema";
import { templateSlots, type ScreenCanvas, type TemplateSlot } from "@/core/model/templates";
import { getThemeById } from "@/core/design/library";
import type { ComponentItem, ImageItem, ScreenItem, ShapeItem } from "@/core/model/types";

export type LayoutBackgroundKind = "layout" | "asset";
export type LayoutBackgroundPreviewKey =
  | "monitor-main-side"
  | "monitor-grid-2x2"
  | "monitor-panel-frame"
  | "monitor-title-band"
  | "monitor-corner-accent"
  | "monitor-ring-orbit"
  | "monitor-header-strip"
  | "monitor-data-wave"
  | "monitor-dot-field"
  | "monitor-bracket-frame"
  | "monitor-radar-sweep"
  | "monitor-hex-mesh"
  | "monitor-signal-bars"
  | "monitor-energy-divider"
  | "monitor-vertical-lights"
  | "monitor-corner-nodes"
  | "monitor-status-dots"
  | "monitor-data-path";

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
  { id: "monitor-ring-orbit", kind: "asset", name: "轨道环装饰", description: "原创环形刻度和节点，可用于强调核心指标。", previewKey: "monitor-ring-orbit" },
  { id: "monitor-header-strip", kind: "asset", name: "折线标题饰条", description: "原创折角线条和渐变高亮的标题辅助素材。", previewKey: "monitor-header-strip" },
  { id: "monitor-data-wave", kind: "asset", name: "数据波形", description: "透明底波形线条，适合点缀图表和面板边缘。", previewKey: "monitor-data-wave" },
  { id: "monitor-dot-field", kind: "asset", name: "点阵灯带", description: "紧凑点阵与渐隐横线，可作为边缘信息装饰。", previewKey: "monitor-dot-field" },
  { id: "monitor-bracket-frame", kind: "asset", name: "发光折角框", description: "原创四角描边框，适合叠加在面板周围。", previewKey: "monitor-bracket-frame" },
  { id: "monitor-radar-sweep", kind: "asset", name: "雷达扫描环", description: "同心刻度与扇形扫描光束，适合装饰区域态势图。", previewKey: "monitor-radar-sweep" },
  { id: "monitor-hex-mesh", kind: "asset", name: "蜂巢数据网", description: "轻量六边形网格，可作为科技感面板背景点缀。", previewKey: "monitor-hex-mesh" },
  { id: "monitor-signal-bars", kind: "asset", name: "信号波段", description: "波形与分段信号柱，适合指标卡和标题区域。", previewKey: "monitor-signal-bars" },
  { id: "monitor-energy-divider", kind: "asset", name: "能量分隔线", description: "带中心节点的细线分隔装饰，可拉伸用于分区。", previewKey: "monitor-energy-divider" },
  { id: "monitor-vertical-lights", kind: "asset", name: "竖向刻度灯带", description: "细刻度与发光节点组成的纵向边饰。", previewKey: "monitor-vertical-lights" },
  { id: "monitor-corner-nodes", kind: "asset", name: "节点角标组", description: "四角折线与数据节点，适合强调面板边界。", previewKey: "monitor-corner-nodes" },
  { id: "monitor-status-dots", kind: "asset", name: "状态指示点", description: "点阵与短标签线构成的状态信息装饰。", previewKey: "monitor-status-dots" },
  { id: "monitor-data-path", kind: "asset", name: "数据脉冲路径", description: "多节点折线与微弱轨迹，适合趋势区底部点缀。", previewKey: "monitor-data-path" },
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
  "monitor-ring-orbit": { kind: "svg", w: 240, h: 240 },
  "monitor-header-strip": { kind: "svg", w: 520, h: 88 },
  "monitor-data-wave": { kind: "svg", w: 520, h: 160 },
  "monitor-dot-field": { kind: "svg", w: 360, h: 120 },
  "monitor-bracket-frame": { kind: "svg", w: 360, h: 240 },
  "monitor-radar-sweep": { kind: "svg", w: 280, h: 280 },
  "monitor-hex-mesh": { kind: "svg", w: 420, h: 260 },
  "monitor-signal-bars": { kind: "svg", w: 440, h: 140 },
  "monitor-energy-divider": { kind: "svg", w: 520, h: 72 },
  "monitor-vertical-lights": { kind: "svg", w: 96, h: 360 },
  "monitor-corner-nodes": { kind: "svg", w: 360, h: 240 },
  "monitor-status-dots": { kind: "svg", w: 320, h: 120 },
  "monitor-data-path": { kind: "svg", w: 520, h: 180 },
} as const;

function svgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function vectorAssetSvg(id: string, accent: string): string {
  const common = `xmlns="http://www.w3.org/2000/svg"`;
  if (id === "monitor-ring-orbit") return `<svg ${common} width="240" height="240" viewBox="0 0 240 240"><circle cx="120" cy="120" r="79" fill="none" stroke="${accent}" stroke-opacity=".38" stroke-width="2"/><circle cx="120" cy="120" r="62" fill="none" stroke="${accent}" stroke-opacity=".68" stroke-width="1" stroke-dasharray="3 7"/><path d="M120 18v24M120 198v24M18 120h24M198 120h24" stroke="${accent}" stroke-width="3"/><path d="M46 53l18 18M176 169l18 18M194 53l-18 18M64 169l-18 18" stroke="${accent}" stroke-opacity=".7" stroke-width="2"/><circle cx="120" cy="41" r="4" fill="${accent}"/><circle cx="191" cy="120" r="4" fill="${accent}"/></svg>`;
  if (id === "monitor-header-strip") return `<svg ${common} width="520" height="88" viewBox="0 0 520 88"><defs><linearGradient id="a"><stop stop-color="${accent}" stop-opacity="0"/><stop offset=".22" stop-color="${accent}" stop-opacity=".78"/><stop offset="1" stop-color="${accent}" stop-opacity=".16"/></linearGradient></defs><path d="M4 58h280l26-24h190" fill="none" stroke="url(#a)" stroke-width="3"/><path d="M18 68h246l18-17" fill="none" stroke="${accent}" stroke-opacity=".45"/><path d="M35 16h144l18 18h90" fill="none" stroke="${accent}" stroke-opacity=".22"/><circle cx="310" cy="34" r="4" fill="${accent}"/><path d="M354 28h110" stroke="${accent}" stroke-opacity=".38" stroke-width="1"/></svg>`;
  if (id === "monitor-data-wave") return `<svg ${common} width="520" height="160" viewBox="0 0 520 160"><defs><linearGradient id="w"><stop stop-color="${accent}" stop-opacity="0"/><stop offset=".5" stop-color="${accent}" stop-opacity=".72"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs><path d="M0 102c55 0 65-54 112-54s53 72 99 72 60-60 104-60 55 31 91 31 55-34 114-34" fill="none" stroke="url(#w)" stroke-width="2"/><path d="M0 122c52 0 70-37 112-37s52 50 98 50 61-43 105-43 55 20 91 20 61-24 114-24" fill="none" stroke="${accent}" stroke-opacity=".22"/><circle cx="211" cy="120" r="4" fill="${accent}"/><circle cx="406" cy="91" r="3" fill="${accent}"/></svg>`;
  if (id === "monitor-dot-field") return `<svg ${common} width="360" height="120" viewBox="0 0 360 120"><defs><linearGradient id="d"><stop stop-color="${accent}" stop-opacity="0"/><stop offset=".35" stop-color="${accent}" stop-opacity=".74"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient><pattern id="p" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.4" fill="${accent}" fill-opacity=".66"/></pattern></defs><rect x="12" y="18" width="126" height="84" fill="url(#p)"/><path d="M155 38h190M155 58h142M155 78h170" stroke="url(#d)" stroke-width="2"/><circle cx="155" cy="38" r="3" fill="${accent}"/></svg>`;
  if (id === "monitor-radar-sweep") return `<svg ${common} width="280" height="280" viewBox="0 0 280 280"><defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${accent}" stop-opacity=".46"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs><g fill="none" stroke="${accent}" stroke-opacity=".38"><circle cx="140" cy="140" r="42"/><circle cx="140" cy="140" r="82"/><circle cx="140" cy="140" r="122"/><path d="M18 140h244M140 18v244M54 54l172 172M226 54L54 226" stroke-opacity=".2"/></g><path d="M140 140V18A122 122 0 0 1 250 88Z" fill="url(#s)"/><circle cx="206" cy="86" r="4" fill="${accent}"/><circle cx="140" cy="140" r="5" fill="${accent}"/></svg>`;
  if (id === "monitor-hex-mesh") return `<svg ${common} width="420" height="260" viewBox="0 0 420 260"><defs><pattern id="h" width="44" height="76" patternUnits="userSpaceOnUse"><path d="M11 1h22l11 19v36l-11 19H11L0 56V20Z" fill="none" stroke="${accent}" stroke-opacity=".34"/><circle cx="11" cy="1" r="1.5" fill="${accent}"/></pattern><linearGradient id="fade"><stop stop-color="${accent}" stop-opacity="0"/><stop offset=".5" stop-color="${accent}" stop-opacity=".52"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs><rect width="420" height="260" fill="url(#h)"/><path d="M0 210h108l28-28h88" fill="none" stroke="url(#fade)" stroke-width="2"/><circle cx="224" cy="182" r="4" fill="${accent}"/></svg>`;
  if (id === "monitor-signal-bars") return `<svg ${common} width="440" height="140" viewBox="0 0 440 140"><defs><linearGradient id="b" y2="1"><stop stop-color="${accent}" stop-opacity=".8"/><stop offset="1" stop-color="${accent}" stop-opacity=".08"/></linearGradient></defs><path d="M8 94c38 0 38-48 76-48s38 62 76 62 38-82 76-82 38 68 76 68 38-34 120-34" fill="none" stroke="${accent}" stroke-opacity=".68" stroke-width="2"/><g fill="url(#b)"><rect x="32" y="100" width="8" height="24" rx="2"/><rect x="52" y="82" width="8" height="42" rx="2"/><rect x="72" y="92" width="8" height="32" rx="2"/><rect x="92" y="68" width="8" height="56" rx="2"/><rect x="112" y="86" width="8" height="38" rx="2"/></g><circle cx="236" cy="26" r="4" fill="${accent}"/></svg>`;
  if (id === "monitor-energy-divider") return `<svg ${common} width="520" height="72" viewBox="0 0 520 72"><defs><linearGradient id="l"><stop stop-color="${accent}" stop-opacity="0"/><stop offset=".3" stop-color="${accent}" stop-opacity=".64"/><stop offset=".7" stop-color="${accent}" stop-opacity=".64"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs><path d="M0 36h210l20-12h60l20 12h210" fill="none" stroke="url(#l)" stroke-width="2"/><path d="M28 47h164M328 47h164" stroke="${accent}" stroke-opacity=".22"/><path d="M260 20l16 16-16 16-16-16Z" fill="none" stroke="${accent}" stroke-opacity=".8"/><circle cx="260" cy="36" r="4" fill="${accent}"/></svg>`;
  if (id === "monitor-vertical-lights") return `<svg ${common} width="96" height="360" viewBox="0 0 96 360"><defs><linearGradient id="v" y2="1"><stop stop-color="${accent}" stop-opacity="0"/><stop offset=".25" stop-color="${accent}" stop-opacity=".72"/><stop offset=".75" stop-color="${accent}" stop-opacity=".72"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs><path d="M48 0v360M30 20h36M30 64h24M30 108h36M30 152h24M30 196h36M30 240h24M30 284h36M30 328h24" stroke="url(#v)" stroke-width="2"/><circle cx="48" cy="108" r="5" fill="${accent}"/><circle cx="48" cy="240" r="5" fill="${accent}"/></svg>`;
  if (id === "monitor-corner-nodes") return `<svg ${common} width="360" height="240" viewBox="0 0 360 240"><path d="M22 78V22h72M266 22h72v56M22 162v56h72M266 218h72v-56" fill="none" stroke="${accent}" stroke-opacity=".82" stroke-width="3"/><path d="M22 98V42h52M286 42h52v56M22 142v56h52M286 198h52v-56" fill="none" stroke="${accent}" stroke-opacity=".28"/><circle cx="22" cy="22" r="5" fill="${accent}"/><circle cx="338" cy="218" r="5" fill="${accent}"/><circle cx="94" cy="22" r="2" fill="${accent}"/><circle cx="266" cy="218" r="2" fill="${accent}"/></svg>`;
  if (id === "monitor-status-dots") return `<svg ${common} width="320" height="120" viewBox="0 0 320 120"><defs><linearGradient id="q"><stop stop-color="${accent}" stop-opacity=".7"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs><g fill="${accent}"><circle cx="24" cy="28" r="4"/><circle cx="44" cy="28" r="4" fill-opacity=".65"/><circle cx="64" cy="28" r="4" fill-opacity=".35"/></g><path d="M82 28h210" stroke="url(#q)" stroke-width="2"/><path d="M24 58h130M24 76h196M24 94h164" stroke="${accent}" stroke-opacity=".28" stroke-width="2"/><circle cx="246" cy="76" r="3" fill="${accent}"/></svg>`;
  if (id === "monitor-data-path") return `<svg ${common} width="520" height="180" viewBox="0 0 520 180"><defs><linearGradient id="p" x2="1"><stop stop-color="${accent}" stop-opacity="0"/><stop offset=".45" stop-color="${accent}" stop-opacity=".8"/><stop offset="1" stop-color="${accent}" stop-opacity=".1"/></linearGradient></defs><path d="M0 144h72l34-42 58 18 42-76 66 52 54-22 68 34 50-60h76" fill="none" stroke="url(#p)" stroke-width="3"/><path d="M0 164h520M0 126h520M0 88h520" stroke="${accent}" stroke-opacity=".1"/><g fill="${accent}"><circle cx="106" cy="102" r="4"/><circle cx="206" cy="44" r="5"/><circle cx="272" cy="96" r="4"/><circle cx="394" cy="108" r="4"/></g></svg>`;
  return `<svg ${common} width="360" height="240" viewBox="0 0 360 240"><path d="M24 86V28h74M262 28h74v58M24 154v58h74M262 212h74v-58" fill="none" stroke="${accent}" stroke-opacity=".86" stroke-width="3"/><path d="M24 104V44h54M282 44h54v60M24 136v60h54M282 196h54v-60" fill="none" stroke="${accent}" stroke-opacity=".26" stroke-width="1"/><circle cx="24" cy="28" r="4" fill="${accent}"/><circle cx="336" cy="212" r="4" fill="${accent}"/></svg>`;
}

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
  } else if (asset.kind === "corner-frame") {
    const corner = makeDecoration(COMPONENT_IDS.cornerFrame, frame, "角标装饰条", {
      variant: "corner",
      color: theme.tokens.accent,
    });
    if (!corner) return [];
    item = corner;
  } else {
    const image = createItem("image", frame) as ImageItem;
    image.name = LAYOUT_BACKGROUND_ENTRIES.find((entry) => entry.id === id)?.name ?? "内置装饰";
    image.src = svgDataUrl(vectorAssetSvg(id, theme.tokens.accent));
    image.fit = "fill";
    item = image;
  }

  return validFrame(item.frame, canvas) ? [item] : [];
}
