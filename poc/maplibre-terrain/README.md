# ChartForge M2 · 真实 DEM / WebGL 离线 POC

这是隔离的技术验证，不注册正式组件、不修改正式地图导出路径，也不决定最终引擎。

## 当前实验范围

- MapLibre GL JS `6.17.0`（根 `package.json` 中仅为 POC `devDependency`，BSD-3-Clause）。
- 中国西藏附近一块真实 ETOPO 高程瓦片，使用项目已有 `src/assets/geo/china.json` 叠加本地省界。
- 单瓦片：Web Mercator `z=9, x=384, y=211`；目标 PNG 256×256，MapLibre `raster-dem` Terrarium RGB 编码。
- 固定 `cf-dem://` 内存读取器仅返回内嵌 PNG，不使用用户代码、动态插件发现或外部请求。该 API hook 的产品约束仍需在 POC 结论里显式评估。

## DEM 来源与许可记录

- NOAA NCEI，**ETOPO 2022 v1 15 arc-second global relief model (Ice Surface)**。
- 官方 ERDDAP 元数据：<https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s.html>
- NOAA NCEI 元数据：<https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ngdc.dem%3Aetopo_2022>
- 元数据标示 CC0；此 POC 仍保留来源、查询边界、原始子集 SHA-256 与准确度免责声明，扩大再分发前再次核实适用元数据。
- ETOPO 是全球 relief model，局部输入数据来源和准确度不同；不是测绘或导航数据。
- 本 POC 只对一个约 0.70°×0.61° 瓦片取真实格点并双线性重采样；不以随机数或程序造高程填值。若 NOAA 返回缺点/不规则网格，构建脚本直接失败。

## 生成数据与运行

在仓库根目录执行：

```sh
node poc/maplibre-terrain/build-dem-tile.mjs
pnpm exec vite --config poc/maplibre-terrain/vite.config.ts --host 0.0.0.0
```

开发页：`http://localhost:5175/`。worker 源码通过 Vite 编译期虚拟模块内嵌；运行时的 DEM 读取器只回传内存 PNG，不拉取底图/字体/瓦片。

## 构建 file:// 单 HTML

```sh
pnpm exec vite build --config poc/maplibre-terrain/vite.config.ts
```

输出为 `poc/maplibre-terrain/dist/index.html`。构建插件内联 JS/CSS/GeoJSON/DEM/worker，使用脚本哈希并将 `connect-src` 限制为 `blob:`，`worker-src` 限制为 `blob: data:`（file:// 的 null-origin 下 MapLibre 会将已内嵌 worker 包装为 data: Worker；HTTP(S) 不允许）。

```sh
node --no-warnings poc/maplibre-terrain/check-inline-script.mjs
node --no-warnings poc/maplibre-terrain/check-offline.mjs
```

第一项检查单 HTML 内联 JavaScript 语法、无外链 script/style 与 worker CSP。第二项用 Playwright/Chromium 直接 `file://` 打开并阻断 HTTP(S)，检查 MapLibre WebGL、实际 terrain elevation、 DEM 请求、页面/控制台错误，并对 MapLibre canvas 截图做 PNG 像素多样性抽样；仅 build 成功不算通过。

## 本轮验收结果（2026-10-30）

- **通过：** Chromium `file://` 下 MapLibre GL JS `6.17.0` worker 可运行，WebGL 2.0 可用；静态 JS/CSP 检查通过。
- **通过：** NOAA ETOPO Terrarium DEM 真正被 `raster-dem`/hillshade 与 terrain 使用；MapLibre `queryTerrainElevation` 返回中心高程 `5963.15 m`。实际画布截图 1280×720，PNG 采样得到 2,023 种像素颜色。
- **通过：** 两次 DEM 读取均只命中已打包的同一瓦片 `z=9/x=384/y=211`（每次 199,522 字节）；没有 HTTP(S) 请求，页面错误和控制台错误均为 0。
- **单文件大小：** `poc/maplibre-terrain/dist/index.html` 为 2,158,623 字节（约 2.16 MB，Vite gzip 统计约 747.86 kB）。

## POC 结论与范围边界

此结果只证明**一个真实 DEM 瓦片**可在当前 Chromium 环境下通过 `file://` 离线运行与渲染；不代表中国全域 DEM 包体、生产浏览器矩阵或正式导出链路已验收。MapLibre 仍仅为 POC `devDependency`，未接入正式组件/导出。正式方案决策前仍需评估固定 `addProtocol` hook 是否符合“无运行时插件”约束、较大范围 DEM 的体积与许可/署名，以及其他浏览器环境。不得据此扩展为完整 M2 或更改既有路线图。
