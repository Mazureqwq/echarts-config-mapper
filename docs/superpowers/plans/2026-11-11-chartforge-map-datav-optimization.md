# ChartForge 地图 DataV 对标优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task（本环境无子代理，由主会话按任务顺序执行）。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按已批准的 DataV 对标 spec，把地图图表升级为「样式可精调、配置完整、可下钻可联动」的大屏地图组件（三阶段：样式 → 面板 → 交互）。

**Architecture:** 扩展 `MapSceneProps` schema v2（可选新字段，缺省时构建器按 spec 默认值出图，v1 工作区视觉等价）；工作台 `mapScene.ts` 与离线 `runtime.ts` 内嵌构建器同步演进并以 e2e 捕获对比做双端 parity；皮肤为纯常量注册表（应用即写值，无新持久化概念）；事件/下钻走既有 `emitEvent→dispatchComponentEvent→蓝图` 与离线 `runBlueprint` 管线，下钻为会话级镜头 tween + 面包屑。

**Tech Stack:** Vue 3 + TypeScript + ECharts 6（内置 visualMap/geo/流光 effect）+ Vitest + Playwright；无新增依赖。

**Spec:** `docs/superpowers/specs/2026-11-11-chartforge-map-datav-design.md`（2026-11-11 已获人工批准）

## Global Constraints

- 不新增 npm 依赖；localStorage 键 `chartforge.workspace.v1` 不变；`src/assets/screens/` 不入库。
- props 纯白名单投影（`normalizeMapSceneProps`），未知字段剔除；`MAP_SCENE_MODEL_VERSION` 1→2；v1 输入归一后**不新增键**（构建器用缺省出图，视觉与现状等价）。
- 无 `eval` / `new Function` / `innerHTML` / 外链；离线包 DOM 一律 `createElement`+`textContent`。
- 双端一致：`src/core/components/mapScene.ts` 与 `src/core/export/runtime.ts` 内嵌构建器同构演进；parity 以 playwright 捕获离线 option 对比工作台 option 断言。
- 每任务 RED→GREEN；质量门 `pnpm typecheck`、`pnpm vitest run tests`、`pnpm build`、任务涉及 e2e 时 `pnpm test:e2e <file>`；每任务一次提交（信息见各任务 Step 5）。
- 事件载荷：`{ name: string; value: number | null; valueText: string; presentation: "flat" | "tilted" }`（china.json 无 adcode，不承诺）；`valueText` 为 `formatMapValue` 格式化结果（spec §6.4 贯通载荷的落点，§7.1 载荷的超集）。
- 分支 `feature/chartforge-datav-lite` 原地开发；不建 worktree；不使用子代理；每任务变更轮收尾调用一次 `finalize_changes`；`public_intent` 中文无秘密。

## Review Focus

1. **v1 兼容**：旧工作区（无新字段）加载后视觉与现状等价——Task 1 `tests/map-scene-model.spec.ts`「v1 props 归一不新增键」与 Task 10 视觉截图回归共同钉住。
2. **色带正确性**：三色连续（min/mid/max 经 colorStops）与分段 2–10 均分、空值色、`visualMap.show=false` 不外露——Task 2 单测逐字段断言。
3. **双端 parity**：色带/标注/边线/事件/下钻离线与工作台一致——Task 2 建 `e2e/map-scene-style-parity.spec.ts` 捕获对比骨架，Task 7/8 各自追加断言。
4. **tween×漫游**：下钻插值期间 `georoam` 同步与 2.5D 四层对齐不破坏，tween 结束态=目标态——Task 8 单测（纯插值函数）+ e2e（拖拽后断言四层 center/zoom 一致仍成立）。
5. **单双击时序**：双击会连发两次单击事件，业务上 regionClick 可能触发两次——Task 7 测试明确记录行为（事件照发，蓝图侧自行防抖；断言双击后 regionDblclick 恰一次）。
6. **setProps 深合并**：蓝图动作写 `view.center` 不得整替 `view` 丢字段——Task 9 单测（嵌套合并语义，工作台+离线两侧）。

---

### Task 1: MapSceneProps schema v2 基座与 v1 兼容

**Files:**
- Modify: `src/core/model/types.ts`（MapSceneProps/MapSceneView/MapSceneLayer 类型扩展）
- Modify: `src/core/components/mapScene.ts`（`MAP_SCENE_MODEL_VERSION = 2`、`normalizeMapSceneProps` 可选组归一、`formatMapValue`）
- Modify: `tests/map-scene-model.spec.ts`（modelVersion 断言 1→2 + 新用例）

**Interfaces:**
- Consumes: 既有 `MapSceneProps`、`clamp`、`HEX_COLOR`、`isRecord`（同文件）。
- Produces:
  - `MAP_SCENE_MODEL_VERSION = 2 as const`
  - `interface MapValueFormat { decimals?: number; suffix?: string }`
  - `interface MapLegendConfig { show: boolean; position: "top-right" | "bottom-right" | "bottom-left"; mode: "continuous" | "segments" }`
  - `formatMapValue(value: number | null, fmt?: MapValueFormat): string` — null→`"—"`；decimals 缺省 0；suffix 追加末尾。
  - 归一化可选组（**输入缺失则不产出键**）：`valueFormat`、`legend`、`tooltipStyle`、`emphasis`、`selected`、图层 `style.colorMode/colors/segments/border`、`style.label`、`style.animated`、图层 `minZoom/maxZoom`。

- [ ] **Step 1: 写失败测试**

在 `tests/map-scene-model.spec.ts` 追加（并把既有 `modelVersion: 1` 两处断言改为 `2`：`toEqual` 首字段与 `defaults` 的 `toMatchObject`）：

```ts
it("bumps to model version 2 and keeps v1 props key-identical", () => {
  const v1 = { presentation: "flat" as const, layers: [{ id: "a", type: "regionFill" as const, name: "n", visible: true, style: { color: "#336699", opacity: 0.7, size: 12 } }] };
  const out = normalizeMapSceneProps(v1);
  expect(out.modelVersion).toBe(2);
  expect(Object.keys(out).sort()).toEqual(["layers", "modelVersion", "pitch", "presentation", "view"]);
  expect(out.layers[0]).toEqual({ id: "a", type: "regionFill", name: "n", visible: true, style: { color: "#336699", opacity: 0.7, size: 12 } });
  expect("valueFormat" in out).toBe(false);
});

it("normalizes provided v2 groups with clamps", () => {
  const out = normalizeMapSceneProps({
    valueFormat: { decimals: 99, suffix: "次" },
    legend: { show: 1, position: "middle", mode: "pie" },
    tooltipStyle: { background: "#001122", color: "red" },
    emphasis: { areaColor: "#12abEF" },
    layers: [{ id: "a", type: "regionFill", name: "n", visible: true, style: { colorMode: "segments", segments: 99, colors: { min: "#000000", max: "url(x)", empty: "#111111" }, border: { color: "#fff", width: 99, type: "dotted" } }, minZoom: -3, maxZoom: 99 }],
  });
  expect(out.valueFormat).toEqual({ decimals: 4, suffix: "次" });
  expect(out.legend).toEqual({ show: false, position: "top-right", mode: "continuous" });
  expect(out.tooltipStyle).toEqual({ background: "#001122", borderColor: "#1f2a3a", color: "#e7fbff", fontSize: 12 });
  expect(out.emphasis).toEqual({ areaColor: "#12abEF", borderColor: "#ffffff", labelColor: "#ffffff" });
  const layer = out.layers[0]!;
  expect(layer.style).toMatchObject({ colorMode: "segments", segments: 10, colors: { min: "#000000", max: "#32d6ff", empty: "#111111" }, border: { color: "#ffffff", width: 8, type: "solid" } });
  expect([layer.minZoom, layer.maxZoom]).toEqual([0.5, 20]);
});

it("formatMapValue clamps decimals and appends suffix", () => {
  expect(formatMapValue(null)).toBe("—");
  expect(formatMapValue(12.3456)).toBe("12");
  expect(formatMapValue(12.3456, { decimals: 2, suffix: " 万吨" })).toBe("12.35 万吨");
  expect(formatMapValue(-0.04, { decimals: 1 })).toBe("-0.0");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/map-scene-model.spec.ts`
Expected: FAIL（`formatMapValue` 未导出、`modelVersion` 期望 1、`v2` 组缺失）

- [ ] **Step 3: 实现 schema v2**

`types.ts` 增加上述接口与可选字段；`mapScene.ts`：`MAP_SCENE_MODEL_VERSION = 2`；`normalizeMapSceneProps` 仅当输入含对应键时归一并 clamp（decimals 0–4、segments 2–10、position/mode 枚举回退、颜色走 `HEX_COLOR` 回退 spec 默认、width 0–8、type ∈ solid|dashed、minZoom/maxZoom 0.5–20 且 min≤max）；导出 `formatMapValue`。缺省值（构建器用）：`legend {show:false, position:"top-right", mode:"continuous"}`、`tooltipStyle {background:"#07121d", borderColor:"#1f2a3a", color:"#e7fbff", fontSize:12}`、`emphasis {areaColor:"#3a95fd", borderColor:"#ffffff", labelColor:"#ffffff"}`、`selected {areaColor:"#58d6ff", borderColor:"#ffffff"}`、`colorMode:"gradient"`、`colors {min:"#102b3d", mid:"#1c5f8f", max: layer.color, empty:"#0d1a26"}`、`segments:5`、`border {color:"#c0f3fb", width:1, type:"solid"}`。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/map-scene-model.spec.ts`
Expected: PASS（含既有 6 例改毕后全绿）

- [ ] **Step 5: 全量门 + 提交**

Run: `pnpm typecheck && pnpm vitest run tests && pnpm build`
Expected: 三者 exit 0（vitest 全绿）

```bash
git add src/core/model/types.ts src/core/components/mapScene.ts tests/map-scene-model.spec.ts
git commit -m "feat: map scene props schema v2 with v1 compatibility"
```

---

### Task 2: 色带构建与图例（双端 + parity 骨架）

**Files:**
- Modify: `src/core/components/mapScene.ts`（`buildMapSceneOption` regionFill 分支色带 + `buildMapLegend`）
- Modify: `src/core/export/runtime.ts`（内嵌构建器同构 + 图例 DOM）
- Modify: `src/workbench/components/MapSceneWidget.vue`（图例覆盖层）
- Create: `tests/map-scene-style.spec.ts`
- Create: `e2e/map-scene-style-parity.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `MapValueFormat`、`formatMapValue`、可选组类型与缺省值。
- Produces:
  - `buildMapLegend(props: unknown, rows: readonly Record<string, unknown>[], fields?: DatasetBinding["fields"]): Array<{ label: string; color: string } | { from: string; to: string; stops: string[] }>` — 依据首个可见 `regionFill` 层产出图例条目（连续：`{from,to,stops}`；分段：N 条 `{label,color}`；label 用 `formatMapValue`）。
  - option 内 `visualMap`：`gradient`→`{show:false, type:"continuous", min, max, inRange:{colorStops:[{offset:0,color:min},{offset:0.5,color:mid},{offset:1,color:max}]}}`；`segments`→`{show:false, type:"piecewise", pieces:[{lte:..,color},…]}`（均分 N 段，色阶在 min/mid/max 间线性插值）；无数据区域 `regions:[{name, itemStyle:{areaColor:empty}}]`（对已知省名列表缺省着色）。
  - 离线：`RUNTIME_CODE` 图例用 `createElement`/`textContent` 挂 `.cf-map-legend`。

- [ ] **Step 1: 写失败测试（工作台侧）**

`tests/map-scene-style.spec.ts`：

```ts
import { describe, expect, it } from "vitest";
import { buildMapLegend, buildMapSceneOption } from "../src/core/components/mapScene";

const rows = [
  { province: "广东省", score: 92 }, { province: "西藏自治区", score: 31 }, { province: "浙江省", score: 78 },
];
const fields = { category: "province", value: "score" };

describe("map color ramp and legend", () => {
  it("builds a three-stop continuous visualMap from min/mid/max", () => {
    const result = buildMapSceneOption({
      valueFormat: { decimals: 0, suffix: " 分" },
      legend: { show: true, position: "top-right", mode: "continuous" },
      layers: [{ id: "r", type: "regionFill", name: "热度", visible: true, style: { color: "#32d6ff", opacity: 0.85, size: 12, colorMode: "gradient", colors: { min: "#000010", mid: "#0080ff", max: "#66ffff", empty: "#0a0a14" } } }],
    }, rows, fields);
    expect(result.errors).toEqual([]);
    const vm = (result.option.visualMap as any[])[0];
    expect(vm).toMatchObject({ show: false, type: "continuous", min: 31, max: 92 });
    expect(vm.inRange.colorStops).toEqual([
      { offset: 0, color: "#000010" }, { offset: 0.5, color: "#0080ff" }, { offset: 1, color: "#66ffff" },
    ]);
    expect(result.option.geo).toMatchObject({ itemStyle: expect.any(Object) });
    expect((result.option.geo as any).regions?.[0]?.itemStyle.areaColor).toBe("#0a0a14");
  });

  it("builds piecewise segments with linearly interpolated ramp", () => {
    const result = buildMapSceneOption({
      layers: [{ id: "r", type: "regionFill", name: "热度", visible: true, style: { color: "#32d6ff", opacity: 1, size: 12, colorMode: "segments", segments: 4, colors: { min: "#000000", mid: "#808080", max: "#ffffff" } } }],
    }, rows, fields);
    const vm = (result.option.visualMap as any[])[0];
    expect(vm.type).toBe("piecewise");
    expect(vm.pieces).toHaveLength(4);
    expect(vm.pieces[0]).toMatchObject({ color: "#000000" });
    expect(vm.pieces[3]).toMatchObject({ color: "#ffffff" });
    expect(vm.pieces[1].color).toMatch(/^#/);
  });

  it("formats legend entries with valueFormat and omits hidden layers", () => {
    expect(buildMapLegend({
      valueFormat: { decimals: 1, suffix: " 分" }, legend: { show: true, position: "top-right", mode: "continuous" },
      layers: [{ id: "r", type: "regionFill", name: "热度", visible: true, style: { colorMode: "gradient", colors: { min: "#000010", max: "#66ffff" } } }],
    }, rows, fields)).toEqual([{ from: "31.0 分", to: "92.0 分", stops: ["#000010", "#66ffff"] }]);
    expect(buildMapLegend({ legend: { show: false, position: "top-right", mode: "continuous" }, layers: [] }, [], undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/map-scene-style.spec.ts`
Expected: FAIL（`buildMapLegend` 不存在；visualMap 断言不匹配现双色实现）

- [ ] **Step 3: 实现工作台色带与图例**

`mapScene.ts` regionFill 分支按 `colorMode` 产出上述 `visualMap`；`geo.itemStyle.regions` 注入空值色（省名清单取 `buildMapSceneOption` 内静态 `CHINA_REGION_NAMES` 常量，首版 34 省全称，测试内不断言清单来源）；导出 `buildMapLegend`。`MapSceneWidget.vue` 依 `props` 渲染 `.map-scene__legend`（position class、连续渐变条 or 分段色块、from/to 文本）。

- [ ] **Step 4: 实现离线同构**

`runtime.ts` 内嵌构建器同构产出 `visualMap/regions`；`safeMapScene` 内追加图例 DOM（`createElement`+`textContent`+行内样式，类名 `cf-map-legend`，位置与工作台一致）。**不允许 innerHTML。**

- [ ] **Step 5: 跑单测确认通过**

Run: `pnpm vitest run tests/map-scene-style.spec.ts`
Expected: PASS

- [ ] **Step 6: 建 parity e2e 骨架并跑**

`e2e/map-scene-style-parity.spec.ts`：复用 `map-scene-editor.spec.ts` 的种子（localStorage `addInitScript` → `/#/workbench/:id` → 读工作台 option → `import("/src/core/export/{snapshot,artifact,runtime}.ts")` 构建离线页 → 捕获 `__cfCapturedOptions`），断言 `visualMap.inRange.colorStops`、`regions[0].itemStyle.areaColor`、图例文本（工作台 `.map-scene__legend` vs 离线 `.cf-map-legend`）两侧相等。

Run: `pnpm test:e2e e2e/map-scene-style-parity.spec.ts`
Expected: PASS（1 passed）

- [ ] **Step 7: 全量门 + 提交**

Run: `pnpm typecheck && pnpm vitest run tests && pnpm build`
Expected: 三者 exit 0

```bash
git add src/core/components/mapScene.ts src/core/export/runtime.ts src/workbench/components/MapSceneWidget.vue tests/map-scene-style.spec.ts e2e/map-scene-style-parity.spec.ts
git commit -m "feat: map fill color ramp with legend and offline parity"
```

---

### Task 3: 容器样式组（标注/边线/悬停/点击态/tooltip）

**Files:**
- Modify: `src/core/components/mapScene.ts`（`geoBase` 接样式组）
- Modify: `src/core/export/runtime.ts`（同构）
- Modify: `tests/map-scene-style.spec.ts`（追加用例）

**Interfaces:**
- Consumes: Task 1 可选组与缺省值（`tooltipStyle/emphasis/selected`、图层 `style.border`）。
- Produces: `buildMapSceneOption` 产出——`geo.label = {show, color, fontSize:10, stroke, strokeWidth, textShadowColor, textShadowBlur}`（标注组，`showLabels` 总开关仍为显隐总闸：`show = view.showLabels && labelCfg.show`，labelCfg 缺省 show=true）；`geo.itemStyle.borderWidth/borderColor/borderType`（border.type="dashed" 若 ECharts geo 不支持则构建器回退 "solid" 并在 `errors` 不报错——以单测断言实际产出字段为准）；`emphasis.itemStyle` 与 `emphasis.label.color` 来自 `emphasis` 组；`selected` 经 `geo.select`/`series.select`（ECharts geo select 样式 `itemStyle`）接入；`tooltip` 来自 `tooltipStyle` 组。

- [ ] **Step 1: 写失败测试**

`tests/map-scene-style.spec.ts` 追加：

```ts
it("applies container label border hover selected and tooltip style groups", () => {
  const result = buildMapSceneOption({
    view: { showLabels: true },
    label: { show: true, color: "#eaffff", size: 13, stroke: "#013", strokeWidth: 2, shadow: "#0ff", shadowBlur: 6 },
    border: { color: "#88f", width: 2, type: "dashed" },
    emphasis: { areaColor: "#ff0000", borderColor: "#00ff00", labelColor: "#ffffff" },
    selected: { areaColor: "#00ffff", borderColor: "#ffffff" },
    tooltipStyle: { background: "#101820", borderColor: "#334455", color: "#ffffff", fontSize: 13 },
    layers: [{ id: "r", type: "regionFill", name: "热度", visible: true, style: { color: "#32d6ff", opacity: 1, size: 12 } }],
  }, rows, fields);
  const geo = result.option.geo as any;
  expect(geo.label).toMatchObject({ show: true, color: "#eaffff", fontSize: 13, stroke: "#013", strokeWidth: 2, textShadowColor: "#0ff", textShadowBlur: 6 });
  expect(geo.itemStyle).toMatchObject({ borderColor: "#88f", borderWidth: 2, borderType: expect.stringMatching(/solid|dashed/) });
  expect(geo.emphasis).toMatchObject({ itemStyle: { areaColor: "#ff0000", borderColor: "#00ff00" }, label: { color: "#ffffff" } });
  expect(geo.select?.itemStyle ?? result.option.series?.[0]?.select).toMatchObject({ itemStyle: expect.any(Object) });
  expect(result.option.tooltip).toMatchObject({ backgroundColor: "#101820", borderColor: "#334455", textStyle: { color: "#ffffff", fontSize: 13 } });
  expect((result.option.geo as any).label.show).toBe(false); // view.showLabels:false 时总闸关闭
  const off = buildMapSceneOption({ view: { showLabels: false }, label: { show: true, color: "#eaffff", size: 13 }, layers: [] }, [], undefined);
  expect((off.option.geo as any).label.show).toBe(false);
});
```

（注：末两行为总闸断言，若与前段冲突以「总闸优先」实现；一条测试内先断言开、再断言关。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/map-scene-style.spec.ts`
Expected: FAIL（样式组字段缺失）

- [ ] **Step 3: 实现（工作台）**

`geoBase`/`emphasis`/`tooltip`/`select` 按 Interfaces 接线；label 组在 `view.showLabels=false` 时强制 `show:false`；`border.type` 经 ECharts 支持性验证（Step 4 单测锁定实际字段名）。

- [ ] **Step 4: 离线同构 + 跑单测**

`runtime.ts` 同构；Run: `pnpm vitest run tests/map-scene-style.spec.ts` → PASS。

- [ ] **Step 5: parity e2e 追加断言并跑**

`map-scene-style-parity.spec.ts` 追加：label/border/emphasis/tooltip 两侧 `toEqual` 关键字段。

Run: `pnpm test:e2e e2e/map-scene-style-parity.spec.ts` → PASS

- [ ] **Step 6: 全量门 + 提交**

```bash
git add src/core/components/mapScene.ts src/core/export/runtime.ts tests/map-scene-style.spec.ts e2e/map-scene-style-parity.spec.ts
git commit -m "feat: map container style groups (labels borders hover selected tooltip)"
```

---

### Task 4: 图层样式扩展（边线/点标注/飞线流光）

**Files:**
- Modify: `src/core/components/mapScene.ts`（归一化已含字段 → 构建器消费）
- Modify: `src/core/export/runtime.ts`（同构）
- Modify: `tests/map-scene-style.spec.ts`

**Interfaces:**
- Consumes: Task 1 图层可选字段 `style.border`（regionFill）、`style.label`（geoScatter）、`style.animated`（geoFlow）。
- Produces: regionFill 系列 `itemStyle.borderWidth/borderColor/borderType` 来自 `style.border`（缺省沿用现 `#5db9d2/0.65/solid`）；geoScatter 系列 `label {show, color, fontSize, stroke, textShadowColor}`（缺省 show:false）；geoFlow 系列 `effect {show: animated, trailLength: 0.4, symbol:"arrow", symbolSize: 4}`（animated 缺省 false → 与现状 `effect:{show:false}` 等价）。

- [ ] **Step 1: 写失败测试**

```ts
it("applies per-layer border point labels and flyline animation", () => {
  const result = buildMapSceneOption({ layers: [
    { id: "r", type: "regionFill", name: "热度", visible: true, style: { color: "#336699", opacity: 1, size: 12, border: { color: "#aabbcc", width: 2, type: "dashed" } } },
    { id: "s", type: "geoScatter", name: "网点", visible: true, style: { color: "#ffcc66", opacity: 1, size: 12, label: { show: true, color: "#fff", size: 12, stroke: "#000" } } },
    { id: "f", type: "geoFlow", name: "航线", visible: true, style: { color: "#32d6ff", opacity: 1, size: 8, animated: true } },
    { id: "f2", type: "geoFlow", name: "静线", visible: true, style: { color: "#32d6ff", opacity: 1, size: 8 } },
  ] }, [{ province: "广东省", score: 9, lng: 113.26, lat: 23.13, fromLng: 113.26, fromLat: 23.13, toLng: 114.17, toLat: 22.31 }],
  { category: "province", value: "score", geo: { longitude: "lng", latitude: "lat", originLongitude: "fromLng", originLatitude: "fromLat", destinationLongitude: "toLng", destinationLatitude: "toLat" } });
  const series = result.option.series as any[];
  expect(series[0].itemStyle).toMatchObject({ borderColor: "#aabbcc", borderWidth: 2, borderType: "dashed" });
  expect(series[1].label).toMatchObject({ show: true, color: "#fff", fontSize: 12, stroke: "#000" });
  expect(series[2].effect).toMatchObject({ show: true, trailLength: 0.4 });
  expect(series[3].effect).toMatchObject({ show: false });
});
```

- [ ] **Step 2: 跑测试确认失败** — Run: `pnpm vitest run tests/map-scene-style.spec.ts` → FAIL
- [ ] **Step 3: 实现工作台构建器消费三字段**（缺省=现状视觉）
- [ ] **Step 4: 离线同构** — `runtime.ts`
- [ ] **Step 5: 跑测试确认通过** → PASS；parity e2e 追加三字段断言并跑 → PASS
- [ ] **Step 6: 全量门 + 提交**

```bash
git add src/core/components/mapScene.ts src/core/export/runtime.ts tests/map-scene-style.spec.ts e2e/map-scene-style-parity.spec.ts
git commit -m "feat: map layer style extensions (border point labels flyline animation)"
```

---

### Task 5: 皮肤注册表与一键应用

**Files:**
- Create: `src/core/components/mapSkins.ts`
- Modify: `src/workbench/components/MapSceneInspector.vue`（皮肤区）
- Create: `tests/map-skins.spec.ts`

**Interfaces:**
- Consumes: Task 1 可选组、Task 2/3/4 的样式字段路径。
- Produces:

```ts
export interface MapSkinTokens {
  background: string;
  fill: { min: string; mid: string; max: string; empty: string };
  border: { color: string; width: number };
  label: { color: string; size: number; stroke: string };
  emphasis: { areaColor: string; borderColor: string; labelColor: string };
  tooltip: { background: string; borderColor: string; color: string };
  underlay: Array<{ areaColor: string; borderColor: string; shadowColor: string }>; // 2.5D 叠片
}
export interface MapSkin { id: string; name: string; tokens: MapSkinTokens }
export const MAP_SKINS: readonly MapSkin[]; // 恰 5 套：deep-sea/jade-molten/nebula-dawn
export function applyMapSkin<T extends { presentation: "flat" | "tilted" } & Record<string, unknown>>(props: T, skinId: string): T;
// applyMapSkin：写入 valueFormat 之外的全部样式字段（colors/border/label/emphasis/tooltip/background + tilted 时 underlay 叠片），
// 设置 appliedSkin?:"<id>"，未知 skinId 原样返回；纯函数不改入参。
```

- [ ] **Step 1: 写失败测试**

`tests/map-skins.spec.ts`：断言 `MAP_SKINS.length===5`、id 唯一、每套 tokens 六组齐全且颜色全 `HEX`；`applyMapSkin(createDefaultMapSceneProps("tilted"), "jade")` 结果 `valueFormat` 缺省组保留、`colors` 被写入、`appliedSkin==="jade"`、underlay 长度 3、入参未被变异；未知 id 返回深度相等。

- [ ] **Step 2: 跑测试确认失败** → FAIL
- [ ] **Step 3: 实现 `mapSkins.ts`（纯常量+纯函数）**
- [ ] **Step 4: 检查器皮肤区** — `MapSceneInspector`「样式」组顶部 5 张预览卡（色带缩略条+名称），点击 `applyMapSkin` 写回 props；应用后各细项仍可编辑。
- [ ] **Step 5: 跑测试确认通过** → PASS；`pnpm typecheck && pnpm build` → 0
- [ ] **Step 6: 提交**

```bash
git add src/core/components/mapSkins.ts src/workbench/components/MapSceneInspector.vue tests/map-skins.spec.ts
git commit -m "feat: map skin presets with fine-grained override"
```

---

### Task 6: Inspector 分组重排、图层模板与缩放可见级别

**Files:**
- Modify: `src/core/components/mapScene.ts`（`filterLayersForZoom`）
- Modify: `src/core/export/runtime.ts`（georoam 后按 zoom 重算图层可见性）
- Modify: `src/workbench/components/MapSceneInspector.vue`（样式/数据/交互分组 + 模板）
- Modify: `src/workbench/components/MapSceneWidget.vue`（roam→zoom 变化重渲染）
- Create/Modify: `tests/map-scene-model.spec.ts`（helper 用例）、`e2e/map-scene-inspector.spec.ts`

**Interfaces:**
- Consumes: 前序全部样式字段。
- Produces:
  - `filterLayersForZoom(layers: readonly MapSceneLayer[], zoom: number): MapSceneLayer[]` — 剔除 `zoom < minZoom || zoom > maxZoom` 的层（字段缺失不剔）。
  - Inspector 结构：`样式`（皮肤、容器外观、呈现、图层列表+模板）、`数据`（原共享数据绑定迁入）、`交互`（事件说明清单+下钻开关+「导出到蓝图」按钮）三子页签；图层模板按钮：`区域热力+图例`、`散点+飞线`（按序生成 2 层）。
  - 下钻开关字段：`drill?: { enabled: boolean }`（归一可选组，缺省 `{enabled:true}` 于构建器侧；Task 8 消费）。

- [ ] **Step 1: 写失败测试（helper）**

```ts
it("filters layers by zoom range", () => {
  const layers = [
    { id: "a", type: "regionFill" as const, name: "a", visible: true, style: { color: "#336699", opacity: 1, size: 12 } },
    { id: "b", type: "geoScatter" as const, name: "b", visible: true, style: { color: "#ffcc66", opacity: 1, size: 12 }, minZoom: 3, maxZoom: 6 },
  ];
  expect(filterLayersForZoom(layers, 1).map((l) => l.id)).toEqual(["a"]);
  expect(filterLayersForZoom(layers, 4).map((l) => l.id)).toEqual(["a", "b"]);
  expect(filterLayersForZoom(layers, 7).map((l) => l.id)).toEqual(["a"]);
});
```

- [ ] **Step 2: 跑测试确认失败** → FAIL
- [ ] **Step 3: 实现 helper + 双端接入**（工作台 Widget 在 `georoam` 相机同步后若 zoom 跨阈值则用过滤后图层重建 option；离线 georoam handler 同构；**相机同步行为不得回退**——既有 e2e 断言保持绿）
- [ ] **Step 4: 跑测试确认通过** → PASS（`pnpm vitest run tests/map-scene-model.spec.ts`）
- [ ] **Step 5: Inspector 分组 + 模板 e2e**

`e2e/map-scene-inspector.spec.ts`：种子工作区 → 断言三子页签可见且「数据」页含原共享绑定字段（工作区数据集/区域名称字段…）、「样式」页含皮肤区与图层模板按钮、点「散点+飞线」生成 2 层、图层 `minZoom/maxZoom` 输入存在；`map-scene-editor.spec.ts` 既有用例保持 PASS（回归）。

Run: `pnpm test:e2e e2e/map-scene-inspector.spec.ts e2e/map-scene-editor.spec.ts` → PASS

- [ ] **Step 6: 全量门 + 提交**

```bash
git add src/core/components/mapScene.ts src/core/export/runtime.ts src/workbench/components/MapSceneInspector.vue src/workbench/components/MapSceneWidget.vue tests/map-scene-model.spec.ts e2e/map-scene-inspector.spec.ts
git commit -m "feat: datav-style inspector grouping layer templates zoom visibility"
```

---

### Task 7: 区域事件三件套（click/dblclick/updrill → 蓝图）

**Files:**
- Modify: `src/core/components/builtins.ts`（两地图组件 `events`）
- Modify: `src/workbench/components/MapSceneWidget.vue`（`chart.on("click"/"dblclick")` → `props.emitEvent`）
- Modify: `src/core/export/runtime.ts`（离线 `chart.on` → `runBlueprint`）
- Modify: `tests/map-scene-model.spec.ts`（声明断言）、`e2e/map-scene-interaction.spec.ts`（新建）

**Interfaces:**
- Consumes: `ComponentRenderProps.emitEvent(name, payload)`（ItemView 已按 `definition.events` 白名单过滤）、`dispatchComponentEvent`、离线 `runBlueprint(item, screen, event, payload)`。
- Produces: 事件名常量 `MAP_REGION_EVENTS = ["regionClick", "regionDblclick", "regionUpdrill"] as const`；载荷 `{ name: string; value: number | null; valueText: string; presentation: "flat" | "tilted" }`（updrill 载荷 `{ name: string; presentation }`，name 为上一级区域名，全国级为 `"全国"`）。

- [ ] **Step 1: 写失败测试**

单测（`tests/map-scene-model.spec.ts`）：两组件 `events` 恰含三事件且 `payloadFields` 含 `name/value/valueText/presentation`；`ItemView` 白名单负例逻辑以「未声明事件名不出现」断言（注册表层面）。

e2e（`e2e/map-scene-interaction.spec.ts`）种子：地图组件 + 表格 + 蓝图 `regionClick→setVariable selectedProvince`（与 `map-scene-editor.spec.ts` 同构种子，事件节点 `event:"regionClick"`）→ 点击广东省 → 断言 `getVariable` 生效（表格过滤或状态条）与事件恰一次；**双击**后 `regionDblclick` 恰一次且两次 regionClick（记录在案的时序行为）。

- [ ] **Step 2: 跑测试确认失败** — Run: `pnpm vitest run tests/map-scene-model.spec.ts && pnpm test:e2e e2e/map-scene-interaction.spec.ts` → 均 FAIL
- [ ] **Step 3: 实现 builtins 声明 + 工作台发射 + 离线 `runBlueprint` 同构**（离线在 `safeMapScene` 内 `chart.on("click")` 取 `params.componentType==="geo"||"series"` 的 `params.name`，从当前 option/rows 反查 value→`valueText=formatMapValue`）
- [ ] **Step 4: 跑测试确认通过** → 两项 PASS；parity e2e 追加「离线点击同样触发蓝图」断言（复用 editor spec 的离线页 harness）
- [ ] **Step 5: 全量门 + 提交**

```bash
git add src/core/components/builtins.ts src/workbench/components/MapSceneWidget.vue src/core/export/runtime.ts tests/map-scene-model.spec.ts e2e/map-scene-interaction.spec.ts e2e/map-scene-style-parity.spec.ts
git commit -m "feat: map region blueprint events (click dblclick updrill)"
```

---

### Task 8: 镜头式下钻与面包屑

**Files:**
- Modify: `src/core/components/mapScene.ts`（`computeRegionCenter`、`interpolateDrillView`）
- Modify: `src/workbench/components/MapSceneWidget.vue`（tween + 面包屑 + Esc）
- Modify: `src/core/export/runtime.ts`（同构，textContent DOM）
- Create: `tests/map-scene-drill.spec.ts`
- Modify: `e2e/map-scene-interaction.spec.ts`

**Interfaces:**
- Consumes: `drill.enabled`（Task 6）、`regionDblclick/regionUpdrill` 事件（Task 7）、`georoam` 相机同步（既有）。
- Produces:
  - `computeRegionCenter(geoJson: unknown, name: string): [number, number] | null` — FeatureCollection 中按 `properties.name` 找 Feature，压平 GeometryCollection/Polygon/MultiPolygon 坐标取 bbox 中点。
  - `interpolateDrillView(from: {center:[number,number]; zoom:number}, to: {center:[number,number]; zoom:number}, t: number): {center:[number,number]; zoom:number}` — 线性插值（t∈[0,1] clamp）。
  - 会话状态：`drillStack: Array<{center:[number,number]; zoom:number; regionName:string}>`（仅组件内部，不持久化）；面包屑 DOM `.map-scene__breadcrumb` / `.cf-map-breadcrumb`。

- [ ] **Step 1: 写失败测试（纯函数）**

`tests/map-scene-drill.spec.ts`：用内嵌小型 GeoJSON fixture 断言 `computeRegionCenter`（Polygon 中点、MultiPolygon 跨片 bbox、未知名 null、GeometryCollection 递归）；`interpolateDrillView` 端点与 clamp、中心插值。

- [ ] **Step 2: 跑测试确认失败** → FAIL
- [ ] **Step 3: 实现纯函数** → PASS
- [ ] **Step 4: 工作台交互** — dblclick（drill.enabled）→ `computeRegionCenter(chart.getMapGeoJson? 以 `echarts.getMap("china").geoJson` 取数) → rAF 350ms tween（`requestAnimationFrame`，每帧 `setOption` 中心/缩放，`lazyUpdate`），入栈原视角 → 面包屑 `全国 › 广东省`（textContent）；点面包屑/Esc → 出栈回退并 `emitEvent("regionUpdrill", {name, presentation})`；tween 中触发的 georoam 同步照常（四层对齐断言不回退）。
- [ ] **Step 5: 离线同构** — `RUNTIME_CODE` 同构（`document.createElement`+`textContent`；rAF 可用性兜底 `setTimeout` 16ms——离线单文件打开环境允许）。
- [ ] **Step 6: e2e 行为**

`e2e/map-scene-interaction.spec.ts` 追加：双击广东省 → 轮询 center≈省中心、zoom 提升、面包屑文本 `全国 › 广东省` 可见 → Esc → center/zoom 回到原值、`regionUpdrill` 事件触发一次（蓝图状态条断言）；`drill:{enabled:false}` 种子下双击不出现面包屑。

Run: `pnpm test:e2e e2e/map-scene-interaction.spec.ts` → PASS

- [ ] **Step 7: 全量门 + 提交**

```bash
git add src/core/components/mapScene.ts src/workbench/components/MapSceneWidget.vue src/core/export/runtime.ts tests/map-scene-drill.spec.ts e2e/map-scene-interaction.spec.ts
git commit -m "feat: lens drill-down with breadcrumb and camera tween"
```

---

### Task 9: 蓝图动作深合并与地图预设模板

**Files:**
- Modify: `src/core/blueprint/runner.ts` + 工作台组件 props 写入路径（setComponentProps 实现处）
- Modify: `src/core/export/runtime.ts`（离线 setComponentProps 已用 `safeMerge`——以测试确认，不一致则统一）
- Modify: `src/workbench/BlueprintEditor.vue`（地图预设动作）
- Create: `tests/map-scene-actions.spec.ts`

**Interfaces:**
- Consumes: 既有 `componentAction { action:"setProps", componentId, componentVersion, props }`、`BlueprintContext.setComponentProps`。
- Produces: 嵌套深合并语义（`view` 部分写入不丢兄弟键）两侧一致；预设动作模板（编辑器内地图组件选中时可插入）：`定位到区域`（setProps `view.center/zoom` 字面量占位）、`上钻一层`、`复位视角`（`view` 回默认中心 `[104.114129, 35.550339]` zoom 1.05）。

- [ ] **Step 1: 写失败测试**

`tests/map-scene-actions.spec.ts`：以 mock context 跑 runner——`setProps {view:{zoom:4}}` 后 `view.center` 保留原值、`zoom===4`（工作台 store 写入路径同断言）；离线侧以现有 `safeMerge` 行为断言（导入 runtime 导出的 merge 或经 export-e2e 捕获）；未提供 `view` 键时整组不动。

- [ ] **Step 2: 跑测试确认失败** → FAIL（若现状为浅覆盖）
- [ ] **Step 3: 统一深合并（仅必要处）** → PASS
- [ ] **Step 4: BlueprintEditor 预设模板 + typecheck/build**
- [ ] **Step 5: 联动 e2e** — `e2e/map-scene-interaction.spec.ts` 追加：区域点击 → setVariable → `componentAction setProps {view:{zoom}}` → 轮询地图 zoom 变化（事件→动作闭环）。
- [ ] **Step 6: 全量门 + 提交**

```bash
git add src/core/blueprint/runner.ts src/core/export/runtime.ts src/workbench/BlueprintEditor.vue tests/map-scene-actions.spec.ts e2e/map-scene-interaction.spec.ts
git commit -m "feat: blueprint map action presets with deep prop merge"
```

---

### Task 10: 视觉收口、v1 兼容回归与验收

**Files:**
- Modify: `e2e/map-scene-visual.spec.ts`（扩展截图与断言）
- Modify: `docs/superpowers/specs/2026-11-11-chartforge-map-datav-design.md`（§9 验收清单勾选记录）
- Modify: `docs/superpowers/plans/2026-11-11-chartforge-map-datav-optimization.md`（完成记录）

**Interfaces:** 无新代码接口；消费前序全部能力。

- [x] **Step 1: 扩展视觉 spec**

新增截图与断言：分段色带（`visualMap.type==="piecewise"`）、图例可见（`.map-scene__legend` 文本）、皮肤应用后 `colors` 变化（应用「翡翠青绿」截图）、下钻后视角+面包屑、悬停态（`emphasis` 字段断言即可，hover 截图可选）、v1 种子（仅旧字段）加载后与现状等价（结构断言：4 叠片/geoIndex 3/无新键）。

Run: `pnpm test:e2e e2e/map-scene-visual.spec.ts` → PASS；目检新截图（同步本地工作区供人工确认）。

- [x] **Step 2: 全量质量门**

Run: `pnpm typecheck && pnpm vitest run tests && pnpm build && pnpm test:e2e`
Expected: 全部 exit 0（e2e 全量含 style-parity/inspector/interaction/visual/editor）

- [x] **Step 3: 安全与仓库卫生**

Run: `git diff --check`；对 `src/core/export` grep `eval\(|new Function|innerHTML|https?://`（仅许可文本）；`git status --porcelain` 仅预期文件。

- [x] **Step 4: 验收清单与文档提交**

Spec §9 四条逐项记录到 spec 文末「验收记录」；计划文件补执行记录。

```bash
git add e2e/map-scene-visual.spec.ts docs/superpowers/specs/2026-11-11-chartforge-map-datav-design.md docs/superpowers/plans/2026-11-11-chartforge-map-datav-optimization.md
git commit -m "test: map datav optimization visual acceptance and spec checklist"
```

- [x] **Step 5: 整分支评审（会话内，无子代理）** — 全量 diff 通读 + 计划/spec 逐条核对 → Critical/Important 当轮修复，Minor 记 `Final: minor (deferred)`；随后 executing-plans 收尾（台账清理 → finalize_changes → 验收报告 → finishing-a-development-branch 菜单）。
