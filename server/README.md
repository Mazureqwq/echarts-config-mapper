# ChartForge 测试接口（mock server）

一个**零依赖**的本地 HTTP 服务（只用 `node:http`），专门用来验证 ChartForge 的数据相关功能：

- 六种图表各有一条「开箱即用」的接口（返回的形状正好能被对应图表吃下）
- 覆盖各种**数据形态**：对象数组 / 二维表 / 纯数值数组 / 带封套（练 `dataPath`）/ 完整 ChartData
- 覆盖各种**请求方式**：GET、POST + JSON body、自定义请求头、Bearer 鉴权
- 覆盖各种**异常**：500 / 404 / 非 JSON / 空数组 / 慢响应（超时）/ 随机失败（退避）/ 超大载荷 / 未开 CORS

> 这个服务只用于开发联调，**不要部署到公网**：它没有任何鉴权与限流，`/api/echo` 还会回显请求头列表。

---

## 1. 启动

```bash
pnpm server          # http://localhost:8787
```

换端口：

```bash
# macOS / Linux
PORT=9000 pnpm server

# Windows PowerShell
$env:PORT=9000; pnpm server
```

启动后浏览器打开 <http://localhost:8787/> 可以看到**接口目录页**（可点击试接口），
命令行的 `GET /api/index` 返回同一份目录的 JSON。

---

## 2. 在 ChartForge 里怎么配

1. 打开 **接口设置**（`/settings`），把「接口基础地址」填成：

   ```
   http://localhost:8787
   ```

   点「探活」应显示 `HTTP 200 · xx ms`。

2. 进入大屏，选中一个图表 → 检查器 → **实时数据** → 连接页：

   - 写法：**相对路径**
   - 相对路径：`/api/charts/line`（不要再写 `http://localhost:8787`，否则会绕过 baseUrl）
   - 下面会显示「实际请求：http://localhost:8787/api/charts/line」，确认拼接正确

3. 需要令牌的接口，在**设置页 → 公共请求头**里加一行：

   ```
   Authorization=Bearer demo-token
   ```

4. 切到 **调试台** 点「发一次请求」，能看状态码、耗时、`dataPath` 命中行数、字段清单与原始响应；
   点「用这份数据填充图表（快照）」可以先把数据灌进去看效果，再回连接页保存。

---

## 3. 接口总览

所有接口都支持 CORS（`Access-Control-Allow-Origin` 回显请求来源，允许 `Authorization` 等自定义头），
`OPTIONS` 预检返回 `204`。所有 JSON 响应都带 `Cache-Control: no-store`。

| 方法 | 路径 | 说明 | 参数 |
|---|---|---|---|
| GET | `/health` | 探活 | — |
| GET | `/api/index` | 接口目录（JSON） | — |
| GET | `/api/charts/line` | **折线图**：对象数组 | `months`(1–24, 默认 6)、`seed` |
| GET | `/api/charts/bar` | **柱状图**：同折线，默认 12 个月 | `months`(1–24, 默认 12)、`seed` |
| GET | `/api/charts/pie` | **饼图**：`{渠道, 占比}` | `seed` |
| GET | `/api/charts/map` | **地图**：省级全称 + 数值 | `seed` |
| GET | `/api/charts/scatter` | **散点图**：`{x, y, 名称, 分组}` | `points`(1–500, 默认 24)、`seed` |
| GET | `/api/charts/radar` | **雷达图**：首列指标 + 多列系列 | `seed` |
| GET | `/api/sales/rows` | 长表（一行一个组合），练加工 | `rows`(1–5000, 默认 48)、`seed` |
| GET | `/api/sales/wrapped` | 带封套 `{code, data:{rows}}` | `rows`(1–5000, 默认 24)、`seed` |
| GET | `/api/sales/matrix` | 二维表（首行表头） | `months`(1–24, 默认 6)、`seed` |
| GET | `/api/sales/scalars` | 纯数值数组 | `n`(1–500, 默认 12)、`seed` |
| GET | `/api/sales/chartdata` | 完整 ChartData（无需推断） | `seed` |
| POST | `/api/search` | POST + JSON 体，按条件过滤并回显条件 | `body: {region?, channel?, keyword?, limit?}` |
| GET | `/api/echo` | 回显方法/查询参数/请求头名（验证令牌是否带上） | 任意查询参数 |
| GET | `/api/secure/dashboard` | **需要鉴权** | `Authorization: Bearer demo-token` 或 `?token=` |
| GET | `/api/live/random` | 每次返回不同数据（看实时刷新） | `series`(1–3, 默认 2) |
| GET | `/api/errors/500` | 固定 500 | — |
| GET | `/api/errors/404` | 固定 404 | — |
| GET | `/api/errors/html` | 返回 HTML 而不是 JSON | — |
| GET | `/api/errors/badjson` | 返回非法 JSON | — |
| GET | `/api/errors/empty` | 返回空数组 `[]` | — |
| GET | `/api/errors/object` | 返回单个对象（提示要用 dataPath） | — |
| GET | `/api/errors/slow` | 延迟响应，测超时 | `ms`(0–60000, 默认 8000) |
| GET | `/api/errors/flaky` | 按概率 503，测退避 | `rate`(0–1, 默认 0.5) |
| GET | `/api/errors/huge` | 大载荷，测取前 N | `rows`(1–20000, 默认 2000) |
| GET | `/api/errors/no-cors` | 不带 CORS 头（模拟对方没开跨域） | `block=1` |

`seed` 是**确定性随机种子**：同一个 seed 每次返回一样的数，方便截图对比、复现问题；
不传则等于 `1`。

---

## 4. 六种图表的接口

### 折线图 `GET /api/charts/line`

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `months` | 1–24 | 6 | 返回多少个月份的数据点 |
| `seed` | 整数 | 1 | 随机种子 |

响应（对象数组，字段名就是系列名，不需要任何配置）：

```json
[
  { "月份": "一月", "销售额": 193, "利润": 39 },
  { "月份": "二月", "销售额": 244, "利润": 88 }
]
```

用法：图表类型选**折线图**，相对路径 `/api/charts/line`，`dataPath` 留空，**不用配字段映射**。

### 柱状图 `GET /api/charts/bar`

参数同折线（`months` 默认 12），响应形状一致。用来对比「同一个接口喂给不同图表类型」。

### 饼图 `GET /api/charts/pie`

响应：

```json
[
  { "渠道": "线上", "占比": 261 },
  { "渠道": "线下", "占比": 60 }
]
```

用法：图表类型选**饼图**。第一列当名称、第二列当数值，所以字段叫什么都行（`渠道/占比`、
`name/value`、`城市/销量` 都可以）。

### 地图 `GET /api/charts/map`

响应里的 `省份` 是**省级全称**（`广东省`、`北京市`…），必须和中国地图 GeoJSON 的 `name` 完全一致才会着色。

```json
[
  { "省份": "广东省", "销售额": 278 },
  { "省份": "江苏省", "销售额": 41 }
]
```

### 散点图 `GET /api/charts/scatter`

```json
[
  { "x": 42, "y": 71, "名称": "样本1", "分组": "组A" },
  { "x": 88, "y": 12, "名称": "样本2", "分组": "组B" }
]
```

`x` / `y` 必须可转成数字；第三列当点名称、第四列当分组（可选）。

### 雷达图 `GET /api/charts/radar`

```json
[
  { "指标": "攻击", "战士": 75, "法师": 30, "刺客": 67 },
  { "指标": "防御", "战士": 32, "法师": 88, "刺客": 45 }
]
```

第一列是指标名，其余每一列是一个系列；指标上限按该列最大值 × 1.2 自动算。

---

## 5. 数据形态与 `dataPath` 演练

| 接口 | 响应形态 | 怎么用 |
|---|---|---|
| `/api/sales/rows` | 长表对象数组 | `dataPath` 留空，直接吃 |
| `/api/sales/wrapped` | `{ code, message, data: { total, rows } }` | `dataPath` 填 **`data.rows`** |
| `/api/sales/matrix` | 二维表，首行表头 | `dataPath` 留空（`line/bar/radar` 会把首行当表头） |
| `/api/sales/scalars` | `[12, 34, 55, …]` | 数值数组，折线图会按序号当分类 |
| `/api/sales/chartdata` | 完整 ChartData | 完全跳过推断 |
| `/api/errors/object` | 单个对象 | 故意失败：应提示「需要用 dataPath 取到数组」 |

`dataPath` 语法（数据源面板里有提示）：

- `a.b` 逐层取
- `rows[0].value` 取下标
- `rows[*].value` 通配，结果拍平成数组

试试 `/api/sales/wrapped` 配 `data.rows`，再故意写成 `data.row`（少个 s），
调试台会提示「这个路径在返回数据里取不到值」。

---

## 6. 请求方式演练

### POST + JSON body：`POST /api/search`

```bash
curl -X POST http://localhost:8787/api/search \
  -H "Content-Type: application/json" \
  -d '{"region":"华东","channel":"线上","limit":5}'
```

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8787/api/search `
  -ContentType "application/json" -Body '{"region":"华东","limit":5}'
```

响应里 `echo` 会原样回显你传的条件 —— 用它可以确认面板里填的 body 真的发出去了：

```json
{
  "ok": true,
  "echo": { "region": "华东", "channel": "", "keyword": "", "limit": 5 },
  "total": 3,
  "rows": [ ... ]
}
```

在面板里：写法选相对路径 `POST`，body 填 `{"region":"华东","limit":10}`，
`dataPath` 填 `rows`（因为行在 `rows` 字段下）。

### 鉴权：`GET /api/secure/dashboard`

不带令牌 → `401`，并给中文提示；带上正确令牌 → 200 返回折线数据。

```bash
curl http://localhost:8787/api/secure/dashboard                                     # 401
curl -H "Authorization: Bearer demo-token" http://localhost:8787/api/secure/dashboard  # 200
curl "http://localhost:8787/api/secure/dashboard?token=demo-token"                   # 200
```

在 ChartForge 里：设置页 → 公共请求头 → `Authorization=Bearer demo-token`。
验证是否真的带上：打开 `/api/echo`，响应里的 `auth.present` 会是 `true`
（只回报长度，不回显令牌本身）。

---

## 7. 异常演练手册

| 想测什么 | 用哪个接口 | 应该看到 |
|---|---|---|
| 接口报错时画面不崩、保留旧数据 | `/api/errors/500` 或 `/api/errors/flaky?rate=0.5` | 面板底部红字「拉取失败…画面保持上一份数据」，图表不闪空 |
| 地址写错 | `/api/errors/404` | 「接口不存在（404）：检查路径是否写对」 |
| 对方返回 HTML（常见于登录页/网关页） | `/api/errors/html` | 「响应不是合法 JSON…」 |
| 返回空数据 | `/api/errors/empty` | 「接口返回了空数组」 |
| 忘了配 dataPath | `/api/errors/object` | 「返回的是单个对象，需要数组…或用 dataPath 取到数组」 |
| 请求超时 | `/api/errors/slow?ms=8000`，把面板超时设成 2000 | 「请求超时：接口在规定时间内没有返回」 |
| 失败退避 | `/api/errors/flaky?rate=0.8` | 失败后间隔按 ×2 退避（上限 5 分钟），成功后恢复 |
| 数据太多跑不动 | `/api/errors/huge?rows=5000` + 加工里取前 50 | 调试台应显示「原始 5000 行 → 取前 50 行」 |
| 跨域被拦 | `/api/errors/no-cors?block=1` | 浏览器控制台 `Failed to fetch`，调试台翻译成「可能是地址写错、服务未启动，或对方没开 CORS」 |

---

## 8. 数据加工（加工 Tab）演练

用 `GET /api/sales/rows?rows=96`，字段是：

```
月份 / 渠道 / 区域 / 城市 / 销量 / 金额 / 日期 / 状态
```

几条现成的配方：

| 目标 | 加工配置 |
|---|---|
| 只看华东的线上数据 | 过滤：`区域 = 华东`，再加一条 `渠道 = 线上`（多条是「并且」） |
| 只要销量前 10 的城市 | 排序：`销量` 降序 → 取前 N：`10` |
| 筛掉小单 | 过滤：`销量 >= 100`（数字会按数值比，不是字典序） |
| 多城市对比 | 过滤：`城市 属于 上海,北京,深圳`（`in` 用逗号分隔） |
| 只要三列 | 列选择：勾 `月份`、`渠道`、`销量` |
| **长表转多系列柱状图** | 字段映射：分类= `月份`，数值= `金额`，系列字段= `渠道` → 透视成「线上/线下/分销/直营」多系列 |

透视后调试台会显示 `原始 96 行 → 过滤 48 行 → 取前 10 行` 这样的每一步行数，
一眼看出哪一步把数据吃掉了。

---

## 9. 用命令行直接验证（不打开 ChartForge）

```bash
curl http://localhost:8787/health
curl "http://localhost:8787/api/charts/line?months=3"
curl "http://localhost:8787/api/sales/wrapped?rows=2"
curl -X OPTIONS http://localhost:8787/api/charts/line -H "Origin: http://localhost:5174" -i
```

```powershell
Invoke-RestMethod http://localhost:8787/api/charts/pie | ConvertTo-Json -Depth 4
(Invoke-WebRequest http://localhost:8787/api/charts/line).Headers["Access-Control-Allow-Origin"]
```

---

## 10. 约定与限制

- **无持久化**：所有数据都是请求时内存生成，重启不影响任何状态。
- **确定性**：除 `/api/live/random`、`/api/errors/flaky` 外，同一 `seed` 返回同一份数据。
- **不校验业务**：接口故意宽松（缺参数就给默认值），方便随手试。
- **明文令牌**：`demo-token` 是写死的假令牌，只用于演示；真实项目请勿照抄这个模式。
- **不要公网部署**：无鉴权、无限流、`/api/echo` 会回显请求头名。

---

## 11. 排错

| 现象 | 原因 / 处理 |
|---|---|
| `EADDRINUSE` | 8787 被占用，`PORT=9000 pnpm server` 换个端口，并把 baseUrl 一起改掉 |
| 设置页探活 200，但图表拉数据失败 | 图表里填的是完整地址而不是相对路径，或者 `dataPath` 和接口结构对不上 |
| 浏览器控制台 `Failed to fetch` | 用 `/api/errors/no-cors?block=1` 验证一下是不是 CORS；正常接口是带 CORS 头的 |
| 双击 `file://` 打开导出的产物时实时刷新不生效 | 浏览器对 `file://` 的 fetch 有额外限制，用 `serve.sh` / `serve.cmd` 或部署到静态服务器 |
| 401 | 公共请求头里少了 `Authorization=Bearer demo-token` |

---

## 12. 文件结构

```
server/
├── app.mjs      # 路由与响应（createMockServer()，可被测试直接 import）
├── data.mjs     # 确定性 mock 数据发生器（seed 用 mulberry32）
├── index.mjs    # 命令行入口（PORT / HOST 环境变量）
├── app.d.mts    # 类型声明（供 tests/mock-server.spec.ts 使用）
└── README.md    # 本文件
```

接口改动后请同步更新本文件的「接口总览」表——
`tests/mock-server.spec.ts` 会校验 `ENDPOINTS` 里的每一条都能真的调通。
