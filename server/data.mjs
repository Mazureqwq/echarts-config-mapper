/**
 * 极简 mock 数据发生器：零依赖、确定性（同一 seed 结果一致）。
 * 只被 server/app.mjs 使用，不参与前端构建。
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

export function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

export const MONTHS = [
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
];

export const CHANNELS = ["线上", "线下", "分销", "直营"];
export const REGIONS = ["华东", "华北", "华南", "西南", "东北"];
export const CITIES = ["上海", "北京", "广州", "成都", "杭州", "武汉", "深圳", "西安"];

/** 地图图表用的省级全称（必须与中国地图 GeoJSON 的 name 完全一致才会着色） */
export const PROVINCES = [
  "广东省", "江苏省", "浙江省", "山东省", "四川省", "河南省",
  "湖北省", "湖南省", "福建省", "安徽省", "河北省", "陕西省",
  "北京市", "上海市", "天津市", "重庆市", "辽宁省", "江西省",
];

/** 折线 / 柱状：对象数组，字段名即系列名 */
export function lineRows(seed = 1, months = 6) {
  const rand = rng(seed);
  const list = [];
  for (let i = 0; i < months; i++) {
    const sales = int(rand, 80, 260);
    list.push({
      月份: MONTHS[i % MONTHS.length] + (i >= 12 ? `(${Math.floor(i / 12) + 1})` : ""),
      销售额: sales,
      利润: Math.round(sales * (0.2 + rand() * 0.25)),
    });
  }
  return list;
}

/** 饼图：name / value */
export function pieRows(seed = 1) {
  const rand = rng(seed);
  return CHANNELS.map((name) => ({ 渠道: name, 占比: int(rand, 60, 380) }));
}

/** 地图：省份全称 + 数值 */
export function mapRows(seed = 1) {
  const rand = rng(seed);
  return PROVINCES.map((name) => ({ 省份: name, 销售额: int(rand, 40, 420) }));
}

/** 散点：x / y + 名称与分组 */
export function scatterRows(seed = 1, points = 24) {
  const rand = rng(seed);
  const groups = ["组A", "组B", "组C"];
  const rows = [];
  for (let i = 0; i < points; i++) {
    rows.push({
      x: Math.round(rand() * 100),
      y: Math.round(rand() * 100),
      名称: `样本${i + 1}`,
      分组: groups[i % groups.length],
    });
  }
  return rows;
}

/** 雷达：第一列是指标名，其余列是系列（首行表头由字段名自动推断） */
export function radarRows(seed = 1) {
  const rand = rng(seed);
  const indicators = ["攻击", "防御", "速度", "耐力", "技巧"];
  return indicators.map((指标) => ({
    指标,
    战士: int(rand, 40, 95),
    法师: int(rand, 30, 95),
    刺客: int(rand, 35, 95),
  }));
}

/** 长表（一行一个组合）：给过滤 / 选列 / 排序 / 取前 N / 透视练手 */
export function salesRows({ seed = 1, rows = 48 } = {}) {
  const rand = rng(seed);
  const out = [];
  for (let i = 0; i < rows; i++) {
    const monthIndex = Math.floor(i / 4) % 12;
    const month = MONTHS[monthIndex];
    const channel = CHANNELS[i % CHANNELS.length];
    const region = REGIONS[(i * 3) % REGIONS.length];
    const qty = int(rand, 5, 320);
    const price = int(rand, 20, 400);
    out.push({
      月份: month,
      渠道: channel,
      区域: region,
      城市: CITIES[i % CITIES.length],
      销量: qty,
      金额: qty * price,
      日期: `2026-${String(monthIndex + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
      状态: qty > 160 ? "已完成" : "进行中",
    });
  }
  return out;
}

/** 二维表：首行是表头（Excel / 老接口常见形态） */
export function matrixTable(seed = 1, months = 6) {
  const rows = lineRows(seed, months);
  return [
    ["月份", "销售额", "利润"],
    ...rows.map((r) => [r.月份, String(r.销售额), String(r.利润)]),
  ];
}

export function scalarList(seed = 1, n = 12) {
  const rand = rng(seed);
  return Array.from({ length: n }, () => int(rand, 10, 200));
}

/** 带封套的响应：练习 dataPath（data.rows） */
export function wrappedSales({ seed = 1, rows = 24 } = {}) {
  const list = salesRows({ seed, rows });
  return {
    code: 0,
    message: "ok",
    traceId: `trace-${String(seed).padStart(4, "0")}`,
    data: {
      total: list.length,
      updatedAt: new Date().toISOString(),
      rows: list,
    },
  };
}

/** 完整 ChartData（直接就是编辑器内部结构，不需要任何推断） */
export function chartDataPayload(seed = 1) {
  const rows = lineRows(seed, 6);
  return {
    kind: "category",
    categories: rows.map((r) => r.月份),
    series: [
      { name: "销售额", values: rows.map((r) => r.销售额) },
      { name: "利润", values: rows.map((r) => r.利润) },
    ],
  };
}

/** 每次调用都不同：用来肉眼确认「实时刷新」真的在工作 */
export function liveSeries(series = 2) {
  const now = Date.now();
  const names = ["实时销售额", "实时订单量", "实时访客"].slice(0, Math.max(1, series));
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const row = { 时间: `${String(new Date(now - (7 - i) * 60000).getHours()).padStart(2, "0")}:${String(new Date(now - (7 - i) * 60000).getMinutes()).padStart(2, "0")}` };
    for (const name of names) row[name] = Math.round(60 + Math.random() * 240);
    rows.push(row);
  }
  return rows;
}
