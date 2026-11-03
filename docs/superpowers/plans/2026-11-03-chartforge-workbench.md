# ChartForge 一体化大屏搭建工作台 · 彻底重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底重写 ChartForge 为 Canva/Retool 式一体化大屏搭建工作台：图表资产保存复用（成品独立副本）→ 1920×1080 画布组装大屏 → 演示模式投放。

**Architecture:** core 层（model/storage/chart/geometry/history/live）纯 TS 无 UI 依赖、全量单测；Pinia stores 做命令流装配（一切编辑皆命令 → 快照 history → 防抖自动保存）；workbench/views 只做装配与交互。浏览器 localStorage 为唯一持久化，JSON 导入导出三档。

**Tech Stack:** Vue 3.5 + TypeScript 5.9 + Vite 8 + Pinia 3 + Element Plus 2 + ECharts 6 + Vitest 3（沿用现有栈，不换）

**Spec:** `docs/superpowers/specs/2026-11-02-chartforge-workbench-design.md`

## Global Constraints

- 界面语言中文；产品名 ChartForge；路由 `/`、`/workbench/:id`、`/play/:id`（hash 模式）
- 画布 1920×1080；缩放 25%–400%；方向键步进 1px / Shift+方向键 10px；吸附阈值 6px（画布坐标）；Shift 旋转吸附 15°
- localStorage 键 `chartforge.workspace.v1`；自动保存防抖 500ms；history 快照上限 100；图表 option 刷新防抖 100ms
- 缩略图 256px JPEG quality 0.7；图片导入压缩长边 ≤2048、JPEG、≤2MB
- `LiveSource.intervalSec ≥ 5`；失败保留最后成功数据并标记 stale
- 图表六类型 line/bar/pie/map/scatter/radar；默认调色板 `['#5470C6','#91CC75','#FAC858','#EE6666','#73C0DE','#3BA272','#FC8452','#9A60B4','#EA7CCC']`；地图资源 `src/assets/geo/china.json`（注册名 `china`）
- `src/core/` 不得 import Vue / Element Plus / Pinia
- 质量门：`pnpm typecheck → pnpm test → pnpm build` 全绿；每任务提交遵循 conventional commits + 中文描述（如 `feat: 画布拖入落位`）
- 破坏性操作（删除大屏/资产、导入替换）必须确认对话框；快捷键清单见 spec §7
- 不删除未跟踪用户数据 `src/assets/screens/`；`server/` 中间件随重写移除并在 vite.config 中解除引用

## Review Focus

1. localStorage 配额满时保存失败：必须抛 `StorageQuotaError` 且不损坏内存工作区、可重试（Task 2 测试钉住）
2. 导入损坏 JSON / 未来版本：必须抛 `ImportError` 且现有工作区完全不动（Task 2 测试钉住）
3. history 快照零共享引用：undo 后继续编辑不得污染 redo 栈（Task 5 测试钉住）
4. 实时数据请求失败降级：保留最后成功数据 + `stale` 标记，不白屏不清空（Task 6 测试钉住）
5. 旋转元素的命中测试与等比缩放几何：`rotate=30°` 下点选内外判定、Shift 等比缩放不漂移（Task 4 测试钉住）

---

### Task 1: 工程重置与 core/model

**Files:**
- Modify: `package.json`（移除无用依赖如有；scripts 不变）、`vite.config.ts`（移除 server 中间件引用）
- Delete: `src/` 下旧实现文件、`server/`、`tests/` 下旧 spec（保留 `src/assets/geo/`、`src/assets/screens/`、`public/`、`docs/`）
- Create: `src/core/model/types.ts`、`src/core/model/schema.ts`、`src/core/model/migrate.ts`
- Test: `tests/core-model.spec.ts`、`tests/core-migrate.spec.ts`

**Interfaces:**
- Produces: `types.ts` 全部类型按 spec §5 原样定义（`Workspace/Screen/ScreenItem/BaseItem/Frame/Background/ChartAsset/ChartSpec/ChartData/LiveSource/TextSpec/ImageSpec/ShapeSpec`，`ChartType = 'line'|'bar'|'pie'|'map'|'scatter'|'radar'`）；`schema.ts`: `createWorkspace(): Workspace`、`createScreen(name: string): Screen`、`createItem(kind: ScreenItem['kind'], frame: Partial<Frame> = {}): ScreenItem`、`createChartSpec(type: ChartType): ChartSpec`、`createChartAsset(name: string, spec: ChartSpec): ChartAsset`、`normalizeWorkspace(raw: unknown): Workspace`（非法字段剔除/补齐，不抛错）；`migrate.ts`: `migrate(raw: unknown): Workspace`（无法识别抛 `ImportError`，`ImportError` 于 `src/core/model/errors.ts` 定义：`class ImportError extends Error`、`class StorageQuotaError extends Error`）

- [ ] **Step 1: 写失败测试** `tests/core-model.spec.ts`：`createWorkspace` 返回 `version:1` 且 `assets/screens` 为空、`settings.autosave===true`；`createItem('chart')` 得到 `frame {x:100,y:100,w:400,h:300,rotate:0}` 且 `spec.type==='line'`；`createScreen('测试')` 的 `canvas` 为 `{width:1920,height:1080}`；`normalizeWorkspace({version:1,screens:[{id:'a'}]})` 补齐缺失字段并剔除未知 `kind` 的 item
- [ ] **Step 2: 运行 `pnpm vitest run tests/core-model.spec.ts` 确认 FAIL**（模块不存在）
- [ ] **Step 3: 实现上述签名**（工厂函数全量字段默认值；`normalizeWorkspace` 宽进严出，逐项用 `isScreenItem` 收敛）
- [ ] **Step 4: 写 `tests/core-migrate.spec.ts` 并运行两个文件确认 PASS**：`migrate({version:1,...})` 原样规范化；`migrate({})` 抛 `ImportError`；`migrate({version:99})` 抛 `ImportError`；`migrate` 对缺 `version` 的旧格式（上一轮 `screens` 数组形态）可识别并升级——若不识别必须抛 `ImportError` 而不是部分写入
- [ ] **Step 5: 运行 `pnpm typecheck` 确认 PASS，提交** `chore: 重置工程骨架，建立 core/model 与错误类型`

### Task 2: core/storage（工作区持久化与导入导出）

**Files:**
- Create: `src/core/storage/workspaceRepo.ts`、`src/core/storage/thumbnail.ts`
- Test: `tests/core-storage.spec.ts`、`tests/core-thumbnail.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `types/migrate/errors`
- Produces: `workspaceRepo.ts`: `loadWorkspace(): Workspace`（无数据返回 `createWorkspace()`；损坏数据抛 `ImportError`）、`saveWorkspace(ws: Workspace): void`（配额抛 `StorageQuotaError`）、`exportJson(target: Workspace | Screen | ChartAsset): string`、`importJson(text: string, mode: 'merge' | 'replace'): Workspace`（解析/迁移失败抛 `ImportError` 且不动当前已存数据；merge 时 id 冲突生成新 id）；`thumbnail.ts`: `makeThumbnail(source: HTMLImageElement | HTMLCanvasElement): string`（256px JPEG dataURL，quality 0.7）

- [ ] **Step 1: 写失败测试** `tests/core-storage.spec.ts`：save→load 往返相等；`saveWorkspace` 时 mock `localStorage.setItem` 抛 `QuotaExceededError` → 得 `StorageQuotaError` 且随后 `loadWorkspace` 仍返回上一次成功保存的数据；`importJson('not json', 'replace')` 抛 `ImportError` 且已存数据不动；`importJson(exportJson(screen), 'merge')` 生成新 `screen.id`；`importJson(exportJson(workspace), 'replace')` 往返相等
- [ ] **Step 2: 运行确认 FAIL**
- [ ] **Step 3: 实现**（localStorage 直存整工作区 JSON；`migrate` 在 load/import 内部调用；id 冲突用 `crypto.randomUUID` 重新发号）
- [ ] **Step 4: 写 `tests/core-thumbnail.spec.ts`**（jsdom 下 mock canvas：输出以 `data:image/jpeg;base64,` 开头、长度>0）**并运行确认 PASS**
- [ ] **Step 5: `pnpm typecheck` 后提交** `feat: 工作区本地持久化与 JSON 导入导出`

### Task 3: core/chart（数据、TSV、option 构建、注册表）

**Files:**
- Create: `src/core/chart/registry.ts`、`src/core/chart/chartData.ts`、`src/core/chart/tsv.ts`、`src/core/chart/optionBuilder.ts`、`src/core/chart/registerCharts.ts`
- Test: `tests/core-chart.spec.ts`、`tests/core-option.spec.ts`

**Interfaces:**
- Consumes: `ChartSpec/ChartData/ChartType`
- Produces: `registry.ts`: `ConfigGroup = { key: string; label: string; fields: { path: string; label: string; control: 'text'|'number'|'color'|'select'|'switch'; options?: string[]; min?: number; max?: number }[] }`、`ColumnDef = { key: string; label: string; type: 'string'|'number' }`、`chartRegistry: Record<ChartType, { type: ChartType; label: string; dataKind: ChartData['kind']; defaultSpec(): ChartSpec; configGroups: ConfigGroup[]; columns: ColumnDef[] }>`（configGroups 的 `path` 指向 `spec.option` 内 ECharts 路径如 `title.textStyle.fontSize`）；`DEFAULT_PALETTE`（Global Constraints 定值）；`chartData.ts`: `emptyChartData(type: ChartType): ChartData`、`validateChartData(data: ChartData): boolean`（series 长度与 categories 对齐、radar values 与 indicators 对齐等）、`matrixToChartData(matrix: string[][], type: ChartType): ChartData`（TSV 粘贴转换，列规则钉死：category——首列=类目、其余列=系列且首行=系列名；nameValue——两列 [名称,数值]；xy——前两列 [x,y]、可选三四列 [名称,分组]；radar——首行=指标名，后续行首格=系列名、其余=各指标数值）；`tsv.ts`: `parseTsv(text: string): string[][]`（容错 `\r\n`、去空行）；`optionBuilder.ts`: `buildOption(spec: ChartSpec, theme: 'light' | 'dark'): EChartsOption`（series 用 `DEFAULT_PALETTE`；`themeColors(theme)` 返回 `{text,axisLine,splitLine}`：light `#333333/#666666/#E5E5E5`，dark `#E5EAF2/#8A93A6/#3A4153`；map 类型注入 `map:'china'` 与 visualMap）；`registerCharts.ts`: `registerCharts(): void`（echarts/core 按需注册六图 + Grid/Tooltip/Legend/Title/VisualMap/CanvasRenderer）

- [ ] **Step 1: 写失败测试** `tests/core-chart.spec.ts`：`emptyChartData('line')` 为 `kind:'category'` 且 5 类目 2 系列示例数据；`parseTsv("a\tb\n1\t2\r\n")` 得 `[["a","b"],["1","2"]]`；`validateChartData` 对系列长度不符返回 false。`tests/core-option.spec.ts`：`buildOption(createChartSpec('bar'),'light')` 的 `series[0].type==='bar'` 且颜色取 `DEFAULT_PALETTE[0]`；pie 的 `series[0].type==='pie'`；map 的 `series[0].map==='china'`；dark 主题 `option.title.textStyle.color==='#E5EAF2'`。另测 `matrixToChartData([["类目","系列A"],["一","1"],["二","2"]],'bar')` 得 `{kind:'category',categories:['一','二'],series:[{name:'系列A',values:[1,2]}]}`；`chartRegistry.pie.dataKind==='nameValue'` 且 `chartRegistry.line.configGroups.length>0`、`columns.length>0`
- [ ] **Step 2: 运行确认 FAIL**
- [ ] **Step 3: 实现**（optionBuilder 纯函数：spec.option 深合并到构建出的 option 顶层）
- [ ] **Step 4: 运行确认 PASS**
- [ ] **Step 5: 提交** `feat: 六类图表数据模型、TSV 解析与 option 构建`

### Task 4: core/geometry（命中、变换、吸附）

**Files:**
- Create: `src/core/geometry/transform.ts`、`src/core/geometry/hit.ts`、`src/core/geometry/snap.ts`
- Test: `tests/core-geometry.spec.ts`

**Interfaces:**
- Consumes: `Frame/ScreenItem`
- Produces: `hit.ts`: `hitTest(items: ScreenItem[], point: {x:number;y:number}): string | null`（逆旋转后矩形判定，取最上层）、`boxSelect(items: ScreenItem[], rect: {x:number;y:number;w:number;h:number}): string[]`（含旋转包围盒相交）；`transform.ts`: `resizeFrame(frame: Frame, handle: 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w', delta: {x:number;y:number}, opts: {aspect: boolean}): Frame`（等比时锁原始宽高比；w/h 下限 8px）、`rotateFrame(frame: Frame, pivot: {x:number;y:number}, angleDeg: number): Frame`；`snap.ts`: `snapDelta(moving: Frame[], targets: Frame[], canvas: {w:number;h:number}, threshold = 6): { delta: {x:number;y:number}; guides: Guide[] }`（`Guide = {orient:'v'|'h'; pos:number}`；候选线：画布边/中线 + 目标元素边/中线；返回最小修正量与命中的参考线）

- [ ] **Step 1: 写失败测试**：`hitTest` 对 `rotate:30` 的 item，中心点命中、旋转后角外一点不命中；`resizeFrame(..., {aspect:true})` 后 `w/h` 比值不变（断言 `Math.abs(w/h - 16/9) < 1e-9`，以 `w:160,h:90` 为输入）；`snapDelta` 当移动元素左边距目标右边 4px 时返回修正 `delta.x` 且 `guides` 含一条 v 线
- [ ] **Step 2: 运行确认 FAIL**
- [ ] **Step 3: 实现**（旋转矩形判定：把点变换到局部系；吸附先收集全部候选线再取最小 |修正|）
- [ ] **Step 4: 运行确认 PASS**
- [ ] **Step 5: 提交** `feat: 画布命中测试、变换与吸附对齐几何`

### Task 5: core/history（快照撤销重做）

**Files:**
- Create: `src/core/history/history.ts`
- Test: `tests/core-history.spec.ts`

**Interfaces:**
- Produces: `class History<T>`：`constructor(clone: (s:T)=>T, limit = 100)`、`push(state: T): void`、`undo(current: T): T | null`、`redo(current: T): T | null`、`canUndo/canRedo: boolean`、`clear(): void`。`push` 时丢弃 redo 分支；超 limit 丢最旧；`undo/redo` 返回深拷贝且内部存档互不共享引用

- [ ] **Step 1: 写失败测试**：push A,B → undo 返回 A、redo 返回 B；undo 后 push C，redo 返回 null（分支被丢）；连续 push 120 个后 `canUndo` 的总深度恰为 100；undo 返回的对象修改后再次 undo 得到的对象不受影响（零共享引用，钉 Review Focus #3）
- [ ] **Step 2: 运行确认 FAIL**
- [ ] **Step 3: 实现**（结构化克隆 `structuredClone` 作为默认 clone）
- [ ] **Step 4: 运行确认 PASS**
- [ ] **Step 5: 提交** `feat: 快照式撤销重做历史`

### Task 6: core/live（dataPath 与轮询执行器）

**Files:**
- Create: `src/core/live/dataPath.ts`、`src/core/live/liveExecutor.ts`
- Test: `tests/core-live.spec.ts`

**Interfaces:**
- Consumes: `LiveSource/ChartData`
- Produces: `dataPath.ts`: `getByPath(data: unknown, path?: string): unknown`（`a.b.0.c` 点路径，缺失返回 undefined）；`liveExecutor.ts`: `class LiveExecutor`：`register(id: string, source: LiveSource, onData: (d: unknown) => void, onStale: (stale: boolean) => void): void`、`unregister(id: string): void`、`dispose(): void`。立即拉取一次并按 `intervalSec`（`Math.max(5, intervalSec)`）轮询；失败调 `onStale(true)` 且不调 `onData`（保留旧数据，钉 Review Focus #4）；成功调 `onData(getByPath(json, source.dataPath))` 与 `onStale(false)`

- [ ] **Step 1: 写失败测试**（`vi.useFakeTimers` + `vi.stubGlobal('fetch', ...)`）：成功路径 onData 收到 `dataPath` 投影结果；fetch reject → onStale(true) 且 onData 未被再次调用；`intervalSec:1` 实际按 5000ms 调度；`unregister` 后不再触发
- [ ] **Step 2: 运行确认 FAIL**
- [ ] **Step 3: 实现**（每 id 一个 `setInterval` + in-flight 防重入）
- [ ] **Step 4: 运行确认 PASS**
- [ ] **Step 5: 提交** `feat: 元素级实时数据取值与轮询降级`

### Task 7: stores 装配（workspaceStore / documentStore / uiStore）

**Files:**
- Create: `src/stores/workspaceStore.ts`、`src/stores/documentStore.ts`、`src/stores/uiStore.ts`
- Test: `tests/stores-document.spec.ts`、`tests/stores-workspace.spec.ts`

**Interfaces:**
- Consumes: core 全部模块
- Produces:
  - `workspaceStore`: state `{ workspace: Workspace; saveStatus: 'saved'|'saving'|'error' }`；actions `init()`、`upsertScreen(screen)`、`removeScreen(id)`、`upsertAsset(asset)`、`removeAsset(id)`、`importWorkspace(text, mode)`、`exportWorkspace()/exportScreen(id)/exportAsset(id)`、`flushSave()`；命令提交后 `scheduleSave()`（防抖 500ms，模块单例），保存失败置 `error`
  - `documentStore`: state `{ screen: Screen; selection: string[]; focusEditId: string|null }`；actions 全部为命令：`addItem(item)`、`removeSelected()`、`moveBy(delta)`、`resize(handle, delta, aspect)`、`rotateBy(deg)`、`setItemProps(id, props)`、`reorder(id, toIndex)`、`align(mode)`（`'left'|'centerX'|'right'|'top'|'centerY'|'bottom'`）、`distribute(axis:'x'|'y')`、`group()/ungroup()`、`copy()/paste()/duplicate()`、`setChartData(id, data)`、`setCanvas(patch)`、`undo()/redo()`；每个命令先深拷贝快照入 `History<Screen>`（上限 100）再改 `screen`，随后 `workspaceStore.upsertScreen` + `scheduleSave`
  - `uiStore`: `{ zoom, pan:{x,y}, snapEnabled, leftTab:'elements'|'assets'|'layers', theme:'light'|'dark', helpVisible, previewing: boolean }` + `zoomToFit(canvasEl)`、`setZoom(z)`（钳制 0.25–4）

- [ ] **Step 1: 写失败测试** `tests/stores-document.spec.ts`：`addItem` 后 `undo()` 恢复空 items、`redo()` 恢复；`moveBy` 后 frame 变化且 selection 不变；`align('left')` 三个选中元素 x 全部等于最小 x；`copy/paste` 生成新 id 且偏移 10px；`group()` 后两个 item 同 `groupId`，`ungroup()` 后清除。`tests/stores-workspace.spec.ts`：`upsertScreen` 触发 `scheduleSave`（`vi.useFakeTimers` 推进 500ms）后 localStorage 出现该 screen；保存失败置 `saveStatus:'error'`
- [ ] **Step 2: 运行确认 FAIL**
- [ ] **Step 3: 实现**
- [ ] **Step 4: 运行确认 PASS**
- [ ] **Step 5: 提交** `feat: 命令式编辑流、自动保存与三仓装配`

### Task 8: 应用外壳（路由、主题、共享件、EChartsView）

**Files:**
- Create: `src/router/index.ts`（三路由，`/`→`LibraryView`）、`src/shared/theme.ts`（亮/暗 CSS 变量与 Element Plus 主题切换）、`src/shared/ui/`（`ConfirmDialog.vue`、`Icon.vue`）、`src/workbench/EChartsView.vue`
- Modify: `src/App.vue`、`src/main.ts`
- Test: 无单测（UI 壳）；验证以 typecheck/build 为准

**Interfaces:**
- Produces: `EChartsView.vue` props `{ option: EChartsOption; theme?: 'light'|'dark' }`，内部 init/dispose/resize/setOption（防抖 100ms），`onError` 渲染错误占位；`ConfirmDialog.vue` props `{ title: string; message: string }` emit `confirm/cancel`

- [ ] **Step 1: 实现**（App.vue 挂 router-view + 全局主题类；main.ts 注册 pinia/router/`registerCharts()`）
- [ ] **Step 2: `pnpm typecheck && pnpm build` 确认 PASS**（Windows PowerShell 5.1 下 `&&` 可用性不足则分两条命令执行）
- [ ] **Step 3: 浏览器走查**：`pnpm dev` 三路由可打开、主题类切换生效
- [ ] **Step 4: 提交** `feat: 应用外壳、路由、主题与图表渲染封装`

### Task 9: CanvasStage 基座与 ItemView 渲染

**Files:**
- Create: `src/workbench/ItemView.vue`、`src/workbench/CanvasStage.vue`、`src/workbench/SelectionOverlay.vue`
- Test: 无单测（渲染层）；逻辑已在 core/stores 覆盖

**Interfaces:**
- Consumes: `documentStore/uiStore`、`hitTest/boxSelect`、`EChartsView`
- Produces: `ItemView.vue` props `{ item: ScreenItem }`——text/image/shape 纯 DOM + CSS transform，chart 用 `EChartsView`；`CanvasStage.vue` 提供视口（`zoom/pan`）、拖入落位（HTML5 drag 事件落点换算画布坐标 `canvasPoint(ev)`）、框选矩形渲染、空格/中键平移、滚轮缩放（`zoom` 钳制 0.25–4）

- [ ] **Step 1: 实现 ItemView + CanvasStage 渲染循环**（`items` 依数组序叠层，`hidden` 不渲染，`locked` 不参与命中）
- [ ] **Step 2: 实现拖入落位与选择**（左面板拖入 `createItem` → `addItem`；单击选中、Shift 加选、框选、Esc 取消——全部走 `documentStore` 命令）
- [ ] **Step 3: `pnpm typecheck && pnpm build` + 浏览器走查**：拖入 6 类图表与文本/图片/形，缩放平移流畅，选择行为正确
- [ ] **Step 4: 提交** `feat: 画布舞台渲染、拖入落位与选择`

### Task 10: 变换手柄与吸附参考线

**Files:**
- Create: `src/workbench/TransformHandles.vue`
- Modify: `src/workbench/CanvasStage.vue`、`src/workbench/SelectionOverlay.vue`
- Test: 无单测（几何已在 core 覆盖）

**Interfaces:**
- Consumes: `resizeFrame/rotateFrame/snapDelta`
- Produces: 手柄交互：拖动手柄 → `resize(handle, delta, aspect=Shift)`；旋转手柄拖动 → `rotateBy`（Shift 吸附 15°）；拖动元素 → `moveBy` + `snapDelta` 实时参考线（吸附开关控件）；方向键 1px / Shift 10px；Ctrl+C/V、Ctrl+D、Delete、Ctrl+G（绑定在 CanvasStage 键盘监听，`?` 打开帮助浮层的开关先留 `uiStore.helpVisible`）

- [ ] **Step 1: 实现 TransformHandles 与缩放/旋转**：拖动手柄 → `resize(handle, delta, aspect=Shift)`；旋转手柄拖动 → `rotateBy`（Shift 吸附 15°）
- [ ] **Step 2: 实现吸附参考线**：拖动元素 → `moveBy` + `snapDelta` 实时参考线渲染，画布上吸附开关写 `uiStore.snapEnabled`
- [ ] **Step 3: 实现画布快捷键**：方向键 1px / Shift 10px、Ctrl+C/V、Ctrl+D、Delete、Ctrl+G 绑定 CanvasStage 键盘监听；`?` 切 `uiStore.helpVisible`
- [ ] **Step 4: `pnpm typecheck && pnpm build` + 浏览器走查**：8 向缩放（Shift 等比）、旋转（Shift 15°）、吸附参考线出现/消失、键盘微调与复制删除
- [ ] **Step 5: 提交** `feat: 缩放旋转手柄、吸附参考线与画布快捷键`

### Task 11: 图层面板、对齐分布与组合

**Files:**
- Create: `src/workbench/LayersPanel.vue`
- Modify: `src/workbench/CanvasStage.vue`（对齐分布工具条）、`src/stores/documentStore.ts`（如命令缺口按 Task 7 接口补齐）
- Test: 无单测（命令已在 Task 7 覆盖）

**Interfaces:**
- Consumes: `reorder/align/distribute/group/ungroup/setItemProps`
- Produces: 图层面板（倒序显示、拖拽排序、重命名、锁定、隐藏、点击选中/多选）；画布顶部浮动对齐分布条（多选时出现）；Ctrl+G/Ctrl+Shift+G

- [ ] **Step 1: 实现 LayersPanel 与工具条**
- [ ] **Step 2: typecheck/build + 走查**：排序即时反映叠层、锁定后不可选中、隐藏不渲染、对齐分布正确、组合后整体拖动缩放
- [ ] **Step 3: 提交** `feat: 图层管理、对齐分布与组合`

### Task 12: 检查器、图表聚焦编辑与数据表格

**Files:**
- Create: `src/workbench/InspectorPanel.vue`、`src/workbench/panels/FramePanel.vue`、`src/workbench/panels/ChartConfigPanel.vue`、`src/workbench/panels/DataTablePanel.vue`、`src/workbench/panels/StylePanel.vue`、`src/workbench/panels/ScreenPanel.vue`、`src/workbench/panels/LiveSourcePanel.vue`
- Test: 无单测（数据命令已在 Task 7；TSV/校验已在 Task 3）

**Interfaces:**
- Consumes: `chartRegistry`（schema 分组元数据驱动表单）、`setChartData/setItemProps/setCanvas/parseTsv`、`ConfirmDialog`
- Produces: 检查器按 `uiStore/documentStore` 选中态切换：单选 chart → FramePanel + ChartConfigPanel + DataTablePanel + LiveSourcePanel + StylePanel(opacity/name)；text/image/shape → 对应属性；多选 → 对齐/组合入口；无选中 → ScreenPanel（名称、背景三态、主题）。双击图表 → `focusEditId` 聚焦编辑（配置+数据全高面板，Esc 返回）。DataTablePanel：按 `chartRegistry[type].dataKind` 渲染列结构，增删行列，**粘贴 TSV**（`parseTsv` → 转 `ChartData`），“保存为资产”按钮 → `upsertAsset(createChartAsset(name, structuredClone(spec)))`

- [ ] **Step 1: 实现基础属性面板**：FramePanel（x/y/w/h/rotate 数字输入，写 `setItemProps`）、StylePanel（name/opacity）、ScreenPanel（名称、背景三态、主题写 `setCanvas`）
- [ ] **Step 2: 实现 ChartConfigPanel**：由 `chartRegistry[type].configGroups` 驱动表单，控件按 `control` 渲染，改动写 `setItemProps(id,{option})`（沿 `path` 合并）
- [ ] **Step 3: 实现 DataTablePanel**：按 `chartRegistry[type].columns` 渲染表格，增删行列写 `setChartData`；粘贴 TSV 走 `parseTsv` + `matrixToChartData`；“保存为资产”按钮 → `upsertAsset(createChartAsset(name, structuredClone(spec)))`
- [ ] **Step 4: 实现 LiveSourcePanel 与聚焦编辑**：LiveSourcePanel（url/intervalSec≥5/dataPath 写 `setItemProps(id,{source})`）；双击图表置 `focusEditId` 进入全高编辑态（配置+数据），Esc 清除返回
- [ ] **Step 5: `pnpm typecheck && pnpm build` + 浏览器走查**：六类型配置改动即时反映画布；Excel 复制 TSV 直贴生效；保存为资产后资产面板出现新条目；LiveSource 面板保存后图表按间隔刷新
- [ ] **Step 6: 提交** `feat: 上下文检查器、图表聚焦编辑与数据表格`

### Task 13: 资产面板与作品列表页

**Files:**
- Create: `src/workbench/AssetsPanel.vue`、`src/workbench/ElementsPanel.vue`、`src/workbench/LeftPanel.vue`、`src/views/LibraryView.vue`
- Test: 无单测（storage/store 已覆盖）

**Interfaces:**
- Consumes: `upsertAsset/removeAsset/exportAsset/makeThumbnail/createChartAsset`、`ConfirmDialog`
- Produces: ElementsPanel（四类元素拖入源）；AssetsPanel（缩略图网格、搜索、拖出到画布 = `structuredClone` 为独立副本、右键“插入/重命名/删除(确认)/导出”）；LibraryView（“大屏/图表资产”两标签：卡片网格、新建、复制、删除(确认)、导出 JSON、导入 JSON（merge/replace 对话框）、空态引导）；大屏卡片缩略图在离开工作台/手动保存时由 `makeThumbnail` 刷新

- [ ] **Step 1: 实现左面板三件套**：ElementsPanel（四类元素拖入源）、LeftPanel（三标签容器）、AssetsPanel（缩略图网格、搜索、拖出到画布 = `structuredClone` 为独立副本、右键“插入/重命名/删除(确认)/导出”）
- [ ] **Step 2: 实现 LibraryView**：“大屏/图表资产”两标签：卡片网格、新建、复制、删除(确认)、导出 JSON、导入 JSON（merge/replace 对话框）、空态引导；大屏卡片缩略图在离开工作台/手动保存时由 `makeThumbnail` 刷新
- [ ] **Step 3: typecheck/build + 走查**：拖资产落画布得副本且互不影响；列表页全功能可用；导入损坏文件出明确错误文案
- [ ] **Step 4: 提交** `feat: 资产库面板、元素面板与作品列表页`

### Task 14: 顶栏、演示模式、错误处理收口与验收

**Files:**
- Create: `src/workbench/TopBar.vue`、`src/workbench/ShortcutsHelp.vue`、`src/views/WorkbenchView.vue`、`src/views/PlayView.vue`
- Modify: 全局错误边界处（`App.vue` 错误占位、`storage` 重试入口）
- Test: 无新增单测；验收走查

**Interfaces:**
- Consumes: 全部
- Produces: TopBar（大屏名改名、`saveStatus` 指示、撤销/重做、预览=隐藏辅助线切 `previewing` 态、演示=跳 `/play/:id`、导出 JSON/2 倍 PNG——PNG 用离屏 canvas 绘制 1920×1080×2）；PlayView（只读渲染全部 items，等比缩放铺满，`LiveExecutor` 保持工作，F11 提示一次）；ShortcutsHelp（`?` 浮层，spec §7 键位全集）；错误处理按 spec §8 逐条落实（配额提示/导入文案/stale 角标/图表错误占位/图片压缩/确认框）

- [ ] **Step 1: 实现 TopBar/WorkbenchView/PlayView/ShortcutsHelp**
- [ ] **Step 2: 实现错误处理与导出 PNG/JSON**
- [ ] **Step 3: 质量门**：`pnpm typecheck` → `pnpm test` → `pnpm build` 全绿
- [ ] **Step 4: 按 spec §7 清单 19 项逐项人工走查**（记录勾选结果）
- [ ] **Step 5: 提交** `feat: 顶栏、演示模式与错误处理收口`
