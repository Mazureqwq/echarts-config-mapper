import type { ChartSchema, ChartType, FieldMeta, SchemaGroup } from "@/types/chart";
import { CHART_META } from "@/config/editor";

const LEFT_SELECT = [
  { label: "左", value: "left" },
  { label: "居中", value: "center" },
  { label: "右", value: "right" },
];

const textStyle = (label: string): FieldMeta => ({
  kind: "textStyle",
  label,
  children: {
    color: { kind: "color", label: "颜色" },
    fontSize: { kind: "number", label: "字号", min: 8, max: 48, step: 1 },
    fontWeight: {
      kind: "select",
      label: "字重",
      options: [
        { label: "常规 400", value: 400 },
        { label: "中粗 500", value: 500 },
        { label: "半粗 600", value: 600 },
        { label: "加粗 700", value: 700 },
      ],
    },
  },
});

const lineStyle = (label: string): FieldMeta => ({
  kind: "lineStyle",
  label,
  children: {
    color: { kind: "color", label: "颜色" },
    width: { kind: "number", label: "线宽", min: 0, max: 12, step: 0.5 },
    type: {
      kind: "select",
      label: "线型",
      options: [
        { label: "实线", value: "solid" },
        { label: "虚线", value: "dashed" },
        { label: "点线", value: "dotted" },
      ],
    },
  },
});

const titleGroup: SchemaGroup = {
  key: "title",
  label: "标题 Title",
  desc: "图表标题与副标题",
  fields: {
    "show": { kind: "boolean", label: "显示标题" },
    "text": { kind: "string", label: "标题文本" },
    "subtext": { kind: "string", label: "副标题" },
    "left": { kind: "select", label: "水平位置", options: LEFT_SELECT },
    "top": { kind: "number", label: "距顶距离", min: 0, max: 200, step: 1 },
    "textStyle": textStyle("标题样式"),
    "subtextStyle": textStyle("副标题样式"),
  },
};

const legendGroup: SchemaGroup = {
  key: "legend",
  label: "图例 Legend",
  desc: "系列名称与开关",
  fields: {
    "show": { kind: "boolean", label: "显示图例" },
    "orient": {
      kind: "select",
      label: "排列方向",
      options: [
        { label: "横向", value: "horizontal" },
        { label: "纵向", value: "vertical" },
      ],
    },
    "left": { kind: "select", label: "水平位置", options: LEFT_SELECT },
    "top": { kind: "number", label: "距顶距离", min: 0, max: 400, step: 1 },
    "itemWidth": { kind: "number", label: "图形宽", min: 4, max: 40, step: 1 },
    "itemHeight": { kind: "number", label: "图形高", min: 4, max: 40, step: 1 },
    "itemGap": { kind: "number", label: "项间隔", min: 0, max: 60, step: 1 },
    "textStyle": textStyle("文字样式"),
  },
};

const tooltipGroup: SchemaGroup = {
  key: "tooltip",
  label: "提示框 Tooltip",
  fields: {
    "show": { kind: "boolean", label: "显示提示框" },
    "trigger": {
      kind: "select",
      label: "触发方式",
      options: [
        { label: "坐标轴触发", value: "axis" },
        { label: "数据项触发", value: "item" },
        { label: "不触发", value: "none" },
      ],
    },
    "backgroundColor": { kind: "color", label: "背景色" },
    "borderWidth": { kind: "number", label: "边框宽度", min: 0, max: 8, step: 1 },
    "borderColor": { kind: "color", label: "边框颜色" },
    "formatter": { kind: "string", label: "格式化模板" },
    "textStyle": textStyle("文字样式"),
  },
};

const cartesianGroups = (): SchemaGroup[] => [
  {
    key: "grid",
    label: "网格 Grid",
    fields: {
      "left": { kind: "number", label: "左间距", min: 0, max: 200, step: 1 },
      "right": { kind: "number", label: "右间距", min: 0, max: 200, step: 1 },
      "top": { kind: "number", label: "上间距", min: 0, max: 200, step: 1 },
      "bottom": { kind: "number", label: "下间距", min: 0, max: 200, step: 1 },
      "containLabel": { kind: "boolean", label: "包含坐标轴标签" },
    },
  },
  {
    key: "xAxis",
    label: "X 轴",
    fields: {
      "show": { kind: "boolean", label: "显示轴" },
      "type": {
        kind: "select",
        label: "轴类型",
        options: [
          { label: "类目轴", value: "category" },
          { label: "数值轴", value: "value" },
          { label: "时间轴", value: "time" },
          { label: "对数轴", value: "log" },
        ],
      },
      "name": { kind: "string", label: "轴名称" },
      "boundaryGap": { kind: "boolean", label: "留白策略" },
      "axisLabel": textStyle("轴标签样式"),
      "axisLine.lineStyle": lineStyle("轴线样式"),
      "splitLine.show": { kind: "boolean", label: "显示分割线" },
      "splitLine.lineStyle": lineStyle("分割线样式"),
    },
  },
  {
    key: "yAxis",
    label: "Y 轴",
    fields: {
      "show": { kind: "boolean", label: "显示轴" },
      "type": {
        kind: "select",
        label: "轴类型",
        options: [
          { label: "数值轴", value: "value" },
          { label: "类目轴", value: "category" },
          { label: "时间轴", value: "time" },
          { label: "对数轴", value: "log" },
        ],
      },
      "name": { kind: "string", label: "轴名称" },
      "axisLabel": textStyle("轴标签样式"),
      "axisLine.lineStyle": lineStyle("轴线样式"),
      "splitLine.show": { kind: "boolean", label: "显示分割线" },
      "splitLine.lineStyle": lineStyle("分割线样式"),
    },
  },
];

const seriesGroup = (fields: Record<string, FieldMeta>): SchemaGroup => ({
  key: "series",
  label: "系列 Series",
  desc: "主系列（第 1 条）样式",
  fields,
});

const SCHEMAS: Record<ChartType, ChartSchema> = {
  line: {
    type: "line",
    label: CHART_META.line.label,
    labelEn: CHART_META.line.labelEn,
    groups: [
      titleGroup,
      legendGroup,
      tooltipGroup,
      ...cartesianGroups(),
      seriesGroup({
        "0.name": { kind: "string", label: "系列名称" },
        "0.smooth": { kind: "boolean", label: "平滑曲线" },
        "0.showSymbol": { kind: "boolean", label: "显示数据点" },
        "0.lineStyle": lineStyle("线条样式"),
        "0.areaStyle.opacity": { kind: "number", label: "面积透明度", min: 0, max: 1, step: 0.02 },
      }),
    ],
  },
  bar: {
    type: "bar",
    label: CHART_META.bar.label,
    labelEn: CHART_META.bar.labelEn,
    groups: [
      titleGroup,
      legendGroup,
      tooltipGroup,
      ...cartesianGroups(),
      seriesGroup({
        "0.name": { kind: "string", label: "系列名称" },
        "0.barMaxWidth": { kind: "number", label: "最大柱宽", min: 4, max: 80, step: 1 },
        "0.itemStyle.color": { kind: "color", label: "柱体颜色" },
        "0.itemStyle.borderRadius": { kind: "number", label: "圆角", min: 0, max: 20, step: 1 },
        "0.label.show": { kind: "boolean", label: "显示数值标签" },
      }),
    ],
  },
  pie: {
    type: "pie",
    label: CHART_META.pie.label,
    labelEn: CHART_META.pie.labelEn,
    groups: [
      titleGroup,
      legendGroup,
      tooltipGroup,
      seriesGroup({
        "0.name": { kind: "string", label: "系列名称" },
        "0.radius.0": { kind: "string", label: "内半径" },
        "0.radius.1": { kind: "string", label: "外半径" },
        "0.label.show": { kind: "boolean", label: "显示扇区标签" },
        "0.label.color": { kind: "color", label: "标签颜色" },
        "0.itemStyle.borderWidth": { kind: "number", label: "扇区间隙", min: 0, max: 8, step: 1 },
        "0.itemStyle.borderColor": { kind: "color", label: "间隙颜色" },
      }),
    ],
  },
  map: {
    type: "map",
    label: CHART_META.map.label,
    labelEn: CHART_META.map.labelEn,
    groups: [
      titleGroup,
      tooltipGroup,
      {
        key: "visualMap",
        label: "视觉映射 VisualMap",
        fields: {
          "show": { kind: "boolean", label: "显示视觉映射" },
          "min": { kind: "number", label: "最小值", min: 0, max: 100000, step: 10 },
          "max": { kind: "number", label: "最大值", min: 0, max: 100000, step: 10 },
          "calculable": { kind: "boolean", label: "可拖拽筛选" },
          "textStyle": textStyle("文字样式"),
        },
      },
      seriesGroup({
        "0.name": { kind: "string", label: "系列名称" },
        "0.roam": { kind: "boolean", label: "允许缩放平移" },
        "0.label.show": { kind: "boolean", label: "显示区域名" },
        "0.itemStyle.areaColor": { kind: "color", label: "区域底色" },
        "0.itemStyle.borderColor": { kind: "color", label: "区域描边" },
        "0.emphasis.itemStyle.areaColor": { kind: "color", label: "高亮色" },
      }),
    ],
  },
  scatter: {
    type: "scatter",
    label: CHART_META.scatter.label,
    labelEn: CHART_META.scatter.labelEn,
    groups: [
      titleGroup,
      legendGroup,
      tooltipGroup,
      ...cartesianGroups(),
      seriesGroup({
        "0.name": { kind: "string", label: "系列名称" },
        "0.symbolSize": { kind: "number", label: "点大小", min: 2, max: 40, step: 1 },
        "0.itemStyle.opacity": { kind: "number", label: "不透明度", min: 0.1, max: 1, step: 0.05 },
        "0.itemStyle.color": { kind: "color", label: "点颜色" },
      }),
    ],
  },
  radar: {
    type: "radar",
    label: CHART_META.radar.label,
    labelEn: CHART_META.radar.labelEn,
    groups: [
      titleGroup,
      legendGroup,
      tooltipGroup,
      {
        key: "radar",
        label: "雷达坐标系",
        fields: {
          "shape": {
            kind: "select",
            label: "形状",
            options: [
              { label: "多边形", value: "polygon" },
              { label: "圆形", value: "circle" },
            ],
          },
          "splitNumber": { kind: "number", label: "分割段数", min: 1, max: 10, step: 1 },
          "radius": { kind: "string", label: "半径" },
          "axisName": textStyle("轴名称样式"),
          "splitLine.lineStyle": lineStyle("分割线样式"),
        },
      },
      seriesGroup({
        "0.data.0.name": { kind: "string", label: "数据项名称" },
        "0.data.0.areaStyle.opacity": { kind: "number", label: "填充透明度", min: 0, max: 1, step: 0.02 },
        "0.symbolSize": { kind: "number", label: "顶点大小", min: 0, max: 20, step: 1 },
      }),
    ],
  },
};

export function getSchema(type: ChartType): ChartSchema {
  return SCHEMAS[type] ?? SCHEMAS.line;
}
