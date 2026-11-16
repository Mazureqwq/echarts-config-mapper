/**
 * ChartForge — Task 16 演示种子（我的收藏）
 *
 * 用法：打开 dev server 后访问 http://localhost:5174/?demo=t16#/workbench/t16-favorites-demo
 *       （或把本脚本粘贴进浏览器控制台）即会写入演示屏：
 *         #/workbench/t15-suite-demo —— 标题栏 / 指标卡 / 进度条组 / 平面地图
 *
 * 演示动作：
 *   1. 左侧「组件」标签 → 指标卡卡片右上角 ☆ → 变实心；
 *   2. 左侧「设计库」→ 顶部「我的收藏」区立刻出现「指标卡」条目；
 *   3. 点该条目即插入画布；点 × 取消收藏，星标同步变回空心；
 *   4. 刷新页面后收藏仍在（收藏随工作区落盘，只存 kind+id+version）。
 *
 * 注意：颜色类 props（accentColor / color / fillColor / trackColor）留空串，
 * 表示「跟随主题令牌」，插入后即由套件强调色驱动。
 */
(() => {
  const STORAGE_KEY = "chartforge.workspace.v1";
  const SCREEN_ID = "t16-favorites-demo";
  const DATASET_ID = "t16-demo-regions";

  const regionRows = [
    { province: "广东省", score: 92 },
    { province: "江苏省", score: 84 },
    { province: "浙江省", score: 78 },
    { province: "山东省", score: 71 },
    { province: "湖北省", score: 63 },
    { province: "湖南省", score: 58 },
    { province: "四川省", score: 55 },
    { province: "云南省", score: 49 },
    { province: "新疆维吾尔自治区", score: 41 },
    { province: "黑龙江省", score: 36 },
    { province: "内蒙古自治区", score: 33 },
    { province: "西藏自治区", score: 28 },
  ];

  const rows = [
    { name: "华东区", value: 86 },
    { name: "华南区", value: 72 },
    { name: "华北区", value: 64 },
    { name: "西南区", value: 93 },
  ];

  const items = [
    {
      id: "t16-title",
      name: "标题栏",
      kind: "component",
      componentId: "chartforge.section-title",
      componentVersion: 1,
      frame: { x: 60, y: 40, w: 700, h: 70, rotate: 0 },
      props: { title: "区域销售总览", subtitle: "切换设计库顶部的可视化套件，观察画布与新建元素的观感变化", variant: "underline", accentColor: "" },
    },
    {
      id: "t16-kpi",
      name: "指标卡",
      kind: "component",
      componentId: "chartforge.kpi",
      componentVersion: 1,
      frame: { x: 60, y: 140, w: 300, h: 160, rotate: 0 },
      props: { valueField: "value", label: "本月营收", format: "currency", aggregation: "sum" },
      dataBinding: { datasetId: DATASET_ID, fields: { value: "value" } },
    },
    {
      id: "t16-progress",
      name: "进度条组",
      kind: "component",
      componentId: "chartforge.progress-list",
      componentVersion: 1,
      frame: { x: 400, y: 140, w: 360, h: 200, rotate: 0 },
      props: { labelField: "name", valueField: "value", maxValue: 100, fillColor: "", trackColor: "" },
      dataBinding: { datasetId: DATASET_ID, fields: { name: "name", value: "value" } },
    },
    {
      id: "t16-map",
      name: "平面地图",
      kind: "component",
      componentId: "chartforge.map-scene-flat",
      componentVersion: 1,
      frame: { x: 60, y: 360, w: 620, h: 460, rotate: 0 },
      props: {
        presentation: "flat",
        pitch: 0,
        backgroundColor: "#06170f",
        border: { color: "#9ff5cf", width: 1, type: "solid" },
        label: { show: true, color: "#eafff5", size: 10, stroke: "#0b3a28" },
        legend: { show: true, position: "top-right", mode: "continuous" },
        layers: [
          {
            id: "t16-fill",
            type: "regionFill",
            name: "省级热度",
            visible: true,
            style: {
              color: "#5dffb0", opacity: 0.85, size: 12, colorMode: "gradient",
              colors: { min: "#0b2b1e", mid: "#178a5a", max: "#5dffb0", empty: "#0a2018" },
            },
          },
        ],
      },
      dataBinding: { datasetId: DATASET_ID, fields: { province: "province", value: "score" } },
    },
  ];

  const screen = {
    id: SCREEN_ID,
    name: "我的收藏演示",
    canvas: { width: 1600, height: 900, background: { kind: "color", color: "#0a0f16" } },
    items,
    updatedAt: Date.now(),
  };

  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  const workspace =
    existing && typeof existing === "object"
      ? existing
      : { version: 2, assets: [], designAssets: [], screens: [], datasets: [], settings: { autosave: true } };
  workspace.favorites = [
    { kind: "component", id: "chartforge.kpi", version: 1 },
    { kind: "block", id: "title-panel", version: 1 },
    { kind: "component", id: "chartforge.retired-widget", version: 1 },
  ];
  workspace.screens = (workspace.screens ?? []).filter((entry) => entry?.id !== SCREEN_ID);
  workspace.screens.push(screen);
  workspace.datasets = (workspace.datasets ?? []).filter((entry) => entry?.id !== DATASET_ID);
  workspace.datasets.push({
    id: DATASET_ID,
    name: "区域销售（演示）",
    source: {
      kind: "static",
      data: regionRows.map((row, index) => ({
        ...row,
        // 进度条组按 labelField: "name" 取标签，地图按 province 映射省界
        name: rows[index % rows.length].name,
        value: rows[index % rows.length].value,
      })),
    },
    pipeline: { filter: [] },
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  console.log("[chartforge] T16 收藏演示屏已写入：#/workbench/t16-favorites-demo");
})();
