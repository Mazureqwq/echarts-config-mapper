import { createApp } from "vue";
import "element-plus/dist/index.css";
import App from "./App.vue";
import "./style.css";
import { setupElementPlus } from "@/plugins/elementPlus";
import { setupStore } from "@/stores";
import "@/style/index.less";

// 创建实例
const setupAll = async () => {
  const app = createApp(App);

  setupElementPlus(app);
  setupStore(app);
  app.mount("#app");
};

setupAll();
