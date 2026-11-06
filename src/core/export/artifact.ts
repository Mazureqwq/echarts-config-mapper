import {
  GENERATOR_NAME,
  GENERATOR_VERSION,
  PACKAGE_FORMAT,
  PACKAGE_SCHEMA_VERSION,
} from "./model";
import type { ArtifactMode, PackageManifest, PackagePayload } from "./model";
import { cspHash, sha256Hex, sriHash, utf8, webcryptoDigest } from "./hash";
import type { DigestFn } from "./hash";

export interface ArtifactFile {
  path: string;
  content: string;
}

export interface ArtifactInput {
  payload: PackagePayload;
  /** echarts UMD 源码（内联或落盘为 assets/echarts.min.js） */
  echartsCode: string;
  /** 产物运行时源码 */
  runtimeCode: string;
  mode: ArtifactMode;
  digest?: DigestFn;
  now?: () => number;
}

export interface ArtifactOutput {
  files: ArtifactFile[];
  manifest: PackageManifest;
  /** zip / 单文件下载用的建议文件名（不含扩展名） */
  baseName: string;
}

/** HTML 文本转义：所有插入 HTML 的用户字符串都要过这一层 */
export function escapeHtml(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 内联 JSON 的转义：`</script>` 会把 script 块提前闭合，是典型的注入点。
 * 同时把 U+2028/2029 转义掉（老引擎里它们是换行，会破坏 JS）。
 */
export function escapeJsonForScript(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function safeFileName(name: string): string {
  const cleaned = String(name ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "大屏";
}

const BASE_CSS = `
:root { color-scheme: dark; }
html, body { margin: 0; padding: 0; height: 100%; background: #0b1020; overflow: hidden; }
body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif; }
#cf-root { position: relative; width: 100%; height: 100%; }
.cf-stage { position: absolute; overflow: hidden; }
.cf-item { position: absolute; box-sizing: border-box; }
.cf-text { white-space: pre-wrap; overflow: hidden; }
.cf-image { display: block; }
.cf-chart { overflow: hidden; }
.cf-dots { position: fixed; left: 0; right: 0; bottom: 14px; display: flex; gap: 8px; justify-content: center; pointer-events: none; }
.cf-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255, 255, 255, 0.28); }
.cf-dot--on { background: rgba(255, 255, 255, 0.92); }
.cf-noscript, .cf-error { margin: 15vh auto 0; max-width: 520px; padding: 24px; border-radius: 10px; background: #22242a; color: #e8eaed; text-align: center; }
.cf-error h1 { font-size: 18px; margin: 0 0 12px; }
.cf-error p { margin: 6px 0; font-size: 13px; line-height: 1.7; color: #9aa0a8; }
.cf-error-tip { font-size: 12px; opacity: 0.8; }
`;

const ECHARTS_NOTICE = `ECharts (Apache License 2.0)
Copyright 2017-2024 The Apache Software Foundation

This product includes software developed at The Apache Software Foundation (http://www.apache.org/).
ECharts is licensed under the Apache License, Version 2.0.
You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

Copyright 2013-2024, Baidu Inc. and ECharts contributors. All rights reserved.
The ECharts copyright notice and this notice are retained inside the generated artifact
(in the bundled asset header and in this file) as required by the Apache-2.0 license.
`;

const CHARTFORGE_NOTICE = `本产物由 ChartForge 生成（${GENERATOR_NAME} ${GENERATOR_VERSION}）。

- 产物中的图表数据、文案与图片归导出者所有；
- 产物内嵌的第三方库（ECharts）按其自身许可证分发，见 NOTICE-ECHARTS.txt；
- ChartForge 本身不随产物分发，产物可在任意静态服务器上独立运行。
`;

function readmeText(payload: PackagePayload, mode: ArtifactMode): string {
  const lines = [
    `# ${payload.title}`,
    "",
    "这是由 ChartForge 导出的可直接使用的大屏产物，不依赖 ChartForge、不依赖联网（除非使用实时数据）。",
    "",
    "## 打开方式",
    mode === "inline"
      ? "双击 index.html 即可全屏查看（file:// 直接打开）。"
      : "解压后双击 index.html，或在本目录执行 ./serve.sh（Windows 用 serve.cmd）后访问 http://localhost:8080。",
    "",
    "## 部署",
    "把本目录整体上传到任意静态服务器（nginx / OSS / GitHub Pages）即可，无需后端。",
    "nginx 片段：",
    "  location / { root /var/www/screen; index index.html; add_header X-Content-Type-Options nosniff; }",
    "",
    "## 参数与操作",
    "- ?screen=0 起始屏序号；?interval=20 轮播间隔（秒）；多屏默认 15 秒",
    "- ← / → 手动切屏；空格 暂停 / 继续；Esc 退出全屏",
    "- 系统开启「减少动态效果」时不自动轮播",
    "",
    "## 安全说明",
    "- 产物默认是静态快照，不含任何密钥；已在导出时清除请求头里的令牌",
    "- 页面内联了严格的 CSP（default-src 'none'），不加载任何外部脚本",
    "- manifest.json 记录了每份文件的 SHA-256，可用于校验产物是否被改动",
  ];
  if (payload.screens.length > 1) lines.push("", `共 ${payload.screens.length} 屏轮播。`);
  if (payload.warnings.length) {
    lines.push("", "## 导出时的提示", ...payload.warnings.map((w) => `- ${w}`));
  }
  return lines.join("\n") + "\n";
}

function cspPolicy(scriptSrc: string): string {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "img-src data: https: http:",
    "style-src 'unsafe-inline'",
    `script-src ${scriptSrc}`,
    "connect-src https: http:",
  ].join("; ");
}

interface HtmlInput {
  payload: PackagePayload;
  mode: ArtifactMode;
  cspScriptSrc: string;
  payloadJson: string;
  echarts: string;
  runtime: string;
  /** folder 模式下的资源路径与完整性摘要 */
  echartsSrc?: string;
  echartsIntegrity?: string;
  runtimeSrc?: string;
  runtimeIntegrity?: string;
  manifestJson?: string;
}

function buildIndexHtml(input: HtmlInput): string {
  const title = escapeHtml(input.payload.title || "大屏");
  const inline = input.mode === "inline";
  const scriptTags = inline
    ? `<script>${input.echarts}</script>\n<script>${input.runtime}</script>`
    : [
        `<script src="${input.echartsSrc}" integrity="${input.echartsIntegrity}" defer></script>`,
        `<script src="${input.runtimeSrc}" integrity="${input.runtimeIntegrity}" defer></script>`,
      ].join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="generator" content="${GENERATOR_NAME} ${GENERATOR_VERSION}">
<meta name="chartforge-package" content="${PACKAGE_FORMAT}@${PACKAGE_SCHEMA_VERSION}">
<meta http-equiv="Content-Security-Policy" content="${input.cspScriptSrc}">
<title>${title}</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div id="cf-root" role="application" aria-label="${title}"></div>
<noscript><div class="cf-noscript">这个页面需要启用 JavaScript 才能显示大屏内容。</div></noscript>
<script type="application/json" id="cf-payload">${input.payloadJson}</script>
${input.manifestJson ? `<script type="application/json" id="cf-manifest">${input.manifestJson}</script>` : ""}
<!-- 第三方许可证：ECharts 依 Apache-2.0 分发，版权头保留在下方脚本与 NOTICE-ECHARTS.txt 中 -->
${scriptTags}
</body>
</html>
`;
}

/**
 * 生成产物文件集与 manifest。
 * 纯函数 + 可注入摘要算法 → 全部逻辑都能在单测里跑，不需要真浏览器。
 */
export async function buildArtifact(input: ArtifactInput): Promise<ArtifactOutput> {
  const digest = input.digest ?? webcryptoDigest;
  const payloadJson = escapeJsonForScript(JSON.stringify(input.payload));
  const baseName = safeFileName(input.payload.title);

  const files: ArtifactFile[] = [];
  let indexHtml: string;

  if (input.mode === "inline") {
    const [echartsH, runtimeH] = await Promise.all([
      cspHash(input.echartsCode, digest),
      cspHash(input.runtimeCode, digest),
    ]);
    indexHtml = buildIndexHtml({
      payload: input.payload,
      mode: "inline",
      cspScriptSrc: cspPolicy(`'${echartsH}' '${runtimeH}'`),
      payloadJson,
      echarts: input.echartsCode,
      runtime: input.runtimeCode,
    });
    files.push({ path: "index.html", content: indexHtml });
  } else {
    const [echartsInt, runtimeInt] = await Promise.all([
      sriHash(input.echartsCode, digest),
      sriHash(input.runtimeCode, digest),
    ]);
    indexHtml = buildIndexHtml({
      payload: input.payload,
      mode: "folder",
      cspScriptSrc: cspPolicy("'self'"),
      payloadJson,
      echarts: input.echartsCode,
      runtime: input.runtimeCode,
      echartsSrc: "assets/echarts.min.js",
      echartsIntegrity: echartsInt,
      runtimeSrc: "assets/app.js",
      runtimeIntegrity: runtimeInt,
    });
    files.push({ path: "index.html", content: indexHtml });
    files.push({ path: "assets/echarts.min.js", content: input.echartsCode });
    files.push({ path: "assets/app.js", content: input.runtimeCode });
  }

  files.push({ path: "NOTICE-ECHARTS.txt", content: ECHARTS_NOTICE });
  files.push({ path: "LICENSE-CHARTFORGE.txt", content: CHARTFORGE_NOTICE });
  files.push({ path: "README.md", content: readmeText(input.payload, input.mode) });

  if (input.mode === "folder") {
    files.push({
      path: "serve.sh",
      content:
        "#!/bin/sh\n# 本地预览（file:// 下实时数据会被浏览器拦截，用本脚本更稳）\ncd \"$(dirname \"$0\")\" && python3 -m http.server 8080\n",
    });
    files.push({
      path: "serve.cmd",
      content:
        "@echo off\r\nREM 本地预览：需要已安装 Python 3\r\ncd /d %~dp0\r\npython -m http.server 8080\r\n",
    });
  }

  // manifest 记录除自身以外所有文件的 SHA-256（单文件模式下唯一文件就是 index.html 本身，
  // 内嵌清单无法包含自己的摘要，因此改由页面里的 CSP 脚本摘要保证完整性）
  const manifestFiles =
    input.mode === "folder"
      ? await Promise.all(
          files.map(async (f) => ({
            path: f.path,
            bytes: utf8(f.content).length,
            sha256: await sha256Hex(f.content, digest),
          }))
        )
      : [];

  const manifest: PackageManifest = {
    format: PACKAGE_FORMAT,
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION },
    exportedAt: input.payload.exportedAt,
    title: input.payload.title,
    mode: input.mode,
    screens: input.payload.screens.map((s) => ({
      id: s.id,
      name: s.name,
      width: s.canvas.width,
      height: s.canvas.height,
      items: s.items.length,
    })),
    files: manifestFiles,
    ...(input.mode === "inline"
      ? { note: "单文件模式：脚本完整性由页面内 CSP sha256 摘要保证，篡改脚本后浏览器将拒绝执行" }
      : {}),
    warnings: input.payload.warnings,
    licenses: [{ name: "ECharts", version: "^6.0.0", license: "Apache-2.0" }],
  };

  const manifestJson = JSON.stringify(manifest, null, 2);

  if (input.mode === "inline") {
    // 单文件模式：manifest 内嵌进页面（审计时不必另存文件）
    const withManifest = indexHtml.replace(
      "</body>",
      `<script type="application/json" id="cf-manifest">${escapeJsonForScript(manifestJson)}</script>\n</body>`
    );
    return {
      files: [{ path: "index.html", content: withManifest }, ...files.slice(1)],
      manifest,
      baseName,
    };
  }

  files.push({ path: "manifest.json", content: manifestJson });
  return { files, manifest, baseName };
}
