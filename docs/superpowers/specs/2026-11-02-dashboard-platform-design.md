# ChartForge 可视化大屏基座 — 设计 Spec

- 日期：2026-11-02
- 分支：`feature/major-update`
- 流程：superpowers brainstorming（Architectural 路径），全部需求与设计分节经用户确认
- 状态：待用户审阅

## 1. 背景与目标

ChartForge 现状：单页 ECharts 配置编辑器（Vue 3.5 + TS + Vite 8 + ECharts 6 + Pinia + Element Plus + Vitest，pnpm），支持 6 种图表（折线/柱/饼/地图/散点/雷达），三栏布局（类型选择 / 预览 / 属性·数据·JSON 面板），具备撤销重做、localStorage 持久化、导出 JSON/PNG。

目标：在保留现有单图编辑能力的前提下演进为"可视化大屏基座"：

1. 制作的图表可入库保存、搜索复用（资产库）
2. 通过拖拽把图表与基础组件拼装成大屏（设计器）
3. 大屏保存进仓库（git 即版本管理），站内渲染 + 导出 schema 供外部消费

对标结论：GoView（Vue3+TS+Pinia，JSON 驱动整屏、自由拖拽、三栏设计器，最接近的参考）、DataRoom、FlyFish、DataEase；国外 Grafana/Superset/Metabase 的"图表资产 → 仪表盘"两级复用模型。行业共性：两级复用模型、大屏 = 一份 JSON Schema、渲染器只吃 JSON、固定基准分辨率整体 scale。

## 2. 需求清单（已逐条确认）

| # | 需求 | 结论 |
|---|------|------|
| 1 | 图表资产库 | 一份资产 = ECharts option + 样例数据 + 名称/分类/标签；存 `src/assets/library/*.chart.json` 入 git；可搜索复用；缩略图 = 运行时渲染真图（懒加载） |
| 2 | 大屏设计器 | 自由拖拽 + 8 控制点缩放，无栅格吸附；物料 = 6 种图表 + 文本/图片/时间日期/IFrame；边框装饰件不做 |
| 3 | 大屏存储 | `src/assets/screens/*.screen.json` 入 git |
| 4 | 保存链路 | Vite dev 中间件 `POST /api/save` 写仓库文件；git diff 即版本记录；构建后 JSON 随 dist 打包，线上只读 |
| 5 | 大屏消费 | 站内 `/screen/<id>` 渲染 + 导出整份 schema JSON（外部自渲染） |
| 6 | 现有功能 | 单图编辑器保留为独立页面"图表制作"；新增图表库、大屏设计、大屏列表页 |
| 7 | 数据能力 | 静态数据 + 可选 API 轮询（间隔 + dataPath 映射）；WebSocket 不做，接口预留 |
| 8 | 画布适配 | 1920×1080 基准，整体 `transform: scale()` 等比适配 |

使用者是开发者本人；未来若面向非开发者再升级轻后端，不在本期范围。

## 3. 技术方案选型

选定 **方案 A：单体演进**（用户确认）。

| 维度 | A 单体演进（选定） | B monorepo 拆包 | C 独立子应用 |
|------|------------------|----------------|-------------|
| 改动成本 | 低：加 vue-router + 新模块目录 | 高：workspace 配置 + 构建编排 | 中高：新起 SPA |
| 复用现有能力 | 直接复用图表渲染、属性面板、撤销重做 | 需先抽 core 包 | 两份维护或被迫抽包（趋同 B） |
| 部署 | 一个 dist，deploy:pro 不变 | 单 dist 但构建链复杂 | 两套部署 |
| 适合规模 | 6 图表 + 4 基础件，足够 | 多包团队协作 | 大屏与编辑器完全异构 |

放弃 B/C 的理由：收益要等"多项目共享 renderer / 非开发者介入"才兑现，到时再拆不迟。

**逃生门**：渲染核心独立放 `src/core/`（纯 JSON 驱动、不依赖 UI 组件库），将来拆包时整个目录平移即可。

## 4. 总体架构

### 4.1 路由与页面（新引入 vue-router）

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | — | 重定向到 `/library` |
| `/library` | 图表库 | 卡片网格 + 搜索/分类筛选；卡片直接渲染真图（进入视口才渲染）；操作：预览、编辑副本、删除 |
| `/editor` | 图表制作 | 现有编辑器原样迁入（App.vue 内容迁为视图组件），功能不变；新增"保存为资产" |
| `/screens` | 大屏列表 | 缩略图卡片：编辑 / 预览 / 导出 JSON / 复制 / 删除 |
| `/designer/:id` | 大屏设计 | 三栏：物料面板 \| 画布 \| 图层+属性；`new` 为新建占位 id，首次保存落盘 |
| `/screen/:id` | 大屏渲染 | 运行态只读，全屏等比适配 |

顶部导航：图表库 / 图表制作 / 大屏列表。

### 4.2 目录规划

```
src/
  core/                        # 渲染核心：纯 JSON 驱动，可整体平移
    types.ts                   #   ChartAsset / ScreenSchema / ScreenItem 等类型
    ChartRenderer.vue          #   单图表渲染（option + data → ECharts）
    Widgets.vue                #   文本/图片/时间日期/IFrame
    Scaler.vue                 #   1920×1080 等比缩放容器
    data-source.ts             #   静态/API 轮询数据源执行器
  views/                       # 页面级组件（新）
    library/  screens/  designer/  screen-render/  editor/
  stores/                      # 新增 assets / screens / designer
  components/
    designer/  library/        # 设计器与图表库 UI（新）
    editor/                    # 现有编辑器组件（保留，面板抽出复用）
    ui/  chart/                # 现有
  assets/
    library/                   # *.chart.json（入 git）
    screens/                   # *.screen.json（入 git）
    geo/                       # 现有地图数据
server/
  save-api.ts                  # Vite dev 中间件（保存/删除 API）
```

### 4.3 复用关系

- **ChartRenderer**：设计器画布、图表库卡片、`/screen/:id` 运行态共用同一组件。
- **属性/数据/JSON 面板**：从现有编辑器抽出为可复用组件，设计器右侧面板复用，不跳页。
- **data-source.ts**：静态/API 执行器，供运行态与设计器预览使用。

## 5. 数据模型

### 5.1 图表资产 `src/assets/library/<id>.chart.json`

```jsonc
{
  "id": "line-basic-001",          // 与文件名一致，kebab-case
  "name": "基础折线图",
  "category": "折线图",
  "tags": ["趋势"],
  "chartType": "line",             // line | bar | pie | map | scatter | radar
  "option": { /* ECharts option，不含数据 */ },
  "sampleData": { /* 现有编辑器"数据"面板结构 */ },
  "createdAt": "2026-11-02T10:00:00Z",
  "updatedAt": "2026-11-02T10:00:00Z"
}
```

### 5.2 大屏 Schema `src/assets/screens/<id>.screen.json`

```jsonc
{
  "id": "ops-001",
  "name": "运维监控大屏",
  "version": 1,                    // schema 版本号，预留迁移
  "canvas": { "width": 1920, "height": 1080, "background": "#0a1a2e" },
  "items": [
    {
      "id": "item-uuid",
      "type": "chart",             // chart | text | image | datetime | iframe
      "name": "左侧折线",           // 图层名
      "rect": { "x": 0, "y": 0, "w": 480, "h": 320 },   // 画布坐标，px
      "zIndex": 1,
      "visible": true,
      "locked": false,
      "chart": {                   // 仅 type=chart
        "sourceAssetId": "line-basic-001",   // 溯源用，可空
        "option": { /* 拖入时的快照拷贝 */ },
        "sampleData": { /* ... */ },
        "dataSource": {
          "mode": "static",        // static | api
          "api": {
            "url": "", "method": "GET", "headers": {},
            "interval": 30,        // 秒；0 或缺省 = 不轮询
            "dataPath": "data.list" // 响应取值路径（lodash.get 语义）
          }
        }
      }
      // type=text    → "props": { "text", "fontSize", "color", ... }
      // type=image   → "props": { "src" }
      // type=datetime→ "props": { "format": "YYYY-MM-DD HH:mm:ss" }
      // type=iframe  → "props": { "src" }
    }
  ]
}
```

### 5.3 关键决策

1. **缩略图 = 运行时渲染真图**：列表卡片用 ChartRenderer 懒加载渲染，零截图链路，永远与配置同步。
2. **大屏内图表存快照拷贝**（非资产引用）：保证大屏自包含，导出后外部可独立渲染；资产更新不反向影响已存大屏；`sourceAssetId` 仅溯源。
3. **数据映射用 `dataPath` 点路径**取值，第一期不做自定义 transform 脚本。

## 6. 设计器交互规范

- **画布**：1920×1080 固定坐标系；Scaler 等比适配，默认"适应窗口"，提供 50% / 100% / 适应窗口档位。
- **拖入**：物料面板 mousedown 拖入 → drop 落点创建 item。
- **移动/缩放**：选中拖动移动；8 控制点自由拉伸（不锁比例）；无栅格吸附。
- **图表编辑**：选中 chart item，右侧 属性 / 数据 / JSON 三个 tab，复用现有面板组件。
- **图层面板**：名称列表；点击选中、双击重命名、显隐切换、锁定。
- **键盘**：`Delete` 删除、`Ctrl+C/V` 复制粘贴、方向键微调 1px（+Shift 10px）、`Ctrl+Z/Y` 撤销重做（基于 items 快照的历史栈）、`Ctrl+S` 保存；未保存离开提示。

## 7. 保存链路

- Vite dev 中间件（`server/save-api.ts`，vite.config 引入）：
  - `POST /api/save`：body = `{ path, content }`；**路径白名单**：仅 `src/assets/library/` 与 `src/assets/screens/` 下的 `.json`；内容格式化（2 空格缩进）后 UTF-8 写盘。
  - `POST /api/delete`：同样白名单校验。
- 列表读取：`import.meta.glob('.../*.json')` 静态导入，dev 下文件变动即时生效。
- 保存即落盘 → git diff 即版本记录，是否 commit 由使用者决定。
- 生产环境：JSON 随 dist 打包为静态资源，`/api/save` 不存在 → 天然只读。

## 8. 渲染与消费

- `/screen/:id`：ScreenRenderer 读 schema → Scaler 等比缩放 → 按 zIndex 渲染 items；`mode: api` 的 item 启动轮询（`interval` 秒），按 `dataPath` 从响应取值替换 sampleData。
- 大屏列表页**导出 JSON**：下载完整 schema 文件；外部按本文档 §5.2 的 schema 定义自渲染（即外部渲染协议）。

## 9. 不做清单（第一期明确排除）

边框装饰件、栅格吸附、多选/框选/编组、组件旋转、WebSocket 数据源、独立后端服务、权限体系、装饰动效。

## 10. 验收标准

1. 图表库页可搜索/筛选资产卡片（真图渲染）；"图表制作"页可将当前图表保存为资产，文件落盘 `src/assets/library/`。
2. 设计器：拖入 6 种图表与 4 种基础件；自由拖动、8 点缩放；图层显隐/锁定/重命名；撤销重做；`Ctrl+S` 保存落盘 `src/assets/screens/`。
3. `/screen/:id` 等比渲染任一已保存大屏；`api` 模式 item 按 interval 轮询并按 dataPath 取值。
4. 大屏列表：编辑 / 预览 / 导出 JSON / 复制 / 删除 全部可用。
5. 现有编辑器功能回归无损（6 图表、撤销重做、导出 JSON/PNG）。
6. `pnpm typecheck` 与 `pnpm test` 通过；保存 API 对白名单外路径返回错误（含测试用例）。
