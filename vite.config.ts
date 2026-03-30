import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import {
  createStyleImportPlugin,
  ElementPlusResolve,
} from "vite-plugin-style-import";
import { loadEnv, type ConfigEnv } from "vite";
import vueJsx from "@vitejs/plugin-vue-jsx";

const root = process.cwd();

// https://vite.dev/config/
export default defineConfig(({ command, mode }: ConfigEnv) => {
  let env = {} as any;
  const isBuild = command === "build";
  if (!isBuild) {
    env = loadEnv(
      process.argv[3] === "--mode" ? process.argv[4] : process.argv[3],
      root,
    );
  } else {
    env = loadEnv(mode, root);
  }
  return {
    plugins: [
      vue(),
      vueJsx(),
      env.VITE_USE_ALL_ELEMENT_PLUS_STYLE === "false"
        ? createStyleImportPlugin({
            resolves: [ElementPlusResolve()],
            libs: [
              {
                libraryName: "element-plus",
                esModule: true,
                resolveStyle: (name) => {
                  if (name === "click-outside") {
                    return "";
                  }
                  return `element-plus/es/components/${name.replace(/^el-/, "")}/style/css`;
                },
              },
            ],
          })
        : undefined,
    ],
    css: {
      preprocessorOptions: {
        less: {
          additionalData: '@import "./src/style/variables.module.less";',
          javascriptEnabled: true,
        },
      },
    },
    resolve: {
      extensions: [
        ".mjs",
        ".js",
        ".ts",
        ".jsx",
        ".tsx",
        ".json",
        ".less",
        ".css",
      ],
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    server: {
      port: 5174,
      host: "0.0.0.0",
      open: true,
    },
  };
});
