import type { ChartSpec } from "../model/types";
import { dataToOption } from "./chartData";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * 对象数组逐项合并（配置覆盖层场景：series.0.* 补丁不能冲掉生成的 type/data）；
 * 标量/混合数组整体替换（数据场景）；空覆盖数组视为清空。
 */
function mergeArrays(base: unknown[], overlay: unknown[]): unknown[] {
  if (overlay.length === 0) return [];
  const allObjects = base.every(isPlainObject) && overlay.every(isPlainObject);
  if (!allObjects) return [...overlay];
  const out: unknown[] = [];
  const len = Math.max(base.length, overlay.length);
  for (let i = 0; i < len; i++) {
    const b = base[i];
    const o = overlay[i];
    if (o === undefined) out.push(b);
    else if (isPlainObject(b) && isPlainObject(o)) out.push(deepMerge(b, o));
    else out.push(o);
  }
  return out;
}

export function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = out[key];
    if (Array.isArray(value) && Array.isArray(current)) {
      out[key] = mergeArrays(current, value);
    } else if (isPlainObject(value) && isPlainObject(current)) {
      out[key] = deepMerge(current, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function buildOption(spec: ChartSpec): Record<string, unknown> {
  return deepMerge(dataToOption(spec.data, spec.type), spec.option);
}
