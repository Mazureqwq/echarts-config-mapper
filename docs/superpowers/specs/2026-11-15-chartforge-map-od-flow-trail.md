# ChartForge 地图：OD 飞线流动拖尾（Task 13-a）设计稿

> 状态：**已实现并通过门禁**（v2：放弃 line-dasharray，改用 Canvas2D 覆盖层）。
> 上位设计：`docs/superpowers/specs/2026-11-12-chartforge-map-webgl-design.md`（§6.5 记录 Task 13-b）。
> 执行计划：`docs/superpowers/plans/2026-11-12-chartforge-map-webgl.md`（Task 13）。
> 分支：`feature/chartforge-datav-lite`；`main` 不合并。

## 1. 背景与问题

Task 10 交付地理图层时，把旧 ECharts 的 OD 飞线「流动拖尾」降级成了**静态虚线**，
并在评审记录里登记为 deferred Minor。

Task 13-b（点热力径向渐变与按值色带）已完成；按用户指定顺序，本 spec 处理
**Task 13-a：OD 飞线流动拖尾**。用户硬约束：**不能继续采用无动画静态虚线作为最终状态**。

### 1.1 旧实现的事实

`a02dbdc`（旧 ECharts）的 geoFlow 使用 `effect: { show: false }`，即旧实现本身也关闭了
流动特效。因此本任务不是「回退」，而是在 MapLibre 上**补齐旧实现应有而未有的动效**。

## 2. 方案演进（v1 → v2）

### 2.1 v1：逐帧改写 `line-dasharray`（已废弃）

最初采用「唯一光点」图案 `[0, off, on, PERIOD]`，逐帧 `setPaintProperty` 推进 `off`：

```
流光头 dasharray = [0, s, HEAD, PERIOD]
拖尾   dasharray = [0, max(0, s - TAIL), min(TAIL, s), PERIOD]
```

**实测三个致命缺陷**（均在 headless Chromium + WebGL 上复现）：

| # | 缺陷 | 证据 |
|---|---|---|
| 1 | **dash 纹理图集会被逐帧改写耗尽** | MapLibre 把每种 dasharray 编成 `LineAtlas(256,512)` 的一行纹理（key = 数组 join），逐帧改写 ⇒ 每帧新增一行 ⇒ 约 8 秒后 `LineAtlas out of space`，飞线**整条消失**。实测：第 1.5–2.5s 可见（白像素 39 个），第 2.5s 起不可见，第 4s 复现，**第 13s 彻底消失**。 |
| 2 | **超长周期把亮斑压成亚像素** | dash 图案按总和归一化到 256px 纹理，`PERIOD` 越大亮斑占的纹素越少。`PERIOD = 500000` 时亮斑接近不可见。 |
| 3 | **每帧 `setPaintProperty` 让 source 每帧 reload** | `map.loaded()` 永远为 false（所有等待地图就绪的逻辑被卡住），T10 帧率从 60 掉到 **27**。 |

补充否证：`line-gradient` 不可用 —— `interpolate` 的输入必须是字面量，
无法用 `feature-state` 推动渐变带位置。

### 2.2 v2：Canvas2D 覆盖层（采用）

在 MapLibre 容器内叠一层**同尺寸、`pointer-events: none` 的 2D canvas**，
用 Canvas2D 直接绘制彗星：**渐隐拖尾 + 白热流光头**。

优点（逐条对应 v1 的缺陷）：

| v1 缺陷 | v2 结果 |
|---|---|
| dash 图集耗尽 | 不使用 `line-dasharray` ⇒ 无图集问题 |
| 亮斑亚像素 | 直接按像素绘制，拖尾宽 ≥ 4px、辉光半径 ≥ 6px |
| source 每帧 reload | 完全不触碰 MapLibre 图层 paint ⇒ `map.loaded()` 保持 true |
| 帧率 27 → | **帧率 60.1**（T10 实测） |

`dpr` 感知：canvas 物理尺寸 = CSS 尺寸 × `devicePixelRatio`，绘制前 `setTransform(dpr,…)`。

## 3. 样式契约（工作台与离线产物同源）

`geoFlow` 时 MapLibre 只产出 **1 个图层**（底稿）+ 1 个**覆盖层目标**：

| 产物 | 说明 |
|---|---|
| 图层 `cf-flow-<id>` | `line-color` = 图层色；`line-width` = `max(1, size/4)`；`line-opacity` = 图层不透明度；`animated` 时 `line-dasharray` = `[3, 9]`（静态虚线，既有观感） |
| `flowTrails[]` 条目 | `{ id, color, opacity, width, routes: [{ from, to, name }] }`，交给覆盖层绘制彗星 |

`animated === false` ⇒ **只产出底稿图层**，`flowTrails` 为空数组，不启动动画循环。

共享常量（工作台 `src/core/components/mapScene.ts`）：

| 常量 | 值 | 含义 |
|---|---|---|
| `FLOW_DASH_PATTERN` | `[3, 9]` | 底稿虚线节拍（MapLibre line-width 单位，既有） |
| `FLOW_TRAIL_LENGTH` | `64` | 拖尾长度（**px**，v2 起不再是 line-width 单位） |
| `FLOW_HEAD_LENGTH` | `18` | 流光头辉光直径（px） |
| `FLOW_TRAIL_SPEED` | `170` | 彗星推进速度（px/s） |

v1 的 `FLOW_TRAIL_PERIOD` / `FLOW_TRAIL_OPACITY_RATIO` / `FLOW_BASE_OPACITY_RATIO` /
`FLOW_TRAIL_FRAME_MS` 已随 dasharray 方案一并删除。

## 4. 动画语义

```
每帧（requestAnimationFrame）：
  elapsed  = now - startTime
  for 每个带动画的飞线图层：
    travel   = 该图层内最长航线在屏幕上的像素长度（map.project 起终点求得）
    position = (elapsed / 1000 * SPEED) mod travel       // 恒定像素速度
    phase    = position / travel                         // 0..1
    alpha    = fade(phase) * 图层不透明度
    for 每条航线：
      if position > 航线像素长度: 跳过（不画到航线外）
      head = from + unit * position
      tail = head - unit * min(TAIL, position)           // 起点处退化为 [0, s)
      画拖尾：线性渐变 0 → 0.4*alpha → alpha，lineWidth = max(2, width*2)
      画光头：径向渐变 白 → 航线色 0.85*alpha → 透明，半径 = max(5, width*3)
```

**回绕不可见**：周期 = 最长航线像素长度 ⇒ `position` 到达 `travel` 时彗星恰好
越过最长航线终点（更短的航线早已结束）；而 `fade` 在周期两端为 0：

```
fade(phase) = smoothstep(0, 0.08, phase) × (1 − smoothstep(0.92, 1, phase))
```

⇒ 归零瞬间彗星全透明，跳变被彻底掩盖。

### 4.1 生命周期

- 工作台：`MapSceneWidget.vue` 在 `map.on("load")` 后用 `hostEl` 创建覆盖层；
  样式/数据重建时 `refresh(flowTrails)` 换目标；`onBeforeUnmount` 调 `stop()`
  （取消 rAF + 移除 canvas）。
- 离线：`cfStartFlowTrail(map, container, flowTrails)` 在 `map.on("load")` 后启动，
  `charts.push({ dispose })` 里 `stop()` 后再 `map.remove()`。

### 4.2 双端一致性

离线 runtime 是内联字符串，无法 import，因此 `runtime.ts` 内有一份**逐项等价**的实现
（同样的常量、同样的 `fade`、同样的渐变与宽度公式）。phase 是实时量，
parity 只比对**结构**（图层 id 集合、覆盖层挂载、相位在推进、像素可见）。

## 5. 验收标准

| # | 验收点 | 验证方式 |
|---|---|---|
| A1 | `geoFlow` + `animated: true` ⇒ 底稿图层 + `flowTrails` 目标；`animated: false` ⇒ 只有底稿、`flowTrails === []` | vitest `tests/map-libre-scene.spec.ts` |
| A2 | 不再产出 `cf-flow-trail-*` / `cf-flow-head-*` 图层（dasharray 方案已废弃） | vitest + e2e |
| A3 | 相位语义：`fade(0)=0`、`fade(1)=0`、中段 `=1`；相位恒在 `[0,1)` | vitest `tests/map-flow-trail.spec.ts` |
| A4 | 几何：光点沿航线推进、拖尾固定在后方 `TAIL`、越过终点标记 `finished`、零长航线不产生 NaN | vitest |
| A5 | **可见性（回归 v1 的核心缺口）**：覆盖层 canvas 上必须有实画像素（`painted > 100`）、必须出现接近白色的光头（`bright > 0`）、彗星质心随时间位移（`> 3px`） | e2e 像素采样 |
| A6 | 双端（工作台 / 离线 `file://`）都挂载 `canvas.cf-flow-trail-overlay` 且相位在推进 | e2e |
| A7 | 不再有「帧率掉一半 / `map.loaded()` 永久 false」的回归 | 手工诊断（60.1 FPS / loaded=true） |
| A8 | 无泄漏：卸载后无 rAF；离线产物反复生成不报错 | e2e + vitest |
| A9 | 门禁全绿：typecheck / vitest 544 / build / e2e 24 / `git diff --check` 0 | CI 门禁 |

## 6. 非目标

- 不复活旧 ECharts 皮肤或 `effect` 特效体系。
- 不引入逐线图层、不引入逐帧几何重建。
- 不改 `regionFill` / `geoScatter` / `geoHeatmap` 的任何行为。

## 7. 风险

| 风险 | 缓解 |
|---|---|
| 覆盖层与地图相机不同步（缩放/拖动时错位） | 每帧在绘制前 `map.project()` 现算，天然跟随相机 |
| 覆盖层挡住地图交互 | `pointer-events: none` + `aria-hidden="true"` |
| 双端相位不一致导致 parity 抖动 | parity 只比对结构与可见性，不比对实时相位 |
| 高分屏模糊 | 按 `devicePixelRatio` 缩放 canvas 物理尺寸 |
