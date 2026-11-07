/**
 * mock 数据发生器：零依赖、确定性（同一 seed 结果一致）。
 *
 * 数据量按「一眼看上去像真报表」的标准给：
 * 折线/柱状 12 个月 × 3 条系列、地图 34 个省级行政区全量、饼图 8 个分类、
 * 散点 120 个点 3 组、雷达 6 个指标 3 个系列、长表 240 行（12 月 × 4 渠道 × 5 区域）。
 */

/** mulberry32：小而稳的伪随机，保证同一 seed 每次结果一样，方便截图对比 */
export function rng(seed = 1) {
  let a = (Number(seed) || 1) >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function int(rand, min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

/** 在 base 上做 ±pct 的相对波动，结果取整 */
function wobble(rand, base, pct) {
  const delta = 1 + (rand() * 2 - 1) * pct;
  return Math.round(base * delta);
}

export const MONTHS = [
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
];

export const CHANNELS = ["线上商城", "线下门店", "分销渠道", "直播带货"];
export const REGIONS = ["华东", "华北", "华南", "西南", "东北"];
export const CATEGORIES = ["数码", "家电", "服饰", "美妆", "食品", "家居", "母婴", "运动"];
export const CITIES = ["上海", "北京", "广州", "成都", "杭州", "武汉", "深圳", "西安"];

/** 省级行政区全称：必须和 src/assets/geo/china.json 的 name 完全一致，否则地图不着色 */
export const PROVINCES = [
  "广东省", "江苏省", "浙江省", "山东省", "四川省", "河南省", "湖北省", "湖南省",
  "福建省", "安徽省", "河北省", "陕西省", "江西省", "辽宁省", "山西省", "云南省",
  "贵州省", "广西壮族自治区", "内蒙古自治区", "黑龙江省", "吉林省", "甘肃省",
  "新疆维吾尔自治区", "海南省", "宁夏回族自治区", "青海省", "西藏自治区",
  "北京市", "上海市", "天津市", "重庆市", "台湾省", "香港特别行政区", "澳门特别行政区",
];

/** 各省的量级权重（模拟真实经济体量差异，让地图有层次而不是一片同色） */
const PROVINCE_WEIGHT = {
  广东省: 100, 江苏省: 92, 山东省: 84, 浙江省: 80, 河南省: 70, 四川省: 66,
  湖北省: 60, 福建省: 58, 湖南省: 56, 安徽省: 54, 河北省: 50, 上海市: 48,
  北京市: 46, 陕西省: 40, 江西省: 38, 辽宁省: 36, 重庆市: 34, 云南省: 32,
  广西壮族自治区: 30, 山西省: 26, 贵州省: 24, 内蒙古自治区: 22,
  新疆维吾尔自治区: 20, 天津市: 18, 黑龙江省: 17, 吉林省: 15,
  甘肃省: 13, 海南省: 10, 宁夏回族自治区: 8, 青海省: 6,
  西藏自治区: 4, 台湾省: 28, 香港特别行政区: 26, 澳门特别行政区: 12,
};

/** 季节性因子：Q1 淡、年中与年末冲量，折线才有起伏而不是锯齿 */
const SEASON = [0.82, 0.78, 0.95, 1.0, 1.08, 1.18, 1.12, 1.05, 1.14, 1.22, 1.35, 1.42];

/** 折线图：12 个月 × 3 条系列（销售额 / 成本 / 利润），带趋势与季节波动 */
export function lineRows(seed = 1, months = 12) {
  const rand = rng(seed);
  const rows = [];
  let base = int(rand, 800, 1200);
  for (let i = 0; i < months; i++) {
    const m = SEASON[i % 12];
    base = Math.round(base * (1 + (rand() - 0.35) * 0.08));
    const sales = wobble(rand, base * m, 0.06);
    const cost = wobble(rand, sales * (0.55 + rand() * 0.12), 0.04);
    rows.push({
      月份: MONTHS[i % 12] + (i >= 12 ? `(${Math.floor(i / 12) + 1})` : ""),
      销售额: sales,
      成本: cost,
      利润: sales - cost,
    });
  }
  return rows;
}

/** 柱状图：12 个月 × 2 条系列（实际 / 目标），目标线平滑，实际围绕它波动 */
export function barRows(seed = 1, months = 12) {
  const rand = rng(seed);
  const rows = [];
  let target = int(rand, 900, 1300);
  for (let i = 0; i < months; i++) {
    target = Math.round(target * (1 + (rand() - 0.3) * 0.06));
    const t = Math.round(target * SEASON[i % 12]);
    rows.push({
      月份: MONTHS[i % 12],
      实际完成: wobble(rand, t, 0.14),
      目标: t,
    });
  }
  return rows;
}

/** 饼图：8 个流量来源，合计约 2400，份额差异明显 */
export function pieRows(seed = 1) {
  const rand = rng(seed);
  const sources = [
    ["直接访问", 520], ["自然搜索", 460], ["社交媒体", 380], ["付费广告", 320],
    ["邮件营销", 240], ["内容营销", 200], ["联盟推广", 160], ["其他", 120],
  ];
  return sources.map(([name, base]) => ({ 渠道: name, 访问量: wobble(rand, base, 0.18) }));
}

/** 地图：34 个省级行政区全量，按经济体量加权 */
export function mapRows(seed = 1) {
  const rand = rng(seed);
  return PROVINCES.map((name) => ({
    省份: name,
    销售额: wobble(rand, (PROVINCE_WEIGHT[name] ?? 10) * 12, 0.22),
  }));
}

/** 散点图：默认 120 个点，分 3 组，组内聚簇、y 与 x 正相关 */
export function scatterRows(seed = 1, points = 120) {
  const rand = rng(seed);
  const groups = [
    { name: "自营网店", cx: 32, cy: 38, spread: 16 },
    { name: "加盟门店", cx: 58, cy: 62, spread: 18 },
    { name: "海外市场", cx: 74, cy: 84, spread: 12 },
  ];
  const rows = [];
  for (let i = 0; i < points; i++) {
    const g = groups[i % groups.length];
    const x = Math.min(100, Math.max(1, Math.round(g.cx + (rand() * 2 - 1) * g.spread)));
    const y = Math.min(100, Math.max(1, Math.round(g.cy + (x - g.cx) * 0.6 + (rand() * 2 - 1) * 8)));
    rows.push({ x, y, 门店: `${g.name}-${String(i + 1).padStart(2, "0")}`, 分组: g.name });
  }
  return rows;
}

/** 雷达图：6 个指标 × 3 个系列 */
export function radarRows(seed = 1) {
  const rand = rng(seed);
  const indicators = ["销售额", "客户数", "复购率", "客单价", "履约时效", "满意度"];
  const profiles = [
    ["华东大区", 92], ["华南大区", 78], ["华北大区", 64],
  ];
  return indicators.map((指标) => {
    const row = { 指标 };
    for (const [name, base] of profiles) row[name] = Math.min(100, wobble(rand, base, 0.22));
    return row;
  });
}

/**
 * 长表（一行一个组合）：默认 240 行 = 12 个月 × 4 渠道 × 5 区域。
 * 给过滤 / 选列 / 排序 / 取前 N / 透视练手用，字段齐全。
 */
export function salesRows({ seed = 1, rows = 240 } = {}) {
  const rand = rng(seed);
  const out = [];
  const total = rows;
  for (let i = 0; i < total; i++) {
    const monthIndex = Math.floor(i / (CHANNELS.length * REGIONS.length)) % 12;
    const channel = CHANNELS[Math.floor(i / REGIONS.length) % CHANNELS.length];
    const region = REGIONS[i % REGIONS.length];
    const city = CITIES[(i + monthIndex) % CITIES.length];
    const category = CATEGORIES[(i * 3 + monthIndex) % CATEGORIES.length];
    const qty = wobble(rand, 120 * SEASON[monthIndex] * (0.4 + rand()), 0.3);
    const price = int(rand, 25, 620);
    const amount = qty * price;
    out.push({
      月份: MONTHS[monthIndex],
      渠道: channel,
      区域: region,
      城市: city,
      类别: category,
      销量: Math.max(1, qty),
      单价: price,
      金额: amount,
      日期: `2026-${String(monthIndex + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
      状态: amount > 60000 ? "已完成" : amount > 20000 ? "进行中" : "待付款",
    });
  }
  return out;
}

/** 二维表：首行是表头（Excel / 老接口常见形态） */
export function matrixTable(seed = 1, months = 12) {
  const rows = lineRows(seed, months);
  return [
    ["月份", "销售额", "成本", "利润"],
    ...rows.map((r) => [r.月份, String(r.销售额), String(r.成本), String(r.利润)]),
  ];
}

/** 纯数值数组：24 个点，带趋势（不是一堆乱跳的数） */
export function scalarList(seed = 1, n = 24) {
  const rand = rng(seed);
  const out = [];
  let v = int(rand, 60, 120);
  for (let i = 0; i < n; i++) {
    v = Math.max(5, Math.round(v + (rand() - 0.42) * 18));
    out.push(v);
  }
  return out;
}

/** 带封套的响应：练习 dataPath（data.rows） */
export function wrappedSales({ seed = 1, rows = 120 } = {}) {
  const list = salesRows({ seed, rows });
  const amount = list.reduce((sum, r) => sum + r.金额, 0);
  return {
    code: 0,
    message: "ok",
    traceId: `trace-${String(seed).padStart(4, "0")}`,
    data: {
      total: list.length,
      amount,
      updatedAt: new Date().toISOString(),
      rows: list,
    },
  };
}

/** 完整 ChartData（直接就是编辑器内部结构，不需要任何推断） */
export function chartDataPayload(seed = 1) {
  const rows = lineRows(seed, 12);
  return {
    kind: "category",
    categories: rows.map((r) => r.月份),
    series: [
      { name: "销售额", values: rows.map((r) => r.销售额) },
      { name: "成本", values: rows.map((r) => r.成本) },
      { name: "利润", values: rows.map((r) => r.利润) },
    ],
  };
}

/** 每次调用都不同：用来肉眼确认「实时刷新」真的在工作（12 个时间点 × 最多 3 条系列） */
export function liveSeries(series = 2, points = 12) {
  const now = Date.now();
  const names = ["实时销售额", "实时订单量", "实时访客"].slice(0, Math.max(1, Math.min(3, series)));
  const rows = [];
  for (let i = 0; i < points; i++) {
    const at = new Date(now - (points - 1 - i) * 30000);
    const row = {
      时间: `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}:${String(at.getSeconds()).padStart(2, "0")}`,
    };
    for (const name of names) row[name] = Math.round(60 + Math.random() * 260);
    rows.push(row);
  }
  return rows;
}
