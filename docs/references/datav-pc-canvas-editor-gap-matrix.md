# DataV 7.0 PC 画布编辑器 × ChartForge 功能对照与优化矩阵

- **盘点日期：** 2026-10-30
- **盘点范围：** DataV 7.0 PC 画布编辑器相关官方指南，与 ChartForge 当前工作区、编辑器、数据处理、地图与离线交付能力对照。
- **用途：** 明确借鉴项、当前覆盖、真实缺口和优先级；不是要求逐项复制 DataV，也不代表 DataV 在线/云端功能适用于 ChartForge。
- **基线原则：** Vue 3 + TypeScript；编译期受控注册；不执行任意用户代码、不引入运行时插件；离线产物无外网依赖、无 `eval`。用户已明确数据集过滤只管理 `pipeline.filter`，不建立跨数据集具名共享过滤器库；全局变量过滤与数据集处理流水线保持分离。

## 状态定义

| 标记 | 解释 |
| --- | --- |
| ✅ 已覆盖 | 当前有可用功能入口/实现，且存在相应测试或稳定模块证据；不表示与 DataV 的功能广度完全相同。 |
| ◐ 部分覆盖 | 核心路径已实现，但与官方工作流仍有明确差异、缺少关键子能力或缺少端到端验证。 |
| ○ 当前缺口 | 本次源码与测试盘点未找到相应产品功能。 |
| ⤼ 明确不做/暂缓 | 与 ChartForge 离线、受控、前端开发者定位冲突，或已由用户明确排除；不能仅因 DataV 有此功能就列为待办。 |

> 本表区分“产品缺口”和“测试覆盖缺口”。没有浏览器 E2E 不代表底层实现不存在；标注为“部分”时会指出具体未覆盖部分。

## 一、功能差距矩阵

| 能力域 | DataV 7.0 PC 参考能力 | ChartForge 当前基线与证据 | 状态 | 建议与优先级 |
| --- | --- | --- | :---: | --- |
| 编辑器总体布局 | 顶栏工具、左侧资源/图层、中央画布、右侧配置；编辑与蓝图工作流衔接。[D1][D2] | 工作台有顶栏、左侧资源栏、中央画布、右侧检查器；左栏含组件/数据集/变量/资产/素材/设计/图层，检查器含配置/数据/交互。`WorkbenchView.vue`、`LeftPanel.vue`、`InspectorPanel.vue`、`workbench-layout.spec.ts`。 | ✅ | 保持现有布局；优先减少面板切换时的上下文丢失，而不是重做整体结构。 |
| 组件库与添加 | 分类、搜索、切换组件包、加入画布。[D6] | 有分类/搜索/添加组件目录和受控内置注册；没有用户运行时安装第三方组件包。`ComponentCatalogPanel.vue`、`core/components/catalog.ts`、`component-catalog*.spec.ts`。 | ✅ / ⤼ | 内置目录和搜索属于已覆盖项；运行时组件包/任意插件明确不做。若需扩展，走编译期注册和版本化组件定义。 |
| 图层树 | 选择、排序、显隐、锁定、编组、重命名、复制/删除、收藏等。[D3] | 已有层级树、拖拽排序、置顶/置底/上下移、显隐、锁定、重命名、删除、组合/解组和组折叠。`LayersPanel.vue`、`layersTree.ts`、`layers-tree.spec.ts`。图层树未见收藏入口；直接复制/图层右键操作也未形成完整树内流程。 | ◐ | P2：评估图层复制与收藏是否符合 ChartForge 的资产语义；避免为表面相似度增加低频按钮。补充层级树真实交互 E2E。 |
| 画布选择与几何编辑 | 单/多选、拖拽、缩放、旋转、层级、缩略图、快捷键和批量操作。[D4][D5] | 支持框选/多选、移动、尺寸/旋转控制点、画布缩放平移、网格/吸附/参考线、键盘微移、对齐与等距、组合。`CanvasStage.vue`、`TransformHandles.vue`、`SelectionOverlay.vue`、`core-geometry.spec.ts`、`workbench-layout.spec.ts`。 | ✅ / ◐ | 基础编排已覆盖；与 DataV 仍有差异的标尺/用户辅助线、组件间距离标注及更完整的翻转/右键操作应按真实用户需求决定。P2。 |
| 组、迭代器、轮播容器 | 组/容器可批量管理；迭代器按数组重复生成内容；轮播容器在固定区域切换组件。[D3][D4] | 普通组合/解组已实现；地图场景是专用容器，但不是通用列表迭代器或轮播容器。未找到通用迭代器/轮播组件实现。 | ◐ / ○ | P2 评估。若纳入，必须是静态受控组件定义和有限数据/布局语义；不引入运行时模板脚本。不能与普通 group 混为同一需求。 |
| 全局搜索与快捷操作 | 搜索组件、配置及相关对象；快捷入口覆盖编辑器常用操作。[D2][D4] | 顶栏有“查找画布元素”/Ctrl+F；快捷键帮助、键盘移动等已有。未见跨资源、配置项、蓝图节点的统一搜索。`TopBar.vue`、`ShortcutsHelp.vue`、`CanvasStage.vue`。 | ◐ | P2：先明确搜索范围；画布元素搜索已满足基础定位，配置/蓝图搜索仅在复杂项目规模需要时实现。 |
| 历史与恢复 | 回退与清空画布编辑器中的历史记录。[D12] | 有文档级撤销/重做栈，顶栏显示撤销/重做；没有独立历史记录时间线/版本命名/恢复面板。`documentStore.ts`、`TopBar.vue`、`core-history.spec.ts`。 | ◐ | P1/P2：先验证撤销重做对组合、画布尺寸、数据绑定等复杂操作的覆盖；持久化版本历史不纳入近期范围。 |
| 页面与画布配置 | 页面尺寸、背景、预览/发布适配、加载状态、封面等页面级配置。[D18][D8] | 可设画布尺寸、纯色/渐变/图片背景、界面主题；缩小画布有保留原位或等比适配确认。`ScreenPanel.vue`、`documentStore.ts`、`workbench-layout.spec.ts`。未见 DataV 全套发布缩放、加载页和封面配置入口。 | ◐ | P2：现有本地画布设置满足编辑核心；发布专属选项随本地交付需求再定。 |
| 组件检查器 | 快速/完整配置、样式/数据/高级分区、配置搜索、通用定位尺寸、样式复制粘贴。[D8][D9] | 右侧有配置/数据/交互面板、通用 Frame、schema 驱动控件、数据集绑定和声明式事件。`InspectorPanel.vue`、`ComponentInspector.vue`、`DatasetBindingEditor.vue`。未见“快速/完整配置切换”、检查器配置项全文检索和通用样式复制粘贴。 | ◐ | P1：先补配置错误反馈与高频配置定位；快速/完整双模式和样式复制应通过使用场景验证后再做。 |
| 数据源与数据集 | 组件可绑定静态/业务数据源；数据管理查看关联组件、数量并支持更换来源。[D9][D13] | 有静态与 HTTP 数据集、统一 DatasetRuntime/DataHub、加载/成功/陈旧/错误状态；可在数据集面板管理和编辑。`DatasetPanel.vue`、`datasetRuntime.ts`、`dataHub.ts`、`dataset-runtime.spec.ts`、`data-hub.spec.ts`。不包括 DataV 云端数据源生态或数据库直连。 | ✅ / ⤼ | 核心数据集链路已覆盖；云连接器/数据库直连/账号托管为当前明确边界，不按 DataV 菜单逐项补齐。 |
| 数据加工与字段映射 | 数据先过滤/转换，再映射到组件；过滤器可排序、调试并级联。[D9][D11] | 受限声明式 pipeline 支持行过滤、选列、排序、limit 和字段映射；组件绑定配置字段映射。`core/live/pipeline.ts`、`DatasetPanel.vue`、`DatasetBindingEditor.vue`、`pipeline.spec.ts`。 | ✅ | 维持纯数据操作，不执行表达式/用户代码。地图的字段映射与离线相同数据链路纳入独立 E2E。 |
| 可复用过滤器库 | DataV 可管理具名过滤器并在多个组件/蓝图场景引用；过滤器按顺序级联。[D11] | ChartForge 的数据集过滤只管理各数据集 `pipeline.filter`；全局变量过滤单独保存在组件/图层绑定中。没有跨数据集具名共享过滤器库。 | ⤼ | **明确不做共享过滤器库**，这是已确认的产品边界，不作为“欠功能”追赶。继续完善数据集内过滤的可预览与可测试性。 |
| 全局变量 | 管理变量来源/初始值/受控/自动更新；可从静态、异步、URL 或交互事件取值。[D10] | 按大屏保存声明式变量，支持类型/初始值、蓝图赋值、数据绑定等值过滤；没有 DataV 同等范围的变量来源编辑器、URL 参数源、受控/自动更新选项。`GlobalVariablesPanel.vue`、`WorkbenchView.vue`、`blueprint-variables.spec.ts`。 | ◐ | P1：优先验证变量初始值、切换值、刷新和离线产物的一致性；URL/异步变量来源需有明确离线语义后再决定。 |
| 蓝图交互 | 事件节点、条件、变量、数据源和组件动作形成可视化联动。[D1][D10][D16] | 有静态受控图节点：组件事件、变量赋值、条件、字段转换、数据集动作、组件显隐/属性、导航；无任意 JS 节点。`BlueprintEditor.vue`、`core/blueprint/runner.ts`、`blueprint.spec.ts`。 | ✅ / ◐ | 受控节点闭环已有；下一步重点是调试信息与边界覆盖，不追求 DataV 的节点种类/在线服务数量。 |
| 调试预览与错误诊断 | 单独调试预览可记录蓝图节点、请求、过滤、渲染日志并展示错误详情。[D16] | 有预览、蓝图执行结果提示、数据组件状态/错误文本；未见集中式调试会话、逐节点输入输出日志或按请求/过滤/渲染分组的诊断面板。 | ◐ | P1：优先提升可诊断性（节点结果、绑定/数据集错误定位），日志必须是结构化数据，不执行用户代码。 |
| 主题 | 内置/图片生成主题，统一图表调色板与字体等视觉 token。[D14] | 有内置主题套件、主题色 token 和本地应用；未发现从上传图片自动提取主题的流程或 DataV 级细粒度主题生成器。`DesignLibraryPanel.vue`、`core/design/library.ts`、`design-library.spec.ts`。 | ◐ | P2：先保证主题应用/局部显式样式关系稳定；图片主题提取按成本与离线需求另作决策。 |
| 设计库与复用资产 | 模板、规范、视觉资产、资源/收藏，可预览并插入画布。[D7] | 有本地设计库、内置背景布局/区块、图片素材导入和主题套件；内置资源离线自包含。没有 DataV 在线市场、云端收藏同步与同等资产规模。`DesignLibraryPanel.vue`、`LayoutBackgroundCatalog.vue`、`design-layouts.spec.ts`。 | ✅ / ◐ | 本地复用路径已覆盖；云端设计市场不做。后续关注搜索/标签/重复资产管理是否成为实际瓶颈。 |
| 一键美化 | 按预设批量调整布局、间距、对齐吸附和视觉样式；应用前可预览。[D15] | 当前源码/测试中未发现一键美化操作。 | ○ | P2：如纳入，必须先预览、可撤销、显示将被覆盖的配置；不应静默重写用户已有样式。 |
| 普通预览/演示 | 普通预览查看最终效果；交互预览按产品限制运行。[D1][D16] | 编辑器预览可隐藏辅助线/手柄，另有全屏演示视图；预览不等同于独立的蓝图日志调试模式。`TopBar.vue`、`PlayView.vue`、`play-playlist.spec.ts`。 | ✅ / ◐ | 基础预览/演示已覆盖；补的是可诊断交互预览，不是再做一套渲染器。 |
| 离线导出 | DataV 支持发布/快照；ChartForge 的目标是本地可交付产物。[D17] | 有单文件 HTML 与 ZIP 离线包、数据快照、CSP/哈希清单、资源自包含与安全转义；工作区入口由 `ExportPackageDialog.vue` 提供。无外网依赖、无 `eval`。地图 E2E 已验证用户编辑后的数据进入真实导出 runtime 并与刷新画布一致。`core/export/*`、`export-*.spec.ts`、`e2e/map-scene-editor.spec.ts`。 | ✅ | 这是 ChartForge 相对 DataV 的明确差异化交付项；继续保持零外链并覆盖映射/变量/静态管线边界。 |
| JSON/PNG 导出 | 工具栏提供与 DataV 看板操作配套的导出入口。[D2] | 工作台可导出当前大屏 JSON 和 2× PNG；离线包从大屏库导出对话框生成。`TopBar.vue`、`LibraryView.vue`。 | ✅ / ◐ | 入口分布与官方不完全相同，但能力已存在；避免重复导出按钮造成混淆。 |
| 发布、分享、安全与快照版本 | 发布链接/二维码、密码/Token/IP 白名单、加载页、发布快照锁定/回滚等。[D17] | 当前交付以本地文件/静态部署为主；未发现在线发布服务、访问控制后台或发布快照版本面板。 | ⤼ | 当前不作为缺口追赶；无后端/账号和离线交付约束下，采用可审计的静态产物。 |
| 帮助与上手引导 | 新手引导、快速链接、帮助说明。[D2] | 有快捷键帮助和必要提示；未发现完整分步导览/上下文帮助中心。`ShortcutsHelp.vue`。 | ◐ | P3：待核心任务稳定后评估；先补关键错误提示与可发现性。 |
| 地图场景 | 地图组件/图层是 DataV 编辑器中的内容能力；ChartForge 采用“容器 + 图层 + 预设”，当前视觉目标为 2D 与参考图式 2.5D 矢量挤出。 | 已有区域填色、地理散点、热力、飞线图层；独立图层绑定可覆盖容器绑定，无独立绑定时继承容器绑定；字段映射、变量过滤、离线输出走同一数据链。地图 E2E 覆盖绑定继承/覆盖、变量交互、刷新与离线 runtime 一致。`MapSceneInspector.vue`、`e2e/map-scene-editor.spec.ts`。 | ✅ / ◐ | 用户 2026-10-30 澄清 2.5D 需有真实 GeoJSON 省界顶面与挤出侧壁/层叠厚度；单纯倾斜不满足，真实 DEM/WebGL 地形不在当前范围。小型 POC 路线：`docs/superpowers/specs/2026-10-30-chartforge-map-4x-redesign.md`；保留容器+子图层及绑定语义。
| 协作、权限与插件市场 | DataV 云产品的账号/权限、多人协作或组件包生态不属于单机画布单项能力。[D6][D17] | 当前没有云同步、多人实时协作、角色权限或运行时插件市场；组件编译期受控注册。 | ⤼ | 当前明确暂缓；避免将 SaaS 运营面和运行时代码下载机制带入离线产品。 |

## 二、建议优先级与可验收路线

| 优先级 | 工作项 | 为什么现在做 | 建议验收 |
| --- | --- | --- | --- |
| P0（进行中） | 基础平面地图 + 参考图式 2.5D 矢量立体地图 | 用户明确当前需要 2.5D 省界矢量挤出效果；不做真实 DEM 地形模型，也不以单纯倾斜冒充。 | 依 `docs/superpowers/specs/2026-10-30-chartforge-map-4x-redesign.md`：先验收 2.5D 顶面/侧壁视觉 POC 与 2D 图层绑定，再补子图层目录及编辑器/离线一致性。真实 WebGL/DEM 地形须另行批准。 |
| P1 | 蓝图/数据调试可观测性 | 数据链路和声明式蓝图已存在，但 DataV 参考工作流强调请求、过滤、渲染和节点级排错。 | 给一次调试会话生成结构化节点/数据状态结果；失败信息能定位到组件/数据集/字段；不包含任意代码执行。 |
| P1 | 画布核心交互回归 E2E | 画布有多选、吸附、组合、对齐、锁定等逻辑；当前自动化主要是单元测试，操作组合仍可能产生交互回归。 | 覆盖创建/选择/移动/组合/对齐/撤销/保存刷新；不把像素截图作为唯一断言。 |
| P2 | 画布辅助线/定位增强 | 标尺、用户辅助线、距离标注是 DataV 的效率能力，但当前已有网格、吸附与参考线。 | 先做用户任务验证；若纳入，支持可见性开关、坐标持久化和撤销。 |
| P2 | 一键美化 | 当前缺口明确，但风险是覆盖用户样式/布局。 | 仅在设计需求明确后实现；必须预览变更、展示受影响对象、一键撤销。 |
| P2 | 图层收藏/复制、迭代器/轮播 | 官方有对应管理/容器能力，当前仅普通 group 和地图场景容器。 | 先确定真实复用场景和数据/生命周期模型；禁止用通用用户脚本描述容器行为。 |
| 暂缓 | 云发布、在线分享/快照权限、数据库连接、运行时插件、多人协作、真 3D 地球、DEM/真实 WebGL 地形 | 与当前本地离线、无任意运行时代码及 2.5D 矢量挤出目标不符。 | 除非产品范围再次确认，否则不进入迭代计划。 |

## 三、关键产品决策（避免把差异误报成欠账）

1. **差异化而非克隆：** DataV 的在线平台功能只作为交互/工作流参考，不自动转化为 ChartForge 需求。
2. **过滤器模型：** 数据清洗与筛选属于各数据集的 `pipeline.filter`；跨数据集具名共享过滤器库明确不做。全局变量过滤保持单独绑定语义。
3. **组件扩展：** 仅编译期受控注册；不支持工作区导入 JS/HTML/CSS 插件，不加运行时插件安装器。
4. **数据安全：** 离线包只携带需要的数据快照，不携带凭证/请求头；不调用外部网络、不执行 `eval`。
5. **地图范围：** 用户确认地图按“容器 + 子图层”建设；当前视觉目标是 2D 与参考图式 2.5D 省界矢量挤出。顶面、侧壁/层叠和高光阴影由本地 GeoJSON 几何生成；不需要 DEM 或全国高程瓦片。真实 WebGL 地形与真 3D 地球暂缓。

## 四、盘点依据与验证证据

### ChartForge 源码/测试

- 编辑器与画布：`src/views/WorkbenchView.vue`、`src/workbench/CanvasStage.vue`、`InspectorPanel.vue`、`LayersPanel.vue`、`LeftPanel.vue`。
- 组件目录/数据集/变量/蓝图：`src/workbench/components/ComponentCatalogPanel.vue`、`DatasetBindingEditor.vue`、`src/workbench/panels/DatasetPanel.vue`、`GlobalVariablesPanel.vue`、`src/workbench/BlueprintEditor.vue`。
- 画布与布局测试：`tests/workbench-layout.spec.ts`、`tests/core-geometry.spec.ts`、`tests/layers-tree.spec.ts`、`tests/core-history.spec.ts`。
- 数据、变量与交互测试：`tests/pipeline.spec.ts`、`tests/dataset-runtime.spec.ts`、`tests/blueprint-variables.spec.ts`、`tests/blueprint.spec.ts`。
- 设计/导出/地图测试：`tests/design-library.spec.ts`、`tests/export-snapshot.spec.ts`、`tests/export-artifact.spec.ts`、`tests/export-e2e.spec.ts`、`tests/map-scene-model.spec.ts`、`e2e/map-scene-editor.spec.ts`。
- 本次状态基线：Vitest 53 个文件/461 项通过；Playwright 地图编辑链路 1 项通过；`pnpm typecheck` 与 `pnpm build` 通过。此计数记录最近验证，不代表功能矩阵每行都有浏览器级 E2E。

### DataV 7.0 官方参考

| ID | 主题 | 官方帮助 |
| --- | --- | --- |
| D1 | PC 端画布编辑器总览 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/canvas-editor-on-pcs/> |
| D2 | 工具栏 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/toolbar-of-canvas-on-pcs/> |
| D3 | 图层管理 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/layer-management-of-canvas-editor-in-pc-of-datav-7> |
| D4 | 组件画布操作 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/widget-operations-in-a-canvas> |
| D5 | 坐标与辅助线 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/widget-coordinates-and-auxiliary-lines> |
| D6 | 组件库管理 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/widget-library-management> |
| D7 | 设计库 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/design-library> |
| D18 | 页面与组件设置 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/page-and-widget-configurations> |
| D8 | 组件配置项 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/configuration-items> |
| D9 | 组件数据源配置 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/widget-data-source-configuration> |
| D10 | 全局变量 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/manage-global-variables>；<https://help.aliyun.com/zh/datav/datav-7-0/user-guide/use-global-variables> |
| D11 | 过滤器配置与应用 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/filter-configuration-and-application/> |
| D12 | 历史记录 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/historical-records> |
| D13 | 数据管理 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/data-management> |
| D14 | 智能主题 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/smart-theme-for-canvas-on-pcs> |
| D15 | 一键美化 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/one-click-beautification> |
| D16 | 调试预览 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/debugging-and-preview> |
| D17 | 发布与快照管理 | <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/publish-and-snapshot-management> |

> 官方文档页面会随 DataV 产品版本更新。矩阵记录的是当前查阅到的官方能力归纳和 ChartForge 仓库现状；对未逐项验证的边界采用“部分/当前未发现”标记，不把推测写成产品事实。
