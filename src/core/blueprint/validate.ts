import type { ComponentDefinition, ComponentRegistry, ComponentProp } from "@/core/components/types";
import type { BlueprintGraph, BlueprintNode, BlueprintValidationResult, BlueprintVariable } from "./types";

const MAX_NODES = 200;
const MAX_EDGES = 500;
const MAX_VARIABLES = 100;
const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const NODE_KINDS = new Set(["componentEvent", "setVariable", "condition", "fieldTransform", "datasetAction", "componentAction", "navigateScreen"]);
const CONDITION_OPS = new Set(["eq", "ne", "gt", "gte", "lt", "lte", "contains"]);
const TRANSFORM_OPS = new Set(["toNumber", "toString", "uppercase", "lowercase"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256;
}
function isSafeJson(value: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 10000 && value.every((entry) => isSafeJson(entry, depth + 1));
  if (!isRecord(value)) return false;
  return Object.keys(value).length <= 10000 && Object.entries(value).every(([key, entry]) => !FORBIDDEN_KEYS.has(key) && isSafeJson(entry, depth + 1));
}
function variableValueMatches(variable: BlueprintVariable, value: unknown): boolean {
  switch (variable.type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "object": return isSafeJson(value) && (value === null || typeof value === "object");
  }
}
function propValueMatches(prop: ComponentProp, value: unknown): boolean {
  switch (prop.type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "select": return typeof value === "string" && !!prop.options?.includes(value);
    case "json": return isSafeJson(value);
  }
}
function definitionFor(node: { componentId?: unknown; componentVersion?: unknown }, registry: ComponentRegistry): ComponentDefinition | undefined {
  return typeof node.componentId === "string" && typeof node.componentVersion === "number"
    ? registry.get(node.componentId, node.componentVersion)
    : undefined;
}
function validRef(value: unknown, vars: Map<string, BlueprintVariable>, eventNodes: BlueprintNode[], registry: ComponentRegistry): string[] {
  const errors: string[] = [];
  if (!isRecord(value) || typeof value.source !== "string") return ["值引用格式无效"];
  if (value.source === "literal") {
    if (!isSafeJson(value.value)) errors.push("字面值必须是有限且可序列化的 JSON 值");
    return errors;
  }
  if (value.source === "variable") {
    if (typeof value.name !== "string" || !vars.has(value.name)) errors.push(`引用了未声明变量：${String(value.name)}`);
    return errors;
  }
  if (value.source !== "event" || typeof value.path !== "string") return ["值引用来源无效"];
  const parts = value.path.split(".");
  if (!parts.length || parts.length > 16 || parts.some((part) => !SAFE_NAME.test(part) || FORBIDDEN_KEYS.has(part))) {
    errors.push(`事件路径不安全：${value.path}`);
    return errors;
  }
  const root = parts[0];
  const hasPayloadField = eventNodes.some((node) => {
    if (node.kind !== "componentEvent") return false;
    const definition = definitionFor(node, registry);
    const fieldType = definition?.events.find((event) => event.name === node.event)?.payloadFields[root];
    return fieldType !== undefined && (parts.length === 1 || fieldType === "object");
  });
  if (!hasPayloadField) errors.push(`事件路径不属于任何声明的事件载荷：${value.path}`);
  return errors;
}

export function validateBlueprint(graph: BlueprintGraph, registry: ComponentRegistry): BlueprintValidationResult {
  const errors: string[] = [];
  const raw = graph as unknown;
  if (!isRecord(raw) || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges) || !Array.isArray(raw.variables)) {
    return { ok: false, errors: ["蓝图必须包含 nodes、edges 和 variables 数组"] };
  }
  const nodes = raw.nodes;
  const edges = raw.edges;
  const variableEntries = raw.variables;
  if (nodes.length > MAX_NODES) errors.push(`节点数量不能超过 ${MAX_NODES}`);
  if (edges.length > MAX_EDGES) errors.push(`连线数量不能超过 ${MAX_EDGES}`);
  if (variableEntries.length > MAX_VARIABLES) errors.push(`变量数量不能超过 ${MAX_VARIABLES}`);

  const variables = new Map<string, BlueprintVariable>();
  for (const entry of variableEntries) {
    if (!isRecord(entry) || typeof entry.name !== "string" || !SAFE_NAME.test(entry.name) || FORBIDDEN_KEYS.has(entry.name)) {
      errors.push("变量名称无效");
      continue;
    }
    if (variables.has(entry.name)) errors.push(`变量重复：${entry.name}`);
    const type = entry.type;
    if (type !== "string" && type !== "number" && type !== "boolean" && type !== "object") {
      errors.push(`变量类型无效：${entry.name}`);
      continue;
    }
    const variable = entry as unknown as BlueprintVariable;
    if (!variableValueMatches(variable, entry.initialValue)) errors.push(`变量初始值与类型不匹配：${entry.name}`);
    variables.set(entry.name, variable);
  }

  const nodeMap = new Map<string, BlueprintNode>();
  for (const entry of nodes) {
    if (!isRecord(entry) || !nonEmpty(entry.id) || !nonEmpty(entry.kind)) {
      errors.push("节点必须有有效 id 和 kind");
      continue;
    }
    if (!NODE_KINDS.has(entry.kind)) {
      errors.push(`未知节点类型：${entry.kind}`);
      continue;
    }
    if (nodeMap.has(entry.id)) errors.push(`节点 ID 重复：${entry.id}`);
    nodeMap.set(entry.id, entry as unknown as BlueprintNode);
  }
  const eventNodes = [...nodeMap.values()].filter((node) => node.kind === "componentEvent");

  for (const node of nodeMap.values()) {
    switch (node.kind) {
      case "componentEvent": {
        if (!nonEmpty(node.componentId) || !Number.isInteger(node.componentVersion) || node.componentVersion < 1 || !nonEmpty(node.event)) {
          errors.push(`事件节点配置无效：${node.id}`); break;
        }
        const definition = registry.get(node.componentId, node.componentVersion);
        if (!definition || !definition.events.some((event) => event.name === node.event)) errors.push(`组件未声明该事件：${node.componentId}@${node.componentVersion}.${node.event}`);
        break;
      }
      case "setVariable": {
        const variable = variables.get(node.name);
        if (!variable) errors.push(`setVariable 节点引用了未声明变量：${node.name}`);
        if (variable && isRecord(node.value) && node.value.source === "literal" && !variableValueMatches(variable, node.value.value)) errors.push(`赋值字面值与变量类型不匹配：${node.name}`);
        errors.push(...validRef(node.value, variables, eventNodes, registry).map((error) => `${node.id}: ${error}`));
        break;
      }
      case "condition":
        if (!CONDITION_OPS.has(node.op)) errors.push(`条件运算符无效：${node.id}`);
        errors.push(...validRef(node.left, variables, eventNodes, registry).map((error) => `${node.id}: ${error}`));
        errors.push(...validRef(node.right, variables, eventNodes, registry).map((error) => `${node.id}: ${error}`));
        break;
      case "fieldTransform":
        if (!TRANSFORM_OPS.has(node.op)) errors.push(`字段转换操作无效：${node.id}`);
        if (!variables.has(node.outputVariable)) errors.push(`字段转换目标变量未声明：${node.outputVariable}`);
        errors.push(...validRef(node.input, variables, eventNodes, registry).map((error) => `${node.id}: ${error}`));
        break;
      case "datasetAction":
        if (!nonEmpty(node.datasetId)) errors.push(`数据集动作缺少数据集 ID：${node.id}`);
        if (node.action === "filter") {
          if (!nonEmpty(node.field)) errors.push(`数据集过滤字段无效：${node.id}`);
          if (!variables.has(node.globalVariable)) errors.push(`数据集过滤变量未声明：${node.globalVariable}`);
        } else if (node.action === "setParams") {
          if (!isRecord(node.params)) errors.push(`数据集参数必须为对象：${node.id}`);
          else for (const [key, value] of Object.entries(node.params)) {
            if (!SAFE_NAME.test(key) || FORBIDDEN_KEYS.has(key)) errors.push(`数据集参数名无效：${key}`);
            errors.push(...validRef(value, variables, eventNodes, registry).map((error) => `${node.id}: ${error}`));
          }
        } else if (node.action !== "refresh") errors.push(`未知数据集动作：${String((node as { action?: unknown }).action)}`);
        break;
      case "componentAction": {
        if (!nonEmpty(node.componentId) || !Number.isInteger(node.componentVersion) || node.componentVersion < 1) {
          errors.push(`组件动作配置无效：${node.id}`); break;
        }
        const definition = registry.get(node.componentId, node.componentVersion);
        const action = definition?.actions.find((entry) => entry.name === node.action);
        if (!action) { errors.push(`组件未声明该动作：${node.componentId}@${node.componentVersion}.${node.action}`); break; }
        if (node.action === "setVisibility") {
          if (typeof node.visible !== "boolean") errors.push(`setVisibility.visible 必须是布尔值：${node.id}`);
        } else if (node.action === "setProps") {
          if (!isRecord(node.props) || !isSafeJson(node.props)) errors.push(`setProps.props 必须是 JSON 对象：${node.id}`);
          else for (const [key, value] of Object.entries(node.props)) {
            const prop = definition?.props.find((candidate) => candidate.key === key);
            if (!prop || !propValueMatches(prop, value)) errors.push(`组件属性不存在或类型无效：${node.componentId}.${key}`);
          }
        }
        break;
      }
      case "navigateScreen":
        if (!nonEmpty(node.screenId)) errors.push(`导航节点缺少目标屏幕：${node.id}`);
        break;
    }
  }

  const outgoing = new Map<string, Map<string, string>>();
  const indegree = new Map<string, number>([...nodeMap.keys()].map((id) => [id, 0]));
  const edgeIds = new Set<string>();
  for (const value of edges) {
    if (!isRecord(value) || !nonEmpty(value.id) || !isRecord(value.from) || !isRecord(value.to) || !nonEmpty(value.from.nodeId) || !nonEmpty(value.from.port) || !nonEmpty(value.to.nodeId) || value.to.port !== "in") {
      errors.push("连线格式无效"); continue;
    }
    if (edgeIds.has(value.id)) errors.push(`连线 ID 重复：${value.id}`);
    edgeIds.add(value.id);
    const from = nodeMap.get(value.from.nodeId);
    const to = nodeMap.get(value.to.nodeId);
    if (!from || !to) { errors.push(`连线引用了不存在的节点：${value.id}`); continue; }
    if (to.kind === "componentEvent") errors.push(`事件节点不能作为连线目标：${to.id}`);
    const allowedPort = from.kind === "condition" ? value.from.port === "true" || value.from.port === "false" : value.from.port === "next";
    if (!allowedPort) errors.push(`节点输出端口无效：${from.id}.${value.from.port}`);
    let ports = outgoing.get(from.id);
    if (!ports) { ports = new Map(); outgoing.set(from.id, ports); }
    if (ports.has(value.from.port)) errors.push(`同一输出端口不能连接多条连线：${from.id}.${value.from.port}`);
    else ports.set(value.from.port, to.id);
    indegree.set(to.id, (indegree.get(to.id) ?? 0) + 1);
  }
  const available = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
  let visited = 0;
  while (available.length) {
    const id = available.shift()!;
    visited += 1;
    for (const target of outgoing.get(id)?.values() ?? []) {
      const degree = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, degree);
      if (degree === 0) available.push(target);
    }
  }
  if (visited !== nodeMap.size) errors.push("蓝图包含循环连线");
  return errors.length ? { ok: false, errors: [...new Set(errors)] } : { ok: true };
}
