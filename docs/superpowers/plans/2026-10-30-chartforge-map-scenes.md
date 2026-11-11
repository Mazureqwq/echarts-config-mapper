# 地图场景容器、图层与 2.5D 预设实施计划

> 原范围确认：DataV-like 容器 + 图层 + 预设；首版 2D/2.5D，真 3D 地球后续。2026-10-30 用户进一步明确：当前目标为参考图式 2.5D 矢量挤出地图；旧 CSS 倾斜只作历史实现，不满足新视觉验收。
> Spec: `docs/superpowers/specs/2026-10-30-chartforge-map-scenes-design.md`
> Branch: `feature/chartforge-datav-lite`；保护已有未提交改动，不切 worktree、不未经选择 merge/push，不暂存/提交。

## 架构概要

- 两个受控 `ComponentDefinition`（2D / 2.5D 矢量挤出）共用 MapScene Vue renderer、ComponentItem 数据绑定和离线 runtime renderer；现有 `tilted` ID 暂保留兼容。
- MapScene props 含 allowlisted serializable layers；一个现有 DatasetBinding 共享行快照；组件 Inspector 有专用 layer manager。
- 渲染必须以本地 GeoJSON 真实省界构造顶面与有方向的侧壁/分层厚度；全图倾斜不是目标，不使用 DEM/高程栅格。各地图层对齐并叠在顶面之上。
- 顶层目录隐藏独立 geo 系列图表，地图组只列地图场景 preset；旧 standalone `map` 保持兼容。

## Task 1 — map scene allowlist、catalog presets 与 schema

1. RED：新增 map group、两个 preset catalog、layer schema 安全投影、旧 map 兼容测试。
2. 扩展组件类型的 `map` 分类，注册 `chartforge.map-scene-flat@1`、`chartforge.map-scene-tilted@1`，共用受控 renderer placeholder 和原创本地 preview keys。
3. 修改 catalog 投影，map 组只显示 scene presets；地理 ChartTypes 留作兼容但不作为并列地图卡片。
4. 实现 MapScene/MapLayer 类型与纯白名单 normalizer：layer kinds 固定四类，字段/颜色/数值边界明确，未知值剔除。
5. focused catalog/schema/model tests；typecheck。

## Task 2 — workbench 地图绘制与 Inspector 图层管理

1. RED：flat/tilted preset、layer compose/order/visibility、无效映射与坏坐标、重新加载持久化测试。
2. 实现 MapSceneWidget：注册本地中国 GeoJSON，以共享 geo helper 产生 ECharts region/scatter/heat/flow series；仅显示 enabled layers。
3. （历史首版）仅实现 CSS 斜视/景深；用户 2026-10-30 确认该效果不符合参考图目标。本次跟进以 POC 验证矢量顶面/侧壁/分层挤出，不能只靠旋转。
4. 新增专用 Inspector layer manager：固定类型菜单、add/remove/reorder/toggle/rename、color/opacity/size 控件。
5. 添加地图 scene 共享 dataset 和字段映射 editor；变量 filter 在转换前共用于所有图层。
6. focused component inspector/catalog/render/data binding tests；typecheck。

## Task 3 — offline snapshot/runtime

1. RED：snapshot geo resource inclusion、map props/layer allowlist round-trip、runtime render layers、invalid coordinates、blueprint filter refresh、no external request。
2. snapshot scrub/normalizer 仅保留允许的 map-scene props；workspace dataset snapshot 保持屏幕引用隔离。
3. `attachGeo` 命中 legacy `map` chart 和两种 map-scene components，非地图不注入。
4. `RUNTIME_CODE` 注册本地 geo 一次，输出与工作台一致的 2D/2.5D 受控渲染及 scene layers；同样校验映射/坐标，蓝图变量改变时 rerender 更新。
5. export snapshot/E2E/artifact tests；typecheck。

## Task 4 — UI、兼容、安全回归

1. Map preview 固定 local SVG allowlist；map group 只包含 scene presets；click/drag 保持 existing component MIME。
2. 验证普通图表分组、普通 scatter、旧区域 map、旧地理 ChartData、workspace schema version 兼容。
3. 验证 `git diff --check` 与运行时无外链、`eval`/`new Function`/`innerHTML`，运行目录/工作台/map binding 全部定向 suites。

## Task 5 — 最终验收

1. `pnpm typecheck`。
2. `pnpm vitest run`。
3. `pnpm build`。
4. 复查离线 GeoJSON 按需注入、运行时 CSP/no-network、安全边界；保护并保留既有未提交改动。
5. 更新 plan/progress 记录真实命令和计数。保留未暂存/未提交状态；不得 merge/push。

## 执行结果

- Task 1–5 全部完成；地图目录仅呈现场景预设，旧 `map` 图表保持兼容。
- 验证：`pnpm typecheck` 通过；全量 Vitest 49 个文件 / 440 项通过；`pnpm build` 通过（Vite 8.0.3，821 modules）。
- 导出回归：snapshot 15/15、E2E 7/7、artifact 11/11；目录 UI 12/12。
- `git diff --check` 无空白错误（仅有 LF→CRLF 工作区提示）。工作区保留未暂存、未提交；无 merge/push。

## 2026-10-30 方向修订：参考图式 2.5D 矢量挤出 POC

用户澄清当前目标是所附参考图的 2.5D 立体省级地图，不是 DEM/真实 3D 模型，也不是只把平面图旋转。原 Task 1–5 的完成记录保留为历史；原 CSS 倾斜效果只是早期预设，不满足本次视觉验收。该跟进仅为受控视觉 POC，不启动完整 M2、不改正式地图数据链路。

### POC 执行项

- [ ] **P1 — 先核对视觉结构**：以项目 `src/assets/geo/china.json` 省界为唯一几何源；定义顶面、沿屏幕深度向量偏移的侧壁/叠层、外轮廓高光与底座阴影。不得用随机高度、DEM 或栅格地形。
- [ ] **P2 — 受控渲染验证**：已实现总计 4 层本地 ECharts Geo 省界叠片：3 个底层偏移构成立体厚度且 `label.show=false`、`roam=false`，最上层独占地区名称并唯一接收拖拽/缩放；`georoam` 事件把顶层相机中心与缩放同步至底下四层，所有数据系列绑定最上层 `geoIndex`。按用户参考代码调整为蓝色渐变顶面、青色边界高光、各层独立蓝/紫阴影和放大的地图布局。工作台与离线 Runtime 共用该规则。仍需做浏览器实绘，抽查省界边缘、填色、点位/标签层级、拖拽缩放时各层是否精确对齐；这仍是矢量叠片 POC，不是 DEM/真实海拔地形。
- [ ] **P3 — 编辑器/离线一致性**：相同受控样式在工作台及离线 Runtime 输出；绑定继承/覆盖、图层排序与显隐不变；无网络资源、运行时插件、用户代码或 eval。
- [ ] **P4 — 聚焦验收**：针对全国轮廓、省界、广东/西藏等局部边界、数据点/标签遮挡、窄容器裁切做自动化与视觉抽查；用户确认效果前不扩展成完整 3D/M2。

**本 POC 的成功标准：** 参考图式可辨认的省级顶面和立体侧壁/层叠厚度；侧壁由真实行政区矢量轮廓生成；不是单纯倾斜；overlay 保持对齐与层级；复用本地 GeoJSON，完全离线。未通过用户视觉确认前，不宣称地图 4.0 完成。

**当前实现状态（2026-10-30）：** 2.5D 已采用总计 4 个本地 ECharts Geo 地图实例叠片；底下 3 层显式关闭地区名称与独立 roam，只有最上层可交互；其 `georoam` 相机中心/缩放会同步到底下各层，填色/散点/热力/飞线均投影到顶层。参考样式已映射为线性蓝色渐变、省界青色描边及辉光、多层蓝紫阴影、`layoutSize: 150%`；工作台与离线 Runtime 一致。它用省级矢量面平移模拟叠层厚度，仍未构造独立多边形侧壁网格；地图拖拽/缩放期间跨层对齐及遮挡需要浏览器实绘确认。本轮未做截图/人工视觉确认，故 P2/P4 仍未完成，不宣称 POC 已通过。验证：地图模型 11/11、离线导出 E2E 8/8（含模拟顶层拖拽后相机同步断言）、`pnpm typecheck` 与 `pnpm build`（Vite 8.0.3，826 modules）均通过。

