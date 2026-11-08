import { componentRegistry } from "@/core/components/builtins";
import type { ComponentDefinition, ComponentRegistry } from "@/core/components/types";
import type { BlueprintContext, BlueprintGraph, BlueprintNode, BlueprintResult, BlueprintTrigger, ValueRef } from "./types";
import { validateBlueprint } from "./validate";

const RESERVED = new Set(["__proto__", "prototype", "constructor"]);
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function eventDefinition(node: Extract<BlueprintNode, { kind: "componentEvent" }>, registry: ComponentRegistry): ComponentDefinition | undefined {
  return registry.get(node.componentId, node.componentVersion);
}
function payloadMatches(payload: unknown, definition: ComponentDefinition, eventName: string): boolean {
  const event = definition.events.find((entry) => entry.name === eventName);
  if (!event || !isRecord(payload)) return false;
  return Object.entries(event.payloadFields).every(([key, type]) => {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) return false;
    const value = payload[key];
    if (type === "string") return typeof value === "string";
    if (type === "number") return typeof value === "number" && Number.isFinite(value);
    if (type === "boolean") return typeof value === "boolean";
    return isRecord(value) || Array.isArray(value);
  });
}
function eventPath(payload: unknown, path: string): { ok: boolean; value: unknown } {
  let value = payload;
  for (const part of path.split(".")) {
    if (!part || RESERVED.has(part) || !isRecord(value) && !Array.isArray(value)) return { ok: false, value: undefined };
    if (!Object.prototype.hasOwnProperty.call(value, part)) return { ok: false, value: undefined };
    value = (value as Record<string, unknown>)[part];
  }
  return { ok: true, value };
}
function resolveRef(ref: ValueRef, trigger: BlueprintTrigger, context: BlueprintContext): { ok: boolean; value: unknown } {
  if (ref.source === "literal") return { ok: true, value: ref.value };
  if (ref.source === "variable") return { ok: true, value: context.getVariable(ref.name) };
  return eventPath(trigger.payload, ref.path);
}
function compare(op: string, left: unknown, right: unknown): boolean {
  switch (op) {
    case "eq": return left === right;
    case "ne": return left !== right;
    case "gt": return typeof left === "number" && typeof right === "number" ? left > right : typeof left === "string" && typeof right === "string" ? left > right : false;
    case "gte": return typeof left === "number" && typeof right === "number" ? left >= right : typeof left === "string" && typeof right === "string" ? left >= right : false;
    case "lt": return typeof left === "number" && typeof right === "number" ? left < right : typeof left === "string" && typeof right === "string" ? left < right : false;
    case "lte": return typeof left === "number" && typeof right === "number" ? left <= right : typeof left === "string" && typeof right === "string" ? left <= right : false;
    case "contains":
      if (typeof left === "string" && typeof right === "string") return left.includes(right);
      if (Array.isArray(left)) return left.some((entry) => entry === right);
      return isRecord(left) && typeof right === "string" && Object.prototype.hasOwnProperty.call(left, right);
    default: return false;
  }
}
function transform(op: string, value: unknown): { ok: boolean; value: unknown } {
  switch (op) {
    case "toNumber": {
      if (typeof value === "number") return Number.isFinite(value) ? { ok: true, value } : { ok: false, value: undefined };
      if (typeof value !== "string" || !value.trim()) return { ok: false, value: undefined };
      const numeric = Number(value);
      return Number.isFinite(numeric) ? { ok: true, value: numeric } : { ok: false, value: undefined };
    }
    case "toString": {
      if (value === null || value === undefined) return { ok: true, value: "" };
      if (typeof value === "object") {
        try { return { ok: true, value: JSON.stringify(value) ?? "" }; }
        catch { return { ok: false, value: undefined }; }
      }
      return { ok: true, value: String(value) };
    }
    case "uppercase": return typeof value === "string" ? { ok: true, value: value.toUpperCase() } : { ok: false, value: undefined };
    case "lowercase": return typeof value === "string" ? { ok: true, value: value.toLowerCase() } : { ok: false, value: undefined };
    default: return { ok: false, value: undefined };
  }
}
function parameterString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? "";
}
function topologicalOrder(graph: BlueprintGraph): BlueprintNode[] {
  const orderIndex = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    indegree.set(edge.to.nodeId, (indegree.get(edge.to.nodeId) ?? 0) + 1);
    const targets = outgoing.get(edge.from.nodeId) ?? [];
    targets.push(edge.to.nodeId);
    outgoing.set(edge.from.nodeId, targets);
  }
  const ready = graph.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const result: BlueprintNode[] = [];
  while (ready.length) {
    ready.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0) || a.localeCompare(b));
    const id = ready.shift()!;
    const node = nodeMap.get(id);
    if (node) result.push(node);
    for (const target of outgoing.get(id) ?? []) {
      const degree = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, degree);
      if (degree === 0) ready.push(target);
    }
  }
  return result;
}

export async function runBlueprint(
  graph: BlueprintGraph,
  trigger: BlueprintTrigger,
  context: BlueprintContext,
  registry: ComponentRegistry = componentRegistry
): Promise<BlueprintResult> {
  const validation = validateBlueprint(graph, registry);
  if (!validation.ok) return { ok: false, errors: validation.errors, executedNodeIds: [] };
  const roots = graph.nodes.filter((node): node is Extract<BlueprintNode, { kind: "componentEvent" }> => node.kind === "componentEvent" && node.componentId === trigger.componentId && node.componentVersion === trigger.componentVersion && node.event === trigger.event);
  if (!roots.length) return { ok: false, errors: ["蓝图中没有匹配的组件事件入口"], executedNodeIds: [] };
  for (const root of roots) {
    const definition = eventDefinition(root, registry);
    if (!definition || !payloadMatches(trigger.payload, definition, root.event)) {
      return { ok: false, errors: ["事件载荷不符合组件声明的字段类型"], executedNodeIds: [] };
    }
  }
  const edges = new Map<string, Map<string, string>>();
  for (const edge of graph.edges) {
    const ports = edges.get(edge.from.nodeId) ?? new Map<string, string>();
    ports.set(edge.from.port, edge.to.nodeId);
    edges.set(edge.from.nodeId, ports);
  }
  const active = new Set(roots.map((node) => node.id));
  const executedNodeIds: string[] = [];
  try {
    for (const node of topologicalOrder(graph)) {
      if (!active.has(node.id)) continue;
      executedNodeIds.push(node.id);
      let nextPort: string | null = "next";
      switch (node.kind) {
        case "componentEvent":
          break;
        case "setVariable": {
          const resolved = resolveRef(node.value, trigger, context);
          if (!resolved.ok) throw new Error(`事件路径不存在：${node.value.source === "event" ? node.value.path : node.id}`);
          context.setVariable(node.name, resolved.value);
          break;
        }
        case "condition": {
          const left = resolveRef(node.left, trigger, context);
          const right = resolveRef(node.right, trigger, context);
          if (!left.ok || !right.ok) throw new Error(`条件引用的事件路径不存在：${node.id}`);
          nextPort = compare(node.op, left.value, right.value) ? "true" : "false";
          break;
        }
        case "fieldTransform": {
          const input = resolveRef(node.input, trigger, context);
          if (!input.ok) throw new Error(`转换引用的事件路径不存在：${node.id}`);
          const transformed = transform(node.op, input.value);
          if (!transformed.ok) throw new Error(`字段转换失败：${node.op}`);
          context.setVariable(node.outputVariable, transformed.value);
          break;
        }
        case "datasetAction":
          if (node.action === "filter") context.setDatasetFilter(node.datasetId, node.field, context.getVariable(node.globalVariable));
          else if (node.action === "setParams") {
            const parameters: Record<string, string> = {};
            for (const [key, ref] of Object.entries(node.params)) {
              const resolved = resolveRef(ref, trigger, context);
              if (!resolved.ok) throw new Error(`数据集参数引用的事件路径不存在：${key}`);
              parameters[key] = parameterString(resolved.value);
            }
            context.setDatasetParameters(node.datasetId, parameters);
          } else await context.refreshDataset(node.datasetId);
          break;
        case "componentAction":
          if (node.action === "setVisibility") context.setComponentVisibility(node.componentId, node.componentVersion, node.visible);
          else context.setComponentProps(node.componentId, node.componentVersion, node.props);
          break;
        case "navigateScreen":
          context.navigateScreen(node.screenId);
          break;
      }
      const target = nextPort ? edges.get(node.id)?.get(nextPort) : undefined;
      if (target) active.add(target);
    }
    return { ok: true, errors: [], executedNodeIds };
  } catch (cause) {
    return {
      ok: false,
      errors: [cause instanceof Error ? cause.message : String(cause)],
      executedNodeIds,
    };
  }
}
