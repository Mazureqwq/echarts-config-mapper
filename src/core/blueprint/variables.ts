import type { BlueprintGraph, BlueprintNode, ValueRef } from "./types";

const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const FORBIDDEN_NAMES = new Set(["__proto__", "prototype", "constructor"]);

export function isValidBlueprintVariableName(name: string): boolean {
  return SAFE_NAME.test(name) && !FORBIDDEN_NAMES.has(name);
}

function refUsesVariable(value: ValueRef, name: string): boolean {
  return value.source === "variable" && value.name === name;
}

function nodeUsesVariable(node: BlueprintNode, name: string): boolean {
  switch (node.kind) {
    case "setVariable": return node.name === name || refUsesVariable(node.value, name);
    case "condition": return refUsesVariable(node.left, name) || refUsesVariable(node.right, name);
    case "fieldTransform": return node.outputVariable === name || refUsesVariable(node.input, name);
    case "datasetAction":
      if (node.action === "filter") return node.globalVariable === name;
      if (node.action === "setParams") return Object.values(node.params).some((value) => refUsesVariable(value, name));
      return false;
    default: return false;
  }
}

/** Whether a blueprint node refers to a declared variable (as a value or target). */
export function blueprintUsesVariable(graph: BlueprintGraph, name: string): boolean {
  return graph.nodes.some((node) => nodeUsesVariable(node, name));
}

function renameRef(ref: ValueRef, oldName: string, newName: string): ValueRef {
  return ref.source === "variable" && ref.name === oldName ? { ...ref, name: newName } : ref;
}

/** Rename a declaration and every typed reference in its declarative graph. */
export function renameBlueprintVariable(graph: BlueprintGraph, oldName: string, newName: string): BlueprintGraph {
  const nodes = graph.nodes.map((node): BlueprintNode => {
    switch (node.kind) {
      case "setVariable": return { ...node, name: node.name === oldName ? newName : node.name, value: renameRef(node.value, oldName, newName) };
      case "condition": return { ...node, left: renameRef(node.left, oldName, newName), right: renameRef(node.right, oldName, newName) };
      case "fieldTransform": return { ...node, outputVariable: node.outputVariable === oldName ? newName : node.outputVariable, input: renameRef(node.input, oldName, newName) };
      case "datasetAction":
        if (node.action === "filter") return { ...node, globalVariable: node.globalVariable === oldName ? newName : node.globalVariable };
        if (node.action === "setParams") return { ...node, params: Object.fromEntries(Object.entries(node.params).map(([key, value]) => [key, renameRef(value, oldName, newName)])) };
        return node;
      default: return node;
    }
  });
  return {
    ...graph,
    nodes,
    variables: graph.variables.map((variable) => variable.name === oldName ? { ...variable, name: newName } : variable),
  };
}
