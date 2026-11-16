/**
 * 内置装饰素材（DataV 设计库风格）。
 *
 * ── 为什么单独开一个模块 ────────────────────────────────────────────────
 * `layoutBackgrounds.ts` 里已有 16 个装饰素材，但它们**平铺**在一列里，
 * 且只有「信息面板框 / 标题带 / 角标装饰条」三个是结构化组件，其余都是
 * 一次性 SVG。用户要「再内置一些边框 / 标题框 / 背景框 / 装饰素材」，
 * 只往那个平铺列表里续条目会越滚越乱。
 *
 * 本模块补的是**分类 + 可复用几何**：
 *   大屏边框（screen-border）→ 整屏外框，插入即贴合画布
 *   标题框（title-frame）  → 分区标题的装饰外框
 *   背景框（panel-frame）  → 数据面板底板
 *   装饰素材（ornament）   → 零散点缀
 *
 * ── 设计约束 ────────────────────────────────────────────────────────────
 * 1. **纯函数**：`decorSvg(id, accent)` 只吃 id 与强调色，返回 SVG 字符串。
 *    没有 DOM、没有随机数、没有时间——同输入必然同输出，可直接单测。
 * 2. **参数化尺寸**：每个条目声明标称尺寸，SVG 的 viewBox 与之相同；
 *    插入到画布时按标称尺寸居中（大屏边框例外，直接铺满画布）。
 * 3. **离线可用**：全部内联 SVG，转成 data URL 后随工作区持久化，
 *    不引用任何外部图片，导出产物同样可用。
 * 4. **不抢戏**：装饰默认低不透明度 + 强调色单色系，避免盖住图表数据。
 *
 * ── 两条交付路径（T18 补充）────────────────────────────────────────────
 * 条目分两类，同处 `DECOR_ENTRIES`、同一套分组筛选：
 *   · **矢量条目**：`decorSvg(id, accent)` 现场画，随主题强调色变化。
 *   · **位图条目**：带 `asset` 字段，指向 `src/assets/decor-png/` 里的成品
 *     PNG（由 `scripts/sync-decor-png.mjs` 内联成数据 URL）。成品素材的
 *     光泽 / 渐变 / 纹理是矢量画不出来的，所以它**不吃强调色**——
 *     `decorSvg()` 对这类 id 一律返回空串，插入时走 `decorPngDataUrl()`。
 * 两条路径产出同一个 `ImageItem` 形状，画布、撤销、收藏、导出都不区分。
 */

import { decorPngDataUrl } from "./decorPng";
import { createItem } from "../model/schema";
import type { ImageItem, ScreenItem } from "../model/types";

export type DecorGroup = "screen-border" | "title-frame" | "panel-frame" | "ornament";

export const DECOR_GROUPS = Object.freeze(["screen-border", "title-frame", "panel-frame", "ornament"] as const);

/** 分组顺序与文案（UI 用它渲染分组标题，顺序即 DataV 的素材分类习惯）。 */
export const DECOR_GROUP_META: readonly { id: DecorGroup; label: string; hint: string }[] = Object.freeze([
  { id: "screen-border", label: "大屏边框", hint: "插入即贴合整屏四边" },
  { id: "title-frame", label: "标题框", hint: "分区标题的装饰外框" },
  { id: "panel-frame", label: "背景框", hint: "数据面板底板" },
  { id: "ornament", label: "装饰素材", hint: "零散点缀与边饰" },
]);

export interface DecorEntry {
  readonly id: string;
  readonly group: DecorGroup;
  readonly name: string;
  readonly description: string;
  /** 标称尺寸；大屏边框忽略它，按画布铺满。PNG 条目等于素材原生像素尺寸。 */
  readonly size: { readonly w: number; readonly h: number };
  /**
   * 成品 PNG 素材的 slug（对应 `src/assets/decor-png/<slug>.png`）。
   * 有值时不走 `decorSvg()`，直接用素材字节，强调色对它无效。
   */
  readonly asset?: string;
}

/** 默认强调色：与 `monitor-dark` 主题的 accent 一致，保证未设主题时观感不跳。 */
export const DEFAULT_DECOR_ACCENT = "#29d3ff";

export const DECOR_ENTRIES: readonly DecorEntry[] = (
  [
    // ── 大屏边框 ──────────────────────────────────────────────────────
    { id: "decor-border-bracket", group: "screen-border", name: "四角折角边框", size: { w: 1600, h: 900 },
      description: "四角折线包边与外缘刻度，指挥中心常用的整屏外框。" },
    { id: "decor-border-scan", group: "screen-border", name: "扫描光带边框", size: { w: 1600, h: 900 },
      description: "双层细边配左右扫光渐变，适合实时监控大屏。" },
    { id: "decor-border-hex", group: "screen-border", name: "六边齿边框", size: { w: 1600, h: 900 },
      description: "上下缘六边形齿状包边，科技感强于直角边框。" },
    { id: "decor-border-glow-seam", group: "screen-border", name: "流光接缝边框", size: { w: 1600, h: 900 },
      description: "四角接缝处带光晕短线，克制但显精致。" },
    { id: "decor-border-tick-rail", group: "screen-border", name: "刻度导轨边框", size: { w: 1600, h: 900 },
      description: "四边等距刻度导轨，像仪表框，适合数据驾驶舱。" },

    // ── 标题框 ────────────────────────────────────────────────────────
    { id: "decor-title-angled", group: "title-frame", name: "斜切标题框", size: { w: 560, h: 76 },
      description: "右端斜切的横幅标题框，经典大屏标题样式。" },
    { id: "decor-title-double-rail", group: "title-frame", name: "双轨标题框", size: { w: 560, h: 76 },
      description: "上下双轨夹住的标题框，两端带收口。" },
    { id: "decor-title-notch", group: "title-frame", name: "缺口标题框", size: { w: 560, h: 76 },
      description: "底部中央留 V 形缺口的标题框，适合居中标题。" },
    { id: "decor-title-capsule", group: "title-frame", name: "六角胶囊标题框", size: { w: 520, h: 72 },
      description: "两端切角的胶囊标题框，配左侧强调块。" },
    { id: "decor-title-taper", group: "title-frame", name: "渐隐锥形标题框", size: { w: 560, h: 64 },
      description: "由左向右渐隐的锥形标题条，适合引导视觉。" },

    // ── 背景框 ────────────────────────────────────────────────────────
    { id: "decor-panel-glass", group: "panel-frame", name: "玻璃面板框", size: { w: 480, h: 300 },
      description: "半透明叠色面板与内侧细线，图表垫在上面不发闷。" },
    { id: "decor-panel-dash", group: "panel-frame", name: "虚线科技面板", size: { w: 480, h: 300 },
      description: "虚线边框配实心四角，弱化边界但仍可辨区。" },
    { id: "decor-panel-cut-corner", group: "panel-frame", name: "切角面板框", size: { w: 480, h: 300 },
      description: "对角切角的面板边框，比直角更利落。" },
    { id: "decor-panel-tab", group: "panel-frame", name: "页签面板框", size: { w: 480, h: 300 },
      description: "左上角带标题页签的面板，页签内可叠文字。" },
    { id: "decor-panel-hex-grid", group: "panel-frame", name: "蜂巢网点面板", size: { w: 480, h: 300 },
      description: "六边形网点底纹面板，适合承载散点与热力。" },
    { id: "decor-panel-wave-foot", group: "panel-frame", name: "波浪底座面板", size: { w: 480, h: 300 },
      description: "底部带波浪弱化的面板，适合堆叠在屏幕下方。" },

    // ── 装饰素材 ──────────────────────────────────────────────────────
    { id: "decor-orn-led-bar", group: "ornament", name: "LED 灯带", size: { w: 300, h: 24 },
      description: "分段渐亮的横向灯带，可重复排列成一组。" },
    { id: "decor-orn-pulse", group: "ornament", name: "脉冲折线", size: { w: 420, h: 80 },
      description: "单段强脉冲折线，用于强调某个指标正在跳变。" },
    { id: "decor-orn-tri-corner", group: "ornament", name: "三角角饰", size: { w: 120, h: 120 },
      description: "三层嵌套三角角饰，贴角放置即可强化边界。" },
    { id: "decor-orn-rings", group: "ornament", name: "同心环组", size: { w: 200, h: 200 },
      description: "同心刻度环与四个节点，适合围绕核心指标。" },
    { id: "decor-orn-dot-grid", group: "ornament", name: "网格点阵", size: { w: 260, h: 160 },
      description: "渐隐点阵方块，可平铺成一块弱纹理。" },
    { id: "decor-orn-flow-arrows", group: "ornament", name: "流向箭头组", size: { w: 480, h: 60 },
      description: "三段虚线箭头，示意数据流向。" },
    { id: "decor-orn-vert-scale", group: "ornament", name: "竖向刻度尺", size: { w: 40, h: 300 },
      description: "细竖向刻度尺，贴面板左右边当仪表边饰。" },

    // ── 成品 PNG 素材（T18）─────────────────────────────────────────────
    // 全部为 CC0 / 内容许可可再分发的成品位图，来源见 src/assets/decor-png/README.md。
    // 标称尺寸 = 素材原生像素尺寸，与 decorPng.ts 里的 IHDR 一致（有测试守着）。
    { id: "decor-png-border-violet", group: "screen-border", asset: "border-violet",
      name: "紫曜光轨边框", size: { w: 1150, h: 618 },
      description: "紫调渐变光轨 + 底部铭牌，成品位图，暗色大屏压得住场。" },
    { id: "decor-png-border-azure", group: "screen-border", asset: "border-azure",
      name: "冰蓝竞技边框", size: { w: 1150, h: 618 },
      description: "冰蓝到宝蓝的金属边条，配底部铭牌，冷色大屏首选。" },
    { id: "decor-png-border-carbon", group: "screen-border", asset: "border-carbon",
      name: "碳纤折角边框", size: { w: 1280, h: 721 },
      description: "黑白碳纤纹理 + 折角切边，中性色可搭配任意主题。" },
    { id: "decor-png-border-neon", group: "screen-border", asset: "border-neon",
      name: "霓虹星环边框", size: { w: 1265, h: 704 },
      description: "双色霓虹发光描边带星簇角饰，适合活动 / 直播类大屏。" },

    { id: "decor-png-title-violet", group: "title-frame", asset: "title-violet",
      name: "紫曜铭牌标题框", size: { w: 1150, h: 71 },
      description: "与紫曜边框同源的底部铭牌，取来当分区标题条。", },
    { id: "decor-png-title-azure", group: "title-frame", asset: "title-azure",
      name: "冰蓝铭牌标题框", size: { w: 1150, h: 71 },
      description: "与冰蓝边框同源的底部铭牌，取来当分区标题条。", },

    { id: "decor-png-panel-violet", group: "panel-frame", asset: "panel-violet",
      name: "紫曜玻璃面板框", size: { w: 520, h: 300 },
      description: "由紫曜边框九宫格缩放而来的面板框，四角不变形。" },
    { id: "decor-png-panel-azure", group: "panel-frame", asset: "panel-azure",
      name: "冰蓝玻璃面板框", size: { w: 520, h: 300 },
      description: "由冰蓝边框九宫格缩放而来的面板框，四角不变形。" },

    { id: "decor-png-orn-stars", group: "ornament", asset: "orn-stars",
      name: "霓虹星簇角饰", size: { w: 144, h: 125 },
      description: "三颗霓虹星星 + 折角光带，贴角点亮画面。" },
    { id: "decor-png-orn-sideline", group: "ornament", asset: "orn-sideline",
      name: "紫曜侧光条", size: { w: 32, h: 190 },
      description: "竖向渐变光条，贴面板左右边当高亮边饰。" },
    { id: "decor-png-orn-ticks", group: "ornament", asset: "orn-ticks",
      name: "碳纤刻度块", size: { w: 175, h: 80 },
      description: "斜切白色刻度块，与碳纤边框同源，可重复排列。" },
  ] as const satisfies readonly DecorEntry[]
).map((entry) => Object.freeze(entry));

const DECOR_INDEX: ReadonlyMap<string, DecorEntry> = new Map(DECOR_ENTRIES.map((entry) => [entry.id, entry]));

export function getDecorEntry(id: string): DecorEntry | undefined {
  return DECOR_INDEX.get(id);
}

/** 是否为成品 PNG 条目（有 `asset` 就走位图路径）。 */
export function isDecorPngEntry(entry: DecorEntry): boolean {
  return typeof entry.asset === "string" && entry.asset.length > 0;
}

export function isDecorId(id: string): boolean {
  return DECOR_INDEX.has(id);
}

export function listDecorEntries(group?: DecorGroup): readonly DecorEntry[] {
  return group ? DECOR_ENTRIES.filter((entry) => entry.group === group) : DECOR_ENTRIES;
}

/** 仅在测试与内部使用：把 accent 收敛成安全的 6 位十六进制，避免注入到 SVG 里。 */
function safeAccent(accent: string): string {
  return /^#[0-9a-f]{6}$/i.test(accent) ? accent : DEFAULT_DECOR_ACCENT;
}

/**
 * `crispStrokes`：让描边不随缩放变细（`vector-effect: non-scaling-stroke`）。
 *
 * 专门给缩略图用——480×300 的装饰缩进 60px 的卡片里，2px 描边会被压成 0.25px，
 * 肉眼看就是一块黑方块。开启后描边按显示像素绘制，缩略图与插入结果都看得清。
 */
function wrap(w: number, h: number, body: string, crispStrokes = false): string {
  const style = crispStrokes
    ? '<style>path,rect,circle,line,polyline,polygon{vector-effect:non-scaling-stroke}</style>'
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${style}${body}</svg>`;
}

/** 生成等距刻度线（沿水平或垂直方向）。 */
function ticks(count: number, from: number, to: number, make: (pos: number) => string): string {
  const step = (to - from) / Math.max(1, count - 1);
  let out = "";
  for (let i = 0; i < count; i += 1) out += make(from + step * i);
  return out;
}

/**
 * 装饰几何。
 *
 * 每个分支只依赖 `(accent, w, h)`，因此同输入必然同输出——可安全缓存、
 * 可直接单测「SVG 里是否含预期图元」。
 */
export interface DecorSvgOptions {
  /** 描边不随缩放变细，供缩略图使用（见 `wrap` 的说明）。 */
  readonly crispStrokes?: boolean;
}

export function decorSvg(
  id: string,
  accent: string = DEFAULT_DECOR_ACCENT,
  options: DecorSvgOptions = {}
): string {
  const entry = DECOR_INDEX.get(id);
  if (!entry) return "";
  const a = safeAccent(accent);
  const w = entry.size.w;
  const h = entry.size.h;
  const inset = 18;

  switch (id) {
    case "decor-border-bracket": {
      const L = Math.min(110, Math.round(w / 9));
      const corner = (x: number, y: number, sx: number, sy: number) =>
        `<path d="M${x} ${y + sy * L}V${y}H${x + sx * L}" fill="none" stroke="${a}" stroke-width="3" stroke-linecap="square"/>`;
      const body =
        `<rect x="${inset}" y="${inset}" width="${w - inset * 2}" height="${h - inset * 2}" fill="none" stroke="${a}" stroke-opacity=".28"/>` +
        corner(inset, inset, 1, 1) + corner(w - inset, inset, -1, 1) +
        corner(inset, h - inset, 1, -1) + corner(w - inset, h - inset, -1, -1) +
        ticks(21, inset + 60, w - inset - 60, (x) => `<path d="M${x} ${inset}h6" stroke="${a}" stroke-opacity=".45"/>`) +
        ticks(13, inset + 60, h - inset - 60, (y) => `<path d="M${inset} ${y}v6" stroke="${a}" stroke-opacity=".45"/>`) +
        `<path d="M${w / 2 - 10} ${inset}l10 10 10-10" fill="none" stroke="${a}" stroke-width="2"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-border-scan": {
      const g =
        `<defs><linearGradient id="scanL" x1="0" x2="1"><stop stop-color="${a}" stop-opacity=".55"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></linearGradient>` +
        `<linearGradient id="scanR" x1="1" x2="0"><stop stop-color="${a}" stop-opacity=".55"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></linearGradient></defs>`;
      const body =
        g +
        `<rect x="14" y="14" width="${w - 28}" height="${h - 28}" fill="none" stroke="${a}" stroke-opacity=".62" stroke-width="2"/>` +
        `<rect x="22" y="22" width="${w - 44}" height="${h - 44}" fill="none" stroke="${a}" stroke-opacity=".2"/>` +
        `<rect x="14" y="14" width="${Math.round(w * 0.22)}" height="3" fill="url(#scanL)"/>` +
        `<rect x="${w - 14 - Math.round(w * 0.22)}" y="${h - 17}" width="${Math.round(w * 0.22)}" height="3" fill="url(#scanR)"/>` +
        [[14, 14], [w - 30, 14], [14, h - 30], [w - 30, h - 30]]
          .map(([x, y]) => `<rect x="${x}" y="${y}" width="16" height="16" fill="none" stroke="${a}" stroke-opacity=".85"/>`)
          .join("");
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-border-hex": {
      const step = 56;
      const hex = (x: number, y: number) =>
        `<path d="M${x} ${y - 7}l8 7-8 7-8-7Z" fill="none" stroke="${a}" stroke-opacity=".7"/>`;
      const body =
        `<rect x="12" y="12" width="${w - 24}" height="${h - 24}" fill="none" stroke="${a}" stroke-opacity=".35"/>` +
        ticks(Math.floor(w / step), 40, w - 40, (x) => hex(x, 12) + hex(x, h - 12)) +
        ticks(Math.floor(h / step), 40, h - 40, (y) => hex(12, y) + hex(w - 12, y));
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-border-glow-seam": {
      const g =
        `<defs><linearGradient id="seam" x1="0" x2="1"><stop stop-color="${a}" stop-opacity="0"/><stop offset=".5" stop-color="${a}" stop-opacity=".9"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></linearGradient></defs>`;
      const seamH = (x: number, y: number) => `<path d="M${x} ${y}h120" stroke="url(#seam)" stroke-width="2"/>`;
      const seamV = (x: number, y: number) => `<path d="M${x} ${y}v90" stroke="url(#seam)" stroke-width="2"/>`;
      const body =
        g +
        `<rect x="20" y="20" width="${w - 40}" height="${h - 40}" fill="none" stroke="${a}" stroke-opacity=".24" stroke-width="2"/>` +
        seamH(20, 20) + seamH(w - 140, h - 20) + seamV(20, 20) + seamV(w - 20, h - 110) +
        `<circle cx="20" cy="20" r="4" fill="${a}"/><circle cx="${w - 20}" cy="${h - 20}" r="4" fill="${a}"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-border-tick-rail": {
      const body =
        `<rect x="26" y="26" width="${w - 52}" height="${h - 52}" fill="none" stroke="${a}" stroke-opacity=".22"/>` +
        `<path d="M26 26H${w - 26}M26 ${h - 26}H${w - 26}M26 26V${h - 26}M${w - 26} 26V${h - 26}" stroke="${a}" stroke-opacity=".55" stroke-dasharray="26 10"/>` +
        ticks(37, 26, w - 26, (x) => `<path d="M${x} 26v${Math.abs((x - w / 2) / (w / 2)) * 6 + 4}" stroke="${a}" stroke-opacity=".7"/>`) +
        `<circle cx="26" cy="26" r="5" fill="${a}"/><circle cx="${w - 26}" cy="${h - 26}" r="5" fill="${a}"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-title-angled": {
      const g =
        `<defs><linearGradient id="band" x1="0" x2="1"><stop stop-color="${a}" stop-opacity=".26"/><stop offset=".72" stop-color="${a}" stop-opacity=".08"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></linearGradient></defs>`;
      const body =
        g +
        `<path d="M2 8H${w - 132}L${w - 96} ${h / 2}L${w - 132} ${h - 8}H2Z" fill="url(#band)" stroke="${a}" stroke-opacity=".82" stroke-width="2"/>` +
        `<rect x="2" y="8" width="5" height="${h - 16}" fill="${a}"/>` +
        `<path d="M22 ${h - 16}h${w - 210}" stroke="${a}" stroke-opacity=".3"/>` +
        `<circle cx="${w - 62}" cy="${h / 2}" r="5" fill="${a}"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-title-double-rail": {
      const rail = (y: number, op: number) =>
        `<path d="M14 ${y}H${w - 26}l12-8" fill="none" stroke="${a}" stroke-opacity="${op}" stroke-width="2"/>`;
      const body =
        rail(12, 0.85) + rail(h - 6, 0.42) +
        `<path d="M14 12v${h - 18}" stroke="${a}" stroke-opacity=".85" stroke-width="3"/>` +
        ticks(4, 46, 190, (x) => `<circle cx="${x}" cy="12" r="2.5" fill="${a}" fill-opacity=".8"/>`) +
        `<rect x="${w - 132}" y="${h - 26}" width="106" height="14" fill="none" stroke="${a}" stroke-opacity=".5"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-title-notch": {
      const mid = w / 2;
      const body =
        `<path d="M6 6H${mid - 34}L${mid} 20L${mid + 34} 6H${w - 6}V${h - 6}H${mid + 34}L${mid} ${h - 20}L${mid - 34} ${h - 6}H6Z" fill="none" stroke="${a}" stroke-opacity=".72" stroke-width="2"/>` +
        `<path d="M${mid - 22} 6L${mid} 16L${mid + 22} 6" fill="none" stroke="${a}"/>` +
        `<path d="M${mid - 22} ${h - 6}L${mid} ${h - 16}L${mid + 22} ${h - 6}" fill="none" stroke="${a}" stroke-opacity=".4"/>` +
        `<rect x="6" y="6" width="62" height="${h - 12}" fill="${a}" fill-opacity=".14"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-title-capsule": {
      const cut = 26;
      const body =
        `<path d="M${cut} 4H${w - cut}l${cut} ${h / 2 - 4}-${cut} ${h / 2 - 4}H${cut}L0 ${h / 2}Z" fill="${a}" fill-opacity=".1" stroke="${a}" stroke-opacity=".8" stroke-width="2"/>` +
        `<path d="M${cut + 14} ${h / 2}h${Math.round(w * 0.3)}" stroke="${a}" stroke-opacity=".55" stroke-width="3"/>` +
        `<rect x="${cut + 14}" y="${h / 2 + 9}" width="${Math.round(w * 0.18)}" height="3" fill="${a}" fill-opacity=".3"/>` +
        `<circle cx="${w - cut - 22}" cy="${h / 2}" r="4" fill="${a}"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-title-taper": {
      const g =
        `<defs><linearGradient id="taper" x1="0" x2="1"><stop stop-color="${a}" stop-opacity=".85"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></linearGradient></defs>`;
      const body =
        g +
        `<path d="M0 ${h / 2}H${w - 40}" stroke="url(#taper)" stroke-width="6" stroke-linecap="round"/>` +
        `<path d="M0 ${h / 2 - 14}H${Math.round(w * 0.62)}" stroke="url(#taper)" stroke-width="2"/>` +
        `<path d="M0 ${h / 2 + 14}H${Math.round(w * 0.42)}" stroke="url(#taper)" stroke-width="2"/>` +
        `<circle cx="6" cy="${h / 2}" r="6" fill="${a}"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-panel-glass": {
      const g =
        `<defs><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}" stop-opacity=".16"/><stop offset="1" stop-color="${a}" stop-opacity=".04"/></linearGradient></defs>`;
      const body =
        g +
        `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="10" fill="url(#glass)" stroke="${a}" stroke-opacity=".5"/>` +
        `<rect x="10" y="10" width="${w - 20}" height="${h - 20}" rx="6" fill="none" stroke="${a}" stroke-opacity=".16"/>` +
        `<path d="M2 34V12a10 10 0 0 1 10-10h22" fill="none" stroke="${a}" stroke-opacity=".9" stroke-width="2"/>` +
        `<path d="M${w - 34} ${h - 2}h22a10 10 0 0 0 10-10V${h - 34}" fill="none" stroke="${a}" stroke-opacity=".9" stroke-width="2"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-panel-dash": {
      const body =
        `<rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="none" stroke="${a}" stroke-opacity=".55" stroke-dasharray="7 6"/>` +
        `<rect x="8" y="8" width="46" height="3" fill="${a}" fill-opacity=".8"/>` +
        `<rect x="${w - 54}" y="${h - 11}" width="46" height="3" fill="${a}" fill-opacity=".8"/>` +
        `<path d="M8 8h16M8 8v16M${w - 8} ${h - 8}h-16M${w - 8} ${h - 8}v-16" stroke="${a}" stroke-width="2"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-panel-cut-corner": {
      const c = 26;
      const body =
        `<path d="M2 ${c}L${c} 2H${w - 2}V${h - c}L${w - c} ${h - 2}H2Z" fill="none" stroke="${a}" stroke-opacity=".6" stroke-width="2"/>` +
        `<path d="M2 ${c}L${c} 2M${w - 2} ${h - c}L${w - c} ${h - 2}" stroke="${a}" stroke-width="3"/>` +
        `<path d="M${c + 12} 2v10H2" fill="none" stroke="${a}" stroke-opacity=".25"/>` +
        `<path d="M${w - c - 12} ${h - 2}v-10H${w - 2}" fill="none" stroke="${a}" stroke-opacity=".25"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-panel-tab": {
      const tw = Math.min(180, Math.round(w * 0.42));
      const body =
        `<path d="M2 2H${tw}l18 18v${h - 20}H2Z" fill="${a}" fill-opacity=".07"/>` +
        `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" fill="none" stroke="${a}" stroke-opacity=".5"/>` +
        `<path d="M2 2H${tw}l18 18" fill="none" stroke="${a}" stroke-width="2"/>` +
        `<rect x="14" y="10" width="${Math.round(tw * 0.52)}" height="3" fill="${a}" fill-opacity=".7"/>` +
        `<path d="M2 ${h - 26}h${Math.round(w * 0.24)}" stroke="${a}" stroke-opacity=".35"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-panel-hex-grid": {
      const g =
        `<defs><pattern id="hexp" width="40" height="70" patternUnits="userSpaceOnUse"><path d="M10 1h20l10 17v34l-10 17H10L0 52V18Z" fill="none" stroke="${a}" stroke-opacity=".3"/><circle cx="10" cy="1" r="1.6" fill="${a}" fill-opacity=".6"/></pattern></defs>`;
      const body =
        g +
        `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" fill="url(#hexp)"/>` +
        `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" fill="none" stroke="${a}" stroke-opacity=".5"/>` +
        `<path d="M${w - 34} 2h32v32" fill="none" stroke="${a}" stroke-opacity=".8" stroke-width="2"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-panel-wave-foot": {
      const g =
        `<defs><linearGradient id="wave" x1="0" x2="1"><stop stop-color="${a}" stop-opacity="0"/><stop offset=".5" stop-color="${a}" stop-opacity=".7"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></linearGradient></defs>`;
      const baseY = h - 30;
      const body =
        g +
        `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" fill="none" stroke="${a}" stroke-opacity=".45"/>` +
        `<path d="M2 ${baseY}c${w * 0.16} 0 ${w * 0.2} -20 ${w * 0.36} -20s${w * 0.18} 20 ${w * 0.34} 20 ${w * 0.2} -14 ${w * 0.28} -14" fill="none" stroke="url(#wave)" stroke-width="2"/>` +
        `<path d="M2 ${h - 12}c${w * 0.22} 0 ${w * 0.3} -12 ${w * 0.5} -12s${w * 0.26} 12 ${w * 0.48} 12" fill="none" stroke="${a}" stroke-opacity=".2"/>` +
        `<path d="M2 2h${Math.round(w * 0.3)}" stroke="${a}" stroke-opacity=".8" stroke-width="2"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-orn-led-bar": {
      const g =
        `<defs><linearGradient id="led" x1="0" x2="1"><stop stop-color="${a}" stop-opacity=".9"/><stop offset=".5" stop-color="${a}" stop-opacity=".35"/><stop offset="1" stop-color="${a}" stop-opacity=".9"/></linearGradient></defs>`;
      const body =
        g +
        `<rect x="1" y="7" width="${w - 2}" height="10" rx="5" fill="none" stroke="${a}" stroke-opacity=".45"/>` +
        `<rect x="6" y="10" width="${w - 12}" height="4" rx="2" fill="url(#led)"/>` +
        ticks(7, 16, w - 16, (x) => `<path d="M${x} 4v16" stroke="${a}" stroke-opacity=".5"/>`);
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-orn-pulse": {
      const g =
        `<defs><linearGradient id="pulse" x1="0" x2="1"><stop stop-color="${a}" stop-opacity=".1"/><stop offset=".42" stop-color="${a}" stop-opacity=".95"/><stop offset="1" stop-color="${a}" stop-opacity=".12"/></linearGradient></defs>`;
      const body =
        g +
        `<path d="M0 ${h * 0.62}H${w * 0.26}L${w * 0.33} ${h * 0.16}L${w * 0.42} ${h * 0.86}L${w * 0.5} ${h * 0.42}H${w}" fill="none" stroke="url(#pulse)" stroke-width="2.5"/>` +
        `<path d="M0 ${h * 0.82}H${w}" stroke="${a}" stroke-opacity=".16"/>` +
        `<circle cx="${w * 0.42}" cy="${h * 0.86}" r="4" fill="${a}"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-orn-tri-corner": {
      const body =
        `<path d="M6 6h${w - 12}" stroke="${a}" stroke-opacity=".9" stroke-width="3"/>` +
        `<path d="M6 6v${h - 12}" stroke="${a}" stroke-opacity=".9" stroke-width="3"/>` +
        `<path d="M6 6L${w * 0.62} ${h * 0.62}" stroke="${a}" stroke-opacity=".3"/>` +
        `<path d="M6 ${h * 0.46}V${h * 0.52}L${w * 0.46} 6" fill="none" stroke="${a}" stroke-opacity=".55" stroke-width="2"/>` +
        `<path d="M6 ${h * 0.74}V${h * 0.8}L${w * 0.24} 6" fill="none" stroke="${a}" stroke-opacity=".3"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-orn-rings": {
      const c = w / 2;
      const body =
        `<circle cx="${c}" cy="${c}" r="${c - 6}" fill="none" stroke="${a}" stroke-opacity=".24"/>` +
        `<circle cx="${c}" cy="${c}" r="${c * 0.72}" fill="none" stroke="${a}" stroke-opacity=".55" stroke-dasharray="4 8"/>` +
        `<circle cx="${c}" cy="${c}" r="${c * 0.42}" fill="none" stroke="${a}" stroke-opacity=".4"/>` +
        `<circle cx="${c}" cy="${c}" r="5" fill="${a}"/>` +
        `<path d="M${c} 6v14M${c} ${h - 6}v-14M6 ${c}h14M${w - 6} ${c}h-14" stroke="${a}" stroke-width="3"/>` +
        `<circle cx="${c}" cy="${c - c * 0.72}" r="3.5" fill="${a}"/><circle cx="${c + c * 0.72}" cy="${c}" r="3.5" fill="${a}"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-orn-dot-grid": {
      const g =
        `<defs><pattern id="dots" width="13" height="13" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.5" fill="${a}" fill-opacity=".7"/></pattern>` +
        `<linearGradient id="fade" x1="0" x2="1"><stop stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
        `<mask id="m"><rect width="${w}" height="${h}" fill="url(#fade)"/></mask></defs>`;
      const body =
        g +
        `<rect width="${w}" height="${h}" fill="url(#dots)" mask="url(#m)"/>` +
        `<path d="M0 ${h - 1}h${w}" stroke="${a}" stroke-opacity=".3"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-orn-flow-arrows": {
      const arrow = (x: number) =>
        `<path d="M${x} ${h / 2}h44l-9-9M${x + 44} ${h / 2}l-9 9" fill="none" stroke="${a}" stroke-opacity=".85" stroke-width="2"/>`;
      const body =
        `<path d="M0 ${h / 2}h${w}" stroke="${a}" stroke-opacity=".16" stroke-dasharray="3 6"/>` +
        arrow(w * 0.12) + arrow(w * 0.42) + arrow(w * 0.72) +
        `<circle cx="${w * 0.08}" cy="${h / 2}" r="3.5" fill="${a}"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    case "decor-orn-vert-scale": {
      const body =
        `<path d="M${w - 12} 2v${h - 4}" stroke="${a}" stroke-opacity=".55"/>` +
        ticks(17, 6, h - 6, (y) => `<path d="M${w - 12} ${y}h${y % 2 === 0 ? 8 : 5}" stroke="${a}" stroke-opacity=".7"/>`) +
        `<rect x="${w - 12}" y="${h * 0.36}" width="3" height="${h * 0.2}" fill="${a}"/>`;
      return wrap(w, h, body, options.crispStrokes);
    }

    default:
      return "";
  }
}

function svgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function validCanvas(canvas: { width: number; height: number }): boolean {
  return Number.isFinite(canvas.width) && Number.isFinite(canvas.height) && canvas.width >= 8 && canvas.height >= 8;
}

export interface DecorInsertOptions {
  /** 落点中心；缺省则居中。大屏边框忽略它。 */
  readonly position?: { x: number; y: number };
  readonly accent?: string;
}

/**
 * 把装饰条目实例化为画布元素。
 *
 * 大屏边框铺满画布（插入即贴合四边）；其余按标称尺寸居中，
 * 落点会被夹在画布内，避免插到屏幕外找不回来。
 */
export function createDecorItems(
  id: string,
  canvas: { width: number; height: number },
  options: DecorInsertOptions = {}
): ScreenItem[] {
  const entry = getDecorEntry(id);
  if (!entry || !validCanvas(canvas)) return [];
  const position = options.position;
  if (position && (!Number.isFinite(position.x) || !Number.isFinite(position.y))) return [];

  const source = isDecorPngEntry(entry)
    ? decorPngDataUrl(entry.asset as string)
    : (() => {
        const svg = decorSvg(id, options.accent ?? DEFAULT_DECOR_ACCENT);
        return svg ? svgDataUrl(svg) : undefined;
      })();
  if (!source) return [];

  let w = Math.min(entry.size.w, canvas.width);
  let h = Math.min(entry.size.h, canvas.height);
  let x = 0;
  let y = 0;

  if (entry.group === "screen-border") {
    // 整屏外框：严格铺满，位置概念对它没有意义
    w = canvas.width;
    h = canvas.height;
  } else {
    const centerX = position?.x ?? canvas.width / 2;
    const centerY = position?.y ?? canvas.height / 2;
    x = Math.min(canvas.width - w, Math.max(0, Math.round(centerX - w / 2)));
    y = Math.min(canvas.height - h, Math.max(0, Math.round(centerY - h / 2)));
  }

  const item = createItem("image", { x, y, w, h }) as ImageItem;
  item.name = entry.name;
  item.src = source;
  item.fit = "fill";
  return [item];
}
