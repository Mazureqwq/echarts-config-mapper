import type { DesignTheme } from "@/core/design/types";
import type { ComponentThemeToken } from "./types";

export function sanitizeHexColor(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : undefined;
}

export function resolveComponentColor(
  value: unknown,
  token: ComponentThemeToken,
  tokens: Pick<DesignTheme["tokens"], ComponentThemeToken>,
  fallback: string
): string {
  return sanitizeHexColor(value)
    ?? sanitizeHexColor(tokens[token])
    ?? sanitizeHexColor(fallback)
    ?? "#000000";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recursively merge a patch into a base props object; arrays and scalars replace, nested plain objects merge. */
export function deepMergeProps<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") continue;
    const existing = out[key];
    out[key] = isPlainRecord(existing) && isPlainRecord(value) ? deepMergeProps(existing, value) : value;
  }
  return out as T;
}

export function clearComponentColorOverride(
  props: Readonly<Record<string, unknown>>,
  key: string
): Record<string, unknown> {
  const next = { ...props };
  delete next[key];
  return next;
}
