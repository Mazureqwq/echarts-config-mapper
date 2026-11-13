import { describe, it, expect } from "vitest";
import {
  buildArtifact,
  escapeHtml,
  escapeJsonForScript,
  safeFileName,
} from "../src/core/export/artifact";
import { RUNTIME_CODE } from "../src/core/export/runtime";
import { buildPackagePayload } from "../src/core/export/snapshot";
import { createWorkspace, createScreen, createChartSpec } from "../src/core/model/schema";
import type { ChartItem } from "../src/core/model/types";

const ECHARTS_STUB = "/* echarts stub */ var echarts={init:function(){return{setOption:function(){},resize:function(){},dispose:function(){}}};registerMap:function(){}};";

function payloadWith(title: string) {
  const ws = createWorkspace();
  const screen = createScreen(title);
  screen.items.push({
    id: "c1",
    kind: "chart",
    name: "销量",
    frame: { x: 0, y: 0, w: 400, h: 300, rotate: 0 },
    spec: createChartSpec("line"),
  } as ChartItem);
  ws.screens.push(screen);
  return buildPackagePayload(ws, [screen.id]);
}

describe("export/artifact 转义与白名单", () => {
  it("HTML 转义覆盖五个危险字符", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;"
    );
  });

  it("内联 JSON 会把 </script> 打散", () => {
    const escaped = escapeJsonForScript(JSON.stringify({ t: "</script><script>alert(1)</script>" }));
    expect(escaped).not.toContain("</script>");
    expect(escaped).toContain("\\u003c");
  });

  it("文件名去掉非法字符", () => {
    expect(safeFileName('a/b:c*?"<>|d')).toBe("a b c d");
    expect(safeFileName("   ")).toBe("大屏");
  });
});

describe("export/artifact 单文件产物", () => {
  it("结构符合 HTML5 与安全清单（doctype/charset/lang/CSP/generator/noscript）", async () => {
    const out = await buildArtifact({
      payload: payloadWith("销售大屏"),
      echartsCode: ECHARTS_STUB,
      runtimeCode: RUNTIME_CODE,
      mode: "inline",
    });
    const html = out.files.find((f) => f.path === "index.html")!.content;
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('<meta name="generator" content="ChartForge');
    expect(html).toContain("<noscript>");
    expect(html).toContain('role="application"');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'sha256-");
    // 两个内联脚本各一个摘要
    expect(html.match(/sha256-/g)?.length).toBe(2);
    expect(html).not.toContain("unsafe-eval");
    expect(html).toContain("img-src data:");
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toMatch(/(?:src|href)=["']https?:\/\//i);
    expect(html).not.toContain("http-equiv=\"refresh\"");
  });

  it("标题里的脚本注入被转义，payload 里也没有裸的 </script>", async () => {
    const out = await buildArtifact({
      payload: payloadWith("<script>alert(1)</script>"),
      echartsCode: ECHARTS_STUB,
      runtimeCode: RUNTIME_CODE,
      mode: "inline",
    });
    const html = out.files.find((f) => f.path === "index.html")!.content;
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("单文件里内嵌 manifest，且列出许可证", async () => {
    const out = await buildArtifact({
      payload: payloadWith("大屏"),
      echartsCode: ECHARTS_STUB,
      runtimeCode: RUNTIME_CODE,
      mode: "inline",
    });
    const html = out.files.find((f) => f.path === "index.html")!.content;
    expect(html).toContain('id="cf-manifest"');
    expect(out.manifest.licenses[0]).toEqual({ name: "ECharts", version: "^6.0.0", license: "Apache-2.0" });
    expect(out.manifest.files).toEqual([]);
    expect(out.manifest.note).toContain("CSP");
  });

  it("运行时字符串能被 JS 引擎解析（字符串代码没有类型检查兜底）", async () => {
    const { Script } = await import("node:vm");
    expect(() => new Script(RUNTIME_CODE)).not.toThrow();
  });

  it("内联产物包含三种静态组件的本地样式与白名单派发", async () => {
    const out = await buildArtifact({ payload: payloadWith("大屏"), echartsCode: ECHARTS_STUB, runtimeCode: RUNTIME_CODE, mode: "inline" });
    const html = out.files.find((file) => file.path === "index.html")!.content;
    for (const marker of ["cf-progress-list", "cf-progress-track", "cf-section-title", "cf-corner-frame", "cf-map-scene"]) {
      expect(html).toContain(marker);
    }
    for (const id of ["chartforge.progress-list", "chartforge.section-title", "chartforge.corner-frame", "chartforge.map-scene-flat", "chartforge.map-scene-tilted"]) {
      expect(RUNTIME_CODE).toContain(id);
    }
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toMatch(/(?:src|href)=["']https?:\/\//i);
    expect(RUNTIME_CODE).not.toContain("innerHTML");
    expect(RUNTIME_CODE).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket)\b/);
  });

  it("运行时不含 eval / new Function（CSP 与安全要求）", () => {
    expect(/\beval\s*\(/.test(RUNTIME_CODE)).toBe(false);
    expect(/new\s+Function/.test(RUNTIME_CODE)).toBe(false);
    expect(RUNTIME_CODE).not.toContain("innerHTML");
    expect(RUNTIME_CODE).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket)\b/);
  });
});

describe("export/artifact 目录包", () => {
  it("拆出 assets 与 manifest，脚本带 SRI，CSP 收紧到 self", async () => {
    const out = await buildArtifact({
      payload: payloadWith("大屏"),
      echartsCode: ECHARTS_STUB,
      runtimeCode: RUNTIME_CODE,
      mode: "folder",
    });
    const paths = out.files.map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "index.html",
        "assets/echarts.min.js",
        "assets/app.js",
        "manifest.json",
        "NOTICE-ECHARTS.txt",
        "LICENSE-CHARTFORGE.txt",
        "README.md",
        "serve.sh",
        "serve.cmd",
      ])
    );
    const html = out.files.find((f) => f.path === "index.html")!.content;
    expect(html).toContain("script-src 'self'");
    expect(html).toContain('integrity="sha384-');
    expect(html).toContain('src="assets/echarts.min.js"');
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toMatch(/(?:src|href)=["']https?:\/\//i);

    const manifest = JSON.parse(out.files.find((f) => f.path === "manifest.json")!.content);
    expect(manifest.files.length).toBe(out.files.length - 1);
    for (const f of manifest.files) {
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(f.bytes).toBeGreaterThan(0);
    }
    expect(JSON.stringify(manifest)).not.toContain("manifest.json");
  });

  it("README 写明部署与 file:// 限制", async () => {
    const out = await buildArtifact({
      payload: payloadWith("大屏"),
      echartsCode: ECHARTS_STUB,
      runtimeCode: RUNTIME_CODE,
      mode: "folder",
    });
    const readme = out.files.find((f) => f.path === "README.md")!.content;
    expect(readme).toContain("nginx");
    expect(readme).toContain("?interval=");
    expect(readme).toContain("CSP");
  });
});

describe("export/artifact maplibre 注入", () => {
  it("内联模式把 maplibre 源码注入 index.html", async () => {
    const out = await buildArtifact({
      payload: payloadWith("大屏"),
      echartsCode: ECHARTS_STUB,
      maplibreCode: "/* maplibre stub */",
      runtimeCode: RUNTIME_CODE,
      mode: "inline",
    });
    const html = out.files.find((f) => f.path === "index.html")!.content;
    expect(html).toContain("/* maplibre stub */");
  });

  it("folder 模式落盘 assets/maplibre-gl.js", async () => {
    const out = await buildArtifact({
      payload: payloadWith("大屏"),
      echartsCode: ECHARTS_STUB,
      maplibreCode: "/* maplibre stub */",
      runtimeCode: RUNTIME_CODE,
      mode: "folder",
    });
    const lib = out.files.find((f) => f.path === "assets/maplibre-gl.mjs");
    expect(lib?.content).toContain("maplibre stub");
    const html = out.files.find((f) => f.path === "index.html")!.content;
    expect(html).toContain("assets/maplibre-gl.mjs");
  });
});

