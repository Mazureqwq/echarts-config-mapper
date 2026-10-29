import type { EChartsOptionLike } from "@/types/chart";

/** 深色主题里的浅色文字 → 浅色背景下的深色对应值（键会做小写归一化后匹配） */
const DARK_TO_LIGHT_PAIRS: Array<[string, string]> = [
  ["#E6EAF2", "#1f2937"],
  ["#A7B0C0", "#4b5563"],
  ["#8A94A6", "#6b7280"],
  ["#5F6A7D", "#9ca3af"],
  ["rgba(42,53,80,0.65)", "rgba(148,163,184,0.45)"],
  ["rgba(42,53,80,0.9)", "rgba(148,163,184,0.7)"],
  ["#2A3550", "#d7dde6"],
  ["#111826", "#ffffff"],
  ["rgba(17,24,38,0.95)", "rgba(255,255,255,0.96)"],
  ["#0B0F17", "#ffffff"],
  ["#0E1420", "#ffffff"],
  ["#1B2436", "#eef2f7"],
  ["#39466B", "#c3ccda"],
  ["#1E2A45", "#dde5f0"],
];

const DARK_TO_LIGHT: Record<string, string> = Object.fromEntries(
  DARK_TO_LIGHT_PAIRS.map(([dark, light]) => [dark.toLowerCase(), light]),
);

const LIGHT_TO_DARK: Record<string, string> = Object.fromEntries(
  DARK_TO_LIGHT_PAIRS.map(([dark, light]) => [light.toLowerCase(), dark]),
);

function mapColors<T>(value: T, table: Record<string, string>): T {
  if (typeof value === "string") {
    const mapped = table[value.toLowerCase()];
    return (mapped ?? value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => mapColors(item, table)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = mapColors(val, table);
    }
    return out as unknown as T;
  }
  return value;
}

/** 预览背景切换到浅色时调用：把深色配色里的文字/线条改成浅底可读的深色 */
export function toLightTheme(option: EChartsOptionLike): EChartsOptionLike {
  return mapColors(option, DARK_TO_LIGHT);
}

/** 切回深色背景时还原 */
export function toDarkTheme(option: EChartsOptionLike): EChartsOptionLike {
  return mapColors(option, LIGHT_TO_DARK);
}

export function sameOption(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
