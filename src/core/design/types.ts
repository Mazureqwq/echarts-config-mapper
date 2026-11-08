import type { ScreenItem } from "@/core/model/types";

export interface ThemeKit {
  id: string;
  name: string;
  description: string;
  tokens: {
    canvas: string;
    panel: string;
    text: string;
    muted: string;
    accent: string;
    border: string;
    chartPalette: string[];
    titleStyle: Record<string, string>;
    borderStyle: Record<string, string>;
  };
}

/** Backwards-friendly descriptive alias used by the canvas/runtime helpers. */
export type DesignTheme = ThemeKit;

export interface ComponentBlock {
  id: string;
  name: string;
  version: number;
  description: string;
  items: ScreenItem[];
}
