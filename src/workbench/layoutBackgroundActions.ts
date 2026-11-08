import {
  LAYOUT_BACKGROUND_ENTRIES,
  type LayoutBackgroundEntry,
} from "@/core/design/layoutBackgrounds";
import { DESIGN_DND_MIME } from "@/shared/dnd";

export type LayoutBackgroundDropKind = "layout-background" | "layout-asset";

export interface LayoutBackgroundDropPayload {
  kind: LayoutBackgroundDropKind;
  id: string;
}

export interface LayoutBackgroundActions {
  insertLayoutBackground(id: string): string[];
  insertLayoutAsset(id: string, position?: { x: number; y: number }): string[];
}

function resolveEntry(value: unknown): LayoutBackgroundEntry | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as { id?: unknown; kind?: unknown };
  if (typeof candidate.id !== "string" || (candidate.kind !== "layout" && candidate.kind !== "asset")) return null;
  return LAYOUT_BACKGROUND_ENTRIES.find(
    (entry) => entry.id === candidate.id && entry.kind === candidate.kind
  ) ?? null;
}

function toDropPayload(entry: LayoutBackgroundEntry): LayoutBackgroundDropPayload {
  return {
    kind: entry.kind === "layout" ? "layout-background" : "layout-asset",
    id: entry.id,
  };
}

export function layoutBackgroundDragPayload(
  entry: unknown
): { mime: typeof DESIGN_DND_MIME; data: string } | null {
  const safeEntry = resolveEntry(entry);
  if (!safeEntry) return null;
  return { mime: DESIGN_DND_MIME, data: JSON.stringify(toDropPayload(safeEntry)) };
}

export function parseLayoutBackgroundDragPayload(raw: string): LayoutBackgroundDropPayload | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const payload = value as { kind?: unknown; id?: unknown };
  if (Object.keys(value).length !== 2 || typeof payload.id !== "string") return null;
  if (payload.kind !== "layout-background" && payload.kind !== "layout-asset") return null;
  const kind = payload.kind;
  const entryKind = kind === "layout-background" ? "layout" : "asset";
  if (!LAYOUT_BACKGROUND_ENTRIES.some((entry) => entry.id === payload.id && entry.kind === entryKind)) return null;
  return { kind, id: payload.id };
}

export function insertLayoutBackgroundEntry(
  entry: unknown,
  actions: LayoutBackgroundActions,
  position?: { x: number; y: number }
): string[] {
  const safeEntry = resolveEntry(entry);
  if (!safeEntry) return [];
  return safeEntry.kind === "layout"
    ? actions.insertLayoutBackground(safeEntry.id)
    : actions.insertLayoutAsset(safeEntry.id, position);
}
