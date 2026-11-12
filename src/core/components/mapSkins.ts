export interface MapSkinFill { min: string; mid: string; max: string; empty: string }
export interface MapSkinUnderlay { areaColor: string; borderColor: string; shadowColor: string }
export interface MapSkinTokens {
  background: string;
  fill: MapSkinFill;
  border: { color: string; width: number };
  label: { color: string; size: number; stroke: string };
  emphasis: { areaColor: string; borderColor: string; labelColor: string };
  tooltip: { background: string; borderColor: string; color: string };
  underlay: MapSkinUnderlay[];
}
export interface MapSkin { id: string; name: string; tokens: MapSkinTokens }

/** Original offline-safe skin presets. Applying a skin writes concrete style values (no hidden state). */
export const MAP_SKINS: readonly MapSkin[] = [
  {
    id: "deep-sea",
    name: "深海科技蓝",
    tokens: {
      background: "#081622",
      fill: { min: "#102b3d", mid: "#1c5f8f", max: "#32d6ff", empty: "#0d1a26" },
      border: { color: "#c0f3fb", width: 1 },
      label: { color: "#e7fbff", size: 10, stroke: "#013a4a" },
      emphasis: { areaColor: "#3a95fd", borderColor: "#ffffff", labelColor: "#ffffff" },
      tooltip: { background: "#07121d", borderColor: "#1f2a3a", color: "#e7fbff" },
      underlay: [
        { areaColor: "#051523", borderColor: "#3a95ff", shadowColor: "#3a95ff" },
        { areaColor: "#0a1e30", borderColor: "#41d6ff", shadowColor: "#41d6ff" },
        { areaColor: "#10273a", borderColor: "#b5f3ff", shadowColor: "#8cd3ef" },
      ],
    },
  },
  {
    id: "jade",
    name: "翡翠青绿",
    tokens: {
      background: "#06170f",
      fill: { min: "#0b2b1e", mid: "#178a5a", max: "#5dffb0", empty: "#0a2018" },
      border: { color: "#9ff5cf", width: 1 },
      label: { color: "#eafff5", size: 10, stroke: "#0b3a28" },
      emphasis: { areaColor: "#2fd98a", borderColor: "#ffffff", labelColor: "#ffffff" },
      tooltip: { background: "#071d13", borderColor: "#1f4a35", color: "#eafff5" },
      underlay: [
        { areaColor: "#04150d", borderColor: "#1f9d66", shadowColor: "#1f9d66" },
        { areaColor: "#0a2a1c", borderColor: "#3ad6a0", shadowColor: "#3ad6a0" },
        { areaColor: "#103826", borderColor: "#b8f5d8", shadowColor: "#8cd3b4" },
      ],
    },
  },
  {
    id: "molten",
    name: "熔岩橙红",
    tokens: {
      background: "#1a0b08",
      fill: { min: "#3a1108", mid: "#c2410c", max: "#ff9440", empty: "#2a0d07" },
      border: { color: "#ffc39a", width: 1 },
      label: { color: "#fff1e8", size: 10, stroke: "#4a1c08" },
      emphasis: { areaColor: "#ff7a2f", borderColor: "#ffffff", labelColor: "#ffffff" },
      tooltip: { background: "#1f0e08", borderColor: "#4a2416", color: "#fff1e8" },
      underlay: [
        { areaColor: "#1c0a05", borderColor: "#e2580f", shadowColor: "#e2580f" },
        { areaColor: "#2c1208", borderColor: "#ff8a3d", shadowColor: "#ff8a3d" },
        { areaColor: "#3a1a0c", borderColor: "#ffc39a", shadowColor: "#e8a276" },
      ],
    },
  },
  {
    id: "nebula",
    name: "紫夜星河",
    tokens: {
      background: "#10081f",
      fill: { min: "#241247", mid: "#6d3bd4", max: "#c4a8ff", empty: "#1b0f33" },
      border: { color: "#d7c4ff", width: 1 },
      label: { color: "#f3edff", size: 10, stroke: "#2c1660" },
      emphasis: { areaColor: "#8b5cf6", borderColor: "#ffffff", labelColor: "#ffffff" },
      tooltip: { background: "#150b28", borderColor: "#35245c", color: "#f3edff" },
      underlay: [
        { areaColor: "#150b2c", borderColor: "#7c3aed", shadowColor: "#7c3aed" },
        { areaColor: "#1e1240", borderColor: "#a78bfa", shadowColor: "#a78bfa" },
        { areaColor: "#2a1a55", borderColor: "#d7c4ff", shadowColor: "#b9a3f5" },
      ],
    },
  },
  {
    id: "dawn",
    name: "晨曦浅色",
    tokens: {
      background: "#f4f7fb",
      fill: { min: "#dbe7f5", mid: "#6aa5e8", max: "#1d4ed8", empty: "#eef2f8" },
      border: { color: "#1d4ed8", width: 1 },
      label: { color: "#0f172a", size: 10, stroke: "#ffffff" },
      emphasis: { areaColor: "#2563eb", borderColor: "#0f172a", labelColor: "#ffffff" },
      tooltip: { background: "#ffffff", borderColor: "#cbd5e1", color: "#0f172a" },
      underlay: [
        { areaColor: "#e2e8f0", borderColor: "#93c5fd", shadowColor: "#93c5fd" },
        { areaColor: "#eef2f8", borderColor: "#bfdbfe", shadowColor: "#bfdbfe" },
        { areaColor: "#f8fafc", borderColor: "#1d4ed8", shadowColor: "#93c5fd" },
      ],
    },
  },
];

/**
 * Apply a skin by writing concrete style values onto the props (pure function).
 * Unknown skin ids return the input unchanged; the input is never mutated.
 */
export function applyMapSkin<T extends Record<string, unknown>>(props: T, skinId: string): T {
  const skin = MAP_SKINS.find((entry) => entry.id === skinId);
  if (!skin) return props;
  const rawLayers = Array.isArray(props.layers) ? props.layers : [];
  const layers = rawLayers.map((layer) => {
    if (!layer || typeof layer !== "object" || (layer as { type?: unknown }).type !== "regionFill") return layer;
    const record = layer as Record<string, unknown>;
    const style = record.style && typeof record.style === "object" ? record.style as Record<string, unknown> : {};
    return { ...record, style: { ...style, colorMode: "gradient", colors: { ...skin.tokens.fill } } };
  });
  return {
    ...props,
    view: { ...(props.view && typeof props.view === "object" ? props.view : {}), backgroundColor: skin.tokens.background },
    border: { color: skin.tokens.border.color, width: skin.tokens.border.width, type: "solid" },
    label: { show: true, color: skin.tokens.label.color, size: skin.tokens.label.size, stroke: skin.tokens.label.stroke },
    emphasis: { ...skin.tokens.emphasis },
    tooltipStyle: { ...skin.tokens.tooltip },
    underlay: skin.tokens.underlay.map((entry) => ({ ...entry })),
    appliedSkin: skin.id,
    layers,
  } as T;
}
