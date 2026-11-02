import { createApp } from "vue";
import "element-plus/dist/index.css";
import App from "./App.vue";
import "./style/tokens.css";
import { setupStore } from "@/stores";
import { router } from "@/router";

const app = createApp(App);
setupStore(app);
app.use(router);
app.mount("#app");
