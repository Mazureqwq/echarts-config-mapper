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

export function clearComponentColorOverride(
  props: Readonly<Record<string, unknown>>,
  key: string
): Record<string, unknown> {
  const next = { ...props };
  delete next[key];
  return next;
}
