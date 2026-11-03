import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import "./style/index.css";
import App from "./App.vue";
import router from "./router";
import { registerCharts } from "@/core/chart/registerCharts";
import { initTheme } from "@/shared/theme";

registerCharts();
initTheme();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(ElementPlus, { locale: zhCn });
app.mount("#app");
