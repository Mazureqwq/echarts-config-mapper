# 组件目录分类与地图图表扩展实施计划

> **Superseded:** This 2D chart-oriented plan was replaced after user review by `docs/superpowers/plans/2026-10-30-chartforge-map-scenes.md`; retained for history.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将可放置组件目录中的普通图表与地图可视化明确分组，并增加区域填色、地理散点、点热力、OD 飞线四类离线可用地图图表。

**Architecture:** 普通图表和地图图表继续共用 `chartRegistry`、`ChartItem`、现有数据绑定和 ECharts 渲染；chart descriptor 声明 `catalogGroup`，目录增加 map 分组。地图的行转换使用独立、纯函数的地理数据 helper，DatasetBinding 与 LiveSource 都携带可选地理字段映射；导出按需复用仓库内置中国 GeoJSON。

**Tech Stack:** Vue 3.5、TypeScript 5.9、Vite 8、Pinia 3、ECharts 6、Vitest 3；不新增依赖。

**Spec:** `docs/superpowers/specs/2026-10-30-chartforge-map-chart-catalog-design.md`

## Global Constraints

- Vue 3.5、TypeScript 5.9、Vite 8、Pinia 3、ECharts 6、Vitest 3。
- 组件和图表均使用编译期受控注册；不允许运行任意用户代码，不增加运行时插件。
- 地图用本地 ECharts 及仓库内置中国 GeoJSON；离线导出不依赖外部瓦片、字体、图片或其他网络资源。
- 继续当前分支，不切 worktree；不得未经用户选择 merge 或 push。
- 不改写旧工作区中 `map` 区域地图的数据匹配语义；旧 `ChartType`/数据配置保持可读取。
- 本轮只重分类可放置组件目录，不重做图表资产库的用户业务分类。
- 首批不做任意 GeoJSON 导入、轨迹线、3D 地球、地图下钻或在线底图。
- 当前工作区已有未提交改动；每个任务提交前必须核对暂存 diff，只能暂存该任务新增的 hunks。若无法安全区分既有改动，不提交该任务，保留工作区供用户决定。

## Review Focus

1. **旧 `map` 工作区和资产仍按地区名称/数值渲染** — Task 1 在 `tests/core-model.spec.ts` 与 `tests/core-chart.spec.ts` 断言旧样本规范化后 `kind: "nameValue"` 与原中国地图 option 不变。
2. **经纬度输入为数字/数字字符串、空值、NaN 或超出范围** — Task 1 在 `tests/geo-chart-data.spec.ts` 断言有效坐标转换、非法行计数、越界行剔除，以及非空全无效输入返回错误而非 (0,0)。
3. **必需映射缺失、空数据或变量过滤后无行** — Task 2 在 `tests/item-view.spec.ts`、`tests/pipeline.spec.ts` 断言地图报告清晰错误/空状态，且不会把缺失字段伪造成坐标原点。
4. **搜索/筛选、恶意字面量标签、普通/地理散点的类别与拖放** — Task 1 的 catalog tests 固定 map 分组；Task 3 的 UI tests 固定地图卡预览、search/filter、文本字面呈现，以及 map 图表仍使用现有 chart 拖放 MIME 和类型 key。
5. **离线资源条件与网络隔离** — Task 4 在导出快照和 E2E 测试断言所有地图类型携带本地 GeoJSON、非地图不携带、HTML/ZIP 不发起地图外网请求。

---

## File Structure

- Create `src/core/chart/geoData.ts`：地理行映射、有限数值/坐标范围校验，以及地理数据结果类型；不依赖 Vue 或 ECharts。
- Extend `src/core/model/types.ts`、`src/core/model/schema.ts`：地图类型、地理 ChartData 与可选映射的序列化白名单；老工作区版本保持兼容。
- Extend `src/core/chart/chartData.ts`、`registry.ts`、`registerCharts.ts`：矩阵输入/输出、样例、默认 ECharts option、目录组元数据及 ECharts 模块注册。
- Extend `src/core/live/pipeline.ts`、`payload.ts`：把 Dataset/HTTP 的已加工行交给同一地图映射函数；保留既有普通图表转换行为。
- Extend `src/workbench/components/DatasetBindingEditor.vue`、`src/workbench/panels/LiveSourcePanel.vue`、`src/workbench/InspectorPanel.vue`、`src/workbench/ItemView.vue`：按图表类型配置映射并呈现转换错误。
- Extend `src/core/components/types.ts`、`catalog.ts`、`src/workbench/components/ComponentCatalogPanel.vue`：新增地图组、chart descriptor 分类读取及 allow-list 地图预览。
- Extend 图表类型入口标签：`src/workbench/ElementsPanel.vue`、`InspectorPanel.vue`、`src/views/ChartEditView.vue`、`ChartsView.vue`、`src/workbench/panels/AssetLibraryPanel.vue`；图表资产分类机制本身不变。
- Extend `src/core/export/assets.ts`、`src/core/export/runtime.ts`：对地图类型按需嵌入/注册中国 GeoJSON；保留现有 export payload 与 runtime 安全约束。
- Add `tests/geo-chart-data.spec.ts`；扩展 `core-model.spec.ts`、`core-chart.spec.ts`、`pipeline.spec.ts`、`live-source.spec.ts`、`item-view.spec.ts`、`component-catalog.spec.ts`、`component-catalog-ui.spec.ts`、`export-snapshot.spec.ts`、`export-e2e.spec.ts`、`export-artifact.spec.ts`。

## Task 1: 地理模型、转换函数与地图 option

**Files:**
- Create: `src/core/chart/geoData.ts`, `tests/geo-chart-data.spec.ts`
- Modify: `src/core/model/types.ts`, `src/core/model/schema.ts`, `src/core/chart/chartData.ts`, `src/core/chart/registry.ts`, `src/core/chart/registerCharts.ts`, `src/core/live/pipeline.ts`, `src/core/live/payload.ts`, `src/core/components/types.ts`, `src/core/components/catalog.ts`, `src/workbench/components/ComponentCatalogPanel.vue`, `src/workbench/ElementsPanel.vue`, `src/workbench/InspectorPanel.vue`, `src/views/ChartEditView.vue`, `src/views/ChartsView.vue`, `src/workbench/panels/AssetLibraryPanel.vue`
- Test: `tests/geo-chart-data.spec.ts`, `tests/core-model.spec.ts`, `tests/core-chart.spec.ts`, `tests/live-advanced.spec.ts`, `tests/component-catalog.spec.ts`, `tests/component-catalog-ui.spec.ts`

**Interfaces:**
- `ChartType` 增加 `geoScatter | geoHeatmap | geoFlow`；旧 `map` 类型 key 不变。
- `GeoFieldMapping`：可选字符串字段 `longitude`、`latitude`、`name`、`value`、`originLongitude`、`originLatitude`、`destinationLongitude`、`destinationLatitude`。
- `DatasetBinding.fields` 与 `LiveSource.map` 可选包含 `geo?: GeoFieldMapping`；`PipelineMap` 接受相同的可选 `geo` 字段。普通 `category`、`value`、`seriesField` 语义保持原样。
- `GeoChartType = "geoScatter" | "geoHeatmap" | "geoFlow"`；`GeoPoint = { longitude: number; latitude: number; name?: string; value?: number }`；`GeoHeatPoint = { longitude: number; latitude: number; value: number }`；`GeoFlowLine = { from: [number, number]; to: [number, number]; name?: string; value?: number }`。`ChartData` union 增加 `{ kind: "geoScatter"; rows: GeoPoint[] }`、`{ kind: "geoHeatmap"; rows: GeoHeatPoint[] }`、`{ kind: "geoFlow"; rows: GeoFlowLine[] }`；`GeoChartData` 是这三个 variants 的 union。
- 矩阵列顺序固定为：地理散点 `[longitude, latitude, name, value]`；点热力 `[longitude, latitude, value]`；OD 飞线 `[originLongitude, originLatitude, destinationLongitude, destinationLatitude, name, value]`。尾部可选列缺省为空。
- `buildGeoChartDataFromRows(rows: readonly Record<string, unknown>[], mapping: GeoFieldMapping | undefined, type: GeoChartType): GeoChartBuildResult`；成功为 `{ ok: true; data: GeoChartData; invalidRows: number }`，失败为 `{ ok: false; message: string; invalidRows: number }`。缺必需字段时报错；提供映射的合法空输入得到空数据；非空全无效时报错；部分无效时只返回有效记录并报告无效行数。
- `ChartDescriptor.catalogGroup` 为 `"chart" | "map"`；既有图表默认 `chart`，`map` 与三个新地理类型设为 `map`。显示 label 固定为 `map: 区域填色地图`、`geoScatter: 地理散点图`、`geoHeatmap: 点热力图`、`geoFlow: OD 飞线图`。`ComponentCatalogGroup` 增加 `map`，`getComponentCatalog()` 将 descriptor.catalogGroup 原样投影到目录条目；目录顶部筛选项包含图表/地图/数据/装饰/基础五组。

- [x] **Step 1: 写核心与目录分组失败测试** — `geo-chart-data.spec.ts` 断言数字/数字字符串、可选名称/值、热力强度、OD 坐标顺序、无效行、缺字段和空集行为；`core-model.spec.ts` 断言旧 map 仍规范化、白名单 geo mapping 被保留；`core-chart.spec.ts` 断言新类型矩阵往返、默认样例与 ECharts option；`live-advanced.spec.ts` 断言带 geo kind 的结构化 ChartData 可被安全识别/验证；`component-catalog.spec.ts` 断言现有 map 及三类新增图表归 map，普通图表归 chart；UI 测试断言五组筛选按钮与 map 分组筛选。
- [x] **Step 2: 运行测试并确认 RED** — `pnpm exec vitest run tests/geo-chart-data.spec.ts tests/component-catalog.spec.ts tests/component-catalog-ui.spec.ts`；预期因地图类型、组投影与地图筛选不存在而失败。
- [x] **Step 3: 实现地理数据 model 与 `buildGeoChartDataFromRows`** — 在 `geoData.ts` 实现数值解析、经纬度范围校验与三种纯数据转换；在 `model/types.ts` 增加 ChartType、GeoFieldMapping、GeoPoint/GeoFlow 类型及 ChartData union；保持旧 `category/nameValue/xy/radar` 格式不变。
- [x] **Step 4: 实现 ChartData 矩阵、样例、验证与 option** — `chartData.ts` 为三种类型实现固定列序的矩阵序列化/反序列化、有效默认样例、`validateChartData` 与 ECharts geo option；旧地图 option 不变。
- [x] **Step 5: 扩展 schema、descriptor、ECharts registry 与标签** — `schema.ts` 白名单接受新 ChartType 并规范化已声明 geo 字段；`registry.ts` 为每个类型声明 label、数据列、最少样式控制与 `catalogGroup`；`registerCharts.ts` 只注册所需 Geo/Heatmap/Lines 模块；同步 `ElementsPanel`、`InspectorPanel`、`ChartEditView`、`ChartsView`、`AssetLibraryPanel` 所有穷尽 ChartType 的静态标签表。
- [x] **Step 6: 实现 map 目录分组** — `ComponentCatalogGroup` 增加 map，`getComponentCatalog()` 从 descriptor 投影分组，`ComponentCatalogPanel` 添加地图筛选按钮、计数与 section label；现有 data/decoration/basic 分组不变。
- [x] **Step 7: 扩展 HTTP chart pipeline 的类型通路** — `PipelineMap` 支持 geo；`toChartData(raw, type, mapping?)` 识别地图 ChartData kind、验证结构化数据，并将行式地图数据交给同一 helper；保持普通图表请求行为。
- [x] **Step 8: 跑定向测试并确认 GREEN** — `pnpm exec vitest run tests/geo-chart-data.spec.ts tests/core-model.spec.ts tests/core-chart.spec.ts tests/live-advanced.spec.ts tests/component-catalog.spec.ts tests/component-catalog-ui.spec.ts`；预期全部通过。
- [x] **Step 9: 类型检查** — `pnpm typecheck`；预期通过，不可用 `as any` 绕过穷尽检查。
- [ ] **Step 10: 安全暂存并提交（按用户要求暂缓）** — 核对 `git status` 与 `git diff --cached`；对和既有脏 hunks 重合的文件只选择本任务新 hunks；`git diff --cached --check` 后提交 `feat: add typed offline map chart data`。若无法可靠分离，保留未提交并记录原因。

## Task 2: 数据绑定/实时数据字段映射与画布错误态

**Files:**
- Modify: `src/core/live/payload.ts`, `src/core/live/pipeline.ts`, `src/workbench/components/DatasetBindingEditor.vue`, `src/workbench/panels/LiveSourcePanel.vue`, `src/workbench/InspectorPanel.vue`, `src/workbench/ItemView.vue`
- Test: `tests/pipeline.spec.ts`, `tests/live-source.spec.ts`, `tests/item-view.spec.ts`

**Interfaces:**
- `buildChartDataFromRows(rows, fields, type)` 对 `geoScatter/geoHeatmap/geoFlow` 调用 Task 1 的 `buildGeoChartDataFromRows` 并返回现有 `ChartDataResult` 结构及 pipeline counts。
- `DatasetBindingEditor` 可接收 chart type；数据集绑定模式中按类型显示：区域 `category/value`、地理散点 `longitude/latitude/name/value`、点热力 `longitude/latitude/value`、OD `originLongitude/originLatitude/destinationLongitude/destinationLatitude/name/value`。
- `LiveSourcePanel` 编辑/保存同一 geo 字段映射到 `LiveSource.map.geo`；加工阶段须保留地图转换所需原始列，不能被 `applyMap` 的 category/value 投影丢掉。

- [x] **Step 1: 写 Dataset、HTTP 与画布错误态 RED 测试** — `pipeline.spec.ts` 用绑定字段将对象行变为三个 Geo ChartData kinds，检查变量过滤先于转换、counts 保留；`live-source.spec.ts` 断言 `LiveSource.map.geo` schema round-trip；当 `select` 保留所有映射所需列时转换成功，遗漏必需映射列时返回清晰错误；`item-view.spec.ts` 断言缺必需映射、越界数据和变量过滤后空行时有可读状态，缺经纬度绝不显示为原点；旧普通图表加工结果不变。
- [x] **Step 2: 跑定向测试确认 RED** — `pnpm exec vitest run tests/pipeline.spec.ts tests/live-source.spec.ts tests/item-view.spec.ts`；预期地图映射契约与画布错误提示断言失败。
- [x] **Step 3: 实现共享数据转换** — 在 `buildChartDataFromRows` 中将 `fields.geo` 传给 helper；在 direct live `buildChartData` 中将 `source.map` 的 geo 子对象传给 `toChartData`，避免地理字段在映射投影时被移除。保留现有 ordinary chart `applyMap`/pivot 输出。
- [x] **Step 4: 实现按类型的 DatasetBindingEditor 控件** — 由 Inspector 传入 `item.spec.type`；只显示该类型必需/可选字段，更新 geo key 时保留现有 category/value/filterBy，不绑定时清理无效 mapping。
- [x] **Step 5: 实现 LiveSourcePanel 的字段编辑与保存** — 同步 `props.item.spec.source.map.geo` 到表单；保存时仅写入非空字段；调试/加工预览采用和运行渲染相同的转换 helper。
- [x] **Step 6: 实现画布绑定错误与空数据状态** — `ItemView.vue` 将 Geo ChartDataResult 错误映射到既有 binding status UI；非空全无效和缺必需映射给出可读提示，空行集不伪造原点，合法点正常渲染。
- [x] **Step 7: 跑定向测试确认 GREEN** — `pnpm exec vitest run tests/pipeline.spec.ts tests/live-source.spec.ts tests/item-view.spec.ts`；预期通过。
- [ ] **Step 8: 类型检查与提交（类型检查完成；提交按用户要求暂缓）** — `pnpm typecheck`；核对暂存 diff 只含本任务 hunks，随后提交 `feat: map geographic dataset bindings`；若旧改动无法安全隔离则不提交并记录。

## Task 3: 地图目录卡片预览与交互回归

**Files:**
- Modify: `src/workbench/components/ComponentCatalogPanel.vue`
- Test: `tests/component-catalog-ui.spec.ts`, `tests/workbench-layout.spec.ts`

**Interfaces:**
- 已有 map 分组由 Task 1 提供；本任务只增加 `chart-geoScatter`、`chart-geoHeatmap`、`chart-geoFlow` 与区域地图的固定本地 preview variant，不更改目录 group 类型或 chart entry 投影。
- `ComponentCatalogPanel` 通过 preview key allow-list 选择本地 SVG，未知 key 安全回退 generic；不接受入口数据里的任意 markup。
- 每个新 ChartType 在图表创建、画布插入、Inspector 切换、图表编辑页和图表资产标签上都有一致 label；不改变 chart item 的 dnd payload schema。

- [x] **Step 1: 写地图预览 UI RED 测试** — `component-catalog-ui.spec.ts` 断言四种地图条目各自使用预期的本地 preview variant；map 筛选结果只显示地图卡，点击/拖放仍携带 chart type key，恶意标签保持字面文本。
- [x] **Step 2: 跑 UI 测试确认 RED** — `pnpm exec vitest run tests/component-catalog-ui.spec.ts`；预期新地图 preview key 仍回退 generic。
- [x] **Step 3: 加本地地图卡片预览** — `ComponentCatalogPanel.vue` 为 `geoScatter`、`geoHeatmap`、`geoFlow` 和区域图提供固定 SVG/local templates；以 `v-if`/SVG 节点渲染，不用 v-html、远程 URL 或动态 CSS。
- [x] **Step 4: 验证分类与既有 chart label 边界** — chart type 标签已在 Task 1 随 `ChartType` 同步扩展；本任务只为地图卡片新增本地 preview，不改 `ChartsView`/`AssetLibraryPanel` 的业务分类逻辑，地图项仍通过既有添加 action 和 MIME 被拖入画布。
- [x] **Step 5: 跑目录 UI 测试确认 GREEN** — 断言五组筛选控件/count、地图本地预览、map card 的 click/drag type key、搜索匹配；HTML-like 名称保持字面文本。运行 `pnpm exec vitest run tests/component-catalog-ui.spec.ts tests/workbench-layout.spec.ts`，预期通过。
- [ ] **Step 6: 类型检查与提交（类型检查完成；提交按用户要求暂缓）** — `pnpm typecheck`；核对暂存 diff，仅提交任务 hunks，提交 `feat: categorize map charts in component catalog`；不可分离时保留工作区状态并记录。

## Task 4: 离线 GeoJSON 与导出 Runtime 覆盖

**Files:**
- Modify: `src/core/export/assets.ts`, `src/core/export/runtime.ts`, `tests/export-snapshot.spec.ts`, `tests/export-e2e.spec.ts`
- Reuse: `src/core/export/model.ts`, `src/core/export/snapshot.ts`, `src/core/export/artifact.ts`

**Interfaces:**
- `attachGeo(payload)` 对 `map | geoScatter | geoHeatmap | geoFlow` 任一种可见 chart item 注入既有 `geo.china`；无地图时保持不带 geo。
- 离线 runtime 一次注册 payload 内的中国地图；`chartOption(item, screen)` 对带 DatasetBinding 的地图项从包内 dataset rows 与 `fields.geo` 构建对应 series，并在蓝图变量过滤变化后刷新。此为受限字段映射（不是用户代码），经纬度范围校验与无效行规则须和 Task 1 helper 一致；不得增加动态模块查找或外网资源。

- [x] **Step 1: 写导出 RED 测试** — `export-snapshot.spec.ts` 分别构造四种地图类型，断言 `geo.china` 存在且匹配本地地图；纯 line/chart payload 不含 geo。
- [x] **Step 2: 跑 snapshot 测试确认 RED** — 首轮组合测试的 runtime E2E RED 已确认；发现旧 `map` 会掩盖同一 payload 内其它地图类型的快照遗漏后，将快照用例加强为逐类型独立构造，再随 GREEN 批次验证通过。
- [x] **Step 3: 更新 map 类型识别** — 修改 `attachGeo` 对显式 map chart type 白名单判定，不用用户 payload 中的任意 `geo` 来源；既有 `map` 类型继续命中。
- [x] **Step 4: 写离线 Runtime E2E RED 测试** — `export-e2e.spec.ts` 以包内静态 dataset、`fields.geo` 和 blueprint variable 创建绑定的散点/飞线；VM stub 断言初始化 option 含当前筛选结果，并模拟变量变化后 series 更新；另断言缺映射和坏坐标不生成原点或无效行。
- [x] **Step 5: 运行 E2E 测试确认 RED** — `pnpm exec vitest run tests/export-e2e.spec.ts`；预期地图绑定/变量变化行为失败。
- [x] **Step 6: 实现离线 Runtime 行映射与刷新** — `RUNTIME_CODE.chartOption` 按 `fields.geo` 将包内行映射为 geo scatter `[lng,lat]`、heatmap `[lng,lat,value]`、flow `coords:[[fromLng,fromLat],[toLng,toLat]]`，缺映射返回空 series，越界/非有限坐标被跳过；变量过滤变化后复用同一分支刷新 series。
- [x] **Step 7: 运行导出测试** — `pnpm exec vitest run tests/export-snapshot.spec.ts tests/export-e2e.spec.ts tests/export-artifact.spec.ts`；预期本地 GeoJSON 注入、变量更新、HTML/ZIP 无外网依赖全部通过。
- [ ] **Step 8: 核验安全约束与提交（安全核验完成；按用户要求暂不暂存/提交）** — 检查 runtime 对应 diff 不引入 `eval`、`new Function`、`innerHTML` 或网络请求；核对只暂存本任务 hunks，提交 `feat: bundle offline geo data for map charts`；若不能隔离旧 hunks，则跳过提交并记录。

## Task 5: 全量验收与计划关闭

**Files:**
- Verify: 上述所有定向测试、类型检查和构建
- Update: 本计划中任务状态与最终验证记录

- [x] **Step 1: 跑类型检查** — `pnpm typecheck` 通过。
- [x] **Step 2: 跑完整 Vitest** — `pnpm exec vitest run` 全部测试通过；保留并辨识项目既有、测试预期的 stderr 诊断，不把它们误判成失败。
- [x] **Step 3: 跑生产构建** — `pnpm build` 成功。
- [x] **Step 4: 做差异和导出安全复查** — `git diff --check` 通过；地图表项完整包含在 ChartType、schema、catalog、图表转换、地图资源注入各路径；工作树里原有无关改动未丢失或混入任务提交。
- [x] **Step 5: 更新本计划验收记录** — 仅记录真实命令/计数/提交，不改写规格范围；如果所有检查通过，用计划总结当前分支交付，是否继续后续 GeoJSON/轨迹能力另立规格。
