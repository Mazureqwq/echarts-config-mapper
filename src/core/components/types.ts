import type { Component } from "vue";
import type { ChartType, ComponentItem, DatasetSnapshot, Frame } from "@/core/model/types";

export type LegacyItemKind = "chart" | "text" | "image" | "shape";
export type ComponentCatalogGroup = "chart" | "data" | "decoration" | "basic";
export type ComponentThemeToken = "panel" | "text" | "muted" | "accent" | "border";
export type ComponentPayloadFieldType = "string" | "number" | "boolean" | "object";

export interface ComponentCatalogMetadata {
  readonly group: "data" | "decoration";
  readonly description: string;
  readonly tags: readonly string[];
  readonly previewKey: string;
}

export interface ComponentCatalogEntryBase {
  readonly key: string;
  readonly group: ComponentCatalogGroup;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly previewKey: string;
}

export type ComponentCatalogEntry = ComponentCatalogEntryBase & (
  | { readonly source: "chart"; readonly chartType: ChartType }
  | { readonly source: "component"; readonly componentId: string; readonly componentVersion: number }
  | { readonly source: "basic"; readonly itemKind: "text" | "image" | "shape" }
);

export interface ComponentProp {
  readonly key: string;
  readonly label: string;
  readonly type: "string" | "number" | "boolean" | "select" | "json" | "color";
  readonly defaultValue: unknown;
  readonly themeToken?: ComponentThemeToken;
  readonly options?: readonly string[];
}

export interface ComponentEvent {
  readonly name: string;
  readonly payloadFields: Readonly<Record<string, ComponentPayloadFieldType>>;
}

export interface ComponentAction {
  readonly name: string;
  readonly payloadFields: Readonly<Record<string, ComponentPayloadFieldType>>;
}

export type ComponentRenderer =
  | { readonly kind: "vue"; readonly view: Component }
  | { readonly kind: "legacy"; readonly itemKind: LegacyItemKind };

export interface ComponentDefinition {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly category: string;
  readonly catalog?: ComponentCatalogMetadata;
  readonly defaultFrame: Frame;
  readonly defaults: Record<string, unknown>;
  readonly props: readonly ComponentProp[];
  readonly events: readonly ComponentEvent[];
  readonly actions: readonly ComponentAction[];
  readonly renderer: ComponentRenderer;
  readonly exportRendererId: string;
}

export interface ComponentRenderProps {
  item: ComponentItem;
  snapshot: DatasetSnapshot;
  rows: Array<Record<string, unknown>>;
  variables: Readonly<Record<string, unknown>>;
  emitEvent(name: string, payload: unknown): void;
}

export interface ComponentRegistry {
  get(id: string, version: number): ComponentDefinition | undefined;
  list(): readonly ComponentDefinition[];
}
