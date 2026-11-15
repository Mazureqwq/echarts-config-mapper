/**
 * T14（P0-1）：复制 / 粘贴样式。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────
 * DataV 7.0 设计库调研（`docs/superpowers/specs/2026-11-15-datav-7-design-library-reference.md` §7）
 * 得出的核心结论：一致性不能只靠「文字规范 / 色彩规范」这种**展示板**——
 * 展示板本身不带约束力。真正让规格落到组件上的是**跨组件的样式复制机制**
 * （DataV 地图面板底部的「复制配置到剪贴板 / 粘贴样式」）。
 *
 * 本模块就是这条执行路径的纯函数内核，工作台 UI 只负责调用它。
 *
 * ── 设计约束 ────────────────────────────────────────────────────────────
 * 1. **只复制外观**：位置、尺寸、旋转、id、名称、`dataBinding` 永不进入载荷，
 *    也永不被粘贴覆写。
 * 2. **不复制数据语义**：字段引用（`valueField` / `labelField` / `columns` /
 *    `rowKey`）与改变数值含义的配置（`aggregation` / `maxValue`）一律排除，
 *    否则「贴个样式」会把别人的数据口径一起带过来。
 * 3. **白名单式排除 + 深拷贝**：载荷与源对象完全解耦。
 * 4. **兼容性前置校验**：签名不一致时明确拒绝并给出可读原因，绝不静默降级。
 * 5. **不可变更新**：`applyStyleToItem` 返回新对象，不改传入的 item。
 */

import type { ChartItem, ComponentItem, ScreenItem } from "../model/types";

/**
 * 永不进入样式载荷的 props 键。
 *
 * 分两类：
 * - **字段引用**：`valueField` / `labelField` / `columns` / `rowKey` —— 指向数据集里的哪一列。
 * - **数据口径**：`aggregation`（first/sum/average 会改变显示数值）、
 *   `maxValue`（进度条量纲，随数据集走）、`layers`（地图图层内嵌 dataBinding）、
 *   `modelVersion`（schema 版本，不是外观）。
 */
export const STYLE_CLIPBOARD_EXCLUDED_KEYS: readonly string[] = Object.freeze([
  "valueField",
  "labelField",
  "columns",
  "rowKey",
  "aggregation",
  "maxValue",
  "layers",
  "modelVersion",
]);

/**
 * 样式族（style family）：允许互相粘贴样式的组件集合。
 *
 * 平面地图与 2.5D 地图是两个不同的 `componentId`，但它们共享同一套
 * `quickStyle` 令牌与地图配置面板。DataV 的「复制配置 / 粘贴样式」正是
 * 跨这种变体使用的，因此把同族组件显式声明出来，而不是按 componentId 死锁。
 *
 * 同族粘贴时，**元素身份类字段**（见 `IDENTITY_KEYS_BY_FAMILY`）不会被来源覆盖：
 * 例如把平面地图的样式贴到 2.5D 地图上，`presentation` 仍保持 `tilted`。
 */
export const STYLE_FAMILIES: Readonly<Record<string, string>> = Object.freeze({
  "chartforge.map-scene-flat": "map-scene",
  "chartforge.map-scene-tilted": "map-scene",
});

/** 同族粘贴时必须保留目标自身值的 props（元素身份，不是外观）。 */
const IDENTITY_KEYS_BY_FAMILY: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // presentation 决定平面/2.5D；pitch 是它的直接后果，
  // 若把平面地图的 pitch=0 贴到 tilted 地图上，会得到「倾斜视角但 pitch 为 0」
  // 的自相矛盾状态，因此二者都算元素身份。
  "map-scene": ["presentation", "pitch"],
});

/** 文本里永不复制的键：文案是内容，不是样式。 */
const TEXT_CONTENT_KEYS: readonly string[] = Object.freeze(["text"]);

/** 形状里永不复制的键：几何类型属于元素本身，不属于外观。 */
const SHAPE_GEOMETRY_KEYS: readonly string[] = Object.freeze(["shape"]);

/** 图表 option 里永不复制的键：数据点属于数据，不属于样式。 */
const CHART_OPTION_DATA_KEYS: readonly string[] = Object.freeze(["dataset"]);

export interface StyleClipboardPayload {
  /**
   * 兼容性签名。只有签名相同的源与目标才允许粘贴：
   * - 组件：`component:<componentId>@<version>`
   * - 图表：`chart:<chartType>`
   * - 文本：`text`
   * - 形状：`shape`
   */
  signature: string;
  /** 人类可读的来源描述，用于 UI 提示「已复制『指标卡』的样式」。 */
  label: string;
  /** 外观载荷（已深拷贝） */
  style: Record<string, unknown>;
}

export type StyleClipboardResult =
  | { ok: true; payload: StyleClipboardPayload }
  | { ok: false; reason: string };

export type StyleApplyResult =
  | { ok: true; item: ScreenItem }
  | { ok: false; reason: string };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickStyleProps(
  props: Record<string, unknown>,
  excluded: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (excluded.includes(key)) continue;
    out[key] = value;
  }
  return out;
}

/** 组件显示名（用于 UI 文案）。未知 id 退回「组件」。 */
const COMPONENT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "chartforge.data-table": "数据表格",
  "chartforge.kpi": "指标卡",
  "chartforge.progress-list": "进度条组",
  "chartforge.section-title": "标题栏",
  "chartforge.corner-frame": "装饰边框",
  "chartforge.map-scene-flat": "平面地图",
  "chartforge.map-scene-tilted": "2.5D 立体地图",
});

/** 图表显示名（用于 UI 文案）。 */
const CHART_LABELS: Readonly<Record<string, string>> = Object.freeze({
  line: "折线图",
  bar: "柱状图",
  pie: "饼图",
  scatter: "散点图",
  radar: "雷达图",
});

/** 供 UI 在「复制样式」按钮上显示目标描述。 */
export function describeStyleClipboardTarget(item: ScreenItem): string {
  switch (item.kind) {
    case "component":
      return COMPONENT_LABELS[item.componentId] ?? "组件";
    case "chart":
      return CHART_LABELS[item.spec?.type as string] ?? "图表";
    case "text":
      return "文本";
    case "shape":
      return "形状";
    default:
      return "元素";
  }
}

/**
 * 从元素抽取样式载荷。
 *
 * 元素类型不受支持时返回 `ok: false` 与可读原因（而不是抛错或返回空载荷）。
 */
export function buildStyleClipboard(item: ScreenItem): StyleClipboardResult {
  switch (item.kind) {
    case "component": {
      const component = item as ComponentItem;
      const props = isRecord(component.props) ? component.props : {};
      return {
        ok: true,
        payload: {
          signature: componentSignature(component.componentId, component.componentVersion),
          label: describeStyleClipboardTarget(item),
          style: clone(pickStyleProps(props, STYLE_CLIPBOARD_EXCLUDED_KEYS)),
        },
      };
    }
    case "chart": {
      const chart = item as ChartItem;
      const option = isRecord(chart.spec?.option) ? chart.spec.option : {};
      const style = pickStyleProps(option, CHART_OPTION_DATA_KEYS);
      // series 里的 data 属于数据点，必须逐项剥离，只留样式字段
      if (Array.isArray(style.series)) {
        style.series = style.series.map((entry) => {
          if (!isRecord(entry)) return entry;
          const next: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(entry)) {
            if (key === "data") continue;
            next[key] = value;
          }
          return next;
        });
      }
      return {
        ok: true,
        payload: {
          signature: `chart:${chart.spec?.type ?? ""}`,
          label: describeStyleClipboardTarget(item),
          style: clone(style),
        },
      };
    }
    case "text": {
      const style = pickStyleProps(item as unknown as Record<string, unknown>, TEXT_CONTENT_KEYS);
      // 位置、尺寸、id、名称等 BaseItem 字段不是样式
      for (const key of ["id", "name", "frame", "kind", "locked", "hidden", "groupId"]) {
        delete style[key];
      }
      return {
        ok: true,
        payload: { signature: "text", label: "文本", style: clone(style) },
      };
    }
    case "shape": {
      const style = pickStyleProps(item as unknown as Record<string, unknown>, SHAPE_GEOMETRY_KEYS);
      for (const key of ["id", "name", "frame", "kind", "locked", "hidden", "groupId"]) {
        delete style[key];
      }
      return {
        ok: true,
        payload: { signature: "shape", label: "形状", style: clone(style) },
      };
    }
    default:
      return { ok: false, reason: "该元素类型不支持复制样式。" };
  }
}

/** 组件的兼容性签名：同族组件共用签名，因此可以互相粘贴样式。 */
function componentSignature(componentId: string, version: number): string {
  const family = STYLE_FAMILIES[componentId] ?? componentId;
  return `component:${family}@${version}`;
}

/** 计算目标元素的兼容性签名，用于与载荷比对。 */
function signatureOf(item: ScreenItem): string {
  switch (item.kind) {
    case "component": {
      const component = item as ComponentItem;
      return componentSignature(component.componentId, component.componentVersion);
    }
    case "chart":
      return `chart:${(item as ChartItem).spec?.type ?? ""}`;
    case "text":
      return "text";
    case "shape":
      return "shape";
    default:
      return "";
  }
}

/**
 * 把样式载荷应用到目标元素。
 *
 * 返回**新对象**，不修改传入的 `item`。位置、尺寸、id、名称、`dataBinding`
 * 以及目标自身的数据语义 props 全部保持不变。
 */
export function applyStyleToItem(
  item: ScreenItem,
  payload: StyleClipboardPayload,
): StyleApplyResult {
  const targetSignature = signatureOf(item);
  if (!targetSignature) {
    return { ok: false, reason: "该元素类型不支持粘贴样式。" };
  }
  if (targetSignature !== payload.signature) {
    return {
      ok: false,
      reason:
        item.kind === "component"
          ? `组件类型不一致：来源为「${payload.label}」，当前为「${describeStyleClipboardTarget(item)}」，样式不能粘贴。`
          : `元素类型不一致：来源为「${payload.label}」，当前为「${describeStyleClipboardTarget(item)}」，样式不能粘贴。`,
    };
  }

  const style = clone(payload.style);
  const cloned = clone(item) as ScreenItem & Record<string, unknown>;

  if (item.kind === "component") {
    const component = cloned as unknown as ComponentItem;
    // 目标自身的数据语义 props 必须保留
    const preserved: Record<string, unknown> = {};
    for (const key of STYLE_CLIPBOARD_EXCLUDED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(component.props, key)) {
        preserved[key] = component.props[key];
      }
    }
    const merged: Record<string, unknown> = { ...style, ...preserved };
    // 同族跨变体粘贴：元素身份字段沿用目标自身
    const family = STYLE_FAMILIES[component.componentId];
    if (family) {
      for (const key of IDENTITY_KEYS_BY_FAMILY[family] ?? []) {
        if (Object.prototype.hasOwnProperty.call(component.props, key)) {
          merged[key] = component.props[key];
        } else {
          delete merged[key];
        }
      }
    }
    component.props = merged;
    return { ok: true, item: component as unknown as ScreenItem };
  }

  if (item.kind === "chart") {
    const chart = cloned as unknown as ChartItem;
    chart.spec = {
      ...chart.spec,
      option: { ...chart.spec.option, ...style },
    };
    return { ok: true, item: chart as unknown as ScreenItem };
  }

  // text / shape：样式字段直接覆盖回元素，内容与几何字段不在载荷里
  for (const [key, value] of Object.entries(style)) {
    cloned[key] = value;
  }
  return { ok: true, item: cloned as unknown as ScreenItem };
}

/**
 * UI 用：判断当前元素能否接受该样式载荷。
 *
 * 与 `applyStyleToItem` 使用同一套签名规则，避免按钮可用态与实际行为不一致。
 */
export function canPasteStyle(
  item: ScreenItem,
  payload: StyleClipboardPayload | null | undefined,
): boolean {
  if (!payload) return false;
  const signature = signatureOf(item);
  return signature !== "" && signature === payload.signature;
}

/** 导出给商店层使用：判断类型别名，避免 UI 重复实现。 */
export type { ScreenItem };
