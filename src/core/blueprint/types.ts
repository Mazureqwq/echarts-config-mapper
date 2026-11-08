export type BlueprintVariableType = "string" | "number" | "boolean" | "object";

export interface BlueprintVariable {
  name: string;
  type: BlueprintVariableType;
  initialValue: unknown;
}

export type ValueRef =
  | { source: "literal"; value: unknown }
  | { source: "event"; path: string }
  | { source: "variable"; name: string };

export interface BlueprintEdge {
  id: string;
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
}

export type BlueprintNode =
  | { id: string; kind: "componentEvent"; componentId: string; componentVersion: number; event: string }
  | { id: string; kind: "setVariable"; name: string; value: ValueRef }
  | { id: string; kind: "condition"; left: ValueRef; op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains"; right: ValueRef }
  | { id: string; kind: "fieldTransform"; input: ValueRef; op: "toNumber" | "toString" | "uppercase" | "lowercase"; outputVariable: string }
  | { id: string; kind: "datasetAction"; action: "filter"; datasetId: string; field: string; globalVariable: string }
  | { id: string; kind: "datasetAction"; action: "setParams"; datasetId: string; params: Record<string, ValueRef> }
  | { id: string; kind: "datasetAction"; action: "refresh"; datasetId: string }
  | { id: string; kind: "componentAction"; action: "setVisibility"; componentId: string; componentVersion: number; visible: boolean }
  | { id: string; kind: "componentAction"; action: "setProps"; componentId: string; componentVersion: number; props: Record<string, unknown> }
  | { id: string; kind: "navigateScreen"; screenId: string };

export interface BlueprintGraph {
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
  variables: BlueprintVariable[];
}

export interface BlueprintTrigger {
  componentId: string;
  componentVersion: number;
  event: string;
  payload: unknown;
}

export interface BlueprintContext {
  getVariable(name: string): unknown;
  setVariable(name: string, value: unknown): void;
  setDatasetFilter(datasetId: string, field: string, value: unknown): void;
  setDatasetParameters(datasetId: string, parameters: Record<string, string>): void;
  refreshDataset(datasetId: string): Promise<void>;
  setComponentVisibility(componentId: string, componentVersion: number, visible: boolean): void;
  setComponentProps(componentId: string, componentVersion: number, props: Record<string, unknown>): void;
  navigateScreen(screenId: string): void;
}

export type BlueprintValidationResult = { ok: true } | { ok: false; errors: string[] };
export interface BlueprintResult {
  ok: boolean;
  errors: string[];
  executedNodeIds: string[];
}
