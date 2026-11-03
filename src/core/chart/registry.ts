import type { ChartSpec, ChartType } from "../model/types";
import { emptyChartData } from "./chartData";

export type ControlKind = "text" | "number" | "color" | "select" | "switch";

export interface FieldConfig {
  label: string;
  path: string;
  control: ControlKind;
  options?: { label: string; value: string | number }[];
}

export interface ConfigGroup {
  title: string;
  fields: FieldConfig[];
}

export interface ColumnDef {
  key: string;
  label: string;
  required?: boolean;
}

export interface ChartDescriptor {
  type: ChartType;
  label: string;
  dataKind: ChartSpec["data"]["kind"];
  configGroups: ConfigGroup[];
  columns: ColumnDef[];
  defaultSpec(): ChartSpec;
}

const titleGroup: ConfigGroup = {
  title: "标题",
  fields: [
    { label: "显示标题", path: "title.show", control: "switch" },
    { label: "标题文字", path: "title.text", control: "text" },
  ],
};

const legendGroup: ConfigGroup = {
  title: "图例",
  fields: [{ label: "显示图例", path: "legend.show", control: "switch" }],
};

const tooltipGroup: ConfigGroup = {
  title: "提示框",
  fields: [
    {
      label: "触发方式",
      path: "tooltip.trigger",
      control: "select",
      options: [
        { label: "坐标轴", value: "axis" },
        { label: "数据项", value: "item" },
      ],
    },
  ],
};

const axisGroups: ConfigGroup[] = [
  {
    title: "横轴",
    fields: [
      { label: "显示横轴", path: "xAxis.show", control: "switch" },
      { label: "轴线颜色", path: "xAxis.axisLine.lineStyle.color", control: "color" },
    ],
  },
  {
    title: "纵轴",
    fields: [
      { label: "显示纵轴", path: "yAxis.show", control: "switch" },
      { label: "分割线颜色", path: "yAxis.splitLine.lineStyle.color", control: "color" },
    ],
  },
];

const categoryColumns: ColumnDef[] = [
  { key: "category", label: "类目", required: true },
  { key: "series", label: "系列（可多列）", required: true },
];

const nameValueColumns: ColumnDef[] = [
  { key: "name", label: "名称", required: true },
  { key: "value", label: "数值", required: true },
];

const xyColumns: ColumnDef[] = [
  { key: "x", label: "x", required: true },
  { key: "y", label: "y", required: true },
  { key: "name", label: "名称" },
  { key: "group", label: "分组" },
];

const radarColumns: ColumnDef[] = [
  { key: "series", label: "系列", required: true },
  { key: "indicator", label: "指标（可多列）", required: true },
];

function descriptor(
  type: ChartType,
  label: string,
  dataKind: ChartSpec["data"]["kind"],
  configGroups: ConfigGroup[],
  columns: ColumnDef[]
): ChartDescriptor {
  return {
    type,
    label,
    dataKind,
    configGroups,
    columns,
    defaultSpec(): ChartSpec {
      return { type, option: {}, data: emptyChartData(type) };
    },
  };
}

export const chartRegistry: Record<ChartType, ChartDescriptor> = {
  line: descriptor("line", "折线图", "category", [
    titleGroup,
    legendGroup,
    tooltipGroup,
    ...axisGroups,
    {
      title: "系列",
      fields: [
        { label: "平滑曲线", path: "series.0.smooth", control: "switch" },
        { label: "线宽", path: "series.0.lineStyle.width", control: "number" },
        { label: "面积透明度", path: "series.0.areaStyle.opacity", control: "number" },
      ],
    },
  ], categoryColumns),
  bar: descriptor("bar", "柱状图", "category", [
    titleGroup,
    legendGroup,
    tooltipGroup,
    ...axisGroups,
    {
      title: "系列",
      fields: [
        { label: "柱条宽度", path: "series.0.barWidth", control: "number" },
        { label: "柱条圆角", path: "series.0.itemStyle.borderRadius", control: "number" },
      ],
    },
  ], categoryColumns),
  pie: descriptor("pie", "饼图", "nameValue", [
    titleGroup,
    legendGroup,
    tooltipGroup,
    {
      title: "系列",
      fields: [
        { label: "外半径", path: "series.0.radius", control: "text" },
        { label: "内半径", path: "series.0.radiusInner", control: "text" },
        { label: "显示标签", path: "series.0.label.show", control: "switch" },
      ],
    },
  ], nameValueColumns),
  map: descriptor("map", "地图", "nameValue", [
    titleGroup,
    legendGroup,
    tooltipGroup,
    {
      title: "视觉映射",
      fields: [
        { label: "最小值", path: "visualMap.min", control: "number" },
        { label: "最大值", path: "visualMap.max", control: "number" },
        { label: "显示拖拽手柄", path: "visualMap.calculable", control: "switch" },
      ],
    },
  ], nameValueColumns),
  scatter: descriptor("scatter", "散点图", "xy", [
    titleGroup,
    legendGroup,
    tooltipGroup,
    ...axisGroups,
    {
      title: "系列",
      fields: [
        { label: "符号大小", path: "series.0.symbolSize", control: "number" },
        { label: "显示标签", path: "series.0.label.show", control: "switch" },
      ],
    },
  ], xyColumns),
  radar: descriptor("radar", "雷达图", "radar", [
    titleGroup,
    legendGroup,
    tooltipGroup,
    {
      title: "系列",
      fields: [
        {
          label: "形状",
          path: "series.0.shape",
          control: "select",
          options: [
            { label: "多边形", value: "polygon" },
            { label: "圆形", value: "circle" },
          ],
        },
        { label: "面积透明度", path: "series.0.areaStyle.opacity", control: "number" },
      ],
    },
  ], radarColumns),
};
