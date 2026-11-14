/**
 * ChartForge — Task 11 演示种子（地图「快速样式」集合）
 *
 * 用法：打开 dev server 后访问 http://localhost:5174/?demo=t11#/workbench/t11-quick-style
 *       （或把本脚本粘贴进浏览器控制台）即会写入演示屏：
 *         #/workbench/t11-quick-style —— 快速样式「山地绿洲」下的区域填色地图
 *
 * 背景：内置「快速样式」集合提供六套预设（深海蓝 / 山地绿洲 / 暖沙金 / 霓虹紫蓝 /
 *       靛蓝等高线 / 素雅宣纸），检查器以 3×2 缩略图网格呈现，缩略图用真实省界
 *       矢量按预设色带着色，所见即所得；预设令牌随 props 持久化，工作台与离线产物同源。
 */
(() => {
  const STORAGE_KEY = "chartforge.workspace.v1";

  const regionRows = [
    { province: "广东省", score: 92 },
    { province: "西藏自治区", score: 28 },
    { province: "浙江省", score: 78 },
    { province: "四川省", score: 55 },
    { province: "新疆维吾尔自治区", score: 41 },
    { province: "黑龙江省", score: 36 },
    { province: "山东省", score: 71 },
    { province: "云南省", score: 49 },
    { province: "内蒙古自治区", score: 33 },
    { province: "江苏省", score: 84 },
    { province: "湖北省", score: 63 },
    { province: "湖南省", score: 58 },
  ];

  const DATASET_ID = "t11-demo-regions";

  const screen = {
    id: "t11-quick-style",
    name: "T11 地图快速样式",
    canvas: { width: 1280, height: 720, background: { kind: "color", color: "#050b12" } },
    items: [
      {
        id: "t11-quick-scene",
        name: "快速样式地图",
        kind: "component",
        componentId: "chartforge.map-scene-tilted",
        componentVersion: 1,
        frame: { x: 40, y: 40, w: 900, h: 620, rotate: 0 },
        dataBinding: { datasetId: DATASET_ID, fields: { category: "province", value: "score" } },
        props: {
          presentation: "tilted",
          pitch: 28,
          quickStyle: { id: "jade" },
          view: {
            center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8,
            dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#06170f",
          },
          border: { color: "#9ff5cf", width: 1, type: "solid" },
          label: { show: true, color: "#eafff5", size: 10, stroke: "#0b3a28" },
          emphasis: { areaColor: "#2fd98a", borderColor: "#ffffff", labelColor: "#ffffff" },
          selected: { areaColor: "#7dffc4", borderColor: "#ffffff" },
          tooltipStyle: { background: "#071d13", borderColor: "#1f4a35", color: "#eafff5", fontSize: 12 },
          legend: { show: true, position: "top-right", mode: "continuous" },
          layers: [
            {
              id: "t11-fill",
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
      },
    ],
    updatedAt: Date.now(),
  };

  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  const workspace = existing && typeof existing === "object" ? existing : { version: 2, assets: [], designAssets: [], screens: [], datasets: [], settings: { autosave: true } };
  workspace.screens = (workspace.screens ?? []).filter((entry) => entry?.id !== screen.id);
  workspace.screens.push(screen);
  workspace.datasets = (workspace.datasets ?? []).filter((entry) => entry?.id !== DATASET_ID);
  workspace.datasets.push({
    id: DATASET_ID,
    name: "省级热度（演示）",
    source: { kind: "static", data: regionRows },
    pipeline: { filter: [] },
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  console.log("[chartforge] T11 快速样式演示屏已写入：#/workbench/t11-quick-style");
})();
