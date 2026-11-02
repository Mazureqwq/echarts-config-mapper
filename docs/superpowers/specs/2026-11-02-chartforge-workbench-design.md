# ChartForge 重构设计规格 · 一体化大屏搭建工作台

- 日期：2026-11-02
- 状态：待用户审阅（brainstorming 产物）
- 取代：`docs/superpowers/specs/2026-11-02-dashboard-platform-design.md`（上一轮已实施的产品方向；本规格为彻底重写基准）
- 后续：审阅通过后由 writing-plans 生成实施计划

## 1. 意图与成功标准

**产品意图**：快捷搭建可视化大屏。把"快速创建自定义图表"扩展为"保存自定义图表资产并复用，组装完整大屏"。彻底重构（含数据模型），功能、UI、交互对齐国外知名成熟产品。

**已确认决策**：

| 决策点 | 结论 |
|---|---|
| 目标用户 | 个人效率工具，轻量优先（无账号/多用户/分享） |
| 对标基准 | Canva / Retool（画布式拖拽 + 图层 + 检查器），界面中文 |
| 重构范围 | 彻底重写（含数据模型与核心），旧代码仅作参考 |
| 持久化 | 浏览器 localStorage + JSON 导入/导出，无后端；砍掉 dev 文件中间件 |
| 图表复用语义 | 成品独立副本（deepClone），副本与资产互不牵连；无主从联动 |
| 画布模型 | 固定 1920×1080 设计稿画布，自由拖放 + 吸附参考线，运行时等比缩放 |
| 元素范围 | 图表 + 基础元素（文本/图片/装饰形/背景） |
| 产品骨架 | Canva 式一体化设计工作台（单工作台 + 作品列表页 + 演示模式） |
| 实时数据 | 轻量保留：元素级可选（API + dataPath + 刷新间隔），不入资产联动 |
| 技术栈 | 沿用 Vue 3 + TypeScript + Vite + Pinia + Element Plus + ECharts 6 + Vitest，不换栈 |

**成功标准**：第 7 节交互清单 19 项全部达标；质量门 `typecheck → vitest → build` 全绿；第 2.2 节砍掉清单外的旧能力不回归。

## 2. 范围

### 2.1 包含（MVP）
1. 作品列表页（大屏 + 图表资产两个标签）：新建、复制、删除、导入、导出
2. 一体化设计工作台：四区布局（顶栏/左面板/画布/检查器）
3. 画布引擎：选择、移动、缩放、旋转、吸附对齐、图层、组合、撤销重做
4. 图表元素：六种图表（line/bar/pie/map/scatter/radar），schema 配置面板 + 数据表格编辑 + 保存为资产
5. 基础元素：文本、图片、装饰形（矩形/椭圆/线条）、背景（纯色/渐变/图片）
6. 元素级实时数据（可选）：API + dataPath + 刷新间隔
7. 演示模式：1920×1080 等比缩放铺满，实时数据继续工作
8. 导出：工作区/单个大屏/单个资产 JSON；大屏 2 倍 PNG
9. 浏览器本地存储：防抖自动保存 + 手动保存 + 缩略图
10. 亮/暗主题（影响默认配色与工作台外观）

### 2.2 明确排除（YAGNI）
- 模板市场/在线模板；账号体系、云端存储、分享链接
- 回收站、多版本历史（仅编辑态撤销重做）
- 多页大屏、动画编排、图层组样式联动
- 图表资产主从同步（Figma 组件式）；数据源绑定联动体系
- 响应式栅格布局模式；六种以外的图表类型
- dev 文件保存中间件（`server/`，线上不可用）
- E2E 测试框架（质量门以单测 + 类型 + 构建为准）

## 3. 信息架构与路由

| 路由 | 作用 |
|---|---|
| `/` | 我的作品：大屏卡片列表（缩略图/名称/修改时间）+「图表资产」标签页 |
| `/workbench/:id` | 设计工作台（核心编辑器） |
| `/play/:id` | 演示模式：只读运行，隐藏编辑 UI，等比缩放铺满投放屏 |

新建大屏 → 直接进入工作台；顶栏「演示」跳 `/play/:id`；列表页可对大屏/资产执行复制、删除（确认）、导出、导入（合并/替换二选一）。

## 4. 工作台布局

```
┌────────────────────────────────────────────────────────────────┐
│ 顶栏：⬡ ChartForge │ 大屏名·改名 │ ✓已保存 │ ⤴⤓ │ 预览 │ 演示 │ 导出 │
├───────────┬─────────────────────────────────────┬──────────────┤
│ 左面板     │                画布区                │  右检查器     │
│ [元素|资产|图层] │   ┌─────────────────────┐      │ 位置与尺寸    │
│           │      │   1920×1080 虚拟画布  │      │ 图表配置      │
│ 元素：图表 │      │ （缩放/平移/吸附参考线）│      │ 数据编辑      │
│ 文本/图片 │      └─────────────────────┘      │ 外观样式      │
│ 装饰形    │        吸附开关 · 缩放控件 25–400%   │ （随选中切换） │
└───────────┴─────────────────────────────────────┴──────────────┘
```

- **左面板三标签**：元素（拖入新元素）、资产（搜索/拖入/右键管理/保存入库）、图层（顺序、重命名、锁定、隐藏、多选）
- **右检查器（上下文感知）**：选中图表 → 图表配置（schema 分组）+ 数据表格 + 位置尺寸；选中文本/图片/形 → 对应外观属性；多选 → 对齐/分布/组合；未选中 → 大屏属性（尺寸、背景、主题）
- **图表聚焦编辑**：双击画布上的图表 = 展开配置与数据面板（不跳页），Esc 返回普通编辑

## 5. 数据模型

```ts
interface Workspace {
  version: 1
  assets: ChartAsset[]
  screens: Screen[]
  settings: { autosave: boolean }
}

interface Screen {
  id: string
  name: string
  canvas: { width: 1920; height: 1080; background: Background }
  items: ScreenItem[]          // 数组顺序 = 图层顺序（后绘在上）
  updatedAt: number
  thumbnail?: string           // 256px JPEG dataURL
}

type ScreenItem = ChartItem | TextItem | ImageItem | ShapeItem

interface BaseItem {
  id: string
  name: string
  frame: { x: number; y: number; w: number; h: number; rotate: number }
  locked?: boolean
  hidden?: boolean
  opacity?: number             // 0–1
  groupId?: string             // 组合（轻量）
}

type Background =
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle: number }
  | { kind: 'image'; src: string }

interface ChartAsset {
  id: string
  name: string
  thumbnail: string
  spec: ChartSpec
  createdAt: number
  updatedAt: number
}

interface ChartSpec {
  type: 'line' | 'bar' | 'pie' | 'map' | 'scatter' | 'radar'
  option: Record<string, unknown>   // schema 面板产出的 ECharts option 覆盖层
  data: ChartData
  source?: LiveSource               // 可选实时数据
}

type ChartData =
  | { kind: 'category'; categories: string[]; series: { name: string; values: number[] }[] }   // line/bar
  | { kind: 'nameValue'; rows: { name: string; value: number }[] }                              // pie/map
  | { kind: 'xy'; rows: { x: number; y: number; name?: string; group?: string }[] }             // scatter
  | { kind: 'radar'; indicators: { name: string; max: number }[]; series: { name: string; values: number[] }[] }

interface LiveSource {
  url: string
  intervalSec: number          // ≥ 5
  dataPath?: string            // 点路径从响应 JSON 投影出 ChartData（如 data.list）
}

// TextItem: { text; fontSize; color; align; weight; lineHeight? }
// ImageItem: { src; fit: 'contain'|'cover'|'fill' }
// ShapeItem: { shape: 'rect'|'ellipse'|'line'; fill?; stroke?; strokeWidth?; radius? }
```

- **存储**：localStorage 键 `chartforge.workspace.v1`，整工作区一个 JSON；导入导出同构（导出三档：工作区/单屏/单资产）
- **迁移**：`migrate(raw) → Workspace` 按 `version` 逐级升级；失败抛 `ImportError` 且不动现有数据
- **图片**：导入即压缩为 ≤2MB dataURL（JPEG，长边 ≤2048）

## 6. 数据流与状态管理

```
workspaceStore（持久化源） ─→ documentStore（当前大屏编辑态） ─→ CanvasStage / Inspector
       ↑                              │
       └── 防抖 500ms 自动保存 ←── 命令提交 ──→ history 快照栈（undo/redo，上限 100）
```

- **命令式编辑**：一切编辑（画布拖拽落位、检查器改值、数据表格、图层调整、组合）都以命令提交；提交后生成文档快照入 history（深拷贝，规模小），超过 100 步丢最旧
- **撤销/重做**：全局 `Ctrl+Z / Ctrl+Shift+Z`（macOS 同步支持 ⌘）；history 只作用于编辑态，自动保存照常持久化"当前态"
- **渲染**：元素为绝对定位 DOM（CSS transform），数组序即层序；图表元素内嵌 ECharts 实例，编辑期防抖 100ms 重建 option，演示模式一次渲染；图表渲染异常显示错误占位（单元素隔离）
- **自动保存**：命令提交 → 标记 dirty → 防抖 500ms 写 localStorage；`beforeunload` 兜底同步写；顶栏状态机 `已保存/保存中/保存失败(重试)`
- **缩略图**：离开工作台或手动保存时用 canvas 生成 256px JPEG（quality 0.7）写入 `screen.thumbnail`
- **实时数据执行器**：`startLive(item)` 注册轮询（`intervalSec`），响应经 `dataPath` 投影为 `ChartData` 后整体替换数据并重渲染；失败保留最后成功数据并在图表角标显示"数据过期"；离开页面/删除元素时注销
- **core 与 UI 解耦**：`src/core/`（model/storage/chart/geometry/history/live）不依赖 Vue 与 Element Plus，全部可单测；Pinia store 仅装配

## 7. 核心交互清单（MVP 验收基准）

画布与选择（对标 Canva）：
1. 从左面板拖入落位（元素/资产 → 画布任意位置）
2. 单选 / 框选多选 / Shift 加选 / Esc 取消
3. 拖动移动；方向键 1px、Shift+方向键 10px 微调
4. 8 向缩放手柄（Shift 等比）+ 旋转手柄
5. 吸附对齐：画布边缘/中心 + 元素间边缘/中线，带距离参考线
6. Ctrl+C/V 复制粘贴、Ctrl+D 原位复制、Delete 删除
7. 图层：置顶/置底/上移/下移 + 图层面板（拖拽排序、锁定、隐藏、重命名）
8. 多选对齐与分布（左/中/右/上/中/下、水平/垂直等距）
9. 画布缩放（滚轮/控件 25%–400%）、平移（空格/中键）、适应窗口、100%
10. 全局撤销/重做（覆盖一切编辑）
11. Ctrl+G 组合 / 解组

图表编辑：
12. 双击图表聚焦编辑：schema 配置 + 数据表格 + 实时预览
13. 数据表格增删行列，支持粘贴 TSV（Excel 直贴）
14. 一键保存为资产；资产拖出即独立副本

大屏级：
15. 大屏属性：名称、背景、亮/暗主题
16. 顶栏：保存状态、撤销/重做、预览（画布内临时隐藏选框/参考线即看效果，Esc 退出）、演示（跳转 /play/:id 全屏）、导出（JSON / 2 倍 PNG）
17. 列表页：新建、复制、删除（确认）、导入、导出
18. 演示模式：等比缩放铺满，实时数据继续工作
19. `?` 快捷键帮助浮层

## 8. 错误处理

| 场景 | 行为 |
|---|---|
| localStorage 配额超限 | 明确提示 + 引导导出/删除作品；保存失败顶栏警示可重试 |
| 导入解析失败/版本不符/迁移失败 | 明确文案，现有数据不动 |
| 实时数据请求失败/超时 | 保留最后成功数据，图表角标"数据过期" |
| ECharts 渲染异常 | 该元素显示错误占位，不拖垮整屏 |
| 图片过大 | 导入自动压缩（长边 ≤2048，JPEG，≤2MB） |
| 删除大屏/资产、导入替换 | 确认对话框 |

## 9. 测试与质量门

- **core 全覆盖（vitest）**：model（校验/迁移/各 ChartData 结构）、storage（读写/导入导出/配额错误）、chart（六类型 option 构建快照）、geometry（命中/吸附/对齐/变换/等比）、history（undo/redo/上限）、live（dataPath 投影/轮询调度/失败降级）
- **store 集成测**：命令流 + 撤销重做 + 自动保存时序
- **质量门顺序**：`pnpm typecheck → pnpm test → pnpm build` 全绿
- UI 层不引入 E2E（轻量优先）；人工验收走第 7 节清单

## 10. 技术基调与目录

- 沿用 Vue 3 + TypeScript + Vite + Pinia + Element Plus + ECharts 6 + Vitest；不换栈
- 目录：

```
src/
├─ views/       LibraryView · WorkbenchView · PlayView
├─ workbench/   TopBar · LeftPanel(ElementsPanel/AssetsPanel/LayersPanel) · CanvasStage · InspectorPanel
├─ core/        model · storage · chart · render · geometry · history · live
├─ stores/      workspaceStore · documentStore · uiStore
└─ shared/      UI 基础件 · 图标 · 主题
```

- 旧代码处置：以旧代码为参考（schema 面板思路、Scaler 缩放、dataPath 取值、TSV 表格编辑），重写不保留旧文件；`server/` 中间件随重写移除
- 发布沿用现有 `deploy:pro`（构建 dist 部署静态站）

## 11. 验收与交付

- 验收 = 第 7 节 19 项逐项人工走查通过 + 第 9 节质量门全绿
- 交付 = 本仓库 `feature/major-update` 分支上的完整重写实现，含测试与本规格文档
