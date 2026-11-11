# MapLibre / 中国 DEM 离线方案评估（短版）

日期：2026-11-10  
范围：评估 POC 中固定 `addProtocol` 读取器与中国范围真实 DEM 的离线包体；**不是完整 M2 设计或实施批准**。

## 结论先行

- **架构：有条件 No-Go。** MapLibre 官方把 `addProtocol` 定义为在运行时注册自定义 URL scheme 的资源加载函数。POC 传入的 `cf-dem://` 必须依靠该注册回调，故按“禁止任何运行时注册 hook”的严格口径不符合约束。它是编译期内置、固定、不可由用户扩展的代码，并不执行用户代码；如果约束仅禁止用户可配置/可下载的插件，则可由产品架构负责人明确判定为内部适配器而接受。当前应先按严格口径处理，**不可接入正式链路**。  
- **数据：全国 30m 不适合作为每张离线导出物的默认内嵌内容。** 以项目 `china.json` 的 34 个省级边界计算，z12 有 161,162 个相交瓦片，去重后的 z0–z12 金字塔共 216,158 片。三种地貌的直接 SRTM HGT 样本经当前 POC 同款 PNG 编码后，按层级均值估算约 **28.4 GB**（仅为样本外推，未完整下载全国数据）；按三样本每层最小/最大值做情景敏感性约 20.9–36.9 GB。按同一 216,158 片计数与 AWS 混合来源样本均值 51,056 B 外推约 11.0 GB；这是另一管线的混合来源对象长度估算，不能代替单一 SRTM 估算。**
- **可行方向：** 包只含当前地图范围和用户选择的最大缩放级别，或提供区域级 DEM 素材包；不要默认把全国 30m 数据塞入单图 HTML。对小范围地图，仍须用多个真实地形样本测量边界、压缩和包体。

## 架构约束判读

MapLibre 官方 `addProtocol()` API 的用途是“注册一个自定义资源加载函数”，处理自定义 scheme 开头的 URL；其例子在 `addProtocol('custom', loadFn)` 时直接注册 handler。POC 用同一机制将 `cf-dem://tile/{z}/{x}/{y}.png` 映射到编译期固定内存瓦片。[MapLibre addProtocol API](https://maplibre.org/maplibre-gl-js/docs/API/functions/addProtocol/)

| 约束解释 | 判定 | 原因 |
|---|---|---|
| 不允许任何运行时 plugin/handler 注册 | **不通过** | `addProtocol()` 就是运行时注册自定义资源 handler；它虽是应用启动时固定注册，不是用户插件，仍跨不过字面规则。 |
| 不允许用户任意代码或用户扩展；允许内部固定 adapter | **可能通过，须书面确认** | 当前 handler 只查一块编译期确定的 tile，不执行配置中的代码，也不允许动态发现/安装。需要把可注册协议、可访问 URL、异常和数据边界封装成不可扩展的内部实现，并做安全评审。 |
| 完全不调用 `addProtocol()` | **未找到已验证的自包含 `file://` DEM 方案** | 目前通过 `file://` 的验收依赖该 handler。直接读取散装本地文件、目录式导出或换引擎均未在本轮测试。不能据此声称不存在替代方案。 |

**决策建议：** 在约束解释未澄清前，MapLibre 保持 POC-only。若必须严格禁止注册 hook，应比较 Three.js/自研内置加载器，或重新定义离线交付为由 ChartForge 受控的本地 origin 服务；后者不等于当前“单 HTML、直接 `file://`”验收。

## 数据源、许可与内容差别

| 候选 | 分辨率 / 适用范围 | 许可 / 风险 | 评估 |
|---|---|---|---|
| NOAA ETOPO 2022 15 arc-second | 约 450 m 级全球 relief；现有 POC 使用该数据 | 当前 POC 元数据标示 CC0；全域再分发仍应重新核对来源 notice | 适合全国低 zoom 总览，不适合作为城市/县级真实细节。单个样本 Terrarium tile 为 199,522 B。 |
| USGS SRTM 1 arc-second | 约 30 m；SRTM 覆盖 60°N 至 56°S，中国大陆纬度在覆盖内；官方提示部分瓦片仍有 void | USGS 标示 Public Domain；约 25 MB/1° tile（3 arc-second 全球版约 3 MB/1° tile） | 开放、易解释；必须检查中国覆盖与空洞。来源：[USGS SRTM 1 Arc-Second Global](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-digital-elevation-shuttle-radar-topography-mission-srtm-1)。 |
| Copernicus DEM GLO-30 / GLO-90 | 全球 30 m / 90 m | 官方称全球免费许可，但分发/面向公众时必须附规定来源文字；这是 DSM，包含植被、建筑等表面，不等同 bare-earth DTM | 覆盖与质量候选；署名需嵌入编辑器与导出；是否满足“地形”语义要产品确认。来源：[Copernicus DEM](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM)。 |
| AWS Terrain Tiles（Mapzen/Tilezen） | 已预切全球 256×256 Terrarium PNG；本轮读取 z10–z12 对象长度 | AWS Registry 将 Tilezen attribution 文档列为许可；瓦片数据源混合，具体 credit 依来源而定 | 仅用作本轮压缩体积样本，不作为已选生产源；对象元数据见下表说明。[AWS Registry](https://registry.opendata.aws/terrain-tiles/) / [Tilezen attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)。 |

USGS 页面披露的源数据文件大小是下载级 GeoTIFF/DTED，不等于最终 MapLibre PNG 瓦片包大小；Copernicus 的许可也不能简化成“无署名”。AWS Terrain Tiles 的 Registry 将许可指向 Tilezen attribution 文档，后者列出多个基础数据源；本轮 S3 对象元数据也出现 SRTM、GMTED2010，少数低 zoom 还出现 ETOPO1。因此这组 PNG 只能用于包体采样，不能当成同一分辨率、单一来源的中国 DEM。正式选源前需留存具体版本、tile 清单、notice 文案和处理链记录。

## 全国包体粗估

ETOPO 与 90m 的行仍是面积/分辨率粗估；30m z12 则已按项目 `src/assets/geo/china.json` 的 34 个省级 feature 做 Web Mercator 瓦片相交计数，并对祖先层去重（边界相交瓦片计入，省界共享瓦片在全国 union 中只计一次）。该计数受项目边界数据精度影响。在纬度 35°，MapLibre 256px tile 的地面像素约为：z8 501m、z9 250m、z10 125m、z11 62.6m、z12 31.3m。

| 目标数据级别 | 建议最高 zoom（约） | 最高 zoom tile 数 | 含 z0–maxzoom 祖先层 | 粗略用途 |
|---|---:|---:|---:|---|
| ETOPO 约 450m | z8–z9 | 约 600–2,400 | 约 800–3,200 | 全国总览；z9 已对源数据过采样 |
| 全球 90m | z10–z11 | 约 9,000–37,000 | 约 12,000–50,000 | 全国低/中 zoom；z11 更细但过采样 |
| 全球 30m | z12 | 161,162（项目省界相交计数） | 216,158（项目省界相交，z0–z12 祖先去重） | 全国中高 zoom，数据量最大 |

30m 的祖先层采用项目省界相交后的逐级去重计数；450m/90m 仍按理想嵌套近似 `maxZoom tile 数 × 4/3`。输出 PNG 包体敏感性如下（**平均每片大小是情景值，不是全国实测均值**）：

| 金字塔数量 | 25 KB / 片 | 50 KB / 片 | 100 KB / 片 | 200 KB / 片（当前单样本量级） |
|---:|---:|---:|---:|---:|
| ETOPO z8，约 800 片 | 20 MB | 40 MB | 80 MB | 160 MB |
| 90m z11，约 50,000 片 | 1.25 GB | 2.5 GB | 5 GB | 10 GB |
| 30m z12，216,158 片（项目省界相交计数） | 5.4 GB | 10.8 GB | 21.6 GB | 43.2 GB |

独立原始数据量校验：960 万 km² 按 30m×30m 网格约 107 亿个样本；仅 16-bit 单波段原始值约 21.3 GB，尚未计 tile 边缘、overviews、JSON/索引或导出重复。USGS 给出的约 25 MB/1° 源文件量级也意味着约千片 SRTM 1 arc-second 源栅格是数十 GB 原始输入；这是原始输入量级，不是压缩后导出包的下界。

### 实测 PNG 对象长度（2026-10-30）

通过 AWS Open Data Registry 列出的公开 S3 `elevation-tiles-prod/terrarium` 对象做 18 次 HEAD 请求，均返回 HTTP 200；记录 `Content-Length` 与 `x-amz-meta-x-imagery-sources`。另外 GET 六块 z12 PNG 到临时文件并解码后立即删除：均为 256×256，Terrarium 高程数值有效，透明像素各为 0；这不是完整 nodata/void 检查，也不等于用选定原始源重新生产后的压缩率。样点每类两处，分别取高原、平原和海岸；每处取 z10–z12：

| 地貌 / 样点 | 坐标中心 | z10 | z11 | z12 | z12 解码高程范围 |
|---|---|---:|---:|---:|---:|
| 高原 A | 86°E, 29°N | 78,918 B | 66,599 B | 51,669 B | 4,530–5,725 m |
| 高原 B | 90°E, 30°N | 77,027 B | 63,708 B | 52,888 B | 5,188–6,365 m |
| 平原 A | 116°E, 39°N | 24,073 B | 26,535 B | 27,929 B | 2–21 m |
| 平原 B | 118°E, 32°N | 42,933 B | 38,590 B | 29,183 B | 17–90 m |
| 海岸 A | 121°E, 29°N | 73,853 B | 65,207 B | 53,812 B | 95–849 m |
| 海岸 B | 113°E, 23°N | 46,471 B | 50,894 B | 48,712 B | −101–100 m |

| zoom / 样本数 | 最小 | 均值 | 中位数 | 最大 |
|---|---:|---:|---:|---:|
| z10 / 6 | 24,073 B | 57,213 B | 60,162 B | 78,918 B |
| z11 / 6 | 26,535 B | 51,922 B | 57,301 B | 66,599 B |
| z12 / 6 | 27,929 B | 44,032 B | 50,191 B | 53,812 B |
| 合计 / 18 | 24,073 B | 51,056 B | 51,282 B | 78,918 B |

样本很小，max 不是可靠全国 P95。S3 元数据显示 SRTM 占多数，但部分 z10–z12 瓦片同时引用 GMTED2010；一个 z10 样点还列出 ETOPO1。六块 z12 PNG 解码的高程范围从海岸 −101 m 到高原 6,365 m，均无透明像素；opaque fill / source mask 尚未验证，故不能据此宣称无 void。以项目省界 union 实计 216,158 片、按 18 片 AWS 样本均值 51,056 B/片简单外推为 **约 11.0 GB**；层级间像素大小、来源与 PNG 长度会变，正式估值仍要按真正选定的源数据重建。此前 ETOPO 单片 199,522 B 是另一数据源与分布，不能代表该组 SRTM/GMTED 混合瓦片，也不能直接套用作全国 30m 估值。

### 单一 SRTM HGT 样本、重编码与省界瓦片计数（2026-11-10）

**源数据抽样。** 从 Skadi SRTM HGT 存档端点 `https://s3.amazonaws.com/elevation-tiles-prod/skadi/{Nxx}/{NxxExxx}.hgt.gz` 读取三块不同地貌源瓦片；这是 Skadi 存档端点，不是 USGS 官方下载端点。每块解压后均为 3601×3601 个大端有符号 16-bit 样本（25,934,402 B）；对全 tile 扫描 `-32768` void 哨兵：三块均为 0。仅三块样本，不能据此推断全国无 void。

| 地貌样区 | HGT tile | gzip 长度 | 解压长度 | void / 总样本 | 源 HGT 高程范围 / 均值 |
|---|---|---:|---:|---:|---:|
| 高原 | N29E086 | 15,217,442 B | 25,934,402 B | 0 / 12,967,201 | 4,111–6,399 m / 5,162.85 m |
| 平原 | N39E116 | 6,012,851 B | 25,934,402 B | 0 / 12,967,201 | −55–985 m / 29.50 m |
| 海岸 | N29E121 | 11,419,609 B | 25,934,402 B | 0 / 12,967,201 | −49–1,113 m / 161.09 m |

将这些 HGT 源分别双线性重采样为 256×256 Web Mercator 像素中心，再写成 Terrarium RGBA PNG。编码与现有 POC 对齐：RGBA、PNG filter None、zlib level 9。下表为临时生成的九片输出字节数；文件仅在内存中统计，没有纳入工作区。

| 地貌样区 | z10 | z11 | z12 | 每 zoom void pixel |
|---|---:|---:|---:|---:|
| 高原 N29E086 | 189,480 B | 176,378 B | 167,440 B | 0 |
| 平原 N39E116 | 135,261 B | 127,497 B | 122,071 B | 0 |
| 海岸 N29E121 | 170,647 B | 134,087 B | 85,312 B | 0 |
| **每 zoom 均值（3 片）** | **165,129 B** | **145,987 B** | **124,941 B** | — |

AWS 18 片混合来源样本均值 51,056 B 与这组重编码 SRTM 样本相差明显；差异同时受来源、地形与 PNG 编码链影响，不能归结为“同一编码下纯粹的数据集差异”，也不能据此称全国实际包体已经测得。

**项目省界计数。** 对 `china.json` 34 个 feature 的 Polygon/MultiPolygon 外环、内环逐级检查瓦片相交；以 z12 瓦片为基准，将每个瓦片所有祖先层去重。计入与边界接触的瓦片；单省计数分别计算，省界共享 tile 可被多省重复计入，但全国 union 会去重。列出每省 z12 数与该省祖先金字塔总数：

| 省级 feature | z12 / 金字塔 | 省级 feature | z12 / 金字塔 |
|---|---:|---|---:|
| 新疆维吾尔自治区 | 30,810 / 41,469 | 西藏自治区 | 17,898 / 24,160 |
| 内蒙古自治区 | 24,366 / 33,071 | 青海省 | 11,473 / 15,549 |
| 四川省 | 7,216 / 9,848 | 黑龙江省 | 11,026 / 14,988 |
| 甘肃省 | 7,692 / 10,580 | 云南省 | 5,266 / 7,253 |
| 广西壮族自治区 | 3,184 / 4,372 | 湖南省 | 3,025 / 4,160 |
| 陕西省 | 3,445 / 4,757 | 广东省 | 2,643 / 3,663 |
| 吉林省 | 4,094 / 5,630 | 河北省 | 3,650 / 5,041 |
| 湖北省 | 2,866 / 3,962 | 贵州省 | 2,503 / 3,454 |
| 山东省 | 2,927 / 4,041 | 江西省 | 2,400 / 3,303 |
| 河南省 | 2,690 / 3,712 | 辽宁省 | 3,144 / 4,323 |
| 山西省 | 2,798 / 3,840 | 安徽省 | 2,211 / 3,071 |
| 福建省 | 1,897 / 2,617 | 浙江省 | 1,919 / 2,653 |
| 江苏省 | 1,733 / 2,420 | 重庆市 | 1,308 / 1,840 |
| 宁夏回族自治区 | 981 / 1,387 | 海南省 | 536 / 766 |
| 台湾省 | 524 / 759 | 北京市 | 353 / 518 |
| 天津市 | 249 / 368 | 上海市 | 156 / 236 |
| 香港特别行政区 | 49 / 84 | 澳门特别行政区 | 4 / 18 |

34 省级 feature 的全国 union 为 z12 **161,162** 片；各层 z0→z12 数量依次为 `1, 1, 2, 5, 9, 24, 65, 210, 736, 2,731, 10,439, 40,773, 161,162`，共 **216,158** 片。注意全国 union 不是把上表每省金字塔简单求和。

**由计数与样本得到的全国量级。** z10/z11/z12 分别按实测均值 165,129 / 145,987 / 124,941 B；因没有 z0–z9 输出样本，低 zoom 暂以 z10 均值代用。按逐级瓦片数加权，理想样本外推合计约 **28.44 GB**（十进制）；若将 z10 三样本最小值/最大值用于 z0–z10，并将 z11/z12 各自三样本最小值/最大值用于对应层，情景范围约 **20.9–36.9 GB**，不是统计置信区间，也不是完整生产包测量。项目边界的瓦片数已实计，不再另加旧面积法的 10–25% 边界余量。真正生产编码器、全域地形分布、void 处理和数据格式优化仍会改变体积。此前 AWS 约 11.0 GB 估算属于混合来源预制 PNG 对象长度，必须与此 SRTM 重采样/POC 编码假设分开看待。

## 推荐决策与下一项验证

1. **先定插件约束解释。** 默认按严格口径：暂不将 `addProtocol` 带进正式地图链路。若内部固定 adapter 可豁免，需将豁免条件（无用户 handler、协议固定、禁止外部 URL、编译期资源表、导出一致性）写入架构决策。
2. **不要以全国 30m 为默认单文件基线。** 先定义“每张图按当前 bounds + zoom range 打包”的产品语义；明确离线包上限（例如 HTML/资源总量预算）后再做实现选择。
3. 本轮已完成三块 Skadi SRTM HGT 源样本解码/void 扫描、九片 z10–z12 Terrarium 临时重编码，以及项目 34 个省级 feature 的 z12 相交计数和祖先层 union 去重。下一步若继续，应扩充 SRTM 地貌样本、检查瓦片边缘与 nodata 策略，并用完整生产编码链实际构建区域包；当前包体仍是样本外推，不是全国生产验收。
4. 根据第 1 项判定选引擎：内部 adapter 获批则继续 MapLibre 的**范围裁切 POC**；严格禁用 runtime registration 则停止 MapLibre 地形正式化，比较 Three.js 等内置加载路径。此短评估本身不触发完整 M2。

## 参考

- MapLibre GL JS `addProtocol()`：https://maplibre.org/maplibre-gl-js/docs/API/functions/addProtocol/
- USGS SRTM 1 Arc-Second Global：https://www.usgs.gov/centers/eros/science/usgs-eros-archive-digital-elevation-shuttle-radar-topography-mission-srtm-1
- Copernicus DEM GLO-30/GLO-90：https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM
- POC 已测 tile/HTML 与构建信息：`poc/maplibre-terrain/data/dem-metadata.json`、`poc/maplibre-terrain/offline-check.log`、`poc/maplibre-terrain/README.md`。
