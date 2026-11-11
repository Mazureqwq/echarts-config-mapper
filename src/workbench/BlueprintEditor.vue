<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { componentRegistry } from "@/core/components/builtins";
import { validateBlueprint } from "@/core/blueprint/validate";
import { blueprintUsesVariable, isValidBlueprintVariableName, renameBlueprintVariable } from "@/core/blueprint/variables";
import type { BlueprintGraph, BlueprintNode, BlueprintVariable, ValueRef } from "@/core/blueprint/types";
import type { DatasetDefinition } from "@/core/model/types";

const props = withDefaults(defineProps<{ modelValue: BlueprintGraph; datasets: DatasetDefinition[]; boundVariableNames?: string[] }>(), { boundVariableNames: () => [] });
const emit = defineEmits<{ (event: "save", graph: BlueprintGraph, renamedVariables: Record<string, string>): void; (event: "close"): void }>();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const draft = ref<BlueprintGraph>({ nodes: [], edges: [], variables: [] });
const selectedNodeId = ref("");
const connectFrom = ref("");
const connectTo = ref("");
const connectPort = ref("next");
const editError = ref("");
const renamedVariables = ref<Record<string, string>>({});

watch(() => props.modelValue, (value) => {
  draft.value = clone(value);
  renamedVariables.value = {};
  selectedNodeId.value = draft.value.nodes[0]?.id ?? "";
}, { immediate: true, deep: true });

const selectedNode = computed(() => draft.value.nodes.find((node) => node.id === selectedNodeId.value) ?? null);
const validation = computed(() => validateBlueprint(draft.value, componentRegistry));
const componentsWithEvents = computed(() => componentRegistry.list().flatMap((component) => component.events.map((event) => ({
  id: component.id, version: component.version, name: component.name, event: event.name,
}))));
const allComponents = computed(() => componentRegistry.list().filter((component) => component.id !== "legacy.chart" && component.id !== "legacy.text" && component.id !== "legacy.image" && component.id !== "legacy.shape"));

function newId(prefix: string): string {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`;
}
function asRecord(node: BlueprintNode): Record<string, unknown> { return node as unknown as Record<string, unknown>; }
function field(node: BlueprintNode, key: string): unknown { return asRecord(node)[key]; }
function setField(node: BlueprintNode, key: string, value: unknown): void { asRecord(node)[key] = value; }
function setText(node: BlueprintNode, key: string, event: Event): void { setField(node, key, (event.target as HTMLInputElement).value); }
function setJson(node: BlueprintNode, key: string, event: Event): void {
  try {
    const parsed = JSON.parse((event.target as HTMLTextAreaElement).value) as unknown;
    if (parsed === null || typeof parsed === "object") { setField(node, key, parsed); editError.value = ""; }
    else editError.value = "此字段需要 JSON 对象或数组";
  } catch { editError.value = "JSON 格式无效；输入有效内容后才能保存"; }
}
function jsonText(value: unknown): string { return JSON.stringify(value ?? {}, null, 2); }
function setNodeKind(kind: string): void {
  let node: BlueprintNode;
  switch (kind) {
    case "componentEvent": {
      const event = componentsWithEvents.value[0];
      if (!event) return;
      node = { id: newId("event"), kind, componentId: event.id, componentVersion: event.version, event: event.event };
      break;
    }
    case "setVariable": node = { id: newId("set"), kind, name: draft.value.variables[0]?.name ?? "value", value: { source: "literal", value: "" } }; break;
    case "condition": node = { id: newId("condition"), kind, left: { source: "event", path: "row.city" }, op: "eq", right: { source: "literal", value: "" } }; break;
    case "fieldTransform": node = { id: newId("transform"), kind, input: { source: "event", path: "row.city" }, op: "toString", outputVariable: draft.value.variables[0]?.name ?? "value" }; break;
    case "datasetFilter": node = { id: newId("filter"), kind: "datasetAction", action: "filter", datasetId: props.datasets[0]?.id ?? "", field: "", globalVariable: draft.value.variables[0]?.name ?? "" }; break;
    case "datasetParams": node = { id: newId("params"), kind: "datasetAction", action: "setParams", datasetId: props.datasets[0]?.id ?? "", params: {} }; break;
    case "datasetRefresh": node = { id: newId("refresh"), kind: "datasetAction", action: "refresh", datasetId: props.datasets[0]?.id ?? "" }; break;
    case "componentVisibility": {
      const component = allComponents.value[0];
      if (!component) return;
      node = { id: newId("visibility"), kind: "componentAction", action: "setVisibility", componentId: component.id, componentVersion: component.version, visible: true };
      break;
    }
    case "componentProps": {
      const component = allComponents.value[0];
      if (!component) return;
      node = { id: newId("props"), kind: "componentAction", action: "setProps", componentId: component.id, componentVersion: component.version, props: {} };
      break;
    }
    case "navigateScreen": node = { id: newId("navigate"), kind, screenId: "" }; break;
    default: return;
  }
  draft.value.nodes.push(node);
  selectedNodeId.value = node.id;
  if (draft.value.nodes.length > 1 && node.kind !== "componentEvent") {
    const source = draft.value.nodes[draft.value.nodes.length - 2];
    const port = source.kind === "condition" ? "true" : "next";
    draft.value.edges.push({ id: newId("edge"), from: { nodeId: source.id, port }, to: { nodeId: node.id, port: "in" } });
  }
}
function removeNode(id: string): void {
  draft.value.nodes = draft.value.nodes.filter((node) => node.id !== id);
  draft.value.edges = draft.value.edges.filter((edge) => edge.from.nodeId !== id && edge.to.nodeId !== id);
  if (selectedNodeId.value === id) selectedNodeId.value = draft.value.nodes[0]?.id ?? "";
}
function addVariable(): void {
  let index = draft.value.variables.length + 1;
  while (draft.value.variables.some((variable) => variable.name === `variable${index}`)) index += 1;
  draft.value.variables.push({ name: `variable${index}`, type: "string", initialValue: "" });
}
function variableIsReferenced(name: string): boolean {
  const originalName = Object.entries(renamedVariables.value).find(([, currentName]) => currentName === name)?.[0] ?? name;
  return blueprintUsesVariable(draft.value, name)
    || props.boundVariableNames.includes(name)
    || props.boundVariableNames.includes(originalName);
}
function removeVariable(name: string): void {
  if (variableIsReferenced(name)) {
    editError.value = `变量 ${name} 仍被蓝图节点或数据绑定引用，请先解除引用。`;
    return;
  }
  draft.value.variables = draft.value.variables.filter((variable) => variable.name !== name);
  editError.value = "";
}
function setVariableName(variable: BlueprintVariable, event: Event): void {
  const nextName = (event.target as HTMLInputElement).value.trim();
  const oldName = variable.name;
  if (nextName === oldName) return;
  if (!isValidBlueprintVariableName(nextName)) { editError.value = "变量名格式无效。"; return; }
  if (draft.value.variables.some((entry) => entry.name === nextName)) { editError.value = "变量名已存在。"; return; }
  const originalName = Object.entries(renamedVariables.value).find(([, currentName]) => currentName === oldName)?.[0] ?? oldName;
  draft.value = renameBlueprintVariable(draft.value, oldName, nextName);
  if (originalName === nextName) delete renamedVariables.value[originalName];
  else renamedVariables.value[originalName] = nextName;
  editError.value = "";
}
function setVariableType(variable: BlueprintVariable, event: Event): void {
  const type = (event.target as HTMLSelectElement).value as BlueprintVariable["type"];
  if (type === "object" && props.boundVariableNames.includes(variable.name)) { editError.value = "对象变量不能用于数据绑定过滤，请先解除过滤绑定。"; return; }
  variable.type = type;
  variable.initialValue = type === "string" ? "" : type === "number" ? 0 : type === "boolean" ? false : {};
}
function setVariableValue(variable: BlueprintVariable, event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  try { variable.initialValue = JSON.parse(raw) as unknown; }
  catch { variable.initialValue = variable.type === "string" ? raw : variable.type === "number" ? Number(raw) : raw; }
}
function refAt(node: BlueprintNode, key: string): ValueRef {
  const value = field(node, key);
  return value && typeof value === "object" ? value as ValueRef : { source: "literal", value: "" };
}
function setRefSource(node: BlueprintNode, key: string, event: Event): void {
  const source = (event.target as HTMLSelectElement).value;
  const current = refAt(node, key);
  setField(node, key, source === "event" ? { source, path: current.source === "event" ? current.path : "row.city" } : source === "variable" ? { source, name: current.source === "variable" ? current.name : draft.value.variables[0]?.name ?? "" } : { source, value: current.source === "literal" ? current.value : "" });
}
function refValue(node: BlueprintNode, key: string): string {
  const ref = refAt(node, key);
  return ref.source === "event" ? ref.path : ref.source === "variable" ? ref.name : JSON.stringify(ref.value ?? "");
}
function setRefValue(node: BlueprintNode, key: string, event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  const current = refAt(node, key);
  if (current.source === "event") current.path = value;
  else if (current.source === "variable") current.name = value;
  else { try { current.value = JSON.parse(value) as unknown; } catch { current.value = value; } }
  setField(node, key, current);
}
function valueRefKeys(node: BlueprintNode): string[] { return node.kind === "condition" ? ["left", "right"] : node.kind === "fieldTransform" ? ["input"] : node.kind === "setVariable" ? ["value"] : []; }
function connect(): void {
  if (!connectFrom.value || !connectTo.value || connectFrom.value === connectTo.value) return;
  draft.value.edges.push({ id: newId("edge"), from: { nodeId: connectFrom.value, port: connectPort.value }, to: { nodeId: connectTo.value, port: "in" } });
}
function removeEdge(id: string): void { draft.value.edges = draft.value.edges.filter((edge) => edge.id !== id); }
function selectEvent(value: string): void {
  const node = selectedNode.value;
  if (!node || node.kind !== "componentEvent") return;
  const option = componentsWithEvents.value.find((entry) => `${entry.id}@${entry.version}:${entry.event}` === value);
  if (option) Object.assign(node, { componentId: option.id, componentVersion: option.version, event: option.event });
}
function selectActionComponent(value: string): void {
  const node = selectedNode.value;
  if (!node || node.kind !== "componentAction") return;
  const [id, version] = value.split("@");
  Object.assign(node, { componentId: id, componentVersion: Number(version) });
}
function save(): void {
  if (editError.value || !validation.value.ok) return;
  emit("save", clone(draft.value), { ...renamedVariables.value });
}
</script>

<template>
  <div class="blueprint-editor" role="dialog" aria-modal="true" aria-label="蓝图交互编辑器">
    <header class="blueprint-editor__header">
      <div><h2>蓝图交互</h2><p>用声明式事件与动作连接组件；仅执行固定操作，不运行自定义代码。</p></div>
      <button class="cf-button cf-button--plain cf-button--small" type="button" @click="emit('close')">关闭</button>
    </header>
    <div class="blueprint-editor__body">
      <aside class="blueprint-editor__palette">
        <h3>添加节点</h3>
        <button v-for="entry in [
          ['componentEvent', '组件事件'], ['setVariable', '设置变量'], ['condition', '条件分支'], ['fieldTransform', '字段转换'],
          ['datasetFilter', '数据集过滤'], ['datasetParams', '设置参数'], ['datasetRefresh', '刷新数据集'],
          ['componentVisibility', '组件显隐'], ['componentProps', '设置组件属性'], ['navigateScreen', '跳转屏幕'],
        ]" :key="entry[0]" type="button" class="blueprint-editor__palette-button" @click="setNodeKind(entry[0])">＋ {{ entry[1] }}</button>
        <h3>屏幕变量</h3>
        <button type="button" class="blueprint-editor__palette-button" @click="addVariable">＋ 添加变量</button>
        <div v-for="variable in draft.variables" :key="variable.name + draft.variables.length" class="blueprint-editor__variable">
          <input :value="variable.name" aria-label="变量名称" @change="setVariableName(variable, $event)" />
          <select :value="variable.type" aria-label="变量类型" @change="setVariableType(variable, $event)"><option value="string">文本</option><option value="number">数字</option><option value="boolean">布尔</option><option value="object" :disabled="props.boundVariableNames.includes(variable.name)">对象</option></select>
          <input :value="JSON.stringify(variable.initialValue)" aria-label="变量初始值" @change="setVariableValue(variable, $event)" />
          <button type="button" aria-label="删除变量" :disabled="variableIsReferenced(variable.name)" @click="removeVariable(variable.name)">×</button>
        </div>
      </aside>
      <section class="blueprint-editor__graph">
        <h3>节点与连线</h3>
        <div class="blueprint-editor__node-list">
          <article v-for="node in draft.nodes" :key="node.id" class="blueprint-editor__node" :class="{ 'blueprint-editor__node--selected': selectedNodeId === node.id }">
            <button type="button" class="blueprint-editor__node-select" @click="selectedNodeId = node.id">{{ node.kind }} · {{ node.id }}</button>
            <button type="button" aria-label="删除节点" @click="removeNode(node.id)">删除</button>
          </article>
          <p v-if="!draft.nodes.length" class="blueprint-editor__hint">从左侧添加入口和动作节点。</p>
        </div>
        <template v-if="selectedNode">
          <h3>节点配置</h3>
          <div class="blueprint-editor__fields">
            <label>节点 ID<input :value="selectedNode.id" disabled /></label>
            <template v-if="selectedNode.kind === 'componentEvent'">
              <label>组件事件
                <select :value="`${selectedNode.componentId}@${selectedNode.componentVersion}:${selectedNode.event}`" @change="selectEvent(($event.target as HTMLSelectElement).value)">
                  <option v-for="event in componentsWithEvents" :key="`${event.id}@${event.version}:${event.event}`" :value="`${event.id}@${event.version}:${event.event}`">{{ event.name }} · {{ event.event }}</option>
                </select>
              </label>
            </template>
            <template v-else-if="selectedNode.kind === 'setVariable'">
              <label>目标变量<select :value="selectedNode.name" @change="setField(selectedNode, 'name', ($event.target as HTMLSelectElement).value)"><option v-for="v in draft.variables" :key="v.name" :value="v.name">{{ v.name }}</option></select></label>
            </template>
            <template v-else-if="selectedNode.kind === 'condition'">
              <label>比较方式<select :value="selectedNode.op" @change="setField(selectedNode, 'op', ($event.target as HTMLSelectElement).value)"><option v-for="op in ['eq','ne','gt','gte','lt','lte','contains']" :key="op" :value="op">{{ op }}</option></select></label>
            </template>
            <template v-else-if="selectedNode.kind === 'fieldTransform'">
              <label>转换<select :value="selectedNode.op" @change="setField(selectedNode, 'op', ($event.target as HTMLSelectElement).value)"><option v-for="op in ['toNumber','toString','uppercase','lowercase']" :key="op" :value="op">{{ op }}</option></select></label>
              <label>输出变量<select :value="selectedNode.outputVariable" @change="setField(selectedNode, 'outputVariable', ($event.target as HTMLSelectElement).value)"><option v-for="v in draft.variables" :key="v.name" :value="v.name">{{ v.name }}</option></select></label>
            </template>
            <template v-else-if="selectedNode.kind === 'datasetAction'">
              <label>数据集<select :value="selectedNode.datasetId" @change="setField(selectedNode, 'datasetId', ($event.target as HTMLSelectElement).value)"><option v-for="dataset in datasets" :key="dataset.id" :value="dataset.id">{{ dataset.name }}</option></select></label>
              <template v-if="selectedNode.action === 'filter'">
                <label>数据字段<input :value="selectedNode.field" @input="setText(selectedNode, 'field', $event)" /></label>
                <label>全局变量<select :value="selectedNode.globalVariable" @change="setField(selectedNode, 'globalVariable', ($event.target as HTMLSelectElement).value)"><option v-for="v in draft.variables" :key="v.name" :value="v.name">{{ v.name }}</option></select></label>
              </template>
              <label v-else-if="selectedNode.action === 'setParams'">参数映射 JSON<textarea :value="jsonText(selectedNode.params)" @change="setJson(selectedNode, 'params', $event)" /></label>
            </template>
            <template v-else-if="selectedNode.kind === 'componentAction'">
              <label>组件类型<select :value="`${selectedNode.componentId}@${selectedNode.componentVersion}`" @change="selectActionComponent(($event.target as HTMLSelectElement).value)"><option v-for="component in allComponents" :key="`${component.id}@${component.version}`" :value="`${component.id}@${component.version}`">{{ component.name }} · {{ component.id }}</option></select></label>
              <label v-if="selectedNode.action === 'setVisibility'" class="blueprint-editor__check">显示组件<input type="checkbox" :checked="selectedNode.visible" @change="setField(selectedNode, 'visible', ($event.target as HTMLInputElement).checked)" /></label>
              <label v-else>组件属性补丁 JSON<textarea :value="jsonText(selectedNode.props)" @change="setJson(selectedNode, 'props', $event)" /></label>
            </template>
            <label v-else-if="selectedNode.kind === 'navigateScreen'">屏幕 ID<input :value="selectedNode.screenId" @input="setText(selectedNode, 'screenId', $event)" /></label>
            <div v-for="key in valueRefKeys(selectedNode)" :key="key" class="blueprint-editor__ref">
              <label>{{ key }} 来源<select :value="refAt(selectedNode, key).source" @change="setRefSource(selectedNode, key, $event)"><option value="event">事件字段</option><option value="variable">变量</option><option value="literal">固定值</option></select></label>
              <label>{{ refAt(selectedNode, key).source === 'event' ? '事件路径' : refAt(selectedNode, key).source === 'variable' ? '变量名' : 'JSON 值' }}<input :value="refValue(selectedNode, key)" @change="setRefValue(selectedNode, key, $event)" /></label>
            </div>
          </div>
        </template>
        <h3>连线</h3>
        <div class="blueprint-editor__connect">
          <select v-model="connectFrom" aria-label="连线来源"><option value="">来源节点</option><option v-for="node in draft.nodes" :key="node.id" :value="node.id">{{ node.id }}</option></select>
          <select v-model="connectPort" aria-label="来源端口"><option value="next">next</option><option value="true">true</option><option value="false">false</option></select>
          <span>→</span>
          <select v-model="connectTo" aria-label="连线目标"><option value="">目标节点</option><option v-for="node in draft.nodes.filter(n => n.kind !== 'componentEvent')" :key="node.id" :value="node.id">{{ node.id }}</option></select>
          <button type="button" class="cf-button cf-button--small" @click="connect">连接</button>
        </div>
        <div v-for="edge in draft.edges" :key="edge.id" class="blueprint-editor__edge">
          <span>{{ edge.from.nodeId }}.{{ edge.from.port }} → {{ edge.to.nodeId }}</span><button type="button" aria-label="删除连线" @click="removeEdge(edge.id)">删除</button>
        </div>
      </section>
      <aside class="blueprint-editor__validation">
        <h3>校验</h3>
        <p v-if="validation.ok && !editError" class="blueprint-editor__valid">✓ 蓝图结构有效</p>
        <p v-if="editError" class="blueprint-editor__error">{{ editError }}</p>
        <ul v-if="!validation.ok"><li v-for="error in validation.errors" :key="error">{{ error }}</li></ul>
        <p v-if="!validation.ok || editError" class="blueprint-editor__hint">先修复错误再保存；无效蓝图不会执行。</p>
      </aside>
    </div>
    <footer class="blueprint-editor__footer">
      <button class="cf-button cf-button--plain" type="button" @click="emit('close')">取消</button>
      <button class="cf-button" type="button" :disabled="!validation.ok || !!editError" @click="save">保存蓝图</button>
    </footer>
  </div>
</template>

<style scoped>
.blueprint-editor { position: fixed; inset: 56px 24px 24px; z-index: 40; display: flex; flex-direction: column; min-height: 0; border: 1px solid var(--cf-border, #344054); border-radius: 10px; background: var(--cf-panel, #202a39); color: var(--cf-text, #e8edf7); box-shadow: 0 24px 80px rgba(0,0,0,.45); font: 12px/1.4 system-ui, sans-serif; }
.blueprint-editor__header, .blueprint-editor__footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 16px; border-bottom: 1px solid var(--cf-border, #344054); }
.blueprint-editor__header h2 { margin: 0 0 3px; font-size: 16px; }
.blueprint-editor__header p { margin: 0; color: var(--cf-text-2, #a4afbf); }
.blueprint-editor__body { display: grid; flex: 1; min-height: 0; grid-template-columns: minmax(210px, 24%) minmax(320px, 1fr) minmax(190px, 22%); }
.blueprint-editor__palette, .blueprint-editor__graph, .blueprint-editor__validation { min-width: 0; overflow: auto; padding: 12px; border-right: 1px solid var(--cf-border, #344054); }
.blueprint-editor__validation { border: 0; }
.blueprint-editor h3 { margin: 4px 0 9px; font-size: 12px; }
.blueprint-editor__palette-button { display: block; width: 100%; margin: 4px 0; padding: 7px 9px; border: 1px solid var(--cf-border, #344054); border-radius: 5px; background: rgba(255,255,255,.025); color: inherit; text-align: left; cursor: pointer; }
.blueprint-editor__node, .blueprint-editor__edge { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 4px 0; padding: 6px 8px; border: 1px solid var(--cf-border, #344054); border-radius: 5px; }
.blueprint-editor__node--selected { border-color: var(--cf-primary, #49b9f2); background: rgba(73,185,242,.08); }
.blueprint-editor__node-select { flex: 1; border: 0; background: none; color: inherit; text-align: left; cursor: pointer; }
.blueprint-editor__variable { display: grid; grid-template-columns: 1fr 82px 1fr 24px; gap: 4px; margin: 5px 0; }
.blueprint-editor input, .blueprint-editor select, .blueprint-editor textarea { box-sizing: border-box; width: 100%; min-width: 0; padding: 6px 7px; border: 1px solid var(--cf-border, #344054); border-radius: 4px; background: #111720; color: inherit; font: inherit; }
.blueprint-editor textarea { min-height: 72px; resize: vertical; }
.blueprint-editor__fields { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--cf-border, #344054); border-radius: 7px; background: rgba(0,0,0,.08); }
.blueprint-editor__fields label { display: grid; gap: 4px; color: var(--cf-text-2, #a4afbf); }
.blueprint-editor__ref { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.blueprint-editor__ref label { min-width: 0; }
.blueprint-editor__check { display: flex !important; align-items: center; }
.blueprint-editor__check input { width: auto; }
.blueprint-editor__connect { display: flex; align-items: center; gap: 6px; }
.blueprint-editor__valid { color: #69d49a; }
.blueprint-editor__error, .blueprint-editor__validation li { color: #ff9d8f; }
.blueprint-editor__hint { color: var(--cf-text-2, #a4afbf); }
.blueprint-editor__footer { justify-content: flex-end; border-top: 1px solid var(--cf-border, #344054); border-bottom: 0; }
@media (max-width: 850px) { .blueprint-editor { inset: 16px 8px 8px; } .blueprint-editor__body { grid-template-columns: 1fr; } .blueprint-editor__palette, .blueprint-editor__graph, .blueprint-editor__validation { max-height: 30vh; border-right: 0; border-bottom: 1px solid var(--cf-border, #344054); } }
</style>
