# 可视化大屏基座 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ChartForge（Vue3 单页 ECharts 编辑器）内演进出图表资产库、拖拽大屏设计器、大屏渲染/导出能力，图表与大屏以 JSON 文件存入仓库。

**Architecture:** 单体演进：引入 vue-router 划分 6 条路由；渲染核心独立于 `src/core/`（纯 JSON 驱动，供设计器画布、资产库卡片、运行态共用）；保存走 Vite dev 中间件白名单写盘；设计器与运行态共用 ScreenItemView 组件。

**Tech Stack:** Vue 3.5 + TS strict + Vite 8 + Pinia 3 + vue-router@4（新增）+ Element Plus + ECharts 6 + Vitest（node 环境）。

**Spec:** `docs/superpowers/specs/2026-11-02-dashboard-platform-design.md`（先读 spec 再读本计划；本计划按 spec 落地，偏差见下）

## Global Constraints

- 包管理器 pnpm；脚本名不变：`pnpm typecheck`（vue-tsc -p tsconfig.app.json）、`pnpm test`（vitest run）、`pnpm dev`（端口 5174）。
- 新增运行时依赖仅 `vue-router@4`（`pnpm add vue-router@4`）。
- TS strict + `erasableSyntaxOnly`（禁 enum/namespace，用字符串字面量联合）；`noUnusedLocals/noUnusedParameters` 全开。
- 现有代码风格：中文注释、`--cf-*` 设计令牌（src/style/tokens.css）、图标用 `@/components/ui/Icon.vue`、测试标题中文、tests 内用相对路径 `../src/...` 导入。
- 资产/大屏 JSON：2 空格缩进 + 末尾换行，UTF-8；文件名 = `<id>.chart.json` / `<id>.screen.json`，id 为 kebab-case。
- 保存 API 白名单：仅 `src/assets/library/` 与 `src/assets/screens/` 下的 `.json`。
- 画布基准 1920×1080（`SCREEN_W/SCREEN_H`），整体等比 scale，无栅格吸附。
- 第一期不做（spec §9）：边框装饰件、栅格吸附、多选/框选/编组、组件旋转、WebSocket、独立后端、权限、装饰动效。
- **对 spec 的两处落地偏差（已知并接受）：**
  1. 图表资产的 `option` 为完整 option（数据内嵌，即样例数据），无独立 `sampleData` 字段——现有 DataPanel/optionFactory 的数据本就存于 option 内，拆分无消费方。
  2. `dataSource.api` 增加 `optionPath` 字段（数据写回 option 的目标路径，默认 `series.0.data`）；`dataPath` 指 API 响应取值路径。

## Review Focus

1. **保存 API 路径穿越**：`path: "src/assets/library/../../package.json"` 等变体必须被拒绝（Task 5 测试钉死）。
2. **API 数据源失败/字段缺失**：接口报错或 `dataPath` 取不到值时，图表保留当前数据、大屏不得白屏或抛未捕获异常（Task 3 测试钉死 poller 吞错 + pickByPath 缺省 undefined）。
3. **缩放后指针坐标偏差**：画布被 scale 后，拖拽/缩放的鼠标位移必须除以 scale 换算回画布坐标，否则拖拽漂移（Task 12 的 `toCanvasPoint`/`applyResize` 测试钉死）。
4. **手改大屏 JSON 缺字段**：`items[].rect` 缺省、`chart` 缺失、`zIndex` 缺失时渲染不得崩溃（Task 2 的默认值工厂 + Task 9 ScreenItemView 容错测试钉死）。
5. **资产快照语义**：拖入大屏的图表是 option 深拷贝；保存资产后改资产、或删除资产文件，不得影响已创建的大屏 item（Task 11 的 store 测试钉死 deepClone）。

---

### Task 1: 路由与导航壳

**Files:**
- Modify: `package.json`（pnpm add vue-router@4）
- Create: `src/router/index.ts`
- Create: `src/components/ui/NavBar.vue`
- Create: `src/views/library/LibraryView.vue`、`src/views/screens/ScreensView.vue`、`src/views/designer/DesignerView.vue`、`src/views/screen-render/ScreenRenderView.vue`（均为占位：仅页面标题文本）
- Modify: `src/App.vue`、`src/main.ts`

**Interfaces:**
- Produces: `src/router/index.ts` 导出 `router: Router`；路由表：
  - `/` redirect `/library`；`/library`→LibraryView；`/editor`→EditorView（已存在）；`/screens`→ScreensView；`/designer/:id`→DesignerView；`/screen/:id`→ScreenRenderView。
  - 除 `/editor` 外均 `() => import(...)` 懒加载；`/designer/:id` 与 `/screen/:id` 的 `meta: { nav: false }`。
- Produces: `NavBar.vue` 无 props；router-link 三项：图表库 `/library`、图表制作 `/editor`、大屏列表 `/screens`。
- App.vue 模板改为：`<NavBar v-if="route.meta.nav !== false" /> <router-view />`。

- [ ] **Step 1: 安装依赖** — `pnpm add vue-router@4`
- [ ] **Step 2: 创建路由与占位视图**（按上述 Interfaces）
- [ ] **Step 3: main.ts 挂载** — `app.use(router)`（在 setupStore 之后）
- [ ] **Step 4: 验证** — Run: `pnpm typecheck && pnpm test`；Expected: 全部通过（现有用例不受影响）
- [ ] **Step 5: 手工验证** — `pnpm dev` 后依次访问 `/`、`/editor`、`/library`、`/screens`、`/designer/new`、`/screen/x`，导航高亮正确、编辑器功能如常
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: 引入 vue-router 与多页面导航壳"`

### Task 2: core 类型与几何基础

**Files:**
- Create: `src/core/types.ts`、`src/core/item.ts`、`src/core/scaler.ts`
- Test: `tests/core-item.spec.ts`、`tests/core-scaler.spec.ts`

**Interfaces:**
- Produces（`core/types.ts`）：
  ```ts
  export type WidgetType = "text" | "image" | "datetime" | "iframe";
  export type ItemType = "chart" | WidgetType;
  export interface Rect { x: number; y: number; w: number; h: number }
  export interface DataSourceApi { url: string; method: "GET" | "POST"; headers: Record<string, string>; interval: number; dataPath: string; optionPath: string }
  export interface DataSourceConfig { mode: "static" | "api"; api: DataSourceApi }
  export interface ChartPayload { sourceAssetId: string | null; option: EChartsOptionLike; dataSource: DataSourceConfig }
  export interface WidgetProps { text?: string; fontSize?: number; color?: string; format?: string; src?: string }
  export interface ScreenItem { id: string; type: ItemType; name: string; rect: Rect; zIndex: number; visible: boolean; locked: boolean; chart?: ChartPayload; props?: WidgetProps }
  export interface ScreenSchema { id: string; name: string; version: 1; canvas: { width: number; height: number; background: string }; items: ScreenItem[]; createdAt: string; updatedAt: string }
  export interface ChartAsset { id: string; name: string; category: string; tags: string[]; chartType: ChartType; option: EChartsOptionLike; createdAt: string; updatedAt: string }
  export const SCREEN_W = 1920; export const SCREEN_H = 1080;
  export const DEFAULT_SIZES: Record<ItemType, { w: number; h: number }> // chart 480×320, text 320×80, image 320×240, datetime 320×60, iframe 640×480
  ```
- Produces（`core/item.ts`）：
  ```ts
  export function createScreenItem(type: ItemType, rect?: Partial<Rect>): ScreenItem
  // id=createId("item")；name=默认中文名（chart→"图表"、text→"文本"...）；rect 合并 DEFAULT_SIZES 与 {x:40,y:40}；visible:true; locked:false; zIndex:1；
  // type==="chart" 时附 chart: { sourceAssetId: null, option: createDefaultOption("line"), dataSource: createDefaultDataSource() }
  // widget 时附 props 默认值：text{text:"双击编辑文本",fontSize:24,color:"#E6EAF2"}、datetime{format:"YYYY-MM-DD HH:mm:ss"}、image/iframe{src:""}
  export function createDefaultDataSource(): DataSourceConfig  // {mode:"static", api:{url:"",method:"GET",headers:{},interval:0,dataPath:"",optionPath:"series.0.data"}}
  export function createScreenSchema(id: string, name: string): ScreenSchema  // canvas {1920,1080,"#0a1a2e"}，version:1，items:[]，时间戳 ISO
  export function toChartInstance(item: ScreenItem): ChartInstance | null  // type!=="chart"||!item.chart→null；否则 {id:item.id,type:"line"...}
  // 注意：ChartInstance.type 需真实 ChartType；资产拖入后 item 增加 chart.chartType 字段（见 Task 11），
  // 因此 ChartPayload 追加必填字段 chartType: ChartType，toChartInstance 读取 item.chart.chartType ?? "line"
  ```
- Produces（`core/scaler.ts`）：
  ```ts
  export function computeScale(cw: number, ch: number, w = SCREEN_W, h = SCREEN_H): number  // Math.min(cw/w, ch/h)，入参 ≤0 时返回 1
  export function toCanvasPoint(px: number, py: number, scale: number, originX: number, originY: number): { x: number; y: number }  // (px-originX)/scale
  ```

- [ ] **Step 1: 写失败测试** `tests/core-item.spec.ts`：createScreenItem 默认值（chart 含 option 与 dataSource、text 默认尺寸 320×80）；`tests/core-scaler.spec.ts`：computeScale(960,540)=0.5、computeScale(0,540)=1；toCanvasPoint(100,100,0.5,0,0)={x:200,y:200}
- [ ] **Step 2: 运行确认失败** — Run: `pnpm test -- core-item core-scaler`；Expected: FAIL（模块不存在）
- [ ] **Step 3: 实现** `core/types.ts`、`core/item.ts`、`core/scaler.ts`
- [ ] **Step 4: 运行确认通过** — Run: `pnpm test -- core-item core-scaler`；Expected: PASS
- [ ] **Step 5: Commit** — `git add src/core tests/core-item.spec.ts tests/core-scaler.spec.ts && git commit -m "feat(core): 大屏类型、item 工厂与缩放计算"`

### Task 3: 数据源执行器

**Files:**
- Create: `src/core/data-source.ts`
- Test: `tests/core-data-source.spec.ts`

**Interfaces:**
- Consumes: `src/utils/object.ts` 的 `setByPath`
- Produces:
  ```ts
  export function pickByPath(obj: unknown, path: string): unknown  // "a.0.b" 逐段取值；任一段缺失返回 undefined
  export interface Poller { start(): void; stop(): void }
  export function createPoller(fetcher: () => Promise<unknown>, onOk: (data: unknown) => void, intervalSec: number): Poller
  // start(): 立即执行一次 fetcher，成功→onOk；intervalSec>0 时以 setInterval 周期执行；任何异常吞掉（不打断轮询、不调用 onOk）
  // stop(): 清理定时器；重复 start 前先自动 stop
  export function applyApiData(option: EChartsOptionLike, data: unknown, optionPath: string): EChartsOptionLike  // setByPath(option, optionPath || "series.0.data", data)
  ```

- [ ] **Step 1: 写失败测试**：pickByPath 命中/缺失/"a.0.b" 数组下标；createPoller 用 `vi.useFakeTimers`：start 后立即调用一次、intervalSec=2 时 advanceTimersByTime(4000) 再调 2 次、fetcher 抛错不影响后续轮询、stop 后不再调用；applyApiData 写入 series.0.data
- [ ] **Step 2: 运行确认失败** — Run: `pnpm test -- core-data-source`；Expected: FAIL
- [ ] **Step 3: 实现** `core/data-source.ts`
- [ ] **Step 4: 运行确认通过**；再跑 `pnpm typecheck`；Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(core): dataPath 取值与 API 轮询执行器"`

### Task 4: 基础组件（Widgets）与时间格式化

**Files:**
- Create: `src/core/format.ts`、`src/core/ScreenItemView.vue`
- Test: `tests/core-format.spec.ts`

**Interfaces:**
- Consumes: `core/types.ts` 的 `ScreenItem`；`components/chart/ChartRenderer.vue`
- Produces:
  ```ts
  // format.ts
  export function formatDateTime(date: Date, fmt: string): string
  // 支持 token：YYYY MM DD HH mm ss（不足补零）；fmt 缺省 "YYYY-MM-DD HH:mm:ss"
  // ScreenItemView.vue：props { item: ScreenItem }；无交互纯渲染：
  // type=chart → v-if="item.chart" 渲染 ChartRenderer :chart="toChartInstance(item)"；item.chart 缺失渲染空 div（容错）
  // text → div 内联 style fontSize/color，内容 props.text
  // image → img :src，object-fit: contain
  // datetime → div，onMounted 起每秒 setInterval 更新 now，onBeforeUnmount 清理；显示 formatDateTime(now, props.format)
  // iframe → iframe :src（sandbox 属性省略，开发者自用）
  // 根元素 width/height 100%，visible/locked 由父级处理，本组件不管
  ```

- [ ] **Step 1: 写失败测试** `tests/core-format.spec.ts`：formatDateTime(new Date(2026,0,2,3,4,5), "YYYY-MM-DD HH:mm:ss")==="2026-01-02 03:04:05"；缺省 fmt 同值；"YYYY年MM月DD日" 中文格式
- [ ] **Step 2: 运行确认失败** — Run: `pnpm test -- core-format`；Expected: FAIL
- [ ] **Step 3: 实现** `format.ts` 与 `ScreenItemView.vue`
- [ ] **Step 4: 运行确认通过 + typecheck** — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(core): 基础组件渲染与时间格式化"`

### Task 5: 保存 API 中间件

**Files:**
- Create: `server/savePathGuard.ts`、`server/save-api.ts`
- Modify: `vite.config.ts`（plugins 加 `saveApiPlugin()`）、`tsconfig.node.json`（include 加 `"server/**/*.ts"`）
- Test: `tests/save-path-guard.spec.ts`

**Interfaces:**
- Produces（`savePathGuard.ts`，纯函数，无 node 依赖，供测试直接导入）：
  ```ts
  export const ALLOWED_DIRS = ["src/assets/library/", "src/assets/screens/"] as const;
  export function isAllowedSavePath(relPath: string): boolean
  // 规则：反斜杠归一为 /；拒绝绝对路径与含 ".." 段；必须以 ALLOWED_DIRS 之一开头且以 .json 结尾；文件名段非空
  ```
- Produces（`save-api.ts`）：
  ```ts
  import type { Plugin } from "vite";
  export function saveApiPlugin(): Plugin
  // configureServer(middleware)：
  // POST /api/save  body {path,content} → 校验 isAllowedSavePath；content 必须 JSON.parse 通过；
  //   写盘 JSON.stringify(obj,null,2)+"\n"，目录 fs.mkdir(recursive) ，res.json({ok:true})
  // POST /api/delete body {path} → 校验后 fs.rm；res.json({ok:true})
  // 校验失败：res.statusCode=400 res.json({ok:false,error:...})；JSON.parse 失败同样 400
  ```

- [ ] **Step 1: 写失败测试** `tests/save-path-guard.spec.ts`：合法 `src/assets/library/a-b.chart.json` true、`src/assets/screens/x.screen.json` true；穿越 `"src/assets/library/../../package.json"`、绝对路径 `"E:/x.json"`、非 json `"src/assets/library/a.png"`、白名单外 `"src/assets/geo/china.json"` 均 false
- [ ] **Step 2: 运行确认失败** — Run: `pnpm test -- save-path-guard`；Expected: FAIL
- [ ] **Step 3: 实现** `server/savePathGuard.ts` 与 `server/save-api.ts`；接入 vite.config.ts 与 tsconfig.node.json
- [ ] **Step 4: 运行确认通过 + `pnpm typecheck`** — Expected: PASS
- [ ] **Step 5: 手工验证** — `pnpm dev` 后 curl `POST /api/save`（合法 path 写 `src/assets/screens/_t.json`，返回 ok:true 且文件出现；非法 path 返回 400），随后删除该测试文件
- [ ] **Step 6: Commit** — `git commit -m "feat(server): 白名单保存/删除 dev 中间件"`

### Task 6: OptionEditor 上下文（面板与 store 解耦）

**Files:**
- Create: `src/composables/useOptionEditor.ts`
- Modify: `src/components/editor/panels/AttrPanel.vue`、`src/components/editor/panels/DataPanel.vue`、`src/components/editor/panels/JsonPanel.vue`、`src/views/EditorView.vue`

**Interfaces:**
- Produces:
  ```ts
  export interface OptionEditor {
    read(path: string, fallback?: unknown): unknown;
    update(path: string | Array<string | number>, value: unknown): void;  // 不记历史（连续输入）
    replace(option: EChartsOptionLike, record: boolean): void;            // record=true 记一次历史
    commit(): void;                                                        // 手动记一次历史（如 addRow/removeRow 后）
  }
  export function provideOptionEditor(editor: OptionEditor): void
  export function useOptionEditor(): OptionEditor  // inject key "optionEditor"，缺失时 throw（快速暴露漏接）
  ```
- Modify 规则：三个面板删除 `useWorkspaceStore()` 导入，改 `useOptionEditor()`：
  - DataPanel：`store.replaceOption(id, option, false)` → `editor.replace(option, false)`；`store.replaceOption(id, option, true)` → `editor.replace(option, true)`；`reset()` 内 `store.replaceOption(id, fresh, true)` → `editor.replace(fresh, true)`
  - AttrPanel：`store.updateOption(id, path, value)` → `editor.update(path, value)`；涉及历史提交处 → `editor.commit()`（按现有调用语义对应）
  - JsonPanel：`store.replaceOption(id, option, record)` → `editor.replace(option, record)`；`store.readOption(path, fb)` → `editor.read(path, fb)`
- EditorView：`provideOptionEditor({ read: (p,f)=>store.readOption(p,f), update: (p,v)=>store.updateOption(store.type,p,v), replace: (o,r)=>store.replaceOption(store.type,o,r), commit: ()=>store.commit() })`

- [ ] **Step 1: 实现** composable 与四处修改（本任务是重构，测试以既有测试 + typecheck 守护）
- [ ] **Step 2: 验证** — Run: `pnpm typecheck && pnpm test`；Expected: PASS
- [ ] **Step 3: 手工回归** — 编辑器属性/数据/JSON 面板：改单元格→撤销可回退；addRow→出现历史记录；无控制台报错
- [ ] **Step 4: Commit** — `git commit -m "refactor: 属性面板解耦为 OptionEditor 上下文"`

### Task 7: 资产 store 与"保存为资产"

**Files:**
- Create: `src/stores/assets.ts`、`src/utils/slug.ts`
- Modify: `src/components/editor/TopBar.vue`
- Test: `tests/assets-store.spec.ts`、`tests/slug.spec.ts`

**Interfaces:**
- Consumes: `core/types.ts` 的 `ChartAsset`；`server` 的 `/api/save`（HTTP，仅运行时）
- Produces:
  ```ts
  // slug.ts
  export function slugifyName(name: string, fallback = "chart"): string
  // 去首尾空白、空白串替换为 "-"、剔除路径非法字符 \/:*?"<>|，截断 40 字符；空结果返回 fallback
  // stores/assets.ts
  export const useAssetsStore = defineStore("assets", {
    state: () => ({ assets: loadAssets() }),   // loadAssets: import.meta.glob<ChartAsset>("../assets/library/*.chart.json", { eager: true })，按 name 排序
    getters: {
      byId(state): (id: string) => ChartAsset | undefined,
      categories(state): string[],             // 去重保序
      filtered(state): (keyword: string, category: string) => ChartAsset[],
      // keyword 匹配 name/tags（不区分大小写）；category 为空串表示全部
    },
    actions: {
      async saveAsset(input: { name: string; category: string; tags?: string[]; chartType: ChartType; option: EChartsOptionLike }): Promise<ChartAsset>,
      // id = `${slugifyName(input.name)}-${Date.now().toString(36)}`；createdAt/updatedAt = new Date().toISOString()
      // POST /api/save { path: `src/assets/library/${id}.chart.json`, content: JSON.stringify(asset, null, 2) }；成功后 unshift 进 state
      async deleteAsset(id: string): Promise<void>,  // POST /api/delete { path: `src/assets/library/${id}.chart.json` }；成功后从 state 移除
    },
  });
  export function isSaveApiAvailable(): boolean  // import.meta.env.DEV
  ```
- Modify（TopBar.vue）：spacer 前新增按钮"存为资产"（Icon name="plus"）→ `ElMessageBox.prompt("资产名称", ...)` → `assetsStore.saveAsset({ name, category: CHART_META[store.type].label, chartType: store.type, option: deepClone(store.option) })` → `ElMessage.success("已保存到图表库")`；`!isSaveApiAvailable()` 时按钮禁用并 title="生产环境只读"

- [ ] **Step 1: 写失败测试** `tests/slug.spec.ts`（"基础 折线/图"→"基础-折线图"、"///"→fallback）；`tests/assets-store.spec.ts`：`setActivePinia(createPinia())` + `vi.stubGlobal("fetch", ...)` 返回 `{ ok: true, json: async () => ({ ok: true }) }`：saveAsset 后 state.assets[0].id 以 slug 开头、fetch 被调且 URL 为 `/api/save`；deleteAsset 后列表移除；filtered("折线","") 命中 name 或 tags
- [ ] **Step 2: 运行确认失败** — Run: `pnpm test -- slug assets-store`；Expected: FAIL
- [ ] **Step 3: 实现** slug.ts、assets.ts、TopBar 按钮
- [ ] **Step 4: 运行确认通过 + typecheck** — Expected: PASS
- [ ] **Step 5: 手工验证** — 编辑器改个标题 → 存为资产 → `src/assets/library/` 出现 JSON → 大屏库（下一任务）前可先看文件
- [ ] **Step 6: Commit** — `git commit -m "feat: 图表资产保存到仓库图表库"`

### Task 8: 图表库页面

**Files:**
- Create: `src/components/library/AssetCard.vue`
- Modify: `src/views/library/LibraryView.vue`（替换占位）、`src/views/EditorView.vue`
- Test: 无新增单测（UI 页），验证走 typecheck/test + 手工清单

**Interfaces:**
- Consumes: `assetsStore`、`ChartRenderer`、`ChartInstance`、`downloadText`
- Produces:
  - AssetCard：props `{ asset: ChartAsset }`；渲染尺寸固定 288×216 容器，`IntersectionObserver` 进入视口才渲染 `ChartRenderer`（chart: `{ id: asset.id, type: asset.chartType, title: asset.name, x:0, y:0, w:288, h:216, option: asset.option }`）；底部名称+分类；右上操作：编辑副本 / 删除（删除需 `ElMessageBox.confirm`）
  - "编辑副本"：`router.push({ path: "/editor", query: { fromAsset: asset.id } })`
  - LibraryView：顶部搜索框（placeholder "搜索名称或标签"）+ 分类下拉（"全部分类"）+ "新建图表" 按钮（跳 `/editor`）；空态提示文案
  - EditorView：`onMounted` 时读取 `route.query.fromAsset` → `assetsStore.byId` → `selectType(asset.chartType)` + `store.replaceOption(store.type, deepClone(asset.option), true)` → `router.replace({ query: {} })`；资产不存在时 ElMessage.warning

- [ ] **Step 1: 实现** AssetCard 与 LibraryView
- [ ] **Step 2: EditorView 支持 fromAsset 载入**
- [ ] **Step 3: 验证** — Run: `pnpm typecheck && pnpm test`；Expected: PASS
- [ ] **Step 4: 手工验证** — 图表库显示 Task 7 存的资产；搜索/分类过滤生效；编辑副本进入编辑器且载入该 option；删除需确认
- [ ] **Step 5: Commit** — `git commit -m "feat: 图表资产库页面与复用入口"`

### Task 9: ScreenStage 舞台渲染器与运行页

**Files:**
- Create: `src/core/Scaler.vue`、`src/core/ScreenStage.vue`
- Modify: `src/views/screen-render/ScreenRenderView.vue`（替换占位）
- Test: `tests/core-item.spec.ts` 补 `toChartInstance` 用例

**Interfaces:**
- Consumes: `computeScale`/`toCanvasPoint`、`ScreenItemView`、`screensStore`（Task 10 提供，本任务先直接 fetch `import.meta.glob` 之外的临时方案？**否**——本任务只做组件与视图骨架，`screensStore` 在 Task 10 落地；ScreenRenderView 内部先用 `const schema = ref<ScreenSchema | null>(null)`，Task 10 接上 store）
- Produces:
  ```ts
  // Scaler.vue：props { width?: number (=SCREEN_W), height?: number (=SCREEN_H) }
  // 外层 div 占满父级 overflow hidden；内层绝对居中：width/height 固定 px，transform: translate(-50%,-50%) scale(s)，transform-origin "0 0"
  // ResizeObserver 监听外层 → s = computeScale(cw, ch, width, height)
  // provide("screenStage", { scale: Ref<number>, originX, originY, toCanvas(e: PointerEvent): {x,y} })
  //   originX/originY = 外层中心 - (width*s/2, height*s/2)；toCanvas 用 toCanvasPoint(e.clientX, e.clientY, s, originX, originY)
  // ScreenStage.vue：props { schema: ScreenSchema }
  // 外层背景 = schema.canvas.background；Scaler → 内层绝对定位渲染 items：
  //   过滤 visible===false；按 zIndex 升序；wrapper absolute left/top/w/h 取 rect；locked 无需处理（运行态无交互）
  //   每项渲染 <ScreenItemView :item="item" />
  ```

- [ ] **Step 1: 补 toChartInstance 失败测试**（chart item → ChartInstance.id===item.id、type 取 chart.chartType；非 chart → null）→ 确认 FAIL
- [ ] **Step 2: 实现** Scaler.vue、ScreenStage.vue、toChartInstance；确认 PASS + typecheck
- [ ] **Step 3: ScreenRenderView 骨架** — 读取 `route.params.id`；`schema` 为 null 时显示"大屏不存在"与返回按钮；非空时 `<ScreenStage :schema="schema" />` 全屏
- [ ] **Step 4: 验证 + Commit** — `pnpm typecheck && pnpm test`；`git commit -m "feat(core): 大屏舞台渲染器 Scaler/ScreenStage"`

### Task 10: screens store、大屏列表页与运行态轮询

**Files:**
- Create: `src/stores/screens.ts`
- Modify: `src/views/screens/ScreensView.vue`（替换占位）、`src/views/screen-render/ScreenRenderView.vue`
- Test: `tests/screens-store.spec.ts`

**Interfaces:**
- Consumes: `createScreenSchema`、`ScreenStage`、`downloadText`、`/api/save`、`/api/delete`
- Produces:
  ```ts
  export const useScreensStore = defineStore("screens", {
    state: () => ({ screens: loadScreens() }),   // import.meta.glob<ScreenSchema>("../assets/screens/*.screen.json", { eager: true })，按 updatedAt 降序
    getters: { byId(state): (id: string) => ScreenSchema | undefined },
    actions: {
      async create(name: string): Promise<ScreenSchema>,   // id = `${slugifyName(name,"screen")}-${Date.now().toString(36)}`；createScreenSchema → POST /api/save → unshift → 返回
      async save(schema: ScreenSchema): Promise<void>,     // schema.updatedAt = now → POST /api/save → state 内同步替换
      async copy(id: string): Promise<ScreenSchema>,       // deepClone → 新 id + name+" 副本" + updatedAt → POST /api/save → unshift
      async remove(id: string): Promise<void>,             // POST /api/delete → 过滤移除
    },
  });
  ```
- ScreensView：卡片网格：卡片内嵌 `<ScreenStage :schema="s" />` 外套固定 288×162 容器（`pointer-events:none; overflow:hidden`，Stage 内 Scaler 自动缩放）+ 名称/件数/更新时间；操作按钮：编辑（`/designer/${id}`）、预览（`/screen/${id}` 新窗口 `window.open`）、导出 JSON（`downloadText(JSON.stringify(s,null,2), \`${s.name}.screen.json\`)`）、复制、删除（confirm）；顶部"新建大屏"→ `ElMessageBox.prompt` → `create(name)` → 跳 `/designer/${id}`
- ScreenRenderView 接入轮询：`schema = reactive(deepClone(store.byId(id)!))`；对每条 `type==="chart" && mode==="api" && api.url` 的 item：`createPoller(fetcher, onOk, interval)`；fetcher = `fetch(api.url, { method, headers }).then(r => r.json())`；onOk = `data => { const v = pickByPath(data, api.dataPath); if (v !== undefined) item.chart!.option = applyApiData(item.chart!.option, v, api.optionPath) }`；interval 缺省视为不轮询（只拉一次）；`onBeforeUnmount` 全部 `stop()`

- [ ] **Step 1: 写失败测试** `tests/screens-store.spec.ts`：stub fetch；create 生成 schema（version 1、canvas 1920×1080）并 unshift；copy 后新 id ≠ 旧 id、name 含"副本"、items 深拷贝（改副本 items 不影响原件）
- [ ] **Step 2: 确认 FAIL → 实现 → PASS + typecheck**
- [ ] **Step 3: ScreensView 与运行态轮询接入**
- [ ] **Step 4: 手工验证** — 新建大屏→文件落盘→列表出现卡片；预览空屏正常渲染背景；导出 JSON 下载内容完整
- [ ] **Step 5: Commit** — `git commit -m "feat: 大屏列表/运行页与 schema 仓库存储"`

### Task 11: designer store（状态与历史）

**Files:**
- Create: `src/stores/designer.ts`
- Test: `tests/designer-store.spec.ts`

**Interfaces:**
- Consumes: `HistoryStack`、`createId`、`createScreenItem`、`deepClone`、`screensStore`
- Produces:
  ```ts
  export type DesignerViewMode = "fit" | 0.5 | 1;
  export interface DesignerSnapshot { items: ScreenItem[] }
  export const useDesignerStore = defineStore("designer", {
    state: () => ({
      schema: null as ScreenSchema | null,
      selectedId: null as string | null,
      viewMode: "fit" as DesignerViewMode,
      dirty: false,
      clipboard: null as ScreenItem | null,
      history: new HistoryStack<DesignerSnapshot>({ items: [] }, HISTORY_LIMIT),
      canUndo: false, canRedo: false,
    }),
    actions: {
      load(id: string): boolean,           // screensStore.byId → deepClone → history.reset({items}) → 清 dirty/selection；找不到返回 false
      newSchema(name?: string): void,      // id=createId("screen")；调用方随后 router.replace(`/designer/${id}`)
      select(id: string | null): void,
      addItem(item: ScreenItem): void,     // zIndex = max+1；push；select；commit()
      addItemFromAsset(asset: ChartAsset, rect?: Partial<Rect>): void,
      // item = createScreenItem("chart", rect)；item.chart = { sourceAssetId: asset.id, chartType: asset.chartType, option: deepClone(asset.option), dataSource: createDefaultDataSource() }；name = asset.name
      removeItem(id: string): void,        // 选中态清理；commit()
      updateRect(id: string, rect: Partial<Rect>, record = false): void,  // 合并写入；record→commit 否则 touch()
      renameItem(id: string, name: string): void,  // touch
      toggleVisible(id: string): void; toggleLocked(id: string): void,  // commit
      bringToFront(id: string): void; sendBackward(id: string): void,   // zIndex 重排；commit
      setCanvas(patch: Partial<ScreenSchema["canvas"]>): void,  // touch
      setProps(id: string, patch: WidgetProps): void,           // touch
      setChartOption(id: string, option: EChartsOptionLike, record: boolean): void,
      setDataSource(id: string, cfg: DataSourceConfig): void,   // touch
      copySelected(): void,                // clipboard = deepClone(选中项)；无选中为 no-op
      paste(): void,                       // clipboard 深拷贝 → 新 id(createId("item"))、x+24/y+24、zIndex=max+1 → push+select+commit；clipboard 为空 no-op
      commit(): void,                      // history.push({ items: deepClone(schema!.items) })；同步 canUndo/canRedo；dirty=true
      touch(): void,                       // dirty=true
      undo(): void; redo(): void,          // 应用 snapshot.items（deepClone 回写）；保持 selectedId 存在性校验
      async save(): Promise<void>,         // screensStore.save(schema!)；dirty=false
    },
  });
  ```
  注意：ChartPayload 在 Task 2 已加必填 `chartType: ChartType`；本 store 的 addItemFromAsset 是"资产快照语义"的落点。

- [ ] **Step 1: 写失败测试** `tests/designer-store.spec.ts`（setActivePinia，screensStore 用空列表即可；不触发网络）：
  - newSchema→addItem(text)→items.length 1、zIndex 1→addItem(chart)→zIndex 2→undo→length 1→redo→length 2
  - addItemFromAsset：item.chart.option 与 asset.option 深度相等但引用不同；改 asset.option 后 item 不变（快照语义）
  - paste：新 id、x/y 各 +24、原 clipboard 不变
  - updateRect(id,{x:100},false) 不产生历史、(…,true) 产生；undo 回退尺寸
  - removeItem 后 selectedId 清空
- [ ] **Step 2: 确认 FAIL → 实现 → PASS + typecheck**
- [ ] **Step 3: Commit** — `git commit -m "feat: 设计器状态与快照历史"`

### Task 12: 设计器画布交互（拖入/移动/选中/缩放）

**Files:**
- Create: `src/core/resize.ts`、`src/components/designer/DesignerCanvas.vue`
- Test: `tests/core-resize.spec.ts`

**Interfaces:**
- Consumes: `Scaler` 的 `provide("screenStage")`（`toCanvas`）、`designerStore`、`ScreenItemView`
- Produces:
  ```ts
  // resize.ts
  export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
  export const MIN_ITEM_W = 40; export const MIN_ITEM_H = 30;
  export function applyResize(rect: Rect, handle: ResizeHandle, dx: number, dy: number): Rect
  // dx/dy 为画布坐标位移；se/s/e 增 w/h；nw/n/w 移动 x/y 并反向增缩；clamp 到 MIN_ITEM_W/H
  // DesignerCanvas.vue：结构
  // <Scaler><div class="canvas-surface" :style="背景" @dragover.prevent @drop="onDrop">
  //   <div v-for="item" class="canvas-item" :style="rect 定位" @pointerdown="startDrag(item, $event)">
  //     <ScreenItemView :item="item" /> （item.locked 时不绑定拖拽）
  //   </div>
  //   选中项外框 + 8 个 handle div（data-handle），pointerdown → startResize
  // </div></Scaler>
  // onDrop(e)：e.dataTransfer.getData("cf/palette") JSON 解析（Task 13 的 PalettePanel 写入）：
  //   kind==="chart-asset" → addItemFromAsset(asset, 位置)；kind==="chart-default" → createScreenItem("chart", 位置)；kind==="widget" → createScreenItem(type, 位置)
  //   位置 = toCanvas(e) - {w/2, h/2}，clamp 到 [0, SCREEN_W-w]/[0, SCREEN_H-h]
  // startDrag：pointerdown 记录起点（toCanvas），setPointerCapture；pointermove → updateRect(id, {x,y}, false)（位移 = toCanvas delta，含 scale 换算）；pointerup → commit()
  // startResize(handle)：同上，pointermove → applyResize(rect, handle, dx, dy) → updateRect(…, false)；pointerup → commit()
  // 点击空白处（canvas-surface 自身 pointerdown）→ select(null)
  ```

- [ ] **Step 1: 写失败测试** `tests/core-resize.spec.ts`：se 拖 (50,40) → w+50/h+40；nw 拖 (30,20) → x+30/y+20 且 w-30/h-20；w 钳制：w=50 时 handle "w" dx=100 → x 增 10（=50-MIN_W）且 w=MIN_W；"e" 仅改 w
- [ ] **Step 2: 确认 FAIL → 实现 resize.ts → PASS**
- [ ] **Step 3: 实现 DesignerCanvas**（画布交互无单测，靠手工清单验证）
- [ ] **Step 4: 临时验证** — DesignerView 占位页临时挂 `<DesignerCanvas />`（Task 13 正式布局）：从控制台手动 `designerStore.addItem(createScreenItem("text"))` 后可拖动、选中、8 点缩放，缩放窗口后拖拽不漂移
- [ ] **Step 5: typecheck + test + Commit** — `git commit -m "feat: 设计器画布拖入/移动/缩放交互"`

### Task 13: 设计器面板与快捷键

**Files:**
- Create: `src/components/designer/PalettePanel.vue`、`src/components/designer/LayerPanel.vue`、`src/components/designer/DesignerInspector.vue`、`src/components/designer/DataSourceEditor.vue`、`src/composables/useDesignerKeyboard.ts`
- Modify: `src/views/designer/DesignerView.vue`（正式布局，替换 Task 12 临时挂载）

**Interfaces:**
- Consumes: `designerStore`、`assetsStore`、`OptionEditor`（Task 6）、三个编辑器面板、`Scaler`、`HISTORY_LIMIT`
- Produces:
  - **DesignerView 布局**：左 `PalettePanel`（240px）｜中列（顶栏 + DesignerCanvas）：顶栏含 大屏名（可编辑）、撤销/重做、视图档位 `el-select`（适应窗口/50%/100%）、保存按钮（含 dirty 圆点）；右列：上 `LayerPanel`（40% 高）下 `DesignerInspector`。
    - 路由 `id==="new"` → `designerStore.newSchema()` + `router.replace(\`/designer/${schema.id}\`)`；否则 `load(id)`，失败 → ElMessage + `/screens`。
    - 离开守卫：`onBeforeRouteLeave` 当 `dirty` → `ElMessageBox.confirm("有未保存的更改，确认离开？")`；另注册 `beforeunload`。
  - **PalettePanel**：两个 tab「组件」「图表资产」。
    - 组件 tab：6 图表（CHART_META 标签）+ 4 基础件；条目 `draggable`，`dragstart` 写 `dataTransfer.setData("cf/palette", JSON.stringify({ kind: "chart-default" | "widget", type }))`。
    - 图表资产 tab：`assetsStore.assets` 列表（名称+分类），dragstart 写 `{ kind: "chart-asset", assetId }`。
  - **LayerPanel**：按 zIndex 降序；行 = 名称（双击 `ElMessageBox.prompt` 重命名）+ 眼睛（visible）+ 锁（locked）；点击选中；顶部按钮 置顶/上移一层。
  - **DesignerInspector**：无选中 → 提示"选中画布中的组件"；有选中 →
    - 通用：名称、位置尺寸 x/y/w/h（`el-input-number`，input 中 `updateRect(…,false)`、change 时 `commit()`）。
    - `type==="chart"`：四个 tab「属性」「数据」「JSON」「数据源」；前三个包一层 `provideOptionEditor({ read, update, replace, commit })`，其中 `read=(p,f)=>getByPath(item.chart!.option,p,f)`、`update=(p,v)=>setChartOption(id, setByPath(option,p,v), false)`、`replace=(o,r)=>setChartOption(id,o,r)`、`commit=()=>store.commit()`；chart prop 传 `toChartInstance(item)`。「数据源」嵌 `DataSourceEditor`。
    - widget：按类型渲染字段（text: 文本 textarea/字号/颜色；image、iframe: src 输入；datetime: format 输入）→ `setProps`。
  - **DataSourceEditor**：props `{ item: ScreenItem }`；mode 单选 static/api；api 展开字段：url、method(GET/POST)、headers（key-value 行编辑）、interval(秒, `el-input-number` min 0)、dataPath、optionPath（placeholder "series.0.data"）；每次修改 `setDataSource(id, cfg)`。
  - **useDesignerKeyboard.ts**：`window keydown`（复用 EditorView 的 `isTypingTarget` 思路，抽到 `src/utils/dom.ts` 导出共享）：Delete→removeItem；Ctrl/⌘+C→copySelected；Ctrl/⌘+V→paste；方向键→updateRect 位移 1px（Shift 10px, record=false）后立即 commit；Ctrl/⌘+Z / +Shift+Z / +Y → undo/redo；Ctrl/⌘+S → preventDefault + save()。

- [ ] **Step 1: 抽取 isTypingTarget 到 utils/dom.ts 并让 EditorView 复用**（行为不变）
- [ ] **Step 2: 实现 5 个组件 + DesignerView 正式布局 + 快捷键**
- [ ] **Step 3: 验证** — Run: `pnpm typecheck && pnpm test`；Expected: PASS
- [ ] **Step 4: 手工验证清单** — 拖入图表与基础件；拖入资产（Task 7 保存的）显示正确；移动/缩放/方向键/删除/复制粘贴/撤销重做；图层面板重命名/显隐/锁定/层级；图表 item 右侧四 tab 可编辑且画布实时更新；数据源切 api 填 url+interval 后保存，打开 `/screen/:id` 数据轮询生效；Ctrl+S 落盘；dirty 未保存离开有确认
- [ ] **Step 5: Commit** — `git commit -m "feat: 设计器物料/图层/检查器与快捷键"`

### Task 14: 全量验证与收尾

**Files:**
- Modify: 仅在发现问题时修复

- [ ] **Step 1: 全量校验** — Run: `pnpm typecheck && pnpm test && pnpm build`；Expected: 全部通过
- [ ] **Step 2: 手工回归 spec §10 验收清单**（6 条逐项过，含：现有编辑器回归、保存 API 白名单 400、`/screen/:id` 轮询、导出 JSON 外部可读）
- [ ] **Step 3: 清理** — 删除 Task 5 手工验证留下的临时 JSON、确认无调试代码
- [ ] **Step 4: Commit（如有修复）** — `git commit -m "fix: 验收问题修复"`
- [ ] **Step 5: 汇报** — 输出验收清单逐条结果

## Self-Review 记录

- **Spec 覆盖**：§4 路由/目录→T1；§5 模型→T2/T10（偏差见 Global Constraints）；§6 交互→T12/T13；§7 保存链路→T5/T7/T10/T11；§8 渲染消费→T9/T10；§2-需求 6（编辑器保留）→T6 仅重构面板；需求 7 数据→T3/T10；§10 验收→T14。无缺口。
- **类型一致性**：`ChartPayload.chartType` 在 T2 定义、T9 toChartInstance/T11 addItemFromAsset 使用一致；`OptionEditor` 四方法在 T6 定义、T13 消费一致；`provide("screenStage")` 契约 T9 定义、T12 消费一致。
- **Review Focus→测试**：5 条分别在 T5/T3/T12/T2/T11 有对应用例。
- **比例**：计划只钉签名/值/路径，函数体仅 applyResize/快照语义等规格不明处给出一句行为描述，未转录实现。
