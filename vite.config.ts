import { defineConfig } from "vitest/config";
import { resolve } from "path";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueJsx()],
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
  },
});
