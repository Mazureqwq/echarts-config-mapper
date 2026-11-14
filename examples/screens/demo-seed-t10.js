/**
 * ChartForge — Task 10 演示种子（整分支评审修复：地理散点 / 点热力 / OD 飞线）
 *
 * 用法：打开 dev server 后访问 http://localhost:5174/?demo=t10#/workbench/t10-geo-layers
 *       （或把本脚本粘贴进浏览器控制台）即会写入演示屏：
 *         #/workbench/t10-geo-layers —— 区域填色 + 地理散点 + 点热力 + OD 飞线
 *
 * 背景：MapLibre 迁移评审发现，旧 ECharts 渲染器支持的 geoScatter / geoHeatmap / geoFlow
 *       在 MapLibre 侧曾被静默丢弃（图层可新增但不渲染）。本次修复后三类图层
 *       以 circle / heatmap / line 图层落地，绑定数据缺失时显式报错而非静默。
 */
(() => {
  const STORAGE_KEY = "chartforge.workspace.v1";

  const regionRows = [
    { province: "广东省", score: 90 },
    { province: "西藏自治区", score: 30 },
    { province: "浙江省", score: 60 },
    { province: "四川省", score: 45 },
    { province: "新疆维吾尔自治区", score: 52 },
    { province: "黑龙江省", score: 38 },
    { province: "山东省", score: 71 },
    { province: "云南省", score: 49 },
  ];

  /* 城市点：地理散点（带名称标注）+ 点热力（带数值权重） */
  const cityRows = [
    { city: "北京", lng: 116.41, lat: 39.9, weight: 96 },
    { city: "上海", lng: 121.47, lat: 31.23, weight: 88 },
    { city: "广州", lng: 113.26, lat: 23.13, weight: 82 },
    { city: "成都", lng: 104.07, lat: 30.57, weight: 61 },
    { city: "西安", lng: 108.95, lat: 34.27, weight: 54 },
    { city: "哈尔滨", lng: 126.53, lat: 45.8, weight: 33 },
    { city: "乌鲁木齐", lng: 87.62, lat: 43.82, weight: 27 },
    { city: "昆明", lng: 102.83, lat: 24.88, weight: 44 },
    { city: "拉萨", lng: 91.11, lat: 29.65, weight: 19 },
    { city: "海口", lng: 110.32, lat: 20.04, weight: 41 },
  ];

  /* OD 飞线：起点/终点经纬度 */
  const flowRows = [
    { route: "京沪线", fromLng: 116.41, fromLat: 39.9, toLng: 121.47, toLat: 31.23 },
    { route: "京广线", fromLng: 116.41, fromLat: 39.9, toLng: 113.26, toLat: 23.13 },
    { route: "成渝线", fromLng: 104.07, fromLat: 30.57, toLng: 108.95, toLat: 34.27 },
    { route: "沪昆线", fromLng: 121.47, fromLat: 31.23, toLng: 102.83, toLat: 24.88 },
    { route: "哈穗线", fromLng: 126.53, fromLat: 45.8, toLng: 113.26, toLat: 23.13 },
    { route: "乌昆线", fromLng: 87.62, fromLat: 43.82, toLng: 102.83, toLat: 24.88 },
  ];

  const REGION_DATASET = "t10-demo-regions";
  const CITY_DATASET = "t10-demo-cities";
  const FLOW_DATASET = "t10-demo-flows";

  const screen = {
    id: "t10-geo-layers",
    name: "T10 地理散点 / 点热力 / OD 飞线",
    canvas: { width: 1280, height: 720, background: { kind: "color", color: "#050b12" } },
    items: [
      {
        id: "t10-geo-scene",
        name: "地图场景",
        kind: "component",
        componentId: "chartforge.map-scene-tilted",
        componentVersion: 1,
        frame: { x: 60, y: 50, w: 900, h: 560, rotate: 0 },
        dataBinding: { datasetId: REGION_DATASET, fields: { category: "province", value: "score" } },
        props: {
          modelVersion: 2,
          presentation: "tilted",
          pitch: 28,
          valueFormat: { decimals: 0, suffix: " 分" },
          legend: { show: true, position: "top-right", mode: "continuous" },
          scaleBar: { show: true, position: "bottom-left" },
          label: { show: true, color: "#eaffff", size: 12, minZoom: 1 },
          border: { color: "#8888ff", width: 1.5, type: "solid", outline: { show: true, color: "#ffd166", width: 3 } },
          view: {
            center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8,
            dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622",
          },
          layers: [
            {
              id: "t10-fill", type: "regionFill", name: "省级热度", visible: true,
              style: {
                color: "#32d6ff", opacity: 0.85, size: 12, colorMode: "gradient",
                colors: { min: "#102b3d", mid: "#1c5f8f", max: "#66ffff", empty: "#0d1a26" },
              },
            },
            {
              id: "t10-scatter", type: "geoScatter", name: "城市网点", visible: true,
              style: {
                color: "#ffcc66", opacity: 1, size: 12,
                label: { show: true, color: "#ffffff", size: 12, stroke: "#000000" },
              },
              dataBinding: {
                datasetId: CITY_DATASET,
                fields: { geo: { longitude: "lng", latitude: "lat", name: "city" } },
              },
            },
            {
              id: "t10-heat", type: "geoHeatmap", name: "城市热力", visible: true,
              style: { color: "#ff6b6b", opacity: 0.85, size: 16 },
              dataBinding: {
                datasetId: CITY_DATASET,
                fields: { geo: { longitude: "lng", latitude: "lat", value: "weight" } },
              },
            },
            {
              id: "t10-flow", type: "geoFlow", name: "高铁干线", visible: true,
              style: { color: "#32d6ff", opacity: 1, size: 8, animated: true },
              dataBinding: {
                datasetId: FLOW_DATASET,
                fields: {
                  geo: {
                    originLongitude: "fromLng", originLatitude: "fromLat",
                    destinationLongitude: "toLng", destinationLatitude: "toLat",
                    name: "route",
                  },
                },
              },
            },
          ],
        },
      },
    ],
    updatedAt: Date.now(),
  };

  const workspace = {
    version: 2,
    assets: [],
    designAssets: [],
    screens: [screen],
    datasets: [
      { id: REGION_DATASET, name: "省级热度集", source: { kind: "static", data: regionRows }, pipeline: { filter: [] } },
      { id: CITY_DATASET, name: "城市点集", source: { kind: "static", data: cityRows }, pipeline: { filter: [] } },
      { id: FLOW_DATASET, name: "干线集", source: { kind: "static", data: flowRows }, pipeline: { filter: [] } },
    ],
    settings: { autosave: true },
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  console.log("[ChartForge T10] 演示数据已写入 → #/workbench/t10-geo-layers");
})();
