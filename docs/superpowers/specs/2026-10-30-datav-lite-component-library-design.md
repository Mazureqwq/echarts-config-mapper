# DataV-lite 组件库升级设计稿

> 状态：基于对话已确认的设计；等待用户审阅本书面规格。规格获批前不进入实施计划或修改产品代码。

## 目标

把 ChartForge 左侧“组件”入口打磨成适合大屏搭建的可发现组件目录，并增加一小批 DataV 风格的受控组件。前端/数据开发者应能快速搜索、识别、配置并放置组件；组件在编辑、播放预览和离线导出中保持同一版本、同一数据快照与一致行为。

## 背景与约束

- 当前左侧“组件”页以六种图表卡片和少量数据组件为主；注册组件也在“设计库”中重复出现。目录卡片缺少用途说明、搜索和预览。
- 已有 `chartRegistry` 负责图表类型，版本化 `componentRegistry` 负责数据组件和旧元素适配器；`ItemView` 通过注册表渲染，`DatasetRuntime` 为绑定组件共享快照，离线 `RUNTIME_CODE` 使用静态受控 renderer。
- 保持 Vue 3.5、TypeScript 5.9、ECharts 6 的既有技术栈；不引入运行时插件或外部依赖。
- 继续采用编译期注册、精确组件版本和显式离线 renderer；不执行任意用户代码，不发起导出产物网络请求。
- 不改变已有工作区 schema、组件 ID/版本、旧 chart/text/image/shape 数据、数据绑定语义或 `buildPackagePayload` API。

## 目录体验

左侧资源导航保持原状。“组件”页成为唯一的组件发现入口，按以下分组浏览：

1. **图表**：从现有 `chartRegistry` 派生，继续提供 line、bar、pie、map、scatter、radar。
2. **数据**：版本化注册的数据组件，如 table、KPI、进度条组。
3. **装饰**：标题栏、边框等注册组件。
4. **基础**：现有文本、图片、形状创建流程；不迁移旧数据模型。

页面顶部提供本地搜索和分类筛选。搜索只匹配当前注册元数据中的名称、说明与标签，不请求服务。结果以可聚焦的卡片呈现名称、简短说明和本地轻量预览；卡片可点击添加，也可拖放到画布指定位置。空屏、无匹配结果、未打开屏幕时都有明确提示。筛选、搜索和预览状态不写入工作区。

“设计库”继续负责主题、可复用区块和本地图片素材，移除重复的注册组件列表。避免把主题/资产/区块与可放置组件混成一个目录。

## 注册与目录元数据

新增只读目录适配层，把三种现有来源汇总为目录条目：`chartRegistry` 的图表定义、`componentRegistry` 的精确组件版本、现有基础元素创建项。目录不拥有第二份组件 renderer 或默认 props。

注册组件可声明可选目录元数据：简短说明、搜索标签、目录分组和稳定的本地预览 key。旧定义继续有效；未提供元数据的旧项使用安全的通用图标/名称，不因此失去渲染或编辑能力。预览 key 由本地模板 allow-list 渲染，不接受任意 URL、HTML 或 CSS。

属性检查器新增受限 `color` 控件，显式值限定为规范化 `#RRGGBB`。颜色 prop 可声明 allow-list 中的 `themeToken`；未显式配置时检查器显示解析后的主题色，只有用户修改才写入 hex 值；“恢复主题色”会清除 override。其它属性仍通过现有 string/number/boolean/select/JSON 类型。组件 renderer 必须对导入工作区中不合法的 props 使用确定的安全默认值，不能把它们当成 CSS 源码执行。

## 首批新增组件

所有新增组件以独立 ID、`version: 1` 注册，默认动作仅使用已声明的 `setVisibility` / `setProps`。表格/KPI 定义和版本保持不变。

### `chartforge.progress-list` — 进度条组

- 逐条读取已绑定数据集快照中的行，按 `labelField` 与 `valueField` 显示标签、进度条和值；通过既有 `DatasetBinding` 使用数据集流水线和全局变量过滤。
- props：`labelField`、`valueField`、正数 `maxValue`、轨道色、填充色、是否显示数值。比例按 0–100% 截断；无绑定或空数据时显示可读占位状态。
- 不进行组件级 fetch；数据更新只来自共享的 DatasetRuntime/离线包快照。

### `chartforge.section-title` — 标题栏

- 展示 title、可选 subtitle、强调色和有限的样式 variant；默认尺寸适合放在数据面板上方。
- 标题始终作为普通文本节点呈现，不接受 HTML。

### `chartforge.corner-frame` — 装饰边框

- 独立可定位的透明装饰层，提供有限的内置角标/线框 variant，以及安全颜色、线宽和内缩量；不含用户内容，不覆盖或改写其它画布元素。
- 仅使用本地 CSS/SVG/DOM 绘制，不下载远程装饰图；不含动画或任意样式编辑。

主题 token 提供默认颜色；未配置颜色 prop 时继承主题，显式 hex 配置优先，用户可恢复主题继承。标题与边框组件不改变画布几何、图层顺序或其他元素样式。

## 编辑、预览和导出

- 新组件统一经 `doc.addComponent` 添加，在 `ComponentInspector` 中编辑声明 props，并沿用现有数据绑定编辑器。
- 工作台编辑画布与播放预览使用同一 Vue renderer 和组件版本；图表继续走原图表 registry。
- 离线导出必须给每个新增版本注册明确的静态 renderer。`progress-list` 读取包内快照并在蓝图过滤变量变化后重绘；装饰组件通过安全 DOM 与 textContent 生成。缺 renderer 仍按现有逻辑阻止导出。
- ZIP 与单文件 HTML 均不得产生外部资源引用、网络请求、`eval`、`new Function` 或 `innerHTML`。

## 安全、可访问性与失败状态

- 目录卡片使用语义化 button；键盘 Tab/Enter/Space 可浏览和添加，分类/搜索控件有可访问名称。
- 搜索和预览不使用 `v-html`；标题、标签、数据字段内容都作为文本节点。
- 只允许预定义的装饰 variant 与格式选项；颜色值经严格校验。旧工作区中未知组件版本仍显示现有缺失组件占位，不被错误替换。
- 进度组件对缺失字段、非数值、空数据和超上限值提供确定行为和可读状态。

## 验收标准

1. “组件”页只出现一份注册组件目录；图表、数据、装饰、基础分组可搜索和筛选，搜索可匹配名称/说明/标签，空结果有提示。
2. 卡片可以点击添加或拖动定位；键盘操作可添加组件；“设计库”仍可管理主题、区块与本地图片。
3. 新增三组件精确注册 `@1`，属性检查器只显示声明配置；progress-list 使用共享数据快照并响应既有变量过滤。
4. 编辑、播放预览、ZIP 和单文件 HTML 均支持三个新增版本；主题默认值不覆盖显式 props；旧 chart/text/image/shape 与 table/KPI 行为不回归。
5. 安全测试覆盖恶意标签文本、非法颜色值、未知 variant、外部 URL 与 renderer 缺失；离线产物无网络请求、外部资源、`eval`、`new Function`、`innerHTML`。
6. 运行 `npm run typecheck && npm test -- --run && npm run build` 全部通过。

## 非目标

首批不做运行时插件、第三方组件市场、任意 HTML/CSS/脚本、收藏/最近使用、轮播动画、多选下拉框、地图扩展或整个工作台重构。这些内容需要独立规格和安全/交互设计。

## 参考

- Alibaba Cloud DataV 7.0 轮播列表配置：<https://help.aliyun.com/zh/datav/datav-7-0/user-guide/list-carousel-1>
- Alibaba Cloud DataV 7.0 进度条组件配置：<https://help.aliyun.com/zh/datav/datav-7-0/user-guide/progress-bar>
