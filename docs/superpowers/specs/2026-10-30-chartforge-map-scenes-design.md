# ChartForge 地图场景容器与图层设计

> 状态：用户已确认“容器 + 图层 + 预设”。2026-10-30 明确参考图目标为 2.5D 矢量挤出地图：单纯旋转倾斜和真实 DEM 地形都不是当前目标；真 3D/真实地形后续另议。
> 工作区：`E:/project/github-project/echarts-project`；继续 `feature/chartforge-datav-lite`，保留已有未提交改动。

## 目标

把地图从若干独立地理系列图表纠正为地图场景：画布中放置地图容器/预设，在容器内添加、排序、显隐和配置地理图层。首版提供 2D 平面地图与参考图式 2.5D 矢量挤出地图；2.5D 以真实省界多边形的顶面、侧壁/叠层、阴影和高光塑造厚度，不是单纯把平面 rotateX，也不表示真实海拔；可旋转真实 3D 地球和 DEM 地形不在当前范围。

DataV 只参考信息架构和能力，不复制品牌素材、数据、代码或受保护资产。保留 ChartForge 离线交付、受控注册、安全及可扩展方向。

## 已确认决策与约束

- 地图库采用“容器 + 图层 + 预设”；首版预设为 2D 平面地图、2.5D 立体地图。旧 tilted component ID 为兼容字段，不再宣称只提供斜面倾角。
- `regionFill`、`geoScatter`、`geoHeatmap`、`geoFlow` 是图层类型，不再是并列地图目录卡片。
- 真 3D 地球、WebGL 地形和 DEM 均延期；首版 2.5D 只从本地 GeoJSON 几何生成可控的矢量挤出侧面/层叠厚度，允许轻微构图透视但不能只靠倾斜角度。不得引入高程采样或全国地形栅格。
- 技术栈 Vue 3.5、TypeScript 5.9、Vite 8、Pinia 3、ECharts 6、Vitest 3；编译期受控注册，不允许运行任意代码或运行时插件。
- 使用仓库本地中国 GeoJSON；离线交付不能依赖地图瓦片、在线地图、网络字体或远程图像。
- 旧 `ChartType: "map"`、区域名称/数值匹配规则及其工作区文件保持兼容。旧地理系列数据格式可继续读取，但从顶层地图目录隐藏。
- 当前分支保持不变，不切 worktree，不未经选择 merge/push；保护既有未提交改动，不整文件暂存或提交。

## DataV 参考结论

DataV 设计库展示平面区域地图、3D 省份地图、3D 中国地图与 3D 地球等地图成品；地图容器承载多个子图层，并能排序/显隐。基础平面地图支持镜头倾斜，3D 平面地图有独立地形/拉伸和镜头控制；地球容器有球体、投影与视点设置。首版采用其“场景容器 + 子层 + 可复用预设”信息架构，但只实现 2D/2.5D。

官方参考：
- 设计库：<https://help.aliyun.com/zh/datav/datav-7-0/user-guide/design-library>
- 基础平面地图容器：<https://help.aliyun.com/zh/datav/datav-7-0/user-guide/map-container-4-0>
- 3D 平面地图容器：<https://help.aliyun.com/zh/datav/datav-7-0/user-guide/map-containers-of-v4-x>
- 地图子组件管理：<https://help.aliyun.com/zh/datav/datav-7-0/user-guide/manage-map-subcomponents-4-0>
- 3D 地球容器（后续参考）：<https://help.aliyun.com/zh/datav/datav-7-0/user-guide/earth-container-1>

## 受控模型与目录

两个编译期注册的 `ComponentDefinition` 预设共用 MapScene renderer：

- `chartforge.map-scene-flat@1`：“2D 平面地图”，presentation=`flat`。
- `chartforge.map-scene-tilted@1`：目录展示名改为“2.5D 立体地图”，持久化 presentation=`tilted` 仅为既有组件 ID/文档兼容；它表示矢量挤出表现，不再承诺通过倾角完成视觉效果。

两项属于目录 `map` 组，放置为已有 `ComponentItem`；不新增动态插件/任意组件运行时。旧区域 `map` 图表继续可读和导出。新的顶层地图卡片是地图容器预设，不是散点/热力/飞线。

```ts
type MapLayerType = "regionFill" | "geoScatter" | "geoHeatmap" | "geoFlow";
interface MapLayer {
  id: string;
  type: MapLayerType;
  name: string;
  visible: boolean;
  style: { color: string; opacity: number; size: number };
}
interface MapSceneProps {
  presentation: "flat" | "tilted";
  pitch: number;
  layers: MapLayer[];
}
```

只接受上述 layer kinds/字段；数组顺序为绘制顺序。Inspector 通过控件增加、删除、上移/下移、显隐、重命名和编辑基本样式；不得执行 JSON 内含代码/markup。normalize、快照和 runtime 各层都复核 allowlist 与数值界限。

## 数据绑定

首版每个地图场景使用一个既有 `DatasetBinding`，各图层共享已过滤的行集，避免引入新的动态数据源运行机制：

- `fields.category`、`fields.value` 映射区域名称和值；旧 map chart 的匹配语义独立保持。
- `fields.geo.longitude/latitude`、可选 `name/value` 用于地理散点；点热力需要 `longitude/latitude/value`。
- `fields.geo.originLongitude/originLatitude/destinationLongitude/destinationLatitude`、可选 `name/value` 用于 OD 飞线。
- `filterBy` 在所有图层转换前运行；字段名是声明式对象键，绝不解释为表达式。

Inspector 提供地图场景专用的共享字段映射。独立图层数据集、任意 GeoJSON 上传、下钻和用户 transform 不在本轮范围。

## 渲染与错误状态

- 工作台 MapSceneWidget 将可见层组合成 ECharts option，复用共享地理转换 helper 和本地中国 GeoJSON。
- `flat` 使用正常平面 geo 视图；`tilted`（新 UI 名称“2.5D 立体地图”）必须从本地中国 GeoJSON 多边形构造顶面与有方向的矢量侧壁/多层切片，并用明暗/描边表现厚度。仅 `perspective`/`rotateX` 不合格；不读取 DEM/海拔、不生成真实地形。省界、区域填色、数据点/飞线需使用同一投影并层序清晰，标记与文字位于顶面之上。实现可在受控 SVG/Canvas/ECharts 内置渲染路径间做小型 POC 选择，不引入插件或外部资源。
- region fill 使用区域名称/数值；scatter、heat、flow 使用显式经纬度映射；点位越界、非有限坐标、必要映射缺失不能伪造为 (0,0)。全无效行清晰报告/空态。
- 空图层数组回退到本地底图；普通旧 map chart 走原渲染路径。

## Inspector UX

MapScene 专用配置包括：地图预设、有限的挤出厚度/方向（若 POC 证明需要再持久化）、共用数据集与字段映射，以及可访问图层列表。历史 `pitch` 字段只为兼容读取，不把旧角度值重新解释成厚度。图层菜单固定 allowlist，仅 region-fill/scatter/heat/flow。每层可排序、启停、重命名、删除和编辑基本 color/opacity/size；不提供通用 JSON 编辑器作为主体验。组件目录预览为固定内嵌原创 SVG，未知 preview key 回退通用模板。

## 离线导出与安全

- 快照只保留 MapScene 受控 props/layers 和选中屏幕引用数据集的行快照。
- `attachGeo` 对旧 map chart 或任一地图场景按需嵌入仓库中国 GeoJSON；非地图 payload 不增加该资源。
- Runtime 注册一次本地 GeoJSON，按允许层型读取数据集和字段映射，按蓝图过滤变量刷新；与工作台保持同样坐标界限与缺字段行为。
- ZIP 与单文件 HTML 不加载外部瓦片/图片/脚本，不发起地图网络请求，不引入 `eval`、`new Function`、`innerHTML` 或任意用户代码；保留 CSP `connect-src 'none'`。

## 兼容性

- `ComponentItem` 按受控 `componentId/version` 持久化，旧 workspace version 不升级。
- 旧 map 图表的区域名称数据、schema、资产预览和导出逻辑保持可读取/可渲染。
- 新增 map-scene layers 经过白名单 normalize；未知字段丢弃。`presentation`、图层 opacity/size 与未来新增的挤出参数有界；旧 `pitch` 可保留兼容但不是 2.5D 深度来源。
- 文案、层名称和数据值只作文本，不解析为 HTML。

## 验收标准

1. 地图组只呈现地图场景容器预设（2D 与斜面 2.5D）；地理散点、热力、填色、飞线从容器内添加。
2. Inspector 可管理图层顺序、显隐、增删、名称和受限样式；工作区重载后保持一致。
3. 参考图式 2.5D 清楚可见省级矢量顶面与有厚度的分层/侧壁；不是整图倾斜冒充立体，不依赖 DEM；边界、填色与叠加层精确对齐，数据点/文字位于顶面上方，离线编辑器/导出视觉一致。
4. 同一绑定行集通过显式字段映射供多层消费；变量筛选更新所有层；坏坐标不生成伪原点。
5. 旧 map 图表继续按原地区名称/数值渲染；旧地理 ChartData 可读。
6. 离线 HTML/ZIP 只在需要时携带本地 GeoJSON，支持地图层和变量刷新，不依赖外网。
7. `pnpm typecheck`、全量 Vitest、`pnpm build` 通过；无运行时插件、用户代码、网络地图资源。

## 非目标

真实 DEM/高程地形、WebGL 真 3D 网格、可旋转地球、每层独立数据集、任意 GeoJSON 上传、在线瓦片、地图下钻、轨迹层、第三方插件/代码及无关图表资产分类。
