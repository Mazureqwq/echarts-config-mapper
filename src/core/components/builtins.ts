import { DEFAULT_FRAME } from "@/core/model/schema";
import { createComponentRegistry } from "./registry";
import type { ComponentAction, ComponentDefinition, LegacyItemKind } from "./types";

const BASE_ACTIONS: readonly ComponentAction[] = [
  { name: "setVisibility", payloadFields: { visible: "boolean" } },
  { name: "setProps", payloadFields: { props: "object" } },
];

const LEGACY_ITEM_KINDS: readonly LegacyItemKind[] = ["chart", "text", "image", "shape"];

export const legacyComponentDefinitions: readonly ComponentDefinition[] = LEGACY_ITEM_KINDS.map(
  (itemKind) => ({
    id: `legacy.${itemKind}`,
    version: 1,
    name: itemKind,
    category: "legacy",
    defaultFrame: { ...DEFAULT_FRAME },
    defaults: {},
    props: [],
    events: [],
    actions: BASE_ACTIONS,
    renderer: { kind: "legacy", itemKind },
    exportRendererId: `legacy-${itemKind}`,
  })
);

export const componentRegistry = createComponentRegistry(legacyComponentDefinitions);
