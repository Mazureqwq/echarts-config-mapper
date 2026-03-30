// 图表默认配置
export const CHART_DEFAULT_CONFIG = {
  LineChart: {
    title: { text: "折线图" },
    xAxis: { type: "category", data: ["周一", "周二", "周三", "周四", "周五"] },
    yAxis: { type: "value" },
    series: [{ data: [120, 200, 150, 80, 220], type: "line" }],
  },
  BarChart: {
    title: { text: "柱状图" },
    xAxis: { type: "category", data: ["周一", "周二", "周三", "周四", "周五"] },
    yAxis: { type: "value" },
    series: [{ data: [120, 200, 150, 80, 220], type: "bar" }],
  },
  PieChart: {
    title: { text: "饼图" },
    tooltip: { trigger: "item" },
    series: [
      {
        name: "访问量",
        type: "pie",
        radius: ["40%", "70%"],
        data: [
          { value: 1048, name: "首页" },
          { value: 735, name: "产品页" },
          { value: 580, name: "详情页" },
          { value: 484, name: "结算页" },
          { value: 300, name: "其他" },
        ],
      },
    ],
  },
} as const;

// 画布默认配置
export const CANVAS_DEFAULT_CONFIG = {
  SCREEN_WIDTH: 1920,
  SCREEN_HEIGHT: 1080,
  COMPONENT_DEFAULT_POSITION: { x: 100, y: 100 },
  COMPONENT_DEFAULT_SIZE: { w: 400, h: 300 },
  COMPONENT_SIZE_LIMIT: {
    MIN_WIDTH: 0,
    MAX_WIDTH: 1200,
    MIN_HEIGHT: 0,
    MAX_HEIGHT: 800,
  },
} as const;

// 组件类型枚举（增强类型提示）
export enum ChartComponentType {
  LineChart = "LineChart",
  BarChart = "BarChart",
  PieChart = "PieChart",
}
