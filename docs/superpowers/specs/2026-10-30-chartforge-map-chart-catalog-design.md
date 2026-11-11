# ChartForge 组件目录分类与地图图表扩展设计

> 状态：已被 `2026-10-30-chartforge-map-scenes-design.md` supersede；保留为上一轮二维地图图表方案的历史记录。
> 工作区：`E:/project/github-project/echarts-project`；继续当前分支 `feature/chartforge-datav-lite`，保留已有未提交改动。

## 目标

在可放置组件目录中清楚区分普通图表与地图可视化，并以一套受控图表注册、数据绑定、编辑和离线导出链路扩展首批二维地图图表。首批地图类型为中国区域填色地图、地理散点、点热力和 OD 飞线。

面向前端/数据开发者，地图字段以显式列映射配置；数据可用于编辑预览与离线交付。DataV 只参考信息架构和地图可视化能力，不复制其素材、代码或受保护内容。

## 已确认的约束与决策

- 技术栈保持 Vue 3.5、TypeScript 5.9、Vite 8、Pinia 3、ECharts 6、Vitest 3。
- 组件和图表均使用编译期受控注册；不允许运行任意用户代码，不增加运行时插件。
- 地图用本地 ECharts 及仓库内置中国 GeoJSON；离线导出不依赖外部瓦片、字体、图片或其他网络资源。
- 继续当前分支，不切 worktree；不得未经用户选择 merge 或 push。
- 不改写旧工作区中 `map` 区域地图的数据匹配语义；旧 `ChartType`/数据配置保持可读取。
- 本轮只重分类可放置组件目录，不重做图表资产库的用户业务分类。
- 首批不做任意 GeoJSON 导入、轨迹线、3D 地球、地图下钻或在线底图。

## 现状

- `ComponentCatalogPanel` 当前分为图表、数据、装饰、基础；`ComponentCatalogEntry.source === "chart"` 通过 `chartRegistry` 生成，点击和拖放都走现有 chart action。
- `ChartType` 当前包括 `line`、`bar`、`pie`、`map`、`scatter`、`radar`；`map` 是使用本地中国省级 GeoJSON 的区域填色地图，`scatter` 是笛卡尔坐标散点。
- `DatasetBinding` 与 `LiveSource.map` 现有字段映射以 category/value/seriesField 为主。数据绑定、变量过滤、图表错误提示、工作台 ECharts 渲染和离线 payload 已经存在。
- 导出器按需注入中国 GeoJSON，目前只识别 `type === "map"`；地图新类型必须一并进入地图资源条件和离线 renderer。

## 目录分类

组件目录分为五个顶层筛选组：

1. **图表**：折线图、柱状图、饼图、常规散点图、雷达图。
2. **地图**：区域填色地图、地理散点图、点热力图、OD 飞线图。
3. **数据**：表格、指标卡、进度条组及后续数据组件。
4. **装饰**：标题栏、装饰边框及后续装饰组件。
5. **基础**：文本、图片、形状。

图表描述符声明目录分组；普通和地图图表继续由同一 `chartRegistry` 与 `source: "chart"` 目录条目承载。地图条目只在目录层归入 map 组，图表资产、画布 item 类型和图表添加流程不另建一套。搜索、计数、键盘添加、点击添加及拖放遵循现有目录行为。每类地图使用本地预览模板 allow-list，不接受外部 URL、任意 SVG/HTML 或 CSS。

普通散点仍归“图表”；地理散点归“地图”。旧 `map` 类型在目录中作为区域填色地图呈现，`ChartType` 的存储 key 不变。

## 地图图表与数据模型

扩展图表类型为：

- `map`：区域填色地图，保持现有 name/value 与 `china` 地图匹配规则。
- `geoScatter`：地理散点图；每行一个经纬度点，可选名称或点数值。
- `geoHeatmap`：点热力图；每行一个经纬度点与有限强度数值。
- `geoFlow`：OD 飞线图；每行提供起点、终点经纬度，可选名称/权重。

为三种新增地图定义独立、可验证的 `ChartData` 变体，不把地理经纬度强塞进笛卡尔 `xy` 数据。例如散点/热力记录持有 `longitude`、`latitude` 和相应可选/必需值；飞线记录持有 `[longitude, latitude]` 起终点。普通图表的 `category`、`nameValue`、`xy`、`radar` 数据格式继续有效。

### 字段映射

地图支持现有工作区数据集绑定和既有图表数据源流程。为 DatasetBinding 与 LiveSource 的声明式映射增加可选地理映射对象，旧字段保持不变：

- 区域填色：现有 `category` 映射地区名称，`value` 映射数值。
- 地理散点：地理映射的 longitude/latitude 必填，name/value 可选。
- 点热力：longitude/latitude/value 必填，value 是热力强度。
- OD 飞线：origin longitude/latitude 与 destination longitude/latitude 必填；name/value 可选。

数据绑定面板按 chart type 展示合适的标签和字段输入；变量过滤仍在数据转换前执行。直接输入已结构化 ChartData 的来源先经过同一类型验证；表格/对象数组经共享的按列映射转换为地图数据。字段名只是声明式对象键，不执行表达式或代码。

未绑定数据源时，各地图类型使用内置确定性样例数据。工作区序列化新增字段均为可选，不升级工作区版本；schema normalizer 仅接纳声明字段并维持旧文档兼容。

## 渲染、配置与数据流

1. 目录点击/拖放继续调用现有图表添加 action，按地图 `ChartType` 生成默认 spec 与样例数据。
2. `chartRegistry` 声明地图类型、数据 kind、数据列及样式控制；图表 Inspector 继续编辑受限 option。
3. 工作区数据集由现有 DatasetRuntime 取共享快照并先应用 `DatasetBinding.filterBy`；Direct live source 继续走既有安全请求/数据管线。两者复用同一个地理行转换和验证函数。
4. 地理散点、点热力、飞线通过 ECharts 的 `geo: "china"` 坐标系投影。区域地图继续使用现有 `map: "china"`。只注册并打包所需 ECharts 图表与 geo/heatmap/lines 组件。
5. 地图边界来自仓库内固定中国 GeoJSON，不允许地图组件自行请求网络或动态加载远程图层。地图缩略图、目录预览和数据样例均为本地资源。

## 验证与失败行为

- 必需字段映射缺失时返回地图绑定错误，不将缺字段静默填成 0。
- 经度/纬度超出合法范围、非数值坐标或必需数值无效的记录不参与绘制；若输入非空但有效记录为零，则显示清晰错误/空数据状态。
- 可选名称缺失时不阻止绘制。区域图沿用既有 name 到本地省级要素匹配规则；未匹配名称不改变其它已匹配区域。
- 数据转换函数纯函数化，按 chart type 可单测；不改变现有普通图表的数据绑定/变量过滤行为。

## 离线导出与安全

- `attachGeo` 在屏幕 payload 含 `map`、`geoScatter`、`geoHeatmap` 或 `geoFlow` 时，按需嵌入已有中国 GeoJSON；没有地图时不增加 GeoJSON。
- 离线 Runtime 注册地图一次，并按地图类型创建选项；option 与已处理的数据随 payload 序列化，不引入外部底图或地图 API。
- ZIP 与单文件 HTML 中不出现地图瓦片 URL、外部资源依赖、用户可执行表达式、`eval`、`new Function` 或 `innerHTML`。
- 组件目录预览只从有限本地 variant 映射；地图/地区/标签文本仍作为普通文本处理。

## 验收标准

1. 目录提供五个分类筛选组；搜索、计数、空结果态、键盘、点击添加和拖放对地图类型均正常。
2. 五组归属正确；普通散点在图表组，地理散点在地图组；地图目录项预览来自本地 allow-list。
3. 四种地图类型均有稳定的默认配置与样例；字段映射针对各类型显示正确，类型错误/坏坐标可预测处理。
4. 工作区数据绑定和原有直接数据源路径都能使用声明式地图字段，变量过滤与数据更新正确；普通图表和旧 map spec 不回归。
5. 工作台能本地渲染四种地图；离线 payload 对所有地图类型按需带本地边界，非地图 payload 不带边界；ZIP 与 HTML 渲染无外网依赖。
6. 自动化覆盖分类/预览/添加、地图数据转换/验证、数据绑定或 live source、schema 兼容、导出资源条件和导出 runtime。
7. `pnpm typecheck`、全量 `pnpm exec vitest run` 与 `pnpm build` 均通过。

## 本轮非目标

地图轨迹线、任意 GeoJSON 文件上传、行政区下钻、海外/自定义地图边界、在线底图、地图编辑器/图层叠加面板、3D 地球、地图资产分类、第三方插件/代码、组件市场以及无关工作台重构。

## DataV 官方参考

- 地图子组件类别（点热力、飞线、轨迹、散点、区域热力等）：<https://help.aliyun.com/zh/datav/datav-7-0/user-guide/manage-components-of-a-map-widget>
- 区域热力层：<https://help.aliyun.com/zh/datav/datav-7-0/user-guide/regional-thermal-layer-4-0>
- 矢量散点层：<https://help.aliyun.com/zh/datav/datav-7-0/user-guide/vector-scatter-layer-4-0>
- 飞线层：<https://help.aliyun.com/zh/datav/datav-7-0/user-guide/flying-line-layer-4-0>
