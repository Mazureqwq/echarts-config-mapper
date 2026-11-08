import DataTableWidget from "@/workbench/components/DataTableWidget.vue";
import KpiWidget from "@/workbench/components/KpiWidget.vue";
import { createComponentRegistry } from "./registry";
import type { ComponentAction, ComponentDefinition, LegacyItemKind } from "./types";

const DEFAULT_FRAME = { x: 100, y: 100, w: 400, h: 300, rotate: 0 } as const;
const BASE_ACTIONS: readonly ComponentAction[] = [
  { name: "setVisibility", payloadFields: { visible: "boolean" } },
  { name: "setProps", payloadFields: { props: "object" } },
];

const LEGACY_ITEM_KINDS: readonly LegacyItemKind[] = ["chart", "text", "image", "shape"];
const legacyComponentDefinitions: readonly ComponentDefinition[] = LEGACY_ITEM_KINDS.map((itemKind) => ({
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
}));

const dataWidgetDefinitions: readonly ComponentDefinition[] = [
  {
    id: "chartforge.data-table",
    version: 1,
    name: "数据表格",
    category: "data",
    defaultFrame: { x: 100, y: 100, w: 520, h: 300, rotate: 0 },
    defaults: {
      columns: [
        { field: "name", label: "名称", format: "text", align: "left" },
        { field: "value", label: "数值", format: "number", align: "right" },
      ],
      rowKey: "",
      striped: true,
    },
    props: [
      { key: "columns", label: "列配置（JSON）", type: "json", defaultValue: [
        { field: "name", label: "名称", format: "text", align: "left" },
        { field: "value", label: "数值", format: "number", align: "right" },
      ] },
      { key: "rowKey", label: "行标识字段", type: "string", defaultValue: "" },
      { key: "striped", label: "斑马纹", type: "boolean", defaultValue: true },
    ],
    events: [{ name: "rowSelect", payloadFields: { row: "object", index: "number" } }],
    actions: BASE_ACTIONS,
    renderer: { kind: "vue", view: DataTableWidget },
    exportRendererId: "chartforge-data-table-v1",
  },
  {
    id: "chartforge.kpi",
    version: 1,
    name: "指标卡",
    category: "data",
    defaultFrame: { x: 100, y: 100, w: 300, h: 170, rotate: 0 },
    defaults: { valueField: "value", label: "指标", format: "number", aggregation: "sum" },
    props: [
      { key: "valueField", label: "数值字段", type: "string", defaultValue: "value" },
      { key: "label", label: "指标名称", type: "string", defaultValue: "指标" },
      { key: "format", label: "格式", type: "select", defaultValue: "number", options: ["number", "currency", "percent"] },
      { key: "aggregation", label: "聚合方式", type: "select", defaultValue: "sum", options: ["first", "sum", "average"] },
    ],
    events: [],
    actions: BASE_ACTIONS,
    renderer: { kind: "vue", view: KpiWidget },
    exportRendererId: "chartforge-kpi-v1",
  },
];

export const componentRegistry = createComponentRegistry([...legacyComponentDefinitions, ...dataWidgetDefinitions]);
