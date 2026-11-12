# ChartForge 地图大屏 DataV 对标优化设计稿

- 日期：2026-11-11
- 状态：**待人工批准**（brainstorming 阶段产物；批准后进入 writing-plans）
- 分类：architectural（涉及持久化 props 契约、渲染器、离线运行时、Inspector、蓝图）
- 对标来源：阿里云 DataV 官方文档（地图容器 v4.x、区域下钻热力层、自定义区域下钻层、基础多边形层、Atlas SDK 飞线参数），见 §10 参考
- 既定决策（用户确认）：**全面对标、分阶段（先样式后交互）**；下钻=**镜头式**（不引入新地理数据）；皮肤=**预设+可微调**；蓝图=**事件+动作完整联动**

## 1. 产品目标

优化地图图表的**样式、配置项、使用方式**，让用户在右侧面板内以 DataV 质感完成地图大屏搭建（不写代码、不改 JSON）。

成功标准：

1. **样式**：区域填色有层次（三色映射/分段色带），标注可精调（字号/描边/阴影），边线、悬停、图例、流线动画可配；一键皮肤预设后仍可逐项微调。
2. **配置项**：DataV 式完整面板分组（容器/样式/图层/数据/交互），图层有可见缩放级别，数值有格式化（小数/单位），tooltip 与图例可读。
3. **使用方式**：双击省份平滑下钻定位、面包屑返回、Esc 上钻；区域点击/双击事件进蓝图驱动联动；离线导出行为与工作台完全一致。

## 2. 范围与非目标

### 2.1 纳入（三阶段，先样式后交互）

- **Phase A 样式与质感**：schema v2 样式字段、色带（连续三色+分段）、标注样式、边线、悬停/点击态、图例、tooltip、飞线动画、皮肤预设库（约 5 套原创深色/浅色大屏皮肤）。
- **Phase B 面板与使用方式**：Inspector 重排为 DataV 式分组页签（样式/数据/交互）、图层可见缩放级别、数值格式化、图层快速添加模板、空状态与引导。
- **Phase C 交互与联动**：区域单击/双击/上钻三事件（载荷 name/value）、双击镜头下钻+面包屑+Esc、蓝图动作打通（`setProps` 深合并 + 编辑器预设动作）、离线运行时事件对等。

### 2.2 非目标（本期明确不做）

- 真市级边界/新 GeoJSON 资产（镜头式下钻代替；市级边界另立规格）。
- adcode 字段：`china.json` 无 adcode 数据，事件载荷用 `name`+`value`（后续引入带 adcode 的地理数据时再扩展）。
- 图片/瓦片底图、真 3D/DEM、API 轮询数据（数据侧沿用既有静态/HTTP 数据集能力，无地图专用改动）。
- 国界/海岸/省界**分级**边线（ECharts 单 geo 单边框样式，近似项：外轮廓高光+内省界可配色宽）。
- 与 DataV 的组件逐像素一致；不引入任何运行时网络请求。

### 2.3 硬约束

- 完全离线、无 `eval`/`new Function`/`innerHTML`/外链；props 纯白名单投影（`normalizeMapSceneProps`）。
- **工作台渲染与离线 `RUNTIME_CODE` 双端一致**（新增字段两侧同构实现 + parity 测试断言）。
- 旧工作区兼容：`MAP_SCENE_MODEL_VERSION` 1→2，v1 props 归一化补默认值，不破坏既有大屏。
- 不新增 npm 依赖；不建 worktree，原地开发于 `feature/chartforge-datav-lite`；**不使用子代理**（用户既定指令）。

## 3. 当前基础与主要缺口

**基础**（保持不动的骨架）：容器+图层模型与 DataV「地图容器+子图层」同构；容器共享数据绑定、图层独立覆盖；4 类图层（区域填色/散点/热力/飞线）；平面/2.5D 两种呈现；2.5D 四层叠片已验收（P1–P4）；蓝图已有 `componentEvent`/`componentAction(setProps/setVisibility)` 完整管线；右栏已有组件检查器挂载点（`MapSceneInspector` 三段式：地图容器/地图图层/共享数据绑定）。

**缺口**（对标 DataV）：

| 维度 | DataV 有 | 我们现状 |
|---|---|---|
| 填色 | 最大/最小/空值三色映射、分段 | 固定双色 `[#102b3d→色]`，`visualMap.show=false` |
| 标注 | 字体/字号/颜色/描边/阴影/显隐 | 仅 `showLabels` 布尔，颜色字号写死 |
| 边线 | 颜色/粗细/虚线线型 | 写死 `#c0f3fb/1`、区域层 `#5db9d2/0.65` |
| 图例 | 连续/分段图例 | 无 |
| 皮肤 | 填充设置/皮肤一键 | 无 |
| 交互 | 单击/双击/上钻抛 adcode→蓝图 | 无事件（`events: []`） |
| 下钻 | 双击下钻定位+上钻 | 无 |
| 悬停/点击态 | 悬停比例/动画/点击态 | ECharts 默认 emphasis |
| 配置组织 | 样式/数据/交互三页签+搜索配置 | 单列三个 section，平铺 |
| 图层可见级别 | 按缩放级别显隐 | 无 |

## 4. 数据模型（schema v2）

`MapSceneProps` 白名单扩展（全部有默认值，normalizer 拒绝未知值策略不变）：

```ts
// 容器级新增
valueFormat?: { decimals?: number; suffix?: string };          // 图例/tooltip/事件载荷统一格式
legend?: { show: boolean; position: "top-right"|"bottom-right"|"bottom-left"; mode: "continuous"|"segments" };
tooltipStyle?: { background?: string; borderColor?: string; color?: string; fontSize?: number };
emphasis?: { areaColor?: string; borderColor?: string; labelColor?: string };  // 悬停态
selected?: { areaColor?: string; borderColor?: string };        // 点击态持久高亮
// 图层 style 扩展（regionFill）
style: { color, opacity, size,
  colorMode?: "gradient" | "segments";                          // 连续 or 分段
  colors?: { min: string; mid?: string; max: string; empty?: string };  // 三色映射+空值色
  segments?: number;                                            // 分段数 2–10
  border?: { color: string; width: number; type?: "solid"|"dashed" };   // 线型为验证点，geo 不支持则降级 solid
}
// 图层 style 扩展（geoScatter/geoHeatmap/geoFlow）
style: { …, label?: { show: boolean; color: string; size: number; stroke?: string };  // 点标注
         animated?: boolean }                                   // 飞线流光（geoFlow）
```

- `MAP_SCENE_MODEL_VERSION: 1 → 2`；`normalizeMapSceneProps` 对 v1 输入补 v2 默认值（等价现状视觉），回归既有 463 测试。
- **皮肤不新增持久化字段**：皮肤=把一组具体样式值写入 props（应用即所见，微调即改写），保留 `appliedSkin?: string` 仅作展示记录（可选）。
- 皮肤注册表 `src/core/components/mapSkins.ts`：`{ id, name, tokens: {区域填色三色/渐变、边线、标注、背景、强调、阴影、2.5D 叠片色} }`，常量纯数据、离线可用；首发 5 套原创：深海科技蓝、翡翠青绿、熔岩橙红、紫夜星河、晨曦浅色（浅色用于浅色大屏验证）。

## 5. Phase A 样式与质感

1. **色带**：`regionFill` 构建器按 `colorMode` 产出 `visualMap`——`gradient` 连续三色（min/mid/max 经 `inRange.colorStops`），`segments` 分段（`type:"piecewise"`, `splitNumber` 或 `pieces` 均分，`inRange` 色阶取三色插值）；`empty` 色用于无数据区域（`regions` 或缺省色）。
2. **标注**：容器级标注样式组（显隐/颜色/字号/描边色宽/阴影色模糊），散点层独立点标注开关与样式；`formatter` 支持 `name` 与 `name + 值(按 valueFormat)`。
3. **边线与质感**：区域边线颜色/粗细/线型；`emphasis` 悬停态与 `selected` 点击态配色；tooltip 配色三件套；2.5D 叠片色纳入皮肤 tokens；飞线 `animated` 打开 ECharts `effect` 流光（内置能力，离线安全）。
4. **图例**：自绘 HTML 覆盖层（渐变条或分段色块 + min/max 值按 valueFormat 格式化），位置三选一，随图层数据自动生成。
5. **皮肤**：检查器「皮肤」区一键应用（5 张预览卡），应用后所有细项仍可编辑；2.5D/平面同一皮肤 tokens 适配。
6. 产出：构建器单测（色带/分段/空值/皮肤 tokens）、视觉截图回归（沿用 `map-scene-visual.spec.ts` 扩展断言与截图）。

## 6. Phase B 面板与使用方式

1. **Inspector 重排**：`MapSceneInspector` 分三组页签（沿用右栏页签机制，若无组件级路由则组件内子页签）：
   - **样式**：皮肤、容器外观（背景/边线/标注/悬停/图例/tooltip/值格式）、呈现方式（平面/2.5D/俯仰）；
   - **数据**：现共享数据绑定+字段映射迁入（内容不变）；
   - **交互**：事件清单（说明+载荷字段）、下钻开关（双击下钻启用）、蓝图联动引导（「导出到蓝图」按钮定位现有蓝图编辑器）。
   - 图层列表保留在样式组下方，图层编辑器内按类型折叠出「样式/数据」两段。
2. **图层可见级别**：每图层 `minZoom/maxZoom`（对齐 DataV 可见级别），构建器按当前 zoom 过滤图层。
3. **快速添加**：图层类型选择旁提供「模板」——如「区域热力+图例」「散点+飞线套餐」一次生成有序图层组。
4. **值格式化**：容器级 `decimals/suffix` 贯通图例、tooltip、事件载荷。
5. 空状态：无数据层提示「配置字段映射」；皮肤应用后提示可微调。

## 7. Phase C 交互与联动

1. **事件**（`builtins.ts` 声明 + 双端派发）：
   - `regionClick` / `regionDblclick` / `regionUpdrill`，载荷 `{ name: string, value: number | null, presentation }`；
   - 声明式白名单：`ItemView.emitComponentEvent` 已按 `definition.events` 过滤，工作台经 `dispatchComponentEvent` 进蓝图，离线 `RUNTIME_CODE` 内 `chart.on("click"/"dblclick")` → `runBlueprint` 同构。
   - 事件常开（无 DataV 式启用开关）——蓝图未订阅即无副作用，作为对 DataV 的简化（记录在案）。
2. **镜头式下钻**：双击区域 → 计算该省几何包围盒中心 → rAF 插值 tween（~350ms，同时插值 center/zoom，`animation:false` 下自实现）→ 画布角上面包屑 `全国 › 广东省`；点击面包屑/Esc/上钻事件 → 回退视图栈一层并抛 `regionUpdrill`。下钻状态为**会话级**（不持久化），刷新回默认视角（`view` 字段仍持久化常规视角）。
3. **蓝图动作**：复用 `componentAction.setProps` 指向地图组件（写 `view.center/zoom` 或 `view.targetRegion`），**前置条件是 `setProps` 对嵌套 props 深合并**——plan 阶段验证工作台与离线两侧 merge 语义，必要时统一为 `safeMerge`；BlueprintEditor 为地图组件增加预设动作模板（定位到区域/上钻一层/复位视角），降低手写 JSON 成本。
4. **联动示范**：区域点击 → `setVariable` → 另一组件（如 KPI/表格过滤）——作为验收用例写入 e2e。

## 8. 双端一致与安全

- 工作台 `mapScene.ts` 构建器与 `runtime.ts` 内嵌构建器同步演进；新增 **parity 测试**：同一 props+rows 双端产出 option 关键字段（色带/标注/边线/图例数据/事件载荷构造）一致。
- 事件与下钻在离线运行时全部复刻（click/dblclick/tween/面包屑 DOM 用 `createElement/textContent`，不用 `innerHTML`）。
- 白名单投影、无外链、无 eval 的既有 grep/e2e 断言继续作为门禁。

## 9. 验收标准

1. 质量门：`typecheck` / `vitest`（含新增单测+parity）/ `build` / `playwright`（既有 2 例 + 新增：色带分段、皮肤应用、双击下钻+面包屑、regionClick→变量→组件联动、离线事件对等）全绿。
2. 视觉：`map-scene-visual.spec.ts` 扩展截图（分段色带、图例、皮肤×2、下钻后视角、面包屑），人工目检通过。
3. 兼容：v1 工作区加载后视觉与现状等价（回归既有截图断言）。
4. 安全：无新增依赖；导出包 grep 无 `eval`/外链；双端行为断言通过。

## 10. 参考（阿里云 DataV 官方文档）

- 地图容器 v4.x（镜头/下钻/边界/悬停/蓝图事件动作）：help.aliyun.com/zh/datav/datav-7-0/user-guide/map-containers-of-v4-x
- 自定义区域下钻层 v3.x/v4.x、区域下钻热力层 v1/v2（填充三色/标注/边线/交互抛 adcode）：help.aliyun.com 相应条目
- 基础多边形层 4.0（图形交互点击态）、Atlas SDK（飞线流光参数）

## 11. 执行方式（计划批准后生效）

- `superpowers:writing-plans` 产出分任务计划 → 人工批准 → `superpowers:executing-plans` **会话内连续执行**（无子代理、不建 worktree、每任务 RED→GREEN+质量门+提交，收尾整分支评审+台账清理）。

## 验收记录（实施完成）

1. **质量门**：`pnpm typecheck` 0；`pnpm vitest run tests` **487/487**；`pnpm build` 0；`pnpm test:e2e` **11/11**（editor / inspector / interaction×3 / style-parity×3 / tilted-drill / visual×2）；`git diff --check` 0。
2. **视觉**：`e2e/map-scene-visual.spec.ts` 产出截图 01–09（结构与拖拽对齐 / 广东 / 西藏 / 窄容器 / 分段色带+分段图例 / 皮肤翡翠青绿与晨曦浅色 / 下钻面包屑），已同步本地逐张目检通过。
3. **v1 兼容**：旧形状 props 加载后遗留双色 visualMap、无空值色 regions、无图例、归一化键集不变（e2e 断言）。
4. **安全**：`src/core/export` 无 eval/new Function/innerHTML/外链（仅许可文本与本地 serve 提示）；无新增依赖；src/e2e 无 console.log/debugger/TODO 残留。
5. **整分支评审（会话内，无子代理）**：**Critical 0 / Important 0 / Minor 1**（离线真实渲染级的区域点击事件 e2e 延后——已以 RUNTIME_CODE 接线契约断言补强）；评审中发现并修复 tilted 下钻探针与散点层碰撞的测试问题，新增 `map-scene-tilted-drill.spec.ts` 钉住 2.5D 旗舰路径（含 Esc 后四层对齐断言）。
