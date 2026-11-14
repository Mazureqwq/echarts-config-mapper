/**
 * ChartForge — Task 9 演示种子（兼容降级 + 废弃清理）
 *
 * 用法：打开 dev server（http://localhost:5173/）后，在浏览器控制台粘贴本脚本，
 *       即会写入三个演示屏：
 *         #/workbench/t9-legacy-flat   —— v1 旧形状 props（无任何 v2 增量字段）
 *         #/workbench/t9-legacy-tilted —— 旧 tilted 屏 + 历史皮肤写入的具体色值
 *         #/workbench/t9-current        —— 现行 v2 地图（对照）
 *
 * T9 的两个演示屏刻意只带**旧**字段：没有 legend / label / border / emphasis /
 * tooltipStyle / scaleBar / offset，也没有 v2 的 underlay / appliedSkin
 * （皮肤体系已废弃，历史屏里已被皮肤写进 props 的具体颜色值仍然生效）。
 */
(() => {
  const STORAGE_KEY = "chartforge.workspace.v1";

  const rows = [
    { province: "广东省", score: 90 },
    { province: "西藏自治区", score: 30 },
    { province: "浙江省", score: 60 },
    { province: "四川省", score: 45 },
    { province: "新疆维吾尔自治区", score: 52 },
    { province: "黑龙江省", score: 38 },
    { province: "山东省", score: 71 },
    { province: "云南省", score: 49 },
  ];

  const DATASET_ID = "t9-demo-regions";

  const makeScreen = (id, name, props) => ({
    id,
    name,
    canvas: { width: 1280, height: 720, background: { kind: "color", color: "#050b12" } },
    items: [
      {
        id: `${id}-scene`,
        name: "地图场景",
        kind: "component",
        componentId: props.presentation === "tilted" ? "chartforge.map-scene-tilted" : "chartforge.map-scene-flat",
        componentVersion: 1,
        frame: { x: 60, y: 50, w: 900, h: 560, rotate: 0 },
        dataBinding: { datasetId: DATASET_ID, fields: { category: "province", value: "score" } },
        props,
      },
    ],
    updatedAt: Date.now(),
  });

  /* (a) v1 旧形状 props：只有 modelVersion/presentation/pitch/view/layers */
  const legacyFlat = {
    modelVersion: 1,
    presentation: "flat",
    pitch: 0,
    view: {
      center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8,
      dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#081622",
    },
    layers: [
      { id: "legacy-fill", type: "regionFill", name: "旧填色", visible: true, style: { color: "#336699", opacity: 0.85, size: 12 } },
    ],
  };

  /* (b) 旧 tilted 屏 + 历史皮肤（翡翠青绿 jade）写入的具体色值。
       underlay / appliedSkin 是已废弃字段，会被忽略而不是让渲染失败。 */
  const legacyTilted = {
    modelVersion: 1,
    presentation: "tilted",
    pitch: 28,
    view: {
      center: [104.114129, 35.550339], zoom: 1.05, minZoom: 1, maxZoom: 8,
      dragEnabled: true, zoomEnabled: true, showLabels: true, backgroundColor: "#06170f",
    },
    border: { color: "#9ff5cf", width: 1, type: "solid" },
    label: { show: true, color: "#eafff5", size: 10, stroke: "#0b3a28" },
    emphasis: { areaColor: "#2fd98a", borderColor: "#ffffff", labelColor: "#ffffff" },
    tooltipStyle: { background: "#071d13", borderColor: "#1f4a35", color: "#eafff5", fontSize: 12 },
    underlay: [
      { areaColor: "#04150d", borderColor: "#1f9d66", shadowColor: "#1f9d66" },
      { areaColor: "#0a2a1c", borderColor: "#3ad6a0", shadowColor: "#3ad6a0" },
      { areaColor: "#103826", borderColor: "#b8f5d8", shadowColor: "#8cd3b4" },
    ],
    appliedSkin: "jade",
    layers: [
      {
        id: "skin-fill", type: "regionFill", name: "翡翠青绿", visible: true,
        style: {
          colorMode: "gradient",
          colors: { min: "#0b2b1e", mid: "#178a5a", max: "#5dffb0", empty: "#0a2018" },
          opacity: 0.85, size: 12,
        },
      },
    ],
  };

  /* (c) 现行 v2 地图：带比例尺 / 标注 / 精确外轮廓强化层，对照用 */
  const current = {
    modelVersion: 2,
    presentation: "tilted",
    pitch: 28,
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
        id: "t9-fill", type: "regionFill", name: "热度", visible: true,
        style: {
          color: "#32d6ff", opacity: 0.85, size: 12, colorMode: "gradient",
          colors: { min: "#102b3d", mid: "#1c5f8f", max: "#66ffff", empty: "#0d1a26" },
        },
      },
    ],
  };

  const workspace = {
    version: 2,
    assets: [],
    designAssets: [],
    screens: [
      makeScreen("t9-legacy-flat", "T9 旧 v1 屏（无 v2 字段）", legacyFlat),
      makeScreen("t9-legacy-tilted", "T9 旧 tilted 屏 + 历史皮肤色值", legacyTilted),
      makeScreen("t9-current", "T9 现行 v2 地图（对照）", current),
    ],
    datasets: [
      { id: DATASET_ID, name: "省级热度集", source: { kind: "static", data: rows }, pipeline: { filter: [] } },
    ],
    settings: { autosave: true },
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  console.log("[ChartForge T9] 演示数据已写入。可访问：");
  console.log("  #/workbench/t9-legacy-flat   —— 旧 v1 props（pitch 0，无图例/比例尺/外轮廓）");
  console.log("  #/workbench/t9-legacy-tilted —— 旧 tilted 屏 + 历史皮肤色值（pitch 28）");
  console.log("  #/workbench/t9-current        —— 现行 v2 地图（比例尺/标注/精确外轮廓）");
})();
