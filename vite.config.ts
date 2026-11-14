import { configDefaults, defineConfig } from "vitest/config";
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";

/** 本地演示副本专用：?demo=t9 / ?demo=t10 / ?demo=t11 时在 index.html 注入演示种子（不改业务源码）。 */
function demoSeedPlugin() {
  return {
    name: "cf-demo-seed-t9",
    transformIndexHtml(html: string, ctx: { originalUrl?: string }) {
      const url = (ctx as unknown as { originalUrl?: string }).originalUrl ?? "";
      const seedFile = url.includes("demo=t11")
        ? "examples/screens/demo-seed-t11.js"
        : url.includes("demo=t10")
          ? "examples/screens/demo-seed-t10.js"
          : url.includes("demo=t9")
            ? "examples/screens/demo-seed-t9.js"
            : null;
      if (!seedFile) return html;
      // 种子文件缺失时静默跳过，不影响 dev server 启动与其它页面。
      const seedPath = resolve(__dirname, seedFile);
      if (!existsSync(seedPath)) return html;
      const seed = readFileSync(seedPath, "utf-8");
      return html.replace("</head>", `<script>${seed.replace(/<\/script>/gi, "<\\/script>")}</script></head>`);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueJsx(), demoSeedPlugin()],
  resolve: {
    extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json", ".vue"],
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5174,
    host: "0.0.0.0",
    open: false,
    // 仅放行沙箱预览域名（*.e2b.app）；localhost / 127.0.0.1 由 Vite 默认放行。
    allowedHosts: [".e2b.app"],
  },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // 把变化频率低的第三方库拆成独立 chunk：升级业务代码时浏览器缓存不用失效
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (id.includes("node_modules/echarts") || id.includes("node_modules/zrender")) {
            return "echarts";
          }
          if (
            id.includes("node_modules/vue") ||
            id.includes("node_modules/@vue") ||
            id.includes("node_modules/pinia")
          ) {
            return "vue-vendor";
          }
          return "vendor";
        },
      },
    },
  },
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
