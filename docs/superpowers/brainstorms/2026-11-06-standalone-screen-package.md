# 整合设计 · 大屏可交付产物（Standalone Screen Package）

> 日期：2026-11-06 · 状态：**V1 已实施**（Q1–Q4 全取推荐项）
> 前序：`docs/superpowers/brainstorms/2026-11-06-live-data-center-v2.md`（数据源中心 v2，V1/V2 已落地 `facf2e6` / `b379068`）

## 0. 现状为什么不够

现在「导出」只做了一件事：`exportJson(screen)` → 一个 `.screen.json`。

- 拿到文件的人**必须装 ChartForge、导入、再点演示**才能看到画面。发给客户/领导/投屏设备等于发了一份「源代码」。
- 产物里既没有图表渲染代码，也没有数据结构说明，第三方无法二次集成。
- `src/assets/screens/*.json` 这类运行时产物进了仓库（虽已 gitignore），说明「导出」目前只是调试用。

结论：**「导出」的语义要从「导出数据」升级为「交付产物」——一个打包好、能直接打开、能部署、能审计的大屏项目。**

## 1. 目标与非目标

### 目标（Definition of Done）
1. **双击即用**：产物里的 `index.html` 双击（file://）就能看到全屏大屏，不需要 chartforge、不需要联网、不需要构建。
2. **可部署**：放进任意静态服务器（nginx / OSS / GitHub Pages）即可对外访问。
3. **不含编辑器**：产物里没有 Vue、Pinia、路由、工作台代码，只有「渲染 + 轮播 + 可选轮询 + ECharts」。
4. **可校验**：HTML5 语义正确、UTF-8、`lang="zh-CN"`、CSP 生效、无外链、无内联 eval、许可证声明齐全。
5. **可审计**：产物内嵌 `manifest`（生成器版本、导出时间、schema 版本、每份文件的 SHA-256）。
6. **不泄密**：不含 token、不含其它大屏/图表库数据、不含 localStorage 全库。

### 非目标
- 不做「导出成 Vue/React 工程源码」的脚手架（产物是成品，不是二次开发模板）。
- 不做 PDF/视频导出。
- 不做服务端渲染/SSR 截屏调度。

## 2. 产物形态

两种模式共用同一套构建器（`mode: "inline" | "folder"`），差别只是「资源内联」还是「拆文件」。

### A. 单文件：`<大屏名>.screen.html`
```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'sha256-…'; connect-src https: http:; base-uri 'none'; form-action 'none'">
  <meta name="generator" content="ChartForge 1.x">
  <title>销售大屏</title>
  <script type="application/json" id="cf-payload">{…}</script>   <!-- 数据：不执行 -->
  <script>/* echarts（瘦身 UMD）+ 运行时，单段内联 */</script>
</head>
<body><div id="cf-root" role="application" aria-label="销售大屏"></div><noscript>…</noscript></body>
</html>
```
- 优点：一个文件走天下（U 盘、邮件附件、钉钉/企微传输）。
- 代价：体积 = ECharts + 数据，约 600 KB ~ 1 MB（gzip 后 ~250 KB，但本地文件不会被压缩）。

### B. 目录包：`<大屏名>.screen-package.zip`
```
销售大屏/
├── index.html                 # 结构 + CSP + 数据（内联 JSON）
├── assets/
│   ├── echarts.min.js         # 瘦身后的 ECharts（Apache-2.0）
│   └── app.js                 # 运行时（渲染 + 轮播 + 轮询）
├── manifest.json              # 生成器/schema/文件哈希清单
├── LICENSE-CHARTFORGE.txt
├── NOTICE-ECHARTS.txt         # Apache-2.0 要求保留的版权与声明
└── serve.sh / serve.cmd       # 本地预览（可选，用于实时数据场景）
```
- 优点：结构符合静态站点惯例，便于部署、便于差异比对与完整性校验（`script` 可用 `integrity` + `script-src 'self'`，比内联 hash 更符合 CSP 最佳实践）。
- 代价：需要解压。

> 推荐：**两种都提供**，默认 zip（更标准、更易部署、校验更强），并提供「单文件 HTML」勾选项（离线传阅）。

## 3. 技术架构

```
src/core/export/
├─ model.ts        # 导出快照类型（ScreenPackageSpec）与版本号 EXPORT_SCHEMA_VERSION = 1
├─ snapshot.ts     # Workspace/Screen → 快照：脱敏(scrubSecrets)、剥离缩略图、裁掉未用资产
├─ artifact.ts     # 快照 → HTML 字符串（转义、CSP hash、manifest、JSON 注入）；纯函数、可单测
├─ zip.ts          # 无依赖 zip 写入（CompressionStream('deflate-raw')，不支持时降级 STORE）
├─ sha256.ts       # crypto.subtle 摘要（Node 测试用注入实现）
├─ download.ts     # Blob 下载（复用现有 download 习惯）
└─ runtime/        # 产物运行时（**单独构建**，不进主包）
   ├─ main.ts      # 引导：读 payload → 建画布 → 渲染 → 轮播/轮询
   ├─ render.ts    # 复用 optionBuilder.buildOption
   └─ live.ts      # 复用 pipeline + dataPath + payload + apiSettings
```

### 运行时代码怎么进产物（关键取舍）
不能手写一份「简易渲染器」——那会把 `optionBuilder / pipeline / dataPath` 的逻辑复制一遍，从此两处漂移。

方案：**两段构建**
1. `vite build --config vite.export.config.ts`（lib/IIFE 模式，tree-shake 后的 echarts + 运行时）→ `src/export/generated/runtime.iife.js`（gitignore）。
2. 主构建 `pnpm build` 先跑第 1 步；应用内用 `import runtimeCode from "@/export/generated/runtime.iife.js?raw"` 拿到字符串，导出时内联。
- dev/test 环境没有该文件时：`artifact.ts` 从参数接收 `runtimeCode`，测试直接传假字符串 → **构建器 100% 可单测**，缺文件只在真正导出时提示「请先 `pnpm build:runtime`」。

### 产物运行时要做的事（都在 `runtime/` 里，可单测）
- 读 `#cf-payload`（`application/json`，`textContent`，不 eval）。
- 校验 `schemaVersion === 1`，否则显示可读降级页（中文）。
- 按 `canvas.width/height` 建舞台，`scale = min(vw/w, vh/h)` 适配窗口，居中；`ResizeObserver` 重排。
- 每个图表项：`buildOption(spec)` → `echarts.init(el).setOption(option)`；地图项先 `registerMap("china", geo)`（GeoJSON 内联，54 KB）。
- 文本/图片/形状项：DOM 渲染（图片走 data URL / https 白名单）。
- 多屏轮播：`?screen=<index>&interval=<秒>`、`←/→` 切屏、`空格` 暂停、Esc 退出全屏、底部圆点；`prefers-reduced-motion: reduce` 时**不自动轮播**（只响应键盘）。
- 实时（可选）：`setInterval` + `AbortController` 超时 + 失败保留上一帧并显示角标；加工走 `pipeline`（与编辑器完全一致）。

## 4. 标准符合性清单

| 项 | 做法 | 校验方式 |
|---|---|---|
| HTML5 | `<!doctype html>`、语义标签、无废弃属性 | `html-validate`（仅 devDependency 或脚本）可选；主看结构单测 |
| 字符集/语言 | `<meta charset="utf-8">` + `lang="zh-CN"` | 构建器单测断言 |
| 视口 | `<meta name="viewport">`、`color-scheme` | 同上 |
| CSP | 内联模式用 `script-src 'sha256-…'`（对唯一内联脚本求摘要）；目录包用 `script-src 'self'`；`default-src 'none'` 起步，只放开 `img-src`/`connect-src`/`style-src` | 单测：摘要与脚本字节一致；断言无 `unsafe-eval` |
| 无内联 eval | 运行时禁用 `eval/new Function`；ECharts 走 canvas 渲染 | 单测扫 `runtimeCode` 不含 `eval(`/`new Function` |
| 无障碍 | `role="application"`/每图 `role="img"` + `aria-label`（名称+类型）、键盘可操作说明、`<noscript>` 备选提示 | 结构单测 |
| 动效偏好 | `prefers-reduced-motion` 关闭自动轮播与入场动画 | 运行时单测 |
| 许可证 | Apache-2.0：产物内保留 ECharts 版权头 + `NOTICE-ECHARTS.txt`；单文件模式在 HTML 注释内保留 | 单测断言注释存在 |
| 版本/schema | payload 内 `format/chartforgeVersion/schemaVersion/exportedAt` | 单测 |
| 完整性 | `manifest.json` 记录每个文件 SHA-256 与总大小 | 单测（摘要可注入） |
| 部署 | 纯静态、无服务端依赖；README 附 nginx 片段与 CORS 说明 | 文档 |

## 5. 安全清单（威胁 → 缓解）

| 威胁 | 缓解 |
|---|---|
| XSS：大屏名/文本元素/图表标题注入 `<script>` | 所有插入 HTML 的字符串走 `escapeHtml`；JSON 注入后二次转义 `<` → `\u003c`（防 `</script>` 提前闭合） |
| XSS：图片/背景 `src` 为 `javascript:`、`data:text/html` | URL 白名单：仅 `http(s):`、`data:image/(png|jpe?g|gif|webp|svg+xml);base64,`；其它一律丢弃并在导出报告里列出 |
| 令牌外泄 | 复用 `scrubSecrets`；导出面板默认「剔除请求头值」，勾选保留时弹二次确认；产物里 grep 不到 `Bearer`/`token` 明文（单测断言） |
| 越权读取其它数据 | 只导出被选中的大屏（+ 其引用到的图/图集），不导出 assets 库、不导出 localStorage 全库、不含其它屏 |
| 注入第三方脚本 | 默认**零外链**（no CDN）；不使用 `innerHTML` 渲染用户内容（用 `textContent`）；CSP `default-src 'none'` |
| 中间人篡改 | 目录包：`<script integrity="sha384-…">` + manifest 哈希；单文件：CSP 内联 hash（改了脚本就不再执行） |
| 参考隐私：外链图片带 Referer | 图片 `<img referrerpolicy="no-referrer">`；单文件模式对 `https:` 图片保持同策略 |
| file:// 下 fetch 受限（实时数据） | 导出时检测大屏是否含数据源：含则给明确提示「双击打开时实时刷新可能被浏览器拦截，请用 `serve.sh` 或部署到静态服务器」 |
| 供应链 | 只用仓库已依赖的 `echarts`（锁定版本），运行时由本仓库源码构建，产物内记录版本号 |

## 6. 数据与实时

- **默认快照**：把每张图表当前的数据固化成 `ChartData` 写进 payload，产物完全静态（最安全、最标准）。
- **可选轮询**（勾选）：payload 额外带 `source`（含 baseUrl 合并后的最终 URL、方法、头（脱敏后可选择保留）、dataPath、加工配置、间隔、超时）；运行时按 `pipeline` 重算。
- 间隔下限 5s、超时可配、失败退避（沿用 `DataHub` 的策略，运行时内精简实现：单飞 + 指数退避，无跨图合并的必要——产物里图表数量有限，但同一 URL 仍合并）。
- 产物里**不含**任何 ChartForge 服务端地址，`baseUrl` 来自用户配置。

## 7. 体积预算

| 组成 | 估算 |
|---|---|
| ECharts（tree-shaken：6 图 + 5 组件 + canvas 渲染） | ~450–550 KB（min） |
| 运行时（含 pipeline/optionBuilder 复用） | ~40–60 KB（min） |
| GeoJSON（仅当地图图表存在时内联） | 54 KB |
| 大屏数据 + 图片（图片已是压缩后的 data URL） | 视屏而定 |
| **合计（无图）** | **约 550–700 KB；zip（deflate）后约 200–260 KB** |

单文件 HTML 无法被服务器 gzip（本地打开），所以单文件模式优先保证体积：地图资源按需内联、图片超过阈值（如 512 KB）时提示改用 zip 模式。

## 8. 兼容与版本

- `format: "chartforge/screen-package"`、`schemaVersion: 1`；运行时遇未知版本 → 显示中文降级页（不白屏）。
- 现有 `.screen.json` / workspace JSON 的导入导出**保持不变**（产物是新增能力，不替换旧通道）。
- 旧数据里 `source.url` 绝对地址、`path` 相对路径都被产物支持（导出时已合成最终 URL）。

## 9. 测试策略（TDD）

| 模块 | 用例 |
|---|---|
| `snapshot.ts` | 脱敏后无令牌；只含选中屏；缩略图被剥离；未引用的资产不导出；非法 URL 被剔除并记录 |
| `artifact.ts` | 结构断言（doctype/charset/lang/CSP/generator/NOTICE）；`<`/`"`/`</script>` 注入被转义；CSP hash 与内联脚本字节一致；noscript/aria 存在 |
| `sha256.ts` / `zip.ts` | 摘要与已知向量一致；zip 目录结构与 CRC 正确（用 Node 侧 `unzip`/`DecompressionStream` 回读校验） |
| `runtime/render.ts` | 给定 payload 生成的 DOM 结构（jsdom 或纯函数产出结构描述）；缩放计算；轮播索引与间隔；reduced-motion 不自动播 |
| `runtime/live.ts` | dataPath + 加工后与编辑器一致（复用同一 pipeline，用同一组固定载荷断言） |
| 端到端（node） | 构造大屏 → 生成 zip → 解压 → 断言 index.html/manifest/assets 存在且哈希匹配 |

## 10. 分期

| 里程碑 | 内容 |
|---|---|
| **V1（本轮）** | 快照导出（单屏）＋ 单文件 HTML 与 zip 包两种模式＋脱敏/转义/CSP/manifest＋许可证与 README＋单测；大屏库卡片与播放页都给「导出为可交付产物」入口 |
| **V2** | 多屏轮播包（勾选多屏，产物含 playlist）＋ 可选实时轮询（含加工）＋ `serve.sh`/`serve.cmd` 与部署说明、`?screen/interval` 参数 |
| **V3** | 部署辅助：一键生成 nginx 配置片段 / Docker 静态镜像示例；产物差异对比（版本升级后重新导出并 diff manifest） |

## 11. 风险

| 风险 | 缓解 |
|---|---|
| 两段构建让 `pnpm build` 变慢/易失败 | 生成物 gitignore + 明确报错信息 + CI 里先跑 `build:runtime`；测试不依赖生成物 |
| 产物里 ECharts 版本与应用内不一致 | 运行时由同一 `package.json` 依赖构建，payload 记录版本，导出时比对并告警 |
| 内联 CSP hash 与脚本字节不一致导致白屏 | 单测锁定「hash 由同一份字符串计算」；产物加载失败时显示中文错误页 |
| 单文件体积过大（大图/多屏） | 图片阈值提示 + 推荐 zip；payload 可裁剪缩略图与未用资产 |
| 用户以为「导出就能实时」 | 导出面板按大屏是否含数据源给出明确提示与勾选项；README 写明 file:// 限制 |
| zip 用手写实现有 bug | 优先 `CompressionStream`，回读校验单测；失败降级 STORE；不引入新依赖 |

## 12. 需要拍板的 4 件事

| 编号 | 问题 | 推荐 |
|---|---|---|
| Q1 | 产物形态：单文件 HTML / zip 目录包 / 两者都要？ | **两者都要**，默认 zip（标准、可部署、可校验），勾选单文件便于传阅 |
| Q2 | 实时数据：默认快照、勾选保留轮询，还是始终保留？ | **默认快照**（最安全最稳），勾选才带轮询；含数据源时给出 file:// 限制提示 |
| Q3 | ECharts 来源：完全内联离线，还是引 CDN 换体积？ | **完全内联离线**（零外链，CSP 才能收到 `default-src 'none'`，也才敢说「符合安全标准」） |
| Q4 | 导出范围：仅当前大屏，还是可勾选多屏（轮播包）？ | **可勾选多屏**（V2 落地），V1 先做单屏但结构上预留 playlist |

---

## 13. V1 实施记录（2026-11-06）

### 代码（`src/core/export/`，全部纯函数 + 可注入摘要算法）
- `model.ts`：产物类型与常量（`PACKAGE_FORMAT = "chartforge/screen-package"`、`PACKAGE_SCHEMA_VERSION = 1`）。
- `snapshot.ts`：`buildPackagePayload(workspace, screenIds, options)` —— 只带被选中的大屏、剔除隐藏项与模板占位、剥离缩略图、图片地址白名单（`http(s)` / `data:image`）、**导出时即算好 ECharts option**（产物运行时只做 `setOption`，不复制建图逻辑）。
- `hash.ts`：`cspHash`（sha256 → CSP）、`sriHash`（sha384 → 目录包 integrity）、`sha256Hex`（manifest），摘要算法可注入。
- `runtime.ts`：产物运行时（纯 JS 字符串）——读 `#cf-payload`、版本校验与中文降级页、舞台缩放居中、图表/文本/图片/形状渲染、多屏轮播（已支持，V1 只导单屏）、`?screen` / `?interval`、键盘 ← → 与空格、`prefers-reduced-motion` 关闭自动播。
- `artifact.ts`：`buildArtifact(...)` 产出文件集与 manifest —— HTML5 骨架（charset / `lang="zh-CN"` / generator / noscript / `role="application"`）、严格 CSP（内联用 `sha256`，目录包 `script-src 'self'` + SRI）、用户文本转义、内联 JSON 的 `</script>` 转义、README / NOTICE-ECHARTS / LICENSE-CHARTFORGE / serve.sh / serve.cmd。
- `zip.ts`：零依赖 zip 写入器（CRC32 + 中央目录），优先 `CompressionStream("deflate-raw")`，不支持时降级 STORE，仍然产出合法 zip。
- `assets.ts`：`echarts/dist/echarts.min.js?url` 按需 fetch（不进首屏 bundle）、地图图表才注入 54 KB GeoJSON。
- `index.ts`：`exportScreenPackage()` 串起「快照 → 产物 → Blob」。
- UI：`src/shared/ui/ExportPackageDialog.vue` + 大屏库卡片「导出可交付产物」按钮（与原有「导出 JSON」并存）。

### 测试（23 例，全量 216 passed）
`tests/export-snapshot.spec.ts`（7）、`tests/export-artifact.spec.ts`（9，含「运行时字符串能被 JS 引擎解析」）、`tests/export-zip.spec.ts`（3，含 crc32 标准向量与 deflate 回读）、`tests/export-e2e.spec.ts`（2，产物 → zip → 回读校验）。

### 与设计的偏差 / 已知取舍
- ECharts 用官方 UMD 全量（1.12 MB，zip 后约 330 KB）而不是 tree-shaken 运行时：**避免引入第二段构建**（`vite build --config vite.export.config.ts` + 生成物入库/gitignore 的复杂度）。代价是单文件模式偏大。V2 若做「带实时轮询的产物」，反正需要把 `pipeline/optionBuilder` 打进运行时，届时一并换成 tree-shaken 运行时（预计 500 KB 级）。
- 单文件模式下 manifest 内嵌在页面里且 `files` 为空：内嵌清单无法包含自身摘要，完整性改由 CSP 脚本摘要保证（页面里已有 `sha256-…`）。
- 实时数据（轮询）V1 未做（Q2 默认快照）；payload 已预留 `geo` 与多屏结构。

### 留给 V2 / V3
- V2：多屏轮播包（大屏库勾选多屏 → playlist + `?interval`）、可选实时轮询（含加工链）、导出前体检（大图阈值、缺失来源、跨域提示）。
- V3：部署辅助（一键生成 nginx 片段 / Docker 静态镜像示例）、升级后重新导出并 diff manifest。
