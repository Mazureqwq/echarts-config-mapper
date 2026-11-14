# ChartForge 地图 WebGL 渲染器（MapLibre）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task（本环境无子代理，由主会话按任务顺序执行；含 D6 里程碑截图验收停止点）。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把地图组件的渲染器从 ECharts 原地替换为 MapLibre WebGL（geojson 省界 + 光照/雾化 + 真倾角/旋转），迁移事件/下钻/图例/外观能力，完成兼容降级与废弃清理，全程保持离线交付。

**Architecture:** 新增纯函数构建器产出 MapLibre style/geojson 源描述（props v2 映射），`MapSceneWidget` 与离线 `RUNTIME_CODE` 地图分支分别实例化 `maplibre-gl`（双端同构、parity 延续）；导出链新增 `maplibreCode` 注入（镜像 `echartsCode` 的 `?url`+fetch 机制）；旧 ECharts 构建器与其测试在 M4 删除（期间为遗留死代码，保持套件绿）。

**Tech Stack:** Vue 3 + TypeScript + maplibre-gl（唯一新增依赖）+ ECharts（非地图组件保留）+ Vitest + Playwright（headless WebGL 风险在 T3 首步验证）。

**Spec:** `docs/superpowers/specs/2026-11-12-chartforge-map-webgl-design.md`（已批准；决策 D1–D9 与评估裁决以 spec 为准）

## Global Constraints

- 离线红线（D2/D3）：无 DEM 地形、无 `addProtocol`、无瓦片底图、无任何联网能力；china geojson 随 payload 内联。
- 唯一新增依赖 `maplibre-gl`（D1 显式取代旧「无新增依赖」约束）；离线产物体积预算 **≤5MB**（超出 → 停止复盘）。
- 组件 ID `chartforge.map-scene-flat/tilted` 不变、props v2 结构不变（`pitch` 升为真实俯仰）；`normalizeMapSceneProps` 白名单延续。
- 双端同构：工作台与离线 style/事件/下钻行为一致，parity 断言延续。
- 废弃项（D4）：ECharts 叠片挤出、皮肤体系（`MAP_SKINS/applyMapSkin/underlay/appliedSkin`）——**M4 清理**，期间皮肤写入的历史颜色值继续生效。
- 兼容地板（D5）：旧 tilted 屏必须以 pitch 渲染、不空白不崩溃（M4 验证）。
- **D6 里程碑门**：M1/M2/M3/M4 各有截图验收停止点——到门必须停止、呈交截图、收到「继续」才恢复执行。
- 无子代理；原地开发于 `feature/chartforge-datav-lite`（安全网已推送至 `15da3c2`）；每任务 RED→GREEN + `pnpm typecheck`/`pnpm vitest run tests`/`pnpm build` + 一次提交；`public_intent` 中文；变更轮 `finalize_changes` 一次。

## Review Focus

1. **headless WebGL 不可用**（Playwright SwiftShader）→ T3 第一步先跑 WebGL 探针 e2e；失败则按记录的补救（`--use-gl=angle` 等启动参数）调整，不得跳过。
2. **file:// 下 maplibre blob worker 失败** → T4 离线 e2e 用真实 maplibre 在 `setContent` 页实跑；M1 门要求人工用浏览器打开导出的单 HTML 复核。
3. **事件载荷漂移**（feature `properties.name` 与数据行 category 全称不一致 / value 取错）→ T5 测试用「广东省/浙江省」全称行断言 `value/valueText` 精确值。
4. **切换期套件变红**：每个切换任务（T3/T4/T5/T6/T7）**逐一列明必须同步改写的 spec 文件**；任务绿的定义=全量 vitest+e2e 绿。
5. **遗留死代码误删/漏删**：旧 `buildMapSceneOption` 与其测试从 T3 起标记为遗留、**T9 统一删除**；T3–T8 期间禁止改其行为（只读兼容）。
6. **体积超预算**：T4 记录离线单 HTML 实测字节数；>5MB → 停止，报告并复盘（候选：maplibre 瘦身构建/分片 zip 模式）。
7. **旧屏降级回归**：T9 必须用「旧 tilted + 皮肤历史值」种子做渲染断言（不空白、颜色保留、pitch 生效），防止 D5 地板被静默打破。

## File Map

- `package.json` — 新增 `maplibre-gl`
- `src/core/export/assets.ts` — 新增 `loadMaplibreSource()`（镜像 `loadEchartsSource` 的 `?url`+fetch+cache）
- `src/core/export/artifact.ts` — `ArtifactInput.maplibreCode`、内联模板/zip 落盘、CSP/SRI 哈希注入
- `src/core/export/index.ts` — `exportScreenPackage` 传入 `maplibreCode`
- `src/core/components/mapLibreScene.ts` — **新增**纯函数构建器 `buildMapLibreScene`
- `src/core/components/mapScene.ts` — 归一化保留；旧 `buildMapSceneOption` 遗留至 T9 删除；`CHINA_REGION_NAMES`/`formatMapValue`/`filterLayersForZoom`/下钻纯函数复用
- `src/workbench/components/MapSceneWidget.vue` — ECharts → MapLibre 实例（含标注覆盖层、事件、flyTo 下钻、图例）
- `src/core/export/runtime.ts` — 地图分支 MapLibre 化（style 同构、点击/flyTo/面包屑）
- `tests/map-libre-scene.spec.ts` — **新增**构建器单测（旧 `map-scene-style/model` 的 option 断言在 T9 前保留）
- `e2e/map-scene-*.spec.ts` — 各任务按切换进度改写（见各任务 Files）
- `docs/superpowers/plans/2026-11-12-chartforge-map-webgl.md` — 本计划

---

### Task 1: 依赖与导出注入基建

**Files:**
- Modify: `package.json` / lockfile
- Modify: `src/core/export/assets.ts`
- Modify: `src/core/export/artifact.ts`
- Modify: `src/core/export/index.ts`
- Test: `tests/export-artifact.spec.ts`、`tests/export-e2e.spec.ts`（补 maplibreCode 入参）

**Interfaces:**
- Produces:
  - `loadMaplibreSource(): Promise<string>`（缓存；失败抛 `加载 MapLibre 运行时失败（HTTP n）`）
  - `ArtifactInput.maplibreCode: string`（必填；内联模板 `<script>…maplibre…</script>` 与 zip 模式 `assets/maplibre-gl.js`；`cspHash`/`sriHash` 同 echarts 处理）
  - `exportScreenPackage` 内部 `maplibreCode: await loadMaplibreSource()`

- [x] **Step 1: 安装依赖**

Run: `pnpm add maplibre-gl` → Expected: 新增依赖写入 package.json（版本以安装结果为准）

- [x] **Step 2: 写失败测试**

`tests/export-artifact.spec.ts` 追加：`buildArtifact({ payload, echartsCode: "/*e*/", maplibreCode: "/*m*/", runtimeCode: "/*r*/", mode: "inline" })` 的 `index.html` 内容 `toContain("/*m*/")`；zip 模式 `files` 含 `path === "assets/maplibre-gl.js"`。`tests/export-e2e.spec.ts` 现有调用补 `maplibreCode: "(function(){window.__cfMaplibreReady=true;})()"` 桩（先不消费，仅满足类型）。

- [x] **Step 3: 跑测试确认失败**

Run: `pnpm vitest run tests/export-artifact.spec.ts` → Expected: FAIL（缺字段/缺注入）

- [x] **Step 4: 实现**

`assets.ts` 增加 `import maplibreUrl from "maplibre-gl/dist/maplibre-gl.js?url"` + `loadMaplibreSource`（仿 `loadEchartsSource`）；`artifact.ts` `ArtifactInput` 加必填 `maplibreCode: string`，模板注入点仿 `echarts`（两处 inline 模板 + zip `files.push` + cspHash/sriHash 行）；`index.ts` 传 `maplibreCode: await loadMaplibreSource()`；全仓 `buildArtifact(` 调用点（含 e2e harness×3）补齐字段。

- [x] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run tests/export-artifact.spec.ts tests/export-e2e.spec.ts` → Expected: PASS

- [x] **Step 6: 全量门 + 提交**

Run: `pnpm typecheck && pnpm vitest run tests && pnpm build` → 三者 exit 0

```bash
git add package.json pnpm-lock.yaml src/core/export/assets.ts src/core/export/artifact.ts src/core/export/index.ts tests/export-artifact.spec.ts tests/export-e2e.spec.ts
git commit -m "feat: maplibre source injection into export artifacts"
```

---

### Task 2: MapLibre 场景构建器（纯函数）

**Files:**
- Create: `src/core/components/mapLibreScene.ts`
- Create: `tests/map-libre-scene.spec.ts`

**Interfaces:**
- Consumes: `normalizeMapSceneProps`、`formatMapValue`、`filterLayersForZoom`、`CHINA_REGION_NAMES`（from `./mapScene`）
- Produces:
  ```ts
  export interface MapLibreSceneResult {
    style: Record<string, unknown>;            // MapLibre style：version/sources/layers/camera/light/fog
    regionValues: Record<string, number>;      // 省全称 → 数值（事件 value 载荷用）
    errors: string[];
  }
  export function buildMapLibreScene(
    props: unknown, rows: readonly Record<string, unknown>[], fields?: DatasetBinding["fields"],
    rowsByLayerId?: Readonly<Record<string, readonly Record<string, unknown>[]>>,
    geoJson?: unknown,   // china FeatureCollection（工作台直传 / 离线取 payload.geo.china）
  ): MapLibreSceneResult;
  ```
  - style 要点：`light`（ambient+directional 默认）、`fog`（range 默认）、`pitch`（tilted→`props.pitch||28`，flat→0）、`center/zoom/minZoom/maxZoom`、source `china`=GeoJSON 内联占位（工作台侧由 widget 注入实际数据，构建器接受 `geoJson` 参数：`buildMapLibreScene(props, rows, fields, rowsByLayerId, geoJson)`）、layers：`fill`（色带：gradient→`fill-color` 三停表达式；segments→`step` 分段表达式；空值省→`fill-color` 按 feature name 匹配 empty 色；`fill-outline-color` 来自 border）、`line`（轮廓）、`symbol` 省名（showLabels 开关；HTML 覆盖层的数据源也由 style 的 symbol 承担——**M1 定案：用 symbol + 本地无字体则禁用 text-field，省名走 HTML 覆盖层**——构建器输出 `labels: Array<{name, centroid}>` 供覆盖层用，`symbol` 层 M1 不启用 text-field）、hover/selected 用 `feature-state` 表达式（`fill-color` 含 `["feature-state",...]` 分支）。
- `regionValues`：与 `regionRows` 同逻辑从容器/图层绑定行提取（首个可见 regionFill 层）。

- [x] **Step 1: 写失败测试（`tests/map-libre-scene.spec.ts`）**

关键断言（RED）：
```ts
it("builds maplibre style with lights fog pitch and camera", () => {
  const r = buildMapLibreScene({ presentation: "tilted", pitch: 30, view: { center: [104, 35], zoom: 2, minZoom: 1, maxZoom: 8, showLabels: true, backgroundColor: "#081622", dragEnabled: true, zoomEnabled: true }, layers: [] }, [], undefined, {}, chinaFixture);
  expect(r.style.version).toBe(8);
  expect(r.style.pitch).toBe(30);
  expect(r.style.center).toEqual([104, 35]);
  expect(r.style.light).toBeTruthy();
  expect(r.style.fog).toBeTruthy();
  expect(r.errors).toEqual([]);
});
it("maps regionFill color ramp to fill-color expressions with empty color", () => {
  const r = buildMapLibreScene({ presentation: "flat", view: {...默认}, layers: [{ id: "r", type: "regionFill", name: "热度", visible: true, style: { color: "#32d6ff", opacity: 0.85, size: 12, colorMode: "gradient", colors: { min: "#000010", mid: "#0080ff", max: "#66ffff", empty: "#0a0a14" } } }] }, [{ province: "广东省", score: 92 }, { province: "西藏自治区", score: 31 }], { category: "province", value: "score" }, {}, chinaFixture);
  const fill = layerByType(r.style, "fill");
  expect(JSON.stringify(fill.paint["fill-color"])).toContain("step");       // 分段/匹配结构
  expect(JSON.stringify(fill.paint)).toContain("#0a0a14");                   // 空值色
  expect(r.regionValues).toEqual({ "广东省": 92, "西藏自治区": 31 });
});
it("keeps legacy flat pitch0 and drops tilted extrusion entirely", () => { pitch flat→0; style 内无 ECharts 依赖字段 });
it("filters layers by zoom window (minZoom/maxZoom → layer minzoom/maxzoom)", () => { … });
it("honors drill disabled and view toggles", () => { … });
```
（`chinaFixture` 为内嵌最小 FeatureCollection：广东省/浙江省两个 feature。）

- [x] **Step 2: 跑测试确认失败** — Run: `pnpm vitest run tests/map-libre-scene.spec.ts` → Expected: FAIL（模块不存在）

- [x] **Step 3: 实现 `mapLibreScene.ts`**

按 Interfaces 构建；色带表达式：gradient 用 `["interpolate", ["linear"], ["get", "__v"], min, c0, mid, c1, max, c2]` 需要每省数值——**实现要点**：`fill-color` 对「有数据省」用 match 列表（省全称→插值色由数据算出的分段色）简化为：构建期计算每省颜色（复用旧 ramp 逻辑的 `rampColor` 思路内联），产出 `["match", ["get","name"], 广东省, colorA, 西藏省, colorB, …, empty]`——离散 match 表达式，确定性强、双端一致。分段模式同理（每省按分段取色）。hover：`fill-color` 外层 `["case", ["feature-state","hover"], hoverColor, base]`；selected 同理（feature-state `selected`，由交互代码 setFeatureState）。

- [x] **Step 4: 跑测试确认通过** — Run: `pnpm vitest run tests/map-libre-scene.spec.ts` → PASS

- [x] **Step 5: 全量门 + 提交**

Run: `pnpm typecheck && pnpm vitest run tests && pnpm build` → 0

```bash
git add src/core/components/mapLibreScene.ts tests/map-libre-scene.spec.ts
git commit -m "feat: maplibre scene style builder (lights fog ramp feature-state)"
```

---

### Task 3: 工作台 Widget 切换（M1 主体）+ WebGL 探针

**Files:**
- Modify: `src/workbench/components/MapSceneWidget.vue`
- Modify: `e2e/map-scene-visual.spec.ts`（结构断言改写为 MapLibre 语义）
- Create: `e2e/webgl-probe.spec.ts`（探针，M1 后保留为环境哨兵）

**Interfaces:**
- Consumes: `buildMapLibreScene`（T2）、`getMap`/下钻纯函数（既有）
- Produces: Widget 持 `maplibregl.Map` 实例；`defineExpose({ getMap: () => map })`（e2e 用）；事件/下钻本任务仅做**点击冒烟**（`map.on("click","fill-layer",…)` 打通 `emitEvent("regionClick",…)` 单测级冒烟），完整事件/下钻在 T5/T6。
- 标注：M1 用 HTML 覆盖层（`labels` 数据 + `project()` 定位），`symbol` 不带 text-field。

- [x] **Step 1: WebGL 探针（风险先行）**

新建 `e2e/webgl-probe.spec.ts`：空页 `page.goto("about:blank")` 后 `page.evaluate` 检测 `document.createElement("canvas").getContext("webgl2") || webgl` 非空，再创建 `new maplibregl.Map({container, style:{version:8,sources:{},layers:[]}})`（经 `/node_modules/maplibre-gl/dist/maplibre-gl.js` 或 dev server 路径引入）断言 `map.on("load")` 触发。
Run: `pnpm test:e2e e2e/webgl-probe.spec.ts` → **若 FAIL**：按 Review Focus 补救记录调整 playwright 启动参数（`launchOptions.args: ["--use-gl=angle", ...]` 写入 `playwright.config.ts`）并复跑；仍失败 → **停止本计划**，报告环境不可用（计划缺陷类停机）。

- [x] **Step 2: Widget 切换实现**

`MapSceneWidget.vue`：移除 `EChartsView` 引用，`onMounted` 创建 `new maplibregl.Map({ container: refEl, style: buildMapLibreScene(...).style 含 geojson 源注入, pitch, interactive: dragEnabled||zoomEnabled, attributionControl:false })`；`dragEnabled/zoomEnabled` 关闭时 `map.dragPan.disable()/map.scrollZoom.disable()`；`backgroundColor`→容器 style；`labels` 覆盖层 DOM（`map.on("move")` 重投影）；`map.on("click","fill",…)` 冒烟：`emitEvent("regionClick", {name,value,valueText,presentation})`（载荷构造复用 `formatMapValue` 与 T2 `regionValues`）；`result/errors` 绑定沿用现有 computed 形态（错误→`.map-scene__status`）；`georoam` 相机同步逻辑（四层叠片）随 ECharts 移除（无叠片后单地图无需同步）——`liveCamera/actualCamera` 改由 `map.on("move")` 读 `getCenter/getZoom` 维护，供 T6 下钻用。

- [x] **Step 3: 同步改写受影响的既有 e2e（防套件变红）**

`e2e/map-scene-visual.spec.ts`：结构断言（4 叠片/geoIndex/colorStops/regions）全部改写为 MapLibre 断言（`style.pitch===28`、fill 层 `fill-color` 含省名 match、无 extrusion 字段）；截图 01–05 保留（内容自然变化）；「拖拽后四层对齐」断言改为「单地图 center/zoom 随拖拽变化」；`convertToPixel` 探针改 `map.project([lng,lat])`（经 `defineExpose().getMap()`）；v1 兼容断言改写（无 v2 键的旧 props → pitch0/默认 camera/无 legend DOM）。**分段/皮肤/下钻截图用例暂跳过标记（`test.fixme` 或移除），T7/T8/T9 恢复**——记录于台账。

- [x] **Step 4: 探针+视觉跑绿**

Run: `pnpm test:e2e e2e/webgl-probe.spec.ts e2e/map-scene-visual.spec.ts` → PASS
其余 e2e（editor/inspector/interaction/parity/tilted-drill）此阶段**必然红**（依赖 ECharts widget）——按切换进度在 T4–T6 逐一改写；**本任务绿的定义**：typecheck+vitest+build 绿 + 上述两个 e2e 绿（全量 e2e 在 T6 结束时恢复全绿）。此裁决记入台账 `Ruling:`。

- [x] **Step 5: 全量 vitest 门 + 提交**

Run: `pnpm typecheck && pnpm vitest run tests && pnpm build` → 0（vitest 不含 e2e ✓）

```bash
git add src/workbench/components/MapSceneWidget.vue e2e/map-scene-visual.spec.ts e2e/webgl-probe.spec.ts playwright.config.ts
git commit -m "feat: switch workbench map widget to maplibre renderer"
```

---

### Task 4: 离线运行时切换 + parity 重建 → **GATE M1**

**Files:**
- Modify: `src/core/export/runtime.ts`（地图分支）
- Modify: `e2e/map-scene-style-parity.spec.ts`（ECharts option 捕获 → MapLibre style 捕获）

**Interfaces:**
- Produces: 离线 `safeMapScene` 改为：`new maplibregl.Map({ container, style: <由 payload props+geo 构建，与工作台同一构建逻辑的 ES5 等价实现>, pitch, … })`；`window.maplibre` 来自产物注入的 `maplibreCode`（`ArtifactInput.maplibreCode` T1 已就位）；**构建逻辑同构**：runtime 内以 ES5 重写 `buildMapLibreScene` 等价物（沿用既有「双端各自实现+parity e2e」模式）。
- parity 新形态：e2e 分别取工作台 `map.getStyle()` 与离线 `map.getStyle()` 的**规范化子集**（layers 数/类型/paint 关键字段/camera/light/fog）逐项 `toEqual`。

- [x] **Step 1: 写失败测试（改写 parity spec）**

`map-scene-style-parity.spec.ts` 三个用例改写：种子不变；工作台读 `getStyle()`（经 `getMap().getStyle()`）；离线页引入**真实** `maplibreCode`（`loadMaplibreSource` 或 dev 路径）与真实 payload → `map.on("load")` 后读 style；断言子集：`pitch/camera/fill paint（match 表达式含空值色）/lights/fog/labels 覆盖层文本`。

- [x] **Step 2: 跑测试确认失败** — Run: `pnpm test:e2e e2e/map-scene-style-parity.spec.ts` → FAIL（离线仍是 ECharts）

- [x] **Step 3: 实现 runtime 地图分支**

`RUNTIME_CODE` 内 `safeMapScene` 重写为 MapLibre（ES5、无 eval、`textContent` DOM、geojson 从 `payload.geo.china` 取）；删除该分支的 ECharts init/georoam 同步/叠片相关代码（其余图表分支不动）；点击/下钻接线随 T5/T6 补（本任务只渲染+style parity）。**体积记录**：构建后读单 HTML 字节数写入台账。

- [x] **Step 4: 跑 parity + 关键回归**

Run: `pnpm test:e2e e2e/map-scene-style-parity.spec.ts e2e/map-scene-visual.spec.ts e2e/webgl-probe.spec.ts` → PASS
（editor/inspector/interaction/tilted-drill 仍红，T5–T6 恢复。）

- [x] **Step 5: 全量 vitest 门 + 提交**

```bash
git add src/core/export/runtime.ts e2e/map-scene-style-parity.spec.ts
git commit -m "feat: switch offline runtime map branch to maplibre with style parity"
```

- [x] **Step 6: GATE M1 截图验收（D6 停止点）**

生成 M1 截图包：`map-scene-visual.spec.ts` 截图（省界 fill+轮廓、pitch 操作后、光照/雾化可见）+ 离线单 HTML 实测体积 + 探针结果 → 通过 b64 分块同步到本地工作区 → `present_file` 呈交 → **停止执行，等待人工「继续/停/改」**；若「改」→ 按意见返工 T3/T4 后重新过门。

---

### Task 5: 区域事件迁移（M2）

**Files:**
- Modify: `src/workbench/components/MapSceneWidget.vue`（fill 层 click/dblclick 完整载荷）
- Modify: `src/core/export/runtime.ts`（同构）
- Modify: `e2e/map-scene-interaction.spec.ts`（ECharts `convertToPixel` → `map.project`；断言语义不变）

**Interfaces:**
- Produces: `regionClick/regionDblclick` 载荷 `{ name, value, valueText, presentation }`（value 从 T2 `regionValues[feature.properties.name]` 取；工作台 `emitEvent` 白名单链路与离线 `runBlueprint` 链路均复用既有管线）；dblclick 同时触发 T6 下钻（本任务先留 `// T6 接下钻` 桩，避免半接状态被 e2e 撞见——interaction 的 dblclick 用例 T6 恢复）。

- [x] **Step 1: 改写 interaction e2e 的点击部分**（`map.project` 探针 + 单击→变量→表格断言）→ Run FAIL（离线/工作台事件未接）→ 实现双端 click/dblclick → PASS
- [x] **Step 2: 全量 vitest 门 + 提交**

```bash
git add src/workbench/components/MapSceneWidget.vue src/core/export/runtime.ts e2e/map-scene-interaction.spec.ts
git commit -m "feat: migrate region blueprint events to maplibre"
```

---

### Task 6: 镜头下钻迁移（flyTo）→ 全量 e2e 恢复绿（M2 主体）

**Files:**
- Modify: `src/workbench/components/MapSceneWidget.vue`（flyTo/easeTo + 面包屑 + Esc）
- Modify: `src/core/export/runtime.ts`（同构）
- Modify: `e2e/map-scene-interaction.spec.ts`（dblclick 用例恢复；下钻断言）
- Modify: `e2e/map-scene-tilted-drill.spec.ts`（4 层对齐断言 → 单地图视角断言；探针 `map.project`）
- Modify: `e2e/map-scene-visual.spec.ts`（下钻截图用例恢复）

**Interfaces:**
- Produces: `startDrill(name)` → `computeRegionCenter(payload.geo.china, name)` → `map.flyTo({ center, zoom: clamp(max(4.5,cur),…), duration: 350, essential: true })`；上钻 `map.easeTo({ center: configView, duration: 350 })`；面包屑/Esc/`regionUpdrill` 复用既有 DOM 与蓝图链路；`drill.enabled` 开关语义不变。

- [x] **Step 1: 改写 tilted-drill e2e**（断言：flyTo 后 `getZoom()>3`、面包屑文本、Esc 后 `getCenter/getZoom` 回配置值；**删除 4 层对齐断言**）→ Run FAIL
- [x] **Step 2: 实现双端下钻** → Run `pnpm test:e2e e2e/map-scene-tilted-drill.spec.ts e2e/map-scene-interaction.spec.ts` → PASS
- [x] **Step 3: 恢复视觉 spec 下钻截图用例**（`map.project` 探针 + 面包屑截图09）→ PASS
- [x] **Step 4: 全量 e2e 恢复** — Run: `pnpm test:e2e` → **11+ 全绿**（editor/inspector 此前已绿）；vitest/build/typecheck 门
- [x] **Step 5: 提交**

```bash
git add src/workbench/components/MapSceneWidget.vue src/core/export/runtime.ts e2e/
git commit -m "feat: migrate lens drill-down to maplibre flyTo"
```

---

### Task 7: 图例/外观/色带贯通（M2 收口）→ **GATE M2**

**Files:**
- Modify: `src/core/components/mapLibreScene.ts`（hover/selected feature-state 接线、tooltip 数据）
- Modify: `src/workbench/components/MapSceneWidget.vue`（图例 DOM/tooltip/悬停 setFeatureState/点击态）
- Modify: `src/core/export/runtime.ts`（同构）
- Modify: `e2e/map-scene-style-parity.spec.ts`（追加外观字段断言）

**Interfaces:**
- Consumes: 既有 `buildMapLegend`、`MapLegendEntry`、外观 props（T2 style 已含 paint，本任务补交互态与 DOM）
- Produces: 图例/tooltip/`emphasis/selected` hover 点击态双端生效；色带 match 表达式与图例文本一致。

- [x] **Step 1: parity spec 追加外观断言**（fill hover 表达式/tooltip 配置/图例文本双端一致）→ FAIL → 实现 → PASS
- [x] **Step 2: 全量门（vitest+e2e+build+typecheck+diff --check）**
- [x] **Step 3: 提交**

```bash
git add src/core/components/mapLibreScene.ts src/workbench/components/MapSceneWidget.vue src/core/export/runtime.ts e2e/map-scene-style-parity.spec.ts
git commit -m "feat: map legend tooltip and hover selected states on maplibre"
```

- [x] **Step 4: GATE M2 截图验收（D6 停止点）**

M2 截图包（图例/色带/悬停态/点击态/下钻前后/事件联动表格变化）→ 同步本地 → `present_file` → **停止等待「继续/停/改」**。

---

### Task 8: 视觉质感项（M3）

**Files:**
- Modify: `src/core/components/mapScene.ts`（共享语义：视图偏移换算/比例尺刻度/精确国界外环重建）
- Modify: `src/core/components/mapLibreScene.ts`（分级边界/标注覆盖层/视图偏移）
- Modify: `src/workbench/components/MapSceneWidget.vue`（比例尺控件自绘、悬停动画、标注覆盖层 move 重投影）
- Modify: `src/core/export/runtime.ts`（同构：比例尺/标注/偏移）
- Modify: `src/core/export/assets.ts`、`src/core/export/model.ts`（离线 payload 内嵌 `geo.chinaOutline`）
- Modify: `src/workbench/components/MapSceneInspector.vue`（视图偏移/比例尺开关等新控件）
- Modify: `tests/map-libre-scene.spec.ts`、`e2e/map-scene-visual.spec.ts`、`e2e/map-scene-style-parity.spec.ts`（断言与截图）

**Interfaces:**
- Produces:
  - 分级边界：`border` props → 省界 `fill-outline-color`（线型/粗细/色）+ 外轮廓强化层（`line` 层用中国 union 外环——**实现**：china.json 无独立国界几何，外环由省级几何做精确平面并集分析重建：边在交点/T 型接点切分 → 沿线内外侧采样判定并集边界 → 左面遍历成环 → 只取外环（大陆含海南 + 台湾），甘肃—宁夏与广东—香港等行政区缝隙不产生独立外环）
  - 视图偏移：`view.offset?: {x,y}`（新增可选 props，归一 clamp ±100%）→ 构建期换算 camera 中心偏移（或 container padding 等价实现）
  - 比例尺控件：`scaleBar?: {show, position}` props → 按 `map.unproject` 两端点算米数、格式化 m/km 自绘 DOM
  - 省名标注：HTML 覆盖层完整版（`map.on("move")` 重投影、`showLabels` 开关、缩放阈值）
- 新增 props 均入 `normalizeMapSceneProps` 白名单（v2 增量字段，向后兼容）

- [x] **Step 1: RED** — 新单测（offset/scaleBar/边界 style 字段/标注覆盖层数据）+ visual spec 断言
- [x] **Step 2: GREEN** — 双端实现
- [x] **Step 3: 全量门 + 提交**

```bash
git add src/core/components/mapLibreScene.ts src/core/components/mapScene.ts src/workbench/components/MapSceneWidget.vue src/workbench/components/MapSceneInspector.vue src/core/export/runtime.ts src/core/export/assets.ts src/core/export/model.ts tests/map-libre-scene.spec.ts e2e/map-scene-visual.spec.ts e2e/map-scene-style-parity.spec.ts e2e/t8-m3-shots.spec.ts .gitignore
git commit -m "feat: map visual polish (exact national outline view offset scale bar labels)"
```

- [x] **Step 4: GATE M3 截图验收（D6 停止点）**

M3 截图包（边界近似/比例尺/视图偏移/悬停动画/标注覆盖层）→ 同步 → `present_file` → **停止等待「继续/停/改」**。

---

### Task 9: 兼容降级验证与废弃清理（M4 上半）

**Files:**
- Modify/删: `src/core/components/mapSkins.ts`（删）、`src/workbench/components/MapSceneInspector.vue`（皮肤区删）、`src/core/components/mapScene.ts`（`applyMapSkin/underlay/MAP_SKINS` 引用与旧 `buildMapSceneOption` 及其专属 helper 删除——`buildMapLegend/formatMapValue/filterLayersForZoom/computeRegionCenter/interpolateDrillView/CHINA_REGION_NAMES` 保留）
- 删: `tests/map-skins.spec.ts`；`tests/map-scene-style.spec.ts`/`tests/map-scene-model.spec.ts` 中旧 builder 专属断言（归一化/事件声明/zoom 过滤/下钻纯函数保留）
- Modify: `e2e/map-scene-inspector.spec.ts`（皮肤卡断言删除）、`tests/component-inspector.spec.ts`（「地图皮肤」断言删除）
- Create: `e2e/map-legacy-compat.spec.ts`（D5 地板）

**Interfaces:**
- Produces: 兼容用例——种子含 (a) 旧 tilted props（无 v2 新字段）(b) 历史皮肤写入的颜色值，断言：渲染不空白（fill 层存在且有颜色）、`pitch===28`、历史 colors 生效、无 `MAP_SKINS` 导出（grep 级断言可放 T10）。

- [x] **Step 1: RED** — `map-legacy-compat.spec.ts`（旧种子渲染断言）
- [x] **Step 2: GREEN** — 先跑通用例确认现状满足（tilted→pitch 渲染与颜色保留若不满足 → 修 widget/buildMapLibreScene）
- [x] **Step 3: 废弃清理** — 删除皮肤体系与旧 builder 及其测试/断言 → typecheck（处理残留引用 TS6133 等）→ vitest 全绿
- [x] **Step 4: 全量门 + 提交**

```bash
git add -A src tests e2e
git commit -m "refactor: remove echarts legacy builder and skin system, add legacy compat coverage"
```

---

### Task 10: 全量收口、验收记录与整分支评审（M4 下半）→ **GATE M4**

**Files:**
- Modify: `docs/superpowers/specs/2026-11-12-chartforge-map-webgl-design.md`（§6 验收记录）
- Modify: 本计划文件（执行记录 + 勾选）
- Modify: `e2e/map-scene-visual.spec.ts`（若 M4 需要的最终截图）

**Interfaces:** 无新代码接口。

- [x] **Step 1: 全量质量门**

Run: `pnpm typecheck && pnpm vitest run tests && pnpm build && pnpm test:e2e` → 全 0/全绿；`git diff --check` → 0；grep `eval\(|new Function|innerHTML` 于 `src/core/export` → 仅许可文本；**体积实测**：导出单 HTML 字节数 ≤5MB（记录台账，超限 → 停止复盘）；grep `MAP_SKINS|applyMapSkin|buildMapSceneOption` → 0（废弃清零）。

- [x] **Step 2: 验收记录**

Spec §6 四条门逐项记录（含 M1–M4 截图索引、体积数字、评审结论）；本计划补执行记录与勾选。

- [x] **Step 3: 整分支评审（会话内、无子代理）**

全量 diff `15da3c2..HEAD` 通读 + 对照 spec D1–D9 逐条核对 → Critical/Important 当轮修复（RED→GREEN），Minor 记 `Final: minor (deferred)`。

- [x] **Step 4: 提交 + 台账收尾**

```bash
git add docs/superpowers e2e tests src
git commit -m "test+docs: map webgl migration acceptance record and plan checklist"
```
台账写入 Task 1–10 完成行、全部 `Ruling:`、评审结论与 `Final:` 行 → 删除 `.superpowers/sdd/2026-11-12-chartforge-map-webgl/` → `finalize_changes` 一次 → 中文验收报告（全部 Ruling + deferred minors）→ `finishing-a-development-branch` 菜单。

- [x] **Step 5: GATE M4 最终验收（D6 停止点）**

最终截图包（M4 兼容降级前后对比 + 全绿门输出摘要）→ `present_file` → **停止等待人工确认**；确认后进入 Step 4 的台账收尾与报告。

### Task 10 执行记录（2026-11-14）

**Step 1 全量质量门（基线 `a744f9c`，Task 10 评审修复后复跑）**

| 门禁 | 实测 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm vitest run tests` | 58 文件 / 496 测试全绿（原 494 + Task 10 新增 2） |
| `pnpm build` | exit 0 |
| `pnpm test:e2e` | 19/19（原 18 + Task 10 新增 1） |
| `git diff --check` | exit 0 |
| `eval(`/`new Function`/`innerHTML`（`src/core/export/`） | 仅 1 处策略注释 |
| `MAP_SKINS|applyMapSkin|buildMapSceneOption`（代码域） | 0 命中 |
| 离线单 HTML | 1,916,394 字节 ≈ 1.828 MiB ≤ 5 MB |

**Step 3 整分支评审结论（`15da3c2..HEAD`，33 文件 +4,162/−1,446）**

- `Final: important (fixed)` — `geoScatter`/`geoHeatmap`/`geoFlow` 图层在 MapLibre 迁移后被静默丢弃（模型与检查器仍可新增，旧 ECharts 确有渲染）。修复：共享构建器 + 离线 runtime 同源补齐 `circle`/`heatmap`/`line` 图层与独立 geojson 源，转换失败显式报错，散点标注进 HTML 覆盖层；补 2 条单测 + 1 条双端 parity e2e。
- `Final: minor (fixed)` — 工作台未应用 `props.label.show`，与离线端标注开关判定漂移 → 工作台补齐同一判定。
- `Final: minor (deferred)` — 旧 ECharts 飞线 `animated` 的流动拖尾降级为静态虚线：MapLibre 的 `line-dasharray` 无过渡属性，逐帧 `setPaintProperty` 会让 style 常驻 dirty（`map.loaded()`/`idle` 永不触发，看板持续重绘）。恢复需另立 spec。
- `Final: minor (deferred)` — `geoHeatmap` 的密度色带观感与旧 ECharts 单色 radial 略有差异（能力不缺）。

**Ruling 摘要**

- `Ruling:` 废弃 grep 门按**代码域**（`src`/`tests`/`e2e`）判定；历史 plan/spec 中的废弃名称保留为废弃记录，不回写。
- `Ruling:` 工作台与离线端继续共享同一套语义源（`buildMapLibreScene` 为工作台权威实现，离线 runtime 为同源镜像实现），几何/图层/标注双端 parity 由 `e2e/map-scene-style-parity.spec.ts` 守护。
- `Ruling:` 散点/热力/飞线的行转换沿用既有 `buildGeoChartDataFromRows`（离线端为等价镜像实现），字段缺失与无效行按旧 ECharts 文案报错，不静默丢层。
- `Ruling:` `main` 不合并，`feature/chartforge-datav-lite` 保持独立分支等待人工确认。


## 执行方式

- `superpowers:executing-plans` 会话内连续执行（无子代理）；四道 D6 门（M1–M4 截图）为**计划内停止点**：停止 → 呈交截图 → 收到「继续/停/改」→ 恢复/返工。
- 每任务 RED→GREEN、三门、一次提交；台账记录全部 Ruling 与门禁结果。
