import { DARK_PALETTE } from "@/config/editor";
import type { ChartType, EChartsOptionLike } from "@/types/chart";
import { deepClone } from "@/utils/object";

const TEXT_STYLE = { color: "#E6EAF2", fontSize: 14, fontFamily: "Inter, system-ui, sans-serif" };

const baseTitle = (text: string) => ({
  show: true,
  text,
  left: "center",
  top: 12,
  textStyle: { ...TEXT_STYLE, fontSize: 16, fontWeight: 600 },
  subtextStyle: { color: "#8A94A6", fontSize: 12 },
});

const baseLegend = () => ({
  show: true,
  top: 44,
  left: "center",
  orient: "horizontal",
  itemGap: 16,
  itemWidth: 12,
  itemHeight: 8,
  icon: "roundRect",
  textStyle: { color: "#A7B0C0", fontSize: 12 },
  inactiveColor: "#4A5468",
});

const baseTooltip = () => ({
  show: true,
  trigger: "axis",
  confine: true,
  backgroundColor: "rgba(17,24,38,0.95)",
  borderColor: "#2A3550",
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: "#E6EAF2", fontSize: 12 },
});

const axisBase = () => ({
  axisLine: { show: true, lineStyle: { color: "#2A3550" } },
  axisTick: { show: false },
  axisLabel: { show: true, color: "#8A94A6", fontSize: 11 },
  splitLine: { show: true, lineStyle: { color: "rgba(42,53,80,0.65)", type: "dashed" } },
});

function lineOption(): EChartsOptionLike {
  return {
    backgroundColor: "transparent",
    color: DARK_PALETTE,
    title: baseTitle("月度趋势"),
    legend: baseLegend(),
    tooltip: baseTooltip(),
    grid: { left: 44, right: 24, top: 88, bottom: 36, containLabel: true },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: ["1月", "2月", "3月", "4月", "5月", "6月", "7月"],
      ...axisBase(),
    },
    yAxis: { type: "value", ...axisBase() },
    series: [
      {
        name: "访问量",
        type: "line",
        smooth: true,
        showSymbol: true,
        symbolSize: 6,
        data: [820, 932, 901, 934, 1290, 1330, 1320],
        lineStyle: { width: 2.5 },
        areaStyle: { opacity: 0.18 },
      },
      {
        name: "转化量",
        type: "line",
        smooth: true,
        showSymbol: true,
        symbolSize: 6,
        data: [320, 402, 431, 534, 690, 730, 810],
        lineStyle: { width: 2.5 },
        areaStyle: { opacity: 0.18 },
      },
    ],
  };
}

function barOption(): EChartsOptionLike {
  return {
    backgroundColor: "transparent",
    color: DARK_PALETTE,
    title: baseTitle("渠道对比"),
    legend: baseLegend(),
    tooltip: { ...baseTooltip(), trigger: "axis" },
    grid: { left: 44, right: 24, top: 88, bottom: 36, containLabel: true },
    xAxis: {
      type: "category",
      data: ["自然搜索", "社交", "直投", "邮件", "联盟"],
      ...axisBase(),
      splitLine: { show: false },
    },
    yAxis: { type: "value", ...axisBase() },
    series: [
      {
        name: "本月",
        type: "bar",
        barMaxWidth: 28,
        data: [120, 200, 150, 80, 170],
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
      {
        name: "上月",
        type: "bar",
        barMaxWidth: 28,
        data: [90, 160, 120, 60, 140],
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
    ],
  };
}

function pieOption(): EChartsOptionLike {
  return {
    backgroundColor: "transparent",
    color: DARK_PALETTE,
    title: baseTitle("流量构成"),
    legend: { ...baseLegend(), top: "auto", bottom: 8 },
    tooltip: {
      ...baseTooltip(),
      trigger: "item",
      formatter: "{b}: {c} ({d}%)",
    },
    series: [
      {
        name: "来源",
        type: "pie",
        radius: ["42%", "66%"],
        center: ["50%", "46%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: "#0B0F17", borderWidth: 2 },
        label: { color: "#A7B0C0", fontSize: 11 },
        labelLine: { lineStyle: { color: "#2A3550" } },
        data: [
          { value: 1048, name: "搜索" },
          { value: 735, name: "社交" },
          { value: 580, name: "直投" },
          { value: 484, name: "邮件" },
          { value: 300, name: "其他" },
        ],
      },
    ],
  };
}

function mapOption(): EChartsOptionLike {
  return {
    backgroundColor: "transparent",
    title: baseTitle("地域分布"),
    tooltip: { ...baseTooltip(), trigger: "item", formatter: "{b}" },
    visualMap: {
      show: true,
      min: 0,
      max: 1000,
      left: 12,
      bottom: 12,
      itemWidth: 10,
      itemHeight: 70,
      calculable: true,
      textStyle: { color: "#8A94A6", fontSize: 11 },
      inRange: { color: ["#1E2A45", "#3B4C86", "#6366F1"] },
    },
    series: [
      {
        name: "热度",
        type: "map",
        map: "china",
        roam: false,
        label: { show: false },
        itemStyle: { areaColor: "#1B2436", borderColor: "#39466B", borderWidth: 0.8 },
        emphasis: {
          label: { show: true, color: "#E6EAF2" },
          itemStyle: { areaColor: "#6366F1" },
        },
        // 名称需与 china.json 的 properties.name 完全一致，否则不会着色
        data: [
          { name: "广东省", value: 980 },
          { name: "北京市", value: 860 },
          { name: "浙江省", value: 720 },
          { name: "上海市", value: 690 },
          { name: "四川省", value: 430 },
          { name: "湖北省", value: 380 },
        ],
      },
    ],
  };
}

function scatterOption(): EChartsOptionLike {
  return {
    backgroundColor: "transparent",
    color: DARK_PALETTE,
    title: baseTitle("相关性分布"),
    legend: baseLegend(),
    tooltip: { ...baseTooltip(), trigger: "item" },
    grid: { left: 52, right: 28, top: 88, bottom: 44, containLabel: true },
    xAxis: { type: "value", scale: true, ...axisBase() },
    yAxis: { type: "value", scale: true, ...axisBase() },
    series: [
      {
        name: "样本 A",
        type: "scatter",
        symbolSize: 10,
        data: [
          [12, 32], [24, 61], [36, 45], [48, 78], [56, 52],
          [64, 88], [72, 66], [84, 94], [96, 71],
        ],
        itemStyle: { opacity: 0.85 },
      },
      {
        name: "样本 B",
        type: "scatter",
        symbolSize: 10,
        data: [
          [16, 18], [28, 30], [40, 26], [52, 44], [60, 38],
          [70, 55], [78, 48], [90, 62], [99, 57],
        ],
        itemStyle: { opacity: 0.85 },
      },
    ],
  };
}

function radarOption(): EChartsOptionLike {
  return {
    backgroundColor: "transparent",
    color: DARK_PALETTE,
    title: baseTitle("能力评估"),
    legend: { ...baseLegend(), top: "auto", bottom: 8 },
    tooltip: baseTooltip(),
    radar: {
      center: ["50%", "48%"],
      radius: "62%",
      splitNumber: 4,
      axisName: { color: "#8A94A6", fontSize: 11 },
      splitLine: { lineStyle: { color: "rgba(42,53,80,0.9)" } },
      splitArea: { areaStyle: { color: ["rgba(24,32,47,0.55)", "rgba(17,24,38,0.55)"] } },
      axisLine: { lineStyle: { color: "rgba(42,53,80,0.9)" } },
      indicator: [
        { name: "行业信息", max: 100 },
        { name: "企业规模", max: 100 },
        { name: "企业信用", max: 100 },
        { name: "创新能力", max: 100 },
        { name: "人才潜力", max: 100 },
        { name: "融资能力", max: 100 },
      ],
    },
    series: [
      {
        type: "radar",
        data: [
          { value: [78, 92, 86, 64, 72, 58], name: "本期", areaStyle: { opacity: 0.22 } },
          { value: [60, 70, 74, 82, 55, 66], name: "上期", areaStyle: { opacity: 0.12 } },
        ],
      },
    ],
  };
}

const FACTORIES: Record<ChartType, () => EChartsOptionLike> = {
  line: lineOption,
  bar: barOption,
  pie: pieOption,
  map: mapOption,
  scatter: scatterOption,
  radar: radarOption,
};

/** 生成某类型图表的默认 option（每次返回全新副本，互不干扰） */
export function createDefaultOption(type: ChartType): EChartsOptionLike {
  return deepClone(FACTORIES[type]());
}

/** 深色主题联动：图表自适应容器尺寸 */
export const CHART_RENDERER_OPTIONS = { renderer: "canvas" as const };
