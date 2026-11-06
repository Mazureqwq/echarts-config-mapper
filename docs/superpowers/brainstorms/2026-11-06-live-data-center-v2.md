# 整合设计 · 数据源中心 v2（全局设置 + 图表级接口配置 + 调试台 + 数据加工）

> 日期：2026-11-06 · 状态：**待决策**（本文件是设计，不是实现）
> 前序：`docs/superpowers/brainstorms/2026-11-06-live-data-advanced.md`（M1 已实施，`74d289d`）

## 0. 你的构想拆成三层

```
┌─ L1 全局设置页 /settings ────────────────────────────────┐
│  baseUrl、公共请求头、公共 query、超时、默认间隔           │
└──────────────────────────┬──────────────────────────────┘
                           │ 所有图表共用
┌─ L2 图表级数据源配置（选中图表 → 检查器） ───────────────┐
│  相对路径 + 方法 + 局部 query/header + 间隔                 │
│  dataPath 取值 → 过滤/选列/排序/取前N → 字段映射 → 图表    │
└──────────────────────────┬──────────────────────────────┘
                           │
┌─ L3 调试台（同一面板） ──────────────────────────────────┐
│  发一次真实请求：状态码/耗时/响应树/字段清单/可点选生成路径  │
│  显示加工后的 ChartData 预览 → 「用这份数据填充图表」       │
└──────────────────────────────────────────────────────────┘
```

现在的实现只有 L2 的一半（绝对 URL + dataPath）和 L3 的一半（测试连接只返回一句摘要）。这个设计把它补齐成一条完整链路。

---

## 1. 数据模型变更（全部可选，`version: 1` 不变）

### 1.1 `Workspace.settings` 扩展

```ts
settings: {
  autosave: boolean;
  api?: {
    baseUrl: string;                     // 例：https://api.example.com（可留空=只允许绝对路径）
    headers?: Record<string, string>;    // 公共请求头（Authorization 等）
    query?: Record<string, string>;      // 公共 query（appKey、tenant 等）
    timeoutMs?: number;                  // 默认 10000
  };
}
```

### 1.2 `ChartSpec.source` 扩展

```ts
source?: {
  path: string;              // 新增：相对路径，如 /api/sales? 与 baseUrl 拼
  url?: string;              // 保留：绝对地址（旧数据直接用，优先于 path+baseUrl）
  method?: "GET" | "POST";   // 默认 GET
  body?: string;             // POST 的 JSON 文本
  headers?: Record<string, string>;   // 覆盖全局同名 header
  query?: Record<string, string>;     // 覆盖/追加全局 query
  intervalSec: number;
  dataPath?: string;         // 取值路径（支持 a.b / rows[0].v / rows[*].v）
  filter?: Array<{ field: string; op: FilterOp; value: string }>;  // 行过滤
  select?: string[];         // 只保留这些列（列投影，保序）
  sort?: { field: string; desc?: boolean };
  limit?: number;            // 取前 N 行（1–5000）
  map?: {                    // 字段映射（不填则按现有规则自动推断）
    category?: string;       // 分类列（饼图/地图为名称列）
    value?: string;          // 数值列（饼图/地图为数值列）
    seriesField?: string;    // 系列字段（把长表转宽表，如 [{月份,渠道,销量}]）
  };
};

type FilterOp = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "in" | "notEmpty";
```

**为什么 `map.seriesField` 值得做**：真实接口常见长表 `[{月份, 渠道, 销量}]`，现在只能画成「一月/二月…一列」。有了 seriesField 就能自动透视成「月份 × 渠道」多系列——这是把真实接口接进多系列图表的关键一步。

---

## 2. 数据加工流水线（纯函数，全部可单测）

```
原始响应 payload
   │  resolveDataPath(dataPath)                     ← 已有，支持 [n] / [*]
   ▼
rows: Record<string, unknown>[]                      ← 统一中间表示（对象数组）
   │  filter：按 op 逐条筛选（值可数字比较，含 null 安全）
   ▼
   │  select：列投影（保序、缺失列给空串）
   ▼
   │  sort：按字段升/降序（数字/字符串分别比较，稳定排序）
   ▼
   │  limit：取前 N
   ▼
toChartData(type, rows, map)   ← 自动推断 or 显式映射（含 seriesField 透视）
   ▼
ChartData → 写回 spec.data
```

新增 `src/core/live/pipeline.ts`：

```ts
export function toRows(payload: unknown): Record<string, unknown>[] | null  // 二维表/对象数组/标量 → 对象数组
export function applyFilter(rows, filters): rows
export function applySelect(rows, select): rows
export function applySort(rows, sort): rows
export function applyLimit(rows, limit): rows
export function pivotBySeries(rows, { category, value, seriesField }): ChartData
export function buildChartData(payload, type, source): { ok, data } | { ok: false, message }
```

`payload.ts` 的 `toChartData` 保留为「无加工」的快捷路径，内部改为复用 pipeline。

---

## 3. 请求层改造（DataHub）

| 项 | 现在 | 目标 |
|---|---|---|
| 合并键 | `url` | `url + method + 排序后的 query + body 摘要`（同参数才合并，不同参数各发各的） |
| 请求构造 | 只 GET | GET/POST、合并全局 header/query、局部覆盖、`AbortController` 超时 |
| baseUrl 拼接 | 无 | `joinUrl(baseUrl, path)`：处理重复斜杠、path 已带协议则直通 |
| 观测 | requests/failures | 增加 `lastStatus`、`lastDurationMs`、`lastErrorAt`，供调试台显示 |

超时是必须的：没有超时的话，一个挂起的请求会让单飞永久卡住（现在就是这个隐患）。

---

## 4. 设置页 `/settings`

- 顶部导航加「设置」入口（图表库 / 大屏库 / 设置）
- 分区：
  1. **接口前缀**：baseUrl + 「测试连通性」按钮（打 `baseUrl` 或用户填的探活路径）
  2. **公共请求头**：键值行编辑（新增/删除），`Authorization` 值默认掩码显示，可点「显示」
  3. **公共查询参数**：同上
  4. **默认轮询间隔 / 请求超时**
  5. **数据**：导出整库 JSON、导入、清空（沿用现有能力）
- **安全提示（必须显眼）**：token 存在浏览器 localStorage，明文；导出 JSON 会把它一起带出去。提供「不写入导出文件」的开关。

---

## 5. 图表级配置面板（L2 + L3 合体）

选中图表 → 检查器「实时数据」分区，改成 Tab 结构：

**Tab 1 连接**
```
[✓] 启用实时数据
地址   [ baseUrl 前缀已拼接预览：https://api.example.com/api/sales ]  ← 只填 /api/sales
方法   [GET ▾]     间隔 [30] 秒    超时 [10000] ms
参数   key/value 行编辑（覆盖全局，只对本图表生效）
请求头 key/value 行编辑
取值路径 dataPath [ result.rows[*] ]        ← 输入框下方实时提示解析结果
```

**Tab 2 调试台**
```
[发送测试请求]   → 200 · 132ms · 1.2 KB
响应结构：{ code, data: { rows: [ { 月份, 渠道, 销量 } × 24 ] } }
字段清单：月份(字符串) 渠道(字符串) 销量(数字)        ← 点击可「设为分类列 / 设为数值列 / 设为系列字段」
原始响应：折叠 JSON 树（前 50 行）
加工后：24 行 → 过滤后 12 行 → 取前 10 行
图表数据预览：分类 [一月…] / 系列 [线上, 线下]
[用这份数据填充图表（快照）]
```

**Tab 3 加工**
```
行过滤    [字段 ▾][运算符 ▾][值]  ＋ 添加条件（多条为 AND）
列选择    [✓月份][✓渠道][✓销量]（点击切换）
排序      [字段 ▾] [升/降]
取前 N 行 [0 = 不限]
字段映射  分类列 [月份 ▾] 数值列 [销量 ▾] 系列字段 [渠道 ▾]（留空=自动推断）
```

---

## 6. 兼容与迁移

| 旧数据 | 处理 |
|---|---|
| `source.url` 绝对地址 | 原样使用，忽略 baseUrl |
| `source.path`（新增） | 与 settings.api.baseUrl 拼接 |
| 无 `settings.api` | 视为「baseUrl 为空」，绝对地址照旧可用 |
| `source` 上所有新字段 | 全部可选，缺省即「不加工」 |
| 规范化 | `normalizeSpec` 里对 source 逐字段校验兜底（op 白名单、limit 夹紧、header 值转字符串） |

---

## 7. 测试策略（TDD）

| 层 | 用例 |
|---|---|
| 拼接 | `joinUrl` 去重斜杠、path 带协议直通、baseUrl 为空、path 无前导斜杠 |
| 请求构造 | 全局 header/query + 局部覆盖合并顺序（局部赢）；POST body 透传；超时 abort |
| 合并键 | 同 URL 不同 query → 两个 feed；同 URL 同 query → 一个 feed（fetch 只 1 次） |
| 行过滤 | 8 个 op 覆盖：数字/字符串/null/缺失字段；多条件 AND |
| 列投影/排序/限制 | 保序、稳定排序、limit 夹紧 1–5000 |
| 透视 | 长表 `[{月份,渠道,销量}]` + seriesField → 多系列 ChartData |
| 端到端 | 给定 mock 响应 + source 配置 → 最终 ChartData 断言（含 seriesField 与 filter 组合） |
| 调试台 | `probe` 返回结构摘要、字段清单、耗时、状态码 |

---

## 8. 风险

| 风险 | 缓解 |
|---|---|
| token 明文落 localStorage / 导出泄露 | 设置页显眼警告 + 导出时默认剔除 header 值（可关）+ 支持「仅本次会话」 |
| CORS 在浏览器侧无法绕过 | 调试台把 `TypeError: Failed to fetch` 翻译成「可能是跨域被拦，检查服务端 CORS 或改用同源代理」 |
| 加工链太长不好排错 | 调试台显式展示每一步行数（24 → 过滤 12 → 取前 10），一眼看出哪步吃掉了数据 |
| 面板复杂度爆炸 | 分 Tab；默认只展开「连接」，加工与调试按需展开 |
| 每轮都跑一遍加工 | 加工是纯内存操作（千行级），实测量级可忽略；不做缓存 |

---

## 9. 分期

| 里程碑 | 内容 |
|---|---|
| **V1（建议本轮）** | `settings.api` + `/settings` 页；`source.path`/method/query/header + baseUrl 拼接；DataHub 支持方法/头/超时与参数级合并键；Tab 化面板；调试台（状态/耗时/字段清单/响应树/加工后预览/快照填充） |
| **V2** | 加工 Tab（filter/select/sort/limit/map + seriesField 透视） |
| **V3** | 「从响应自动推荐 dataPath」、多图表共享同一数据源的「统一数据源管理」列表、ETag 缓存 |

> 说明：V1 的调试台会把「加工后预览」画成表格占位，真正接上加工链是 V2；两者共用同一套 pipeline 接口，不会返工。

---

## 10. 需要拍板的 4 件事

| 编号 | 问题 | 推荐 |
|---|---|---|
| Q1 | 全局设置要不要包含「公共请求头（含 token）+ 公共 query」？ | 要；token 默认掩码 + 导出时默认剔除 + 显眼风险提示 |
| Q2 | 图表级加工能力做到哪一档：只做行过滤，还是过滤+选列+排序+取前N+字段映射（含 seriesField 透视）？ | 做全（V2），这是真实接口能用起来的关键 |
| Q3 | 本轮范围：V1（设置页 + 连接配置 + 调试台）一次做完，还是连 V2 加工也一起做？ | 先 V1 落地并提交，再立刻做 V2（两批提交，便于回滚） |
| Q4 | 调试台的「用这份数据填充图表（快照）」要不要？ | 要，演示/离线场景很实用；但默认不自动填充，需手动点 |

---

## 11. V1 实施记录（2026-11-06，已落地）

### 代码
- `src/core/live/apiSettings.ts`：`joinUrl` / `appendQuery`（参数排序归一，同参数不同书写顺序视为同一请求）/ `buildRequest` / `feedKey` / `clampTimeout` / `previewUrl` / `parsePairs` / `formatPairs`。
- `src/core/live/probe.ts`：`probeSource`（与正式拉数共用 `buildRequest`，所以「调试台能通」等于「图表能通」）、`inferFields` / `toProbeRows`（`data/list/rows/items/result/records` 封装逐层摊平）、`explainFetchError`（CORS / 401 / 404 / 5xx / 超时翻译成人话）。
- `src/core/live/dataHub.ts`：合并键由 URL 改为 `feedKey`（方法 + URL + 请求头 + body）；每轮请求带 AbortController 超时（同一 feed 取组内最小超时）；退避 / 单飞 / 页面隐藏暂停保持不变。
- `src/core/live/liveExecutor.ts`：新增 `resolveApi`，注册时用全局设置合成请求；未注入运行时仍走应用级单例。
- `src/core/storage/workspaceRepo.ts`：`scrubSecrets`，导出时默认把全局与图表级请求头的值替换成 `***`（`settings.api.exportHeaders === true` 才原样导出），并保证不修改内存里的工作区。
- `src/views/SettingsView.vue` + 路由 `/settings` + 图表库 / 大屏库导航入口：baseUrl 与探活（状态码 + 耗时）、公共请求头（敏感值默认打码，需显式勾选「显示明文」才能编辑）、公共 query、默认间隔与超时、导出安全开关。
- `src/workbench/panels/LiveSourcePanel.vue`：Tab 化（连接 / 调试台 / 加工-待上线）。
  - 连接：相对路径与完整地址切换、实际请求预览、GET/POST + body、间隔 / 超时、dataPath 提示、图表级请求头与查询参数、跳转「接口设置」。
  - 调试台：HTTP 状态与耗时、dataPath 命中的行数与字段清单、原始响应（默认隐藏，点开才显示）、「用这份数据填充图表（快照）」。
- `WorkbenchView` / `PlayView`：`LiveExecutor` 注入 `resolveApi`；工作台的数据源指纹把 path / method / body / headers / query / timeout 与全局设置一并纳入，改设置立即重建执行器。

### 测试
新增 `tests/api-settings.spec.ts`（15）、`tests/probe.spec.ts`（10）、`tests/export-scrub.spec.ts`（4）；`tests/core-live.spec.ts` 与 `tests/data-hub.spec.ts` 的 fetchImpl 桩签名改为 `(req, timeoutMs)`。全量 181 passed。

### 留给 V2
- `src/core/live/pipeline.ts`（过滤 9 种 op / 选列 / 排序 / 取前 N / 字段映射 / long→wide 透视）与面板「加工」Tab。
- 调试台每步行数堆叠（24 → 过滤 12 → 取前 10）。


---

## 12. V2 实施记录（2026-11-06，已落地）

### 代码
- `src/core/live/pipeline.ts`：纯函数加工链。
  - `toRows`：数组（对象行 / 二维表首行表头）、常见封套（`data` / `list` / `rows` / `items` / `result` / `records`）、标量 → 统一成对象行；单个对象且无封套时直接给「请用 dataPath 取到数组」的人话错误。
  - `applyFilter`：9 种运算符（`eq/ne/gt/gte/lt/lte/contains/in/notEmpty`），能转数字就按数值比，否则按字符串；多条为 AND；缺字段直接淘汰。
  - `applySelect` 保序投影、`applySort` 数值优先且缺失值沉底的稳定排序、`applyLimit`。
  - `pivotBySeries`：long → wide，缺失组合补 0（多系列等长，不会断线）。
  - `runPipeline` 返回 `counts{raw,filtered,selected,sorted,limited}`，调试台据此展示每一步行数。
  - `buildChartData(raw, source, type)`：加工链 + 字段映射 + 复用 `payload.toChartData` 归一。
- `documentStore.applyLiveUpdate` 改走 `buildChartData`，实时刷新与加工设置同一条链路。
- `probe.toProbeRows` 复用 `pipeline.toRows`，调试台看到的行结构与图表吃到的一致。
- `LiveSourcePanel` 新增「加工」Tab：行过滤（字段/运算符/值 + 增删）、列选择（字段 chip 切换）、排序与取前 N、字段映射（分类/数值/系列），带加工预览表格与每一步行数；「清空加工」可一键还原。
- `WorkbenchView` 的数据源指纹纳入 filter/select/sort/limit/map，改加工设置会立即重建执行器。

### 测试
`tests/pipeline.spec.ts`（13 例：行桥接、9 种过滤运算符、选列/排序/取前 N、透视、全链路行数、字段映射与自动推断）。全量 194 passed。

### 与设计的差异
- 设计里「加工后预览」在调试台只画占位；V2 直接做成「加工」Tab 的实时预览（同一份 `runPipeline`），没有返工。
