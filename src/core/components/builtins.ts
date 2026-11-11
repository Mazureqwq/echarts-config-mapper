import DataTableWidget from "@/workbench/components/DataTableWidget.vue";
import KpiWidget from "@/workbench/components/KpiWidget.vue";
import ProgressListWidget from "@/workbench/components/ProgressListWidget.vue";
import SectionTitleWidget from "@/workbench/components/SectionTitleWidget.vue";
import CornerFrameWidget from "@/workbench/components/CornerFrameWidget.vue";
import MapSceneWidget from "@/workbench/components/MapSceneWidget.vue";
import { createDefaultMapSceneProps } from "./mapScene";
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
    catalog: {
      group: "data",
      description: "以行列形式展示绑定数据，支持列配置与斑马纹。",
      tags: ["表格", "明细", "数据"],
      previewKey: "data-table",
    },
    defaultFrame: { x: 100, y: 100, w: 520, h: 300, rotate: 0 },
    defaults: {
      columns: [
        { field: "name", label: "名称", format: "text", align: "left" },
        { field: "value", label: "数值", format: "number", align: "right" },
      ],
      rowKey: "",
      striped: true,
    },
    sampleRows: [
      { name: "华东区", value: 1280 },
      { name: "华南区", value: 960 },
      { name: "华北区", value: 742 },
    ],
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
    catalog: {
      group: "data",
      description: "突出展示绑定数据的汇总指标，支持数字、货币与百分比格式。",
      tags: ["指标", "KPI", "汇总"],
      previewKey: "kpi",
    },
    defaultFrame: { x: 100, y: 100, w: 300, h: 170, rotate: 0 },
    defaults: { valueField: "value", label: "指标", format: "number", aggregation: "sum" },
    sampleRows: [{ name: "本月营收", value: 1280 }],
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
  {
    id: "chartforge.progress-list",
    version: 1,
    name: "进度条组",
    category: "data",
    catalog: {
      group: "data",
      description: "将数据行映射为进度条",
      tags: ["进度", "比例", "数据"],
      previewKey: "progress-list",
    },
    defaultFrame: { x: 100, y: 100, w: 520, h: 280, rotate: 0 },
    defaults: { labelField: "name", valueField: "value", maxValue: 100, showValue: true, trackColor: "", fillColor: "" },
    sampleRows: [
      { name: "华东区", value: 86 },
      { name: "华南区", value: 72 },
      { name: "华北区", value: 64 },
      { name: "西南区", value: 93 },
    ],
    props: [
      { key: "labelField", label: "名称字段", type: "string", defaultValue: "name" },
      { key: "valueField", label: "数值字段", type: "string", defaultValue: "value" },
      { key: "maxValue", label: "最大值", type: "number", defaultValue: 100 },
      { key: "showValue", label: "显示数值", type: "boolean", defaultValue: true },
      { key: "trackColor", label: "轨道颜色", type: "color", defaultValue: "", themeToken: "border" },
      { key: "fillColor", label: "填充颜色", type: "color", defaultValue: "", themeToken: "accent" },
    ],
    events: [],
    actions: BASE_ACTIONS,
    renderer: { kind: "vue", view: ProgressListWidget },
    exportRendererId: "chartforge-progress-list-v1",
  },
];

const mapSceneDefinitions: readonly ComponentDefinition[] = [
  {
    id: "chartforge.map-scene-flat", version: 1, name: "2D 平面地图", category: "map",
    catalog: { group: "map", description: "本地离线平面地图容器，可在容器内组合地理图层。", tags: ["地图", "2D", "区域", "图层"], previewKey: "map-scene-flat" },
    defaultFrame: { x: 100, y: 100, w: 640, h: 400, rotate: 0 },
    defaults: createDefaultMapSceneProps("flat"),
    props: [
      { key: "presentation", label: "地图预设", type: "select", defaultValue: "flat", options: ["flat", "tilted"] },
      { key: "pitch", label: "倾斜角度", type: "number", defaultValue: 0 },
      { key: "view", label: "地图视图", type: "json", defaultValue: createDefaultMapSceneProps("flat").view },
      { key: "layers", label: "地图图层", type: "json", defaultValue: [] },
    ],
    events: [], actions: BASE_ACTIONS, renderer: { kind: "vue", view: MapSceneWidget }, exportRendererId: "chartforge-map-scene-v1",
  },
  {
    id: "chartforge.map-scene-tilted", version: 1, name: "2.5D 立体地图", category: "map",
    catalog: { group: "map", description: "由本地省界矢量轮廓表现顶面与挤出厚度的离线地图容器，非真实高程地形。", tags: ["地图", "2.5D", "立体", "矢量挤出", "图层"], previewKey: "map-scene-tilted" },
    defaultFrame: { x: 100, y: 100, w: 640, h: 400, rotate: 0 },
    defaults: createDefaultMapSceneProps("tilted"),
    props: [
      { key: "presentation", label: "地图预设", type: "select", defaultValue: "tilted", options: ["flat", "tilted"] },
      { key: "pitch", label: "旧版 pitch（兼容字段）", type: "number", defaultValue: 28 },
      { key: "view", label: "地图视图", type: "json", defaultValue: createDefaultMapSceneProps("tilted").view },
      { key: "layers", label: "地图图层", type: "json", defaultValue: [] },
    ],
    events: [], actions: BASE_ACTIONS, renderer: { kind: "vue", view: MapSceneWidget }, exportRendererId: "chartforge-map-scene-v1",
  },
];

const decorationWidgetDefinitions: readonly ComponentDefinition[] = [
  {
    id: "chartforge.section-title",
    version: 1,
    name: "标题栏",
    category: "decoration",
    catalog: {
      group: "decoration",
      description: "大屏分区标题",
      tags: ["标题", "分区", "装饰"],
      previewKey: "section-title",
    },
    defaultFrame: { x: 100, y: 100, w: 520, h: 72, rotate: 0 },
    defaults: { title: "分区标题", subtitle: "", variant: "underline", accentColor: "" },
    props: [
      { key: "title", label: "标题", type: "string", defaultValue: "分区标题" },
      { key: "subtitle", label: "副标题", type: "string", defaultValue: "" },
      { key: "variant", label: "样式", type: "select", defaultValue: "underline", options: ["underline", "bar", "bracket"] },
      { key: "accentColor", label: "强调色", type: "color", defaultValue: "", themeToken: "accent" },
    ],
    events: [],
    actions: BASE_ACTIONS,
    renderer: { kind: "vue", view: SectionTitleWidget },
    exportRendererId: "chartforge-section-title-v1",
  },
  {
    id: "chartforge.corner-frame",
    version: 1,
    name: "装饰边框",
    category: "decoration",
    catalog: {
      group: "decoration",
      description: "大屏角标边框装饰",
      tags: ["边框", "角标", "装饰"],
      previewKey: "corner-frame",
    },
    defaultFrame: { x: 100, y: 100, w: 500, h: 300, rotate: 0 },
    defaults: { variant: "corner", color: "", thickness: 2, inset: 8 },
    props: [
      { key: "variant", label: "样式", type: "select", defaultValue: "corner", options: ["corner", "outline", "double"] },
      { key: "color", label: "边框颜色", type: "color", defaultValue: "", themeToken: "accent" },
      { key: "thickness", label: "线宽", type: "number", defaultValue: 2 },
      { key: "inset", label: "内缩", type: "number", defaultValue: 8 },
    ],
    events: [],
    actions: BASE_ACTIONS,
    renderer: { kind: "vue", view: CornerFrameWidget },
    exportRendererId: "chartforge-corner-frame-v1",
  },
];

export const componentRegistry = createComponentRegistry([
  ...legacyComponentDefinitions,
  ...dataWidgetDefinitions,
  ...mapSceneDefinitions,
  ...decorationWidgetDefinitions,
]);
