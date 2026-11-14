# ChartForge 地图 WebGL 渲染器（MapLibre）重构设计稿

- 日期：2026-11-12
- 状态：**待人工批准**（grill-me 拷问完毕，brainstorming HARD-GATE 的书面 spec 阶段；批准后才进入 writing-plans）
- 分类：architectural（渲染器替换：涉及组件渲染、双端导出、事件/下钻管线、测试栈重建）
- 决策来源：grill-me 五轮拷问（2026-11-12）+ `poc/maplibre-terrain/feasibility-assessment.md` 两项裁决

## 1. 决策记录（拷问收敛结果，作为本 spec 的约束）

| # | 决策项 | 结论 |
|---|---|---|
| D1 | 第一阶段主体 | **WebGL 渲染器替换**（maplibre 级），既有 ECharts 地图交互/双端栈在新渲染器上重做 |
| D2 | 离线红线 | **保持完全离线**：china geojson 内联 + WebGL 光照/雾化/真倾角旋转；**无瓦片底图、无 DEM 地形**（评估裁决：no_terrain） |
| D3 | 协议约束 | **禁用 `addProtocol` 运行时注册**（评估裁决：strict，按严格口径）——本方案不需要它（geojson 源为对象直传） |
| D4 | 废弃清单 | ECharts **2.5D 叠片挤出**与**皮肤体系（MAP_SKINS/applyMapSkin/underlay）**；其余已交付能力（色带/图例/外观控件/区域事件/镜头下钻）**迁移保留** |
| D5 | 兼容地板 | **原地替换** map-scene（组件 ID 不变）；旧 2.5D 屏必须可看不崩溃不空白（降级策略见 §5）；其余旧屏不额外承诺 |
| D6 | 验收机制 | **里程碑必验收**：每个里程碑出截图 → 人工回「继续/停/改」才进下一节点 |
| D7 | 子组件注册制重写 | **放第二阶段**（另立 spec），本 spec 不含 |
| D8 | 第一里程碑 | **WebGL 渲染基线**（见 M1） |
| D9 | 安全网 | ✅ 已执行：`0b21622..a3685f1` 推送至 origin（14 笔已验收提交留底），新分支开工 |

## 2. 产品目标与里程碑

**目标**：地图组件切换到 MapLibre WebGL 渲染，获得 DataV-Board 7.0 级的真倾角/旋转、光照与雾化质感，同时保住离线交付与既有交互能力。

- **M1 WebGL 渲染基线（第一个验收门）**：china geojson 以 MapLibre 地图渲染（fill 层省界 + 轮廓线），pitch/rotate 可交互，样式含基础光照（lights）与雾化（fog），**离线单 HTML 区域可运行**；区域点击事件冒烟可用。交付：截图 + 离线包实测 → 人工验收（继续/停/改）。
- **M2 交互迁移**：区域三事件（click/dblclick/updrill 载荷不变）、镜头下钻（maplibre `flyTo` 原生动画）+ 面包屑 + Esc、图例与外观控件（色带/标注/边线/悬停/点击态/tooltip/值格式化）在新渲染器上全部生效；双端 parity 测试重建。
- **M3 视觉质感**：分级边界的精确实现（省界线样式可配 + 外轮廓强化；china.json 无独立国界几何，外环由省级几何做精确平面并集分析重建——大陆（含海南）与台湾两条外环，行政区缝隙不产生独立外环）、视图偏移、比例尺控件（按相机分辨率自绘）、悬停动画、色质打磨 → 逐项对照 D6 验收。
- **M4 兼容与收口**：旧屏降级验证（D5 地板）、废弃项清理（皮肤/叠片）、全量质量门、整分支评审。
- 子组件注册制（D7）= 第二阶段，本 spec 交付后另立。

## 3. 范围与非目标

### 3.1 纳入
- 新增 npm 依赖 **`maplibre-gl`**（唯一新增；旧「无新增依赖」约束就此被 D1 显式取代）。
- 工作台 `MapSceneWidget` 与离线 `RUNTIME_CODE` 的地图分支改为 MapLibre 实例（双端同构，parity 延续）。
- props v2 保留并映射（见 §4 映射表）；schema 白名单归一延续。
- 既有能力迁移：事件/下钻/图例/外观控件/色带（fill 属性与表达式实现）。
- 离线包：maplibre-gl 内联（与 echarts 内联同机制），**包体预算 ≤5MB**（超出即触发方案复盘）。

### 3.2 非目标（明确不做）
- DEM 地形、`addProtocol`、瓦片底图、联网能力（D2/D3）。
- adcode/层级下钻数据（维持 name/value 载荷）。
- 子组件注册制、图层色标/固定分层管理（第二阶段 D7）。
- 移动端画布、3D 地球。
- 非地图组件不动：柱状/折线/饼图等仍走 ECharts 与 `EChartsView`；`registerMap("china")` 为既有地理图表保留。

## 4. 架构设计

### 4.1 渲染器替换（原地，组件 ID 不变）
- `chartforge.map-scene-flat/tilted` 的 renderer 从 ECharts Vue 组件切换为 MapLibre：`MapSceneWidget.vue` 持有 `maplibre-gl` 的 `Map` 实例（style 内联：`glyphs` 不使用——无瓦片文字标注走 symbol 需字体图集？**省界标注改用 HTML 覆盖层或 maplibre 本地字体**——M1 内定案，倾向 HTML 覆盖层以规避字体资源离线问题）。
- 数据流不变：白名单归一 → 构建层（原 `buildMapSceneOption` 演变为 **buildMapLibreStyle/Source**，纯函数可测）→ 双端消费。
- 离线：`RUNTIME_CODE` 地图分支实例化 MapLibre；maplibre-gl.js 随产物内联（与 echartsCode 同参数机制，新增 `maplibreCode` 注入位）。
- geojson 源：`src/assets/geo/china.json` 工作台直传对象、离线随 payload 内嵌（沿用既有 geo 资产注入路径）。

### 4.2 props → MapLibre 映射（v2 保留）
| props | MapLibre 落点 |
|---|---|
| `view.center/zoom/minZoom/maxZoom` | `center/zoom/minZoom/maxZoom` |
| `presentation: flat/tilted` + `pitch` | `pitch: 0 / pitch(默认28)`（**真倾角**，替代 CSS/叠片） |
| `view.dragEnabled/zoomEnabled` | `interactive` 与拖拽/滚轮开关组合 |
| `view.showLabels` | 省名标注层显隐（实现载体见 §4.1 末） |
| `view.backgroundColor` | `map.setBackground`/容器背景 |
| `legend/valueFormat/tooltipStyle` | HTML 覆盖层与 tooltip（逻辑复用） |
| `emphasis/selected/border` | fill 层 `fill-color/fill-outline-color` 高亮态与选中态表达式 |
| regionFill `colorMode/colors/segments` | `fill-color` 渐变/分段表达式（match/step 表达式实现色带） |
| 图层 `minZoom/maxZoom` | `filter`/图层 `minzoom/maxzoom` |
| `drill` | 下钻开关（flyTo 实现） |

### 4.3 事件与下钻
- `click/dblclick` 监听 fill 层 feature → 载荷 `{name, value, valueText, presentation}` 不变（名称从 feature properties/匹配数据取）。
- 下钻：`map.flyTo({center: 省bbox中心, zoom, essential, duration})`（替代自研 tween）；上钻 `easeTo` 回原视角；面包屑/Esc/`regionUpdrill` 蓝图链路复用既有管线。

### 4.4 双端与质量门
- 单元测试：构建器输出从 ECharts option 变为 MapLibre style/source 描述——`map-scene-*` 相关单测按新输出形态重写（487 套中受影响部分），语义断言（色带/分段/空值/事件载荷/归一化）保持等价。
- e2e：视觉/交互/parity/tilted-drill 各 spec 在 MapLibre 上重建；**M1 风险验证项**：Playwright headless chromium 的 WebGL（SwiftShader）可用性、file:// 下 maplibre blob worker 行为（离线包实测）。
- parity 新形态：工作台与离线对同一 props+rows 产出的 style/source/feature 状态一致 + 关键交互（点击载荷、flyTo 后视角）一致。

## 5. 兼容、废弃与降级（D4/D5 落地）

- **旧 tilted 屏**：`presentation:"tilted"` → MapLibre `pitch(28)` 渲染（**优于**地板要求的纯平面：保留倾角观感，失去叠片挤出层）；不得空白/崩溃（M4 验证项）。
- **皮肤**：`MAP_SKINS`/`applyMapSkin`/`underlay`/`appliedSkin` **移除**；历史屏中已被皮肤写入的具体颜色值**继续生效**（props 值还在），仅失去「一键换肤」入口。
- **v2 props**：不改结构（`pitch` 语义从旧兼容字段升为真实俯仰）；`normalizeMapSceneProps` 延续，仅删皮肤/叠片相关分支。
- ECharts 侧：`registerMap`、地理图表、`EChartsView` 全部保留（非地图组件不受影响）。

## 6. 验收标准

1. **M1 门**：截图（省界 fill+轮廓、pitch/rotate 操作后状态）+ 离线单 HTML 在 `file://` 实跑证据 + 点击冒烟；人工回「继续/停/改」。
2. **M2 门**：事件/下钻/图例/外观控件 e2e 在新渲染器全绿；双端 parity 断言通过。
3. **M3 门**：视觉逐项截图对照（分级边界精确外环/视图偏移/比例尺/悬停），人工验收。
4. **M4 门**：旧 tilted 屏降级验证截图、废弃项 grep 清零（`MAP_SKINS/applyMapSkin` 等）、全量 `typecheck/vitest/build/e2e` 绿、`git diff --check` 0、无 eval/外链、离线包体积 ≤5MB 实测、整分支评审（Critical/Important 当轮修复，Minor 记 deferred）。

## 7. 风险与开放问题

| 风险 | 缓解 |
|---|---|
| headless WebGL（SwiftShader）不可用导致 e2e 全线受阻 | M1 第一步即验证；不可用则改 Playwright `--use-gl=angle`/`webgl` 启动参数或标记 e2e 环境依赖 |
| file:// 下 maplibre blob worker 失败 | M1 离线实测；失败则评估 inline worker 方案（不引入 addProtocol，D3 不破） |
| 省名标注载体（HTML 覆盖 vs 字体图集） | M1 内定案；默认 HTML 覆盖层 |
| 测试栈重写量（option→style 断言形态） | M1 先重建最小冒烟，M2/M3 逐域迁移，避免一次性大爆炸 |
| 离线包体积（maplibre 内联） | 预算 ≤5MB；M1 记录实测基线 |

## 8. 执行方式（批准后生效）

- 流程：本 spec 人工批准 → `superpowers:writing-plans` 产出分任务计划 → 人工批准 → `superpowers:executing-plans` 会话内连续执行（RED→GREEN、每任务门禁与提交、台账）。
- **无子代理**（既定指令）、原地开发于 `feature/chartforge-datav-lite`（安全网已推送 D9）、新工作可按计划拆分支时再议。
- 里程碑 D6：M1–M4 每门前置截图验收，未过门不进下一阶段。
